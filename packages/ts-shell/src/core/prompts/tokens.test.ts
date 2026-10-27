import { expect, it } from 'vitest';
import { promptTokens, promptTokenAt, withoutPromptTokens } from './tokens.js';

it.each(['`', '~'])('keeps an embedded %s fence, shorter/mixed/trailing closes and examples literal until a valid closing line', character => {
  const fence = character.repeat(4);
  const code = `${fence}text\r\nexample ${fence} /skill:missing\r\n${character.repeat(3)}\r\n/skill:fake\r\n${character === '`' ? '~~~~' : '````'}\r\n${fence} trailing\r\n/brainstorm\r\n${character.repeat(5)}\t`;
  const source = `正文\r\n  ${code}\r\n/skill:a /skill:b`;
  const tokens = promptTokens(source);
  expect(tokens.filter(token => !token.literal).map(token => token.raw)).toEqual(['正文', '/skill:a', '/skill:b']);
  expect(tokens.find(token => token.literal === 'code')?.raw).toBe(code + '\r');
  for (const marker of ['/skill:missing', '/skill:fake', '/brainstorm']) {
    expect(promptTokenAt(source, source.indexOf(marker) + marker.length)?.literal).toBe('code');
  }
  const selected = tokens.filter(token => !token.literal && token.raw.startsWith('/skill:'));
  expect(withoutPromptTokens(source, selected)).toBe(`正文\r\n  ${code}\r\n `);
  for (const token of tokens) expect(source.slice(token.from, token.to)).toBe(token.raw);
});

it.each(['`', '``', '```'])('matches an inline %s delimiter by its whole run, leaving differently sized runs inside literal code', opening => {
  const code = `${opening} code ${opening + '`'} /skill:missing ${opening}`;
  const source = `正文 ${code} /skill:a`;
  expect(promptTokens(source).filter(token => !token.literal).map(token => token.raw)).toEqual(['正文', '/skill:a']);
  expect(promptTokenAt(source, source.indexOf('/skill:missing') + 5)?.literal).toBe('code');
});

it.each(['```text\nexample ``` /skill:a', '~~~text\nexample ~~~ /skill:a', '`` unmatched /skill:a'])(
  'keeps an unfinished literal out of command preparation: %s', source => {
    expect(promptTokens(source).every(token => token.literal === 'code')).toBe(true);
  });

it('does not give a mid-line tilde run fence meaning or a quoted/escaped marker invocation authority', () => {
  const source = '正文 ~~~ /skill:a " /skill:fake " \\/skill:fake /skill:b';
  expect(promptTokens(source).filter(token => !token.literal).map(token => token.raw)).toEqual(['正文', '~~~', '/skill:a', '/skill:b']);
});

it.each(['"', "'"])('keeps a balanced %s quote literal when it starts after a token prefix', quote => {
  const source = `focus=${quote}literal /review text${quote} /review`;
  const tokens = promptTokens(source);
  expect(tokens).toHaveLength(2);
  expect(tokens[0]).toMatchObject({ raw: `focus=${quote}literal /review text${quote}`, literal: 'quote',
    quote: { from: 6, closed: true } });
  expect(tokens[1]).toMatchObject({ raw: '/review' });
  expect(tokens[1]?.literal).toBeUndefined();
});

it('keeps apostrophes in prose from hiding later invocations', () => {
  const source = "Let's compare Users' notes /review because it's ready";
  expect(promptTokens(source).filter(token => !token.literal).map(token => token.raw)).toEqual([
    "Let's", 'compare', "Users'", 'notes', '/review', 'because', "it's", 'ready',
  ]);
});

it('keeps shell-style and unfinished quotes literal after arbitrary token prefixes', () => {
  const source = `dir/'literal /skill:a text' --path'/tmp /review text' --focus' 中文 /review text' --focus'literal /review text' -f'literal /skill:a text' focus="unfinished /skill:b`;
  const tokens = promptTokens(source);
  expect(tokens).toHaveLength(6);
  expect(tokens.map(token => token.literal)).toEqual(['quote', 'quote', 'quote', 'quote', 'quote', 'quote']);
  expect(tokens.map(token => token.quote?.closed)).toEqual([true, true, true, true, true, false]);
});

it.each([
  "--author=O'Brien /review because 'yes'",
  "--user's /review because 'yes'",
  "'Twas ready /review because 'yes'",
])('keeps apostrophes on option-shaped or leading prose from hiding review: %s', source => {
  expect(promptTokens(source).filter(token => !token.literal).map(token => token.raw)).toContain('/review');
});

it.each(['/tmp/work space', '~/work space', './work space', '../work space', 'C:\\work space', '\\\\server\\work space'])(
  'keeps an unfinished single-quoted path literal through whitespace and later markers: %s', value => {
    const source = `读取 '${value} /skill:hidden /review`;
    const tokens = promptTokens(source), quoted = tokens[1]!;
    expect(tokens).toHaveLength(2);
    expect(quoted).toMatchObject({ from: 3, to: source.length, literal: 'quote',
      quote: { from: 3, to: source.length, closed: false } });
    expect(promptTokenAt(source, source.indexOf('/skill:hidden') + 4)).toEqual(quoted);
    expect(tokens.filter(token => !token.literal).map(token => token.raw)).toEqual(['读取']);
    const closed = `${source}' /skill:real /review`;
    expect(promptTokens(closed).filter(token => !token.literal).map(token => token.raw)).toEqual(['读取', '/skill:real', '/review']);
  });

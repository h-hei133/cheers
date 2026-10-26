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

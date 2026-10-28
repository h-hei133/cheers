import { expect, it } from 'vitest';
import { historyDigest } from './identity.js';

it('changes identity for same-length replacements, reordered tool calls and signed reasoning', () => {
  const messages = [{ role: 'user' as const, content: 'old' }, { role: 'assistant' as const, content: 'answer',
    reasoning: { text: 'retained', signature: 'one' } }];
  expect(historyDigest([{ ...messages[0]!, content: 'new' }, messages[1]!])).not.toBe(historyDigest(messages));
  expect(historyDigest([...messages].reverse())).not.toBe(historyDigest(messages));
  expect(historyDigest([messages[0]!, { ...messages[1]!, reasoning: { text: 'retained', signature: 'two' } }])).not.toBe(historyDigest(messages));
  expect(historyDigest([messages[0]!, { ...messages[1]!, origin: { provider: 'openai', model: 'm', replayBinding: 'other' } }]))
    .not.toBe(historyDigest(messages));
});

import { expect, it } from 'vitest';
import { convertMessages } from '../messages.js';
import type { AgentMessage } from '../state.js';
import type { RequestDeclaration } from './model.js';
import { assertDeclarationHistory, declarationEpoch } from './history.js';

const target: RequestDeclaration['target'] = { provider: 'fixture', model: 'm', endpoint: 'anthropic-messages', replayBinding: 'a'.repeat(64) };
const marker = (id: string, changed: Partial<RequestDeclaration['target']> = {}): AgentMessage => ({
  id, role: 'system', content: '', requestDeclaration: { version: 1, target: { ...target, ...changed }, tools: [] },
});

it.each([{ model: 'other' }, { provider: 'other' }, { endpoint: 'openai-compatible' }, { replayBinding: 'b'.repeat(64) }])('separates returning target epochs after %j', changed => {
  const history = [marker('first'), marker('same'), marker('foreign', changed), marker('returned'), marker('last')];
  expect(declarationEpoch(history, target).map(message => message.id)).toEqual(['returned', 'last']);
  expect(declarationEpoch(history.slice(0, 3), target)).toEqual([]);
});

it('preserves declaration boundaries through a multi-message converter', async () => {
  const source: AgentMessage[] = [marker('first'), { role: 'user', content: 'one' }, marker('second'), { role: 'user', content: 'two' }];
  const result = await convertMessages(source, messages => messages.flatMap(message => message.requestDeclaration ? [message]
    : [{ role: 'user' as const, content: message.content }, { role: 'assistant' as const, content: 'projected' }]));
  expect(result.providerMessages!.filter(message => message.requestDeclaration).map(message => message.id)).toEqual(['first', 'second']);
  expect(result.messages).toHaveLength(6);
});

it.each(['drop', 'duplicate', 'role', 'payload', 'id', 'order', 'invent'] as const)('refuses a converter that changes declaration boundaries: %s', async change => {
  const source: AgentMessage[] = [marker('first'), { role: 'user', content: 'one' }, marker('second')];
  await expect(convertMessages(source, messages => {
    const first = messages[0]!; const second = messages[2]!;
    switch (change) {
      case 'drop': return messages.filter(message => !message.requestDeclaration);
      case 'duplicate': return [...messages, first];
      case 'role': return [{ ...first, role: 'user' as const }, ...messages.slice(1)];
      case 'payload': return [{ ...first, requestDeclaration: { ...first.requestDeclaration!, effort: 'high' } }, ...messages.slice(1)];
      case 'id': return [{ ...first, id: 'replaced' }, ...messages.slice(1)];
      case 'order': return [second, messages[1]!, first];
      case 'invent': return [...messages, marker('invented')];
    }
  })).rejects.toThrow();
});

it('refuses duplicate declaration identities even if the converter retains them', () => {
  expect(() => assertDeclarationHistory([marker('same'), marker('same')], [marker('same'), marker('same')])).toThrow('unique');
});

it('rejects converter-added undefined schema fields before generic JSON normalization', async () => {
  const source = [marker('first')];
  await expect(convertMessages(source, messages => [{ ...messages[0]!, requestDeclaration: {
    ...messages[0]!.requestDeclaration!, unexpected: undefined,
  } }])).rejects.toThrow();
});

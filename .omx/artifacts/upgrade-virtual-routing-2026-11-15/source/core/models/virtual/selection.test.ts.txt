import { expect, it } from 'vitest';
import { parseModelSelection } from './selection.js';

const definitions = [{ provider: 'adaptive', id: 'auto', name: 'Automatic' },
  { provider: 'adaptive', id: 'group/model:high', name: 'Literal suffix' }];

it('matches exact registered slash and colon identities before parsing effort', () => {
  expect(parseModelSelection('adaptive/group/model:high', definitions)).toEqual({ kind: 'virtual', definition: definitions[1],
    virtualModel: { provider: 'adaptive', model: 'group/model:high' } });
  expect(parseModelSelection('adaptive/auto:max', definitions, 'google')).toEqual({ kind: 'virtual', definition: definitions[0],
    virtualModel: { provider: 'adaptive', model: 'auto', thinkingEffort: 'max' } });
});

it('retains physical explicit-provider and slash-id semantics for unregistered names', () => {
  expect(parseModelSelection('google/group/model:high', definitions)).toEqual({ kind: 'physical', provider: 'google', model: 'group/model', thinkingEffort: 'high' });
  expect(parseModelSelection('google/group/model', definitions, 'openai')).toEqual({ kind: 'physical', provider: 'openai', model: 'google/group/model' });
  expect(parseModelSelection('unknown/group/model', definitions)).toEqual({ kind: 'physical', model: 'unknown/group/model' });
});

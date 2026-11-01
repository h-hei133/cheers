import { expect, it } from 'vitest';
import { approvalCallBinding } from './binding.js';
import { buildScope } from './store.js';
import { buildToolEscalationPrompt } from '../../query/toolPolicy.js';

it('preserves literal strings, array order, types and JSON property names', () => {
  const baseline = approvalCallBinding('task', { value: ['a', 'b'], nested: JSON.parse('{"__proto__":"read"}') });
  for (const args of [
    { value: ['b', 'a'], nested: JSON.parse('{"__proto__":"read"}') },
    { value: ['a', 'b'], nested: {} },
    { value: ['a', 'b'], nested: JSON.parse('{"__proto__":"write"}') },
  ]) expect(approvalCallBinding('task', args)).not.toBe(baseline);
  for (const [first, next] of [['a', 'a\n'], ['é', 'e\u0301'], ['\ud800', '\ufffd'], [1, '1'], [null, 'null']]) {
    expect(approvalCallBinding('task', { value: first })).not.toBe(approvalCallBinding('task', { value: next }));
  }
});

it.each([undefined, NaN, Infinity, 1n, () => {}, new Date(0)])('refuses unsupported JSON arguments without including their content: %s', value => {
  expect(() => approvalCallBinding('browser', { value })).toThrow('Approval arguments must contain only JSON values.');
});

it('refuses cyclic or excessively nested arguments instead of deriving a fallback key', () => {
  const args: Record<string, unknown> = {};
  args.self = args;
  expect(() => approvalCallBinding('task', args)).toThrow('Approval arguments exceed the supported JSON depth.');
});

it.each(['', 'truncated', 'A'.repeat(64)])('refuses malformed bindings instead of using the display target: %s', callBinding => {
  const prompt = buildToolEscalationPrompt('task', 'execute', 'review', 'fixture');
  prompt.context.callBinding = callBinding;
  expect(() => buildScope(prompt)).toThrow('Invalid approval call binding.');
});

it('retains the existing scope contract for tools outside this argument-binding repair', () => {
  expect(approvalCallBinding('bash', { command: 'printf read' })).toBeUndefined();
  expect(buildScope(buildToolEscalationPrompt('bash', 'execute', 'printf read', 'fixture')).scopeKey).toBe('bash:execute:exact:printf read');
});

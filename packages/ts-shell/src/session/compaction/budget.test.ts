import { expect, it } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { compactionRefusalReason } from '../compaction.js';
import { estimateRequestTokens } from '../context.js';

const messages: AgentMessage[] = [{ role: 'user', content: 'xxxxxxx' }, { role: 'assistant', content: 'yyyyyyy' }];
const overhead = { tools: [{ name: 'read' }], systemPrompt: 's'.repeat(350) };

it('reports additive history, fixed overhead, output and reserve through the refusal path', () => {
  const refusal = compactionRefusalReason(messages, { contextWindow: 100, reserveTokens: 10, outputTokens: 20, overhead });
  expect(refusal?.key).toBe('fits-budget');
  expect(refusal?.message).toContain('fixed overhead 105 (tool schemas 5, system instructions 100)');
  const parts = refusal!.message.match(/history (\d+) \+ fixed overhead (\d+) \(.*?\) \+ output (\d+) \+ reserve (\d+) = (\d+) tokens/);
  expect(parts).not.toBeNull();
  const total = Number(parts![5]);
  expect(parts!.slice(1, 5).reduce((sum, tokens) => sum + Number(tokens), 0)).toBe(total);
  expect(total).toBe(estimateRequestTokens(messages, overhead) + 20 + 10);
});

it('keeps provider usage distinct from the estimated component split', () => {
  const refusal = compactionRefusalReason(messages, { contextWindow: 100, reserveTokens: 10, outputTokens: 20,
    overhead, measureContextTokens: () => 900 });
  expect(refusal?.message).toContain('about 900 provider-measured tokens');
  expect(refusal?.message).toContain('Estimated budget: history 4 + fixed overhead 105');
  expect(refusal?.message).toContain('= 139 tokens.');
});

it('accounts for shared rounding without dropping system instruction tokens', () => {
  const small: AgentMessage[] = [{ role: 'user', content: 'x' }, { role: 'assistant', content: '' }];
  const refusal = compactionRefusalReason(small, { contextWindow: 20, reserveTokens: 10, outputTokens: 20,
    overhead: { tools: [0], systemPrompt: 's' } });
  expect(refusal?.message).toContain('history 1 + fixed overhead 1 (tool schemas 1, system instructions 1, shared rounding -1)');
  expect(refusal?.message).toContain('+ output 20 + reserve 10 = 32 tokens.');
});

it('labels provider-selected output unknown instead of counting it as zero', () => {
  const refusal = compactionRefusalReason(messages, { contextWindow: 100, reserveTokens: 10, overhead });
  expect(refusal?.message).toContain('+ reserve 10 = 119 known tokens; output is provider-selected and unknown.');
  expect(refusal?.message).not.toContain('output 0');
});

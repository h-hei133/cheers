import { expect, it } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { compactionRefusalReason } from '../compaction.js';
import { estimateRequestTokens } from '../context.js';
import { closingCharsFor, formatBudgetBreakdown } from './budget.js';

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

it('adds the closing instruction to the breakdown and the total together', () => {
  const messages = [{ role: 'user' as const, content: 'x'.repeat(1_400) }];
  const policy = { overhead: { systemPrompt: 's', tools: [] }, reserveTokens: 10, outputTokens: 20 };
  const open = formatBudgetBreakdown(messages, policy);
  const closing = formatBudgetBreakdown(messages, policy, closingCharsFor(false));
  // The instruction is a real cost, so both the history line and the total
  // move by the same amount; it must not appear as "shared rounding".
  expect(closing).not.toBe(open);
  // 1,400 chars of history plus the 188-char instruction: 454 tokens in total,
  // 400 without it. The instruction is history-sized, not rounding-sized.
  expect(open).toContain('history 400');
  expect(closing).toContain('history 454');
  // It must not be folded into "shared rounding", which is what the estimate
  // reports when it cannot attribute a difference.
  expect(closing).not.toContain('shared rounding 54');
});

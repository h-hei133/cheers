import { afterEach, expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../../core/agent/state.js';
import { condenseContext } from '../../../session/compaction.js';
import { compactSessionHistory } from '../../../core/shell/compaction.js';
import { resetSessionUsage } from '../../../observability/usageTelemetry.js';
import { manualCompactionPolicy } from './context.js';
import type { StepRequest } from '../../../turn/step.js';

const history: AgentMessage[] = Array.from({ length: 4 }, (_, index) => [
  { role: 'user' as const, content: `${index} ${'x'.repeat(300)}` },
  { role: 'assistant' as const, content: `${index} ${'y'.repeat(300)}` },
]).flat();
const base = { contextWindow: 3000, outputTokens: 10, reserveTokens: 0, keepRecentTokens: 10 };
const request: StepRequest = { provider: { headers: {}, provider: 'fixture', model: 'model', baseUrl: 'https://fixture.test/v1' },
  systemPrompt: 'Base instruction.', tools: [], sessionId: 'manual-capture-test', workspaceRoot: process.cwd(),
  contextWindow: 3000, maxOutputTokens: 10, reserveTokens: 0,
};
afterEach(() => resetSessionUsage(request.sessionId));

it('rejects manual growth after complete conversion before durable publication', async () => {
  const commit = vi.fn(() => ({ status: 'committed' as const }));
  const source = { sessionId: request.sessionId, identity: 'source', history };
  const policy = manualCompactionPolicy(base, request, messages => [{ role: 'user', content:
    messages.some(message => String(message.content).includes('[Context Checkpoint]')) ? 'z'.repeat(4000) : 'small' }]);
  const result = await compactSessionHistory({ sessionId: source.sessionId, policy, summarize: async () => 'summary',
    authority: { capture: () => source, commit }, store: {} as never });
  expect(result.status).toBe('nothing'); expect(commit).not.toHaveBeenCalled();
});

it('uses current request overhead and reuses caller capture through candidate preparation', async () => {
  let instruction = 'First system.';
  const converted = vi.fn((messages: readonly AgentMessage[]) => [{ role: 'user' as const, content:
    messages.some(message => String(message.content).includes('[Context Checkpoint]')) ? 'short' : 'Long history '.repeat(400) }]);
  const policy = manualCompactionPolicy(base, { ...request, get systemPrompt() { return instruction; } }, converted);
  instruction = 'Current system.';
  const result = await condenseContext({ messages: history, policy, force: true, summarize: async () => 'summary' });
  expect(result.status).toBe('condensed'); expect(converted).toHaveBeenCalledTimes(2);
  if (result.status === 'condensed') expect(result.preparedPolicy?.overhead?.systemPrompt).toBe('Current system.');
});

it('refuses manual publication when request ownership changes during candidate conversion', async () => {
  let current = true;
  const commit = vi.fn(() => ({ status: 'committed' as const }));
  const source = { sessionId: request.sessionId, identity: 'source', history };
  const policy = manualCompactionPolicy(base, request, messages => {
    const candidate = messages.some(message => String(message.content).includes('[Context Checkpoint]'));
    if (candidate) current = false;
    return [{ role: 'user', content: candidate ? 'short' : 'a'.repeat(8000) }];
  }, () => current ? undefined : 'Owner replaced.');
  const result = await compactSessionHistory({ sessionId: source.sessionId, policy, summarize: async () => 'summary',
    authority: { capture: () => source, commit }, store: {} as never });
  expect(result.status).toBe('failed'); expect(commit).not.toHaveBeenCalled();
});

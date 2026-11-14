import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { AgentMessage } from '../../core/agent/state.js';
import { condenseContext, createCompactionStep, readContextCheckpoint, type CompactionPolicy } from '../compaction.js';
import type { CompactionAuthority, CompactionSource } from './contract.js';

const history: AgentMessage[] = Array.from({ length: 8 }, (_, index) => ({
  role: index % 2 ? 'assistant' : 'user', content: `message ${index}:` + 'x'.repeat(400),
}));
const base: CompactionPolicy = { contextWindow: 900, reserveTokens: 0, keepRecentTokens: 100 };
let root: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-compaction-preparation-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
});
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

it('prepares caller and rebuilt candidate once and retains raw cut indexes', async () => {
  const caller = [{ role: 'system' as const, content: 'caller system' }, ...history];
  const captures: AgentMessage[][] = [];
  const policy: CompactionPolicy = { ...base, prepare: async messages => {
    captures.push([...messages]);
    const candidate = messages.some(message => readContextCheckpoint(String(message.content)) !== undefined);
    const result: CompactionPolicy = { ...policy, preparedIdentity: candidate ? 'candidate' : 'original',
      estimateContextTokens: () => candidate ? 500 : 1_200, projectMessages: () => [{ role: 'user', content: 'one converted message' }] };
    return result;
  } };
  const summarize = vi.fn(async () => 'summary');
  const result = await condenseContext({ messages: caller, policy, summarize, operation: {
    sessionId: 'captured-test', source: { sessionId: 'captured-test', identity: 'raw-source', history },
  } });
  expect(result.status).toBe('condensed');
  if (result.status !== 'condensed') return;
  expect(captures).toHaveLength(2);
  expect(captures[0]).toEqual(caller);
  expect(captures[1]).toEqual(result.messages);
  expect(result.messages[0]).toEqual(caller[0]);
  expect(result.messages.slice(-result.plan.keptMessages)).toEqual(caller.slice(result.plan.cut));
  expect(result.plan.tokensBefore).toBe(1_200);
  expect(result.tokensAfter).toBe(500);
  expect(result.preparedPolicy?.preparedIdentity).toBe('candidate');
  expect(summarize).toHaveBeenCalledOnce();
});

it.each([false, true])('rejects a candidate that grows after complete conversion (force=%s)', async force => {
  const summarize = vi.fn(async () => 'small raw summary');
  const policy: CompactionPolicy = { ...base, prepare: async messages => ({ ...base,
    estimateContextTokens: () => messages.some(message => readContextCheckpoint(String(message.content)) !== undefined) ? 1_300 : 1_200,
  }) };
  expect(await condenseContext({ messages: history, policy, summarize, force })).toEqual({ status: 'declined', reason: 'would-not-shrink' });
  expect(summarize).toHaveBeenCalledOnce();
});

it('uses the complete caller estimate for threshold and before lifecycle while source stays raw', async () => {
  const before = vi.fn();
  const caller = [{ role: 'system' as const, content: 'captured caller system' }, ...history];
  const policy: CompactionPolicy = { ...base, prepare: async messages => {
    expect(messages[0]!.content).toBe('captured caller system');
    const candidate = messages.some(message => readContextCheckpoint(String(message.content)) !== undefined);
    return { ...base, estimateContextTokens: () => candidate ? 400 : 1_111 };
  } };
  const result = await condenseContext({ messages: caller, policy, summarize: async () => 'summary',
    lifecycle: { before }, operation: { sessionId: 'envelope-test', source: { sessionId: 'envelope-test', identity: 'raw', history } } });
  expect(result.status).toBe('condensed');
  expect(before).toHaveBeenCalledWith({ reason: 'manual', tokensBefore: 1_111, messageCount: caller.length });
});

it('captures authority before preparation and refuses late candidate ownership without commit', async () => {
  const order: string[] = [];
  const commit = vi.fn(() => ({ status: 'committed' as const }));
  const authority: CompactionAuthority = { capture: messages => {
    order.push('capture'); return { sessionId: 'owner-test', identity: 'owner', history: [...messages!] };
  }, commit };
  const policy: CompactionPolicy = { ...base, prepare: async messages => {
    order.push('prepare');
    const candidate = messages.some(message => readContextCheckpoint(String(message.content)) !== undefined);
    return { ...base, estimateContextTokens: () => candidate ? 400 : 1_111,
      admission: () => candidate ? 'owner changed' : undefined };
  } };
  const onError = vi.fn();
  expect(await createCompactionStep(policy, { authority, summarize: async () => 'summary', onError })({ messages: history, toolResults: [] })).toBeUndefined();
  expect(order[0]).toBe('capture');
  expect(order.filter(value => value === 'capture')).toHaveLength(1);
  expect(commit).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledOnce();
});

it('captures original caller and source before async preparation can mutate them', async () => {
  const caller = structuredClone(history);
  const source: CompactionSource = { sessionId: 'snapshot-test', identity: 'source', history: structuredClone(history) };
  const original = structuredClone(caller);
  let prepares = 0;
  const seen: AgentMessage[][] = [];
  const policy: CompactionPolicy = { ...base, prepare: async messages => {
    if (++prepares === 1) { caller[0]!.content = 'changed caller'; source.history[0]!.content = 'changed source'; }
    return { ...base, estimateContextTokens: () => prepares === 1 ? 1_200 : 400 };
  } };
  const result = await condenseContext({ messages: caller, policy, force: true,
    operation: { sessionId: source.sessionId, source }, summarize: async request => {
      seen.push([...request.messages]); return 'summary';
    } });
  expect(result.status).toBe('condensed');
  expect(seen[0]![0]).toEqual(original[0]);
});

it('does not join async policy preparations for the same raw operation', async () => {
  const summarize = vi.fn(async () => 'summary');
  const prepare = vi.fn(async (messages: readonly AgentMessage[]) => ({ ...base,
    estimateContextTokens: () => messages.some(message => readContextCheckpoint(String(message.content)) !== undefined) ? 400 : 1_200 }));
  const policy: CompactionPolicy = { ...base, prepare };
  const input = { messages: history, policy, summarize, force: true };
  await Promise.all([condenseContext(input), condenseContext(input)]);
  expect(prepare).toHaveBeenCalledTimes(4);
  expect(summarize).toHaveBeenCalledTimes(2);
});

it('accepts the request-specific policy supplied to the scheduled step', async () => {
  const summarize = vi.fn(async () => 'summary');
  const step = createCompactionStep({ ...base, estimateContextTokens: () => 1 }, { summarize });
  const current: CompactionPolicy = { ...base, prepare: async messages => ({ ...base,
    estimateContextTokens: () => messages.some(message => readContextCheckpoint(String(message.content)) !== undefined) ? 400 : 1_200 }) };
  expect(await step({ messages: history, toolResults: [] }, undefined, current)).toHaveProperty('messages');
  expect(summarize).toHaveBeenCalledOnce();
});

it('cancels candidate preparation before publishing or arming progress', async () => {
  const controller = new AbortController();
  const commit = vi.fn(() => ({ status: 'committed' as const }));
  const onDeadEnd = vi.fn();
  const authority: CompactionAuthority = { capture: messages => ({ sessionId: 'cancel-test', identity: 'raw', history: [...messages!] }), commit };
  const policy: CompactionPolicy = { ...base, prepare: async messages => {
    const candidate = messages.some(message => readContextCheckpoint(String(message.content)) !== undefined);
    if (candidate) controller.abort();
    return { ...base, estimateContextTokens: () => candidate ? 400 : 1_200 };
  } };
  expect(await createCompactionStep(policy, { authority, summarize: async () => 'summary', onDeadEnd })({ messages: history, toolResults: [] }, controller.signal)).toBeUndefined();
  expect(commit).not.toHaveBeenCalled(); expect(onDeadEnd).not.toHaveBeenCalled();
});

it.each(['caller', 'source'] as const)('rejects nested standard %s accessors before preparation or summary', async owner => {
  for (const field of ['content', 'tool_calls']) {
    const getter = vi.fn(() => 'must not execute');
    const message: AgentMessage = field === 'content'
      ? { role: 'user', content: [{ type: 'text', text: 'history' }] }
      : { role: 'assistant', content: '', tool_calls: [{ id: 'read', type: 'function', function: { name: 'read', arguments: '{}' } }] };
    const nested = field === 'content' ? (message.content as object[])[0]! : message.tool_calls![0]!.function;
    Object.defineProperty(nested, field === 'content' ? 'text' : 'arguments', { enumerable: true, get: getter });
    const prepare = vi.fn(async () => base);
    const summarize = vi.fn(async () => 'must not send');
    await expect(condenseContext({ messages: owner === 'caller' ? [message, ...history] : history,
      policy: { ...base, prepare }, summarize, force: true,
      ...(owner === 'source' ? { operation: { sessionId: 'standard-accessor', source: {
        sessionId: 'standard-accessor', identity: 'raw', history: [message, ...history],
      } } } : {}) })).rejects.toThrow();
    expect(getter).not.toHaveBeenCalled(); expect(prepare).not.toHaveBeenCalled(); expect(summarize).not.toHaveBeenCalled();
  }
});

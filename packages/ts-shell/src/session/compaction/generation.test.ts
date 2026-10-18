import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { condenseContext, type SummarizeHistory } from '../compaction.js';
import { generateCompaction } from './generation.js';
import { compactionOperationsPath } from './state.js';
import type { AgentMessage } from '../../core/agent/state.js';
import { requestCompactionSummary } from '../../core/query/compaction/summarize.js';
import { parseFileFootprintXml } from '../../core/query/compaction/fileFootprint.js';

let home: string;
let sessionId: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-segments-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  sessionId = new SessionManager().createNew(home).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { force: true, recursive: true }); });

function history(): AgentMessage[] {
  return Array.from({ length: 8 }, (_, index) => [{ role: 'user' as const, content: `${index}:` + 'x'.repeat(400) },
    { role: 'assistant' as const, content: '', tool_calls: [{ id: String(index), type: 'function' as const, function: { name: 'read', arguments: '{}' } }] },
    { role: 'tool' as const, tool_call_id: String(index), content: 'y'.repeat(400) }]).flat();
}

it('sends bounded legal tool-paired segments and metered merge steps', async () => {
  const sent: AgentMessage[][] = [];
  const summarize = vi.fn(async (request: Parameters<SummarizeHistory>[0]) => {
    sent.push([...request.messages]);
    const open = new Set<string>();
    for (const message of request.messages) {
      for (const call of message.tool_calls ?? []) open.add(call.id);
      if (message.role === 'tool') { expect(open.has(message.tool_call_id!)).toBe(true); open.delete(message.tool_call_id!); }
    }
    expect(open.size).toBe(0);
    expect(JSON.stringify(request.messages).length).toBeLessThan(1800);
    return 'compact material';
  });
  const result = await generateCompaction({ history: history(), prefix: [], maxTokens: 300,
    operation: { sessionId, policyDigest: 'policy' }, summarize });
  expect(result).toBe('compact material');
  expect(summarize.mock.calls.length).toBeGreaterThan(8);
  const state = JSON.parse(fs.readFileSync(compactionOperationsPath(sessionId), 'utf8'));
  expect(Object.values(state.operations).flatMap((value: any) => Object.values(value.steps))).toHaveLength(summarize.mock.calls.length);
  const calls = summarize.mock.calls.length;
  expect(await generateCompaction({ history: history(), prefix: [], maxTokens: 300, operation: { sessionId, policyDigest: 'policy' }, summarize })).toBe(result);
  expect(summarize).toHaveBeenCalledTimes(calls);
});

it('fences cancellation for a joined subscriber without cancelling another caller', async () => {
  const messages: AgentMessage[] = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'x'.repeat(500) }));
  const policy = { contextWindow: 900, reserveTokens: 0, keepRecentTokens: 100 };
  let resolve!: () => void;
  const pending = new Promise<void>(done => { resolve = done; });
  const summarize = vi.fn(async () => { await pending; return 'summary'; });
  const first = condenseContext({ messages, policy, summarize, force: true, operation: { sessionId } });
  const controller = new AbortController();
  const joined = condenseContext({ messages, policy, summarize, force: true, operation: { sessionId }, signal: controller.signal });
  controller.abort(); resolve();
  expect(await first).toMatchObject({ status: 'condensed' });
  expect(await joined).toEqual({ status: 'declined', reason: 'cancelled' });
  expect(summarize).toHaveBeenCalledOnce();
});

it('refuses an unresolved segment on restart without resending completed predecessors', async () => {
  let calls = 0;
  const first = vi.fn(async () => ++calls === 2 ? undefined : 'material');
  expect(await generateCompaction({ history: history(), prefix: [], maxTokens: 300,
    operation: { sessionId, policyDigest: 'policy' }, summarize: first })).toBeUndefined();
  const restarted = vi.fn(async () => 'must not send');
  await expect(generateCompaction({ history: history(), prefix: [], maxTokens: 300,
    operation: { sessionId, policyDigest: 'policy' }, summarize: restarted })).rejects.toThrow();
  expect(restarted).not.toHaveBeenCalled();
});

it('releases a dispatch-aware proven unsent failure but preserves a handed-off failure', async () => {
  const messages: AgentMessage[] = Array.from({ length: 10 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'x'.repeat(500) }));
  const policy = { contextWindow: 900, reserveTokens: 0, keepRecentTokens: 100 };
  const unsent = Object.assign(vi.fn(async () => { throw new Error('preparation refused'); }), { dispatchAware: true });
  await expect(condenseContext({ messages, policy, summarize: unsent, force: true, operation: { sessionId } })).rejects.toThrow('preparation refused');
  const sent = Object.assign(vi.fn(async (request: Parameters<SummarizeHistory>[0]) => {
    request.dispatch!.dispatch(); throw new Error('connection lost');
  }), { dispatchAware: true });
  await expect(condenseContext({ messages, policy, summarize: sent, force: true, operation: { sessionId } })).rejects.toThrow('connection lost');
  const retry = vi.fn(async () => 'must not send');
  expect(await condenseContext({ messages, policy, summarize: retry, force: true, operation: { sessionId } }))
    .toMatchObject({ status: 'declined', reason: 'step-unknown' });
  expect(retry).not.toHaveBeenCalled();
});

it('refuses oversized indivisible tool groups and oversized merge material', async () => {
  const summarize = vi.fn(async () => 'x'.repeat(1000));
  await expect(generateCompaction({ history: history(), prefix: [], maxTokens: 50, summarize })).rejects.toThrow(/segment budget/);
  expect(summarize).not.toHaveBeenCalled();
  await expect(generateCompaction({ history: history(), prefix: [], maxTokens: 300, summarize })).rejects.toThrow(/merged material/);
});

it('retains previous and segmented file footprints when merge prose omits every path', async () => {
  const messages: AgentMessage[] = Array.from({ length: 3 }, (_, index) => [
    { role: 'user' as const, content: 'x'.repeat(700) },
    { role: 'assistant' as const, content: '', tool_calls: [{ id: `read-${index}`, type: 'function' as const,
      function: { name: 'read', arguments: JSON.stringify({ path: `src/${index}.ts` }) } }] },
    { role: 'tool' as const, tool_call_id: `read-${index}`, content: 'content' },
  ]).flat();
  let sends = 0;
  const summarize = async (request: Parameters<SummarizeHistory>[0]) => requestCompactionSummary({ ...request,
    provider: { headers: {}, baseUrl: 'https://fixture.invalid', model: 'summary' },
    fetchImpl: (async () => { sends++; return Response.json({ choices: [{ message: { content: 'Concise summary.' } }] }); }) as typeof fetch });
  const summary = await generateCompaction({ history: messages, prefix: [], maxTokens: 400,
    previousSummary: '<read-files>\n- src/previous.ts\n</read-files>', summarize });
  expect(sends).toBe(5);
  expect(parseFileFootprintXml(summary).readFiles).toEqual(['src/previous.ts', 'src/0.ts', 'src/1.ts', 'src/2.ts']);
});

it('refuses repeated tool call identities before sending an incompletely paired segment', async () => {
  const summarize = vi.fn(async () => 'summary');
  await expect(generateCompaction({ history: [
    { role: 'assistant', content: '', tool_calls: ['read', 'edit'].map(name => ({ id: 'duplicate', type: 'function' as const,
      function: { name, arguments: '{}' } })) },
    { role: 'tool', content: 'one result', tool_call_id: 'duplicate' },
  ], prefix: [], summarize })).rejects.toThrow('tool call IDs are missing or repeated');
  expect(summarize).not.toHaveBeenCalled();
});

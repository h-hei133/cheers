import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from './SessionManager.js';
import { condenseContext, type CompactionPolicy } from './compaction.js';
import { claimCompactionStep, completeCompactionStep, compactionOperationsPath, markCompactionStepUnknown } from './compactionOperation.js';
import type { AgentMessage } from '../core/agent/state.js';

let home: string;
let sessionId: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'compaction-operation-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  sessionId = new SessionManager().createNew(home).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { recursive: true, force: true }); });

const operation = () => ({ sessionId, provider: 'openai', model: 'm', policyDigest: 'policy' });

it('claims one step, refuses replay, and returns the completed summary', () => {
  const first = claimCompactionStep({ ...operation(), stepDigest: 'step-one' });
  expect(first.acquired).toBe(true);
  expect(claimCompactionStep({ ...operation(), stepDigest: 'step-one' })).toMatchObject({ acquired: false, unknown: true });
  completeCompactionStep(first, sessionId, 'stored summary');
  expect(claimCompactionStep({ ...operation(), stepDigest: 'step-one' })).toMatchObject({ acquired: false, summary: 'stored summary' });
  expect(claimCompactionStep({ ...operation(), stepDigest: 'step-two' }).acquired).toBe(true);
});

it('keeps unknown outcomes durable', () => {
  const claim = claimCompactionStep({ ...operation(), stepDigest: 'step-unknown' });
  markCompactionStepUnknown(claim, sessionId);
  expect(claimCompactionStep({ ...operation(), stepDigest: 'step-unknown' })).toMatchObject({ acquired: false, unknown: true });
});

it('separates operations by summarizer and instruction identity', () => {
  const base = claimCompactionStep({ ...operation(), stepDigest: 'same' });
  expect(base.acquired).toBe(true);
  expect(claimCompactionStep({ ...operation(), model: 'other', stepDigest: 'same' }).acquired).toBe(true);
  expect(claimCompactionStep({ ...operation(), instructions: 'focus', stepDigest: 'same' }).acquired).toBe(true);
});

it('reports a corrupt operation file instead of treating it as empty', () => {
  fs.writeFileSync(compactionOperationsPath(sessionId), '{"version":1,"operations":{"x":{"steps":{}}}}');
  expect(() => claimCompactionStep({ ...operation(), stepDigest: 'step' })).toThrow(/invalid operation/i);
});

function messages(): AgentMessage[] {
  const result: AgentMessage[] = [];
  for (let index = 0; index < 12; index++) {
    result.push({ role: index % 2 === 0 ? 'user' : 'assistant', content: `${index}:${'x'.repeat(2_000)}` });
  }
  return result;
}
const policy: CompactionPolicy = { contextWindow: 4_000, reserveTokens: 0, keepRecentTokens: 100 };

it('reuses a completed summary instead of paying for the same step twice', async () => {
  const summarize = vi.fn(async () => 'summary');
  const first = await condenseContext({ messages: messages(), policy, summarize, force: true, operation: { sessionId } });
  expect(first.status).toBe('condensed');
  expect(summarize).toHaveBeenCalledOnce();
  const second = await condenseContext({ messages: messages(), policy, summarize, force: true, operation: { sessionId } });
  expect(second.status).toBe('condensed');
  expect(summarize).toHaveBeenCalledOnce();
  if (second.status === 'condensed') expect(second.summary).toBe('summary');
});

it('refuses a concurrent duplicate instead of paying twice', async () => {
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const summarize = vi.fn(async () => { await pending; return 'summary'; });
  const first = condenseContext({ messages: messages(), policy, summarize, force: true, operation: { sessionId } });
  const second = await condenseContext({ messages: messages(), policy, summarize, force: true, operation: { sessionId } });
  expect(second).toMatchObject({ status: 'declined', reason: 'step-unknown' });
  release();
  expect((await first).status).toBe('condensed');
  expect(summarize).toHaveBeenCalledOnce();
});

it('declines an unknown step without calling the summarizer again', async () => {
  const summarize = vi.fn(async () => undefined as string | undefined);
  const first = await condenseContext({ messages: messages(), policy, summarize, force: true, operation: { sessionId } });
  expect(first).toMatchObject({ status: 'declined', reason: 'unsummarized' });
  summarize.mockClear();
  const repeated = await condenseContext({ messages: messages(), policy, summarize, force: true, operation: { sessionId } });
  expect(repeated).toMatchObject({ status: 'declined', reason: 'step-unknown' });
  expect(summarize).not.toHaveBeenCalled();
});

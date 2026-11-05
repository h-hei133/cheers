import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { HookDecision, StopPayload } from '../core/hooks/types.js';
import { MAX_STOP_REENTRIES, STOP_TIMEOUT_MS } from '../core/hooks/stop/model.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import type { LifecycleRecord } from '../core/query/runtime/lifecycle.js';
import { ShellSessionRuntime } from '../core/shell/sessionRuntime.js';
import { SessionManager } from '../session/SessionManager.js';
import { runTurn, type TurnOptions } from './session.js';
import { isReadableTranscriptEvent } from '../session/transcript/validation.js';

const block: HookDecision = { decision: 'block', reasonCode: 'open_obligations', proofVerdict: 'refuted',
  evidenceIdentity: ['unit:b', 'unit:a'], reason: 'Repair the missing check in /first/path.' };
const allow: HookDecision = { decision: 'allow', reasonCode: 'proven', proofVerdict: 'proven', evidenceIdentity: ['unit:a', 'unit:b'] };

function fixture(handler: (payload: StopPayload) => HookDecision | Promise<HookDecision>, overrides: Partial<TurnOptions> = {}) {
  const hooks = new HookDispatcher();
  const attempts: StopPayload[] = [];
  hooks.registerInProcessHook({ event: 'Stop', name: 'completion-check', handler: payload => {
    attempts.push(payload as StopPayload); return handler(payload as StopPayload);
  } });
  const step = vi.fn(async (_messages, _signal, listener) => {
    listener.onText?.('Candidate answer');
    return { text: 'Candidate answer', toolCalls: [], stopReason: 'stop' as const };
  });
  const options: TurnOptions = { sessionId: 'stop-fixture', prompt: 'repair', workspaceRoot: process.cwd(),
    history: [], onMessage() {}, hooks, tools: new Map(), maxSteps: 5, step, signal: new AbortController().signal,
    ...overrides };
  return { options, attempts, step, hooks };
}

async function drain(options: TurnOptions): Promise<QueryEvent[]> {
  const events: QueryEvent[] = [];
  for await (const event of runTurn(options).events) events.push(event);
  return events;
}

function records(events: readonly QueryEvent[]): LifecycleRecord[] {
  return events.filter((event): event is LifecycleRecord => event.type === 'lifecycle.record');
}

function report(probe: string, events: readonly QueryEvent[], attempts: number) {
  console.log(JSON.stringify({ probe, attempts, reentries: Math.max(0, attempts - 1), completed: events.filter(e => e.type === 'query.completed').length,
    terminal: records(events).filter(e => e.kind === 'stop_state' && e.terminal).at(-1) }));
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Stop completion lifecycle', () => {
  it('withholds completed during block and resumes exactly once with feedback and stable identity', async () => {
    let release!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; });
    const f = fixture(payload => payload.reentryCount === 0 ? block : allow);
    f.step.mockImplementationOnce(async () => ({ text: 'First candidate', toolCalls: [], stopReason: 'stop' }));
    f.step.mockImplementationOnce(async (messages) => {
      expect(messages.at(-1)).toMatchObject({ role: 'system', content: expect.stringContaining('Repair the missing check') });
      await waiting;
      return { text: 'Repaired', toolCalls: [], stopReason: 'stop' };
    });
    const events: QueryEvent[] = [];
    const consume = (async () => { for await (const event of runTurn(f.options).events) events.push(event); })();
    await vi.waitFor(() => expect(f.step).toHaveBeenCalledTimes(2));
    expect(events.some(e => e.type === 'query.completed')).toBe(false);
    expect(records(events)).toContainEqual(expect.objectContaining({ kind: 'stop_state', state: 'repairing', terminal: false }));
    release(); await consume;
    expect(f.attempts.map(a => [a.reentryCount, a.stop_hook_active])).toEqual([[0, false], [1, true]]);
    expect(new Set(f.attempts.map(a => a.attemptId)).size).toBe(1);
    expect(events.filter(e => e.type === 'query.completed')).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'query.completed', result: { finalOutput: 'Repaired' } });
    report('block-repair-allow', events, f.attempts.length);
  });

  it.each([false, true])('stops a second block despite dynamic reason text, changed identity=%s', async changed => {
    const f = fixture(payload => ({ ...block, reason: `Changed reason /path/${payload.reentryCount}/${Date.now()}`,
      evidenceIdentity: payload.reentryCount === 0 ? ['unit:b', 'unit:a'] : changed ? ['unit:c'] : ['unit:a', 'unit:b', 'unit:a'] }));
    const events = await drain(f.options);
    expect(f.attempts).toHaveLength(2);
    expect(f.step).toHaveBeenCalledTimes(2);
    expect(MAX_STOP_REENTRIES).toBe(1);
    expect(events.some(e => e.type === 'query.completed')).toBe(false);
    const terminal = records(events).at(-1);
    expect(terminal).toMatchObject({ kind: 'stop_state', state: 'blocked', terminal: true,
      reasonCode: changed ? 'reentry_limit' : 'repeated_block' });
    const checks = records(events).filter(e => e.kind === 'hook_result');
    if (!changed) expect(checks[0].progressFingerprint).toEqual(checks[1].progressFingerprint);
    report(changed ? 'different-block-limit' : 'same-fingerprint', events, f.attempts.length);
  });

  it.each([
    ['unknown', { decision: 'unknown' }],
    ['could_not_decide', { decision: 'allow', reasonCode: 'could_not_decide' }],
    ['could_not_judge', { decision: 'allow', reasonCode: 'could_not_judge' }],
    ['already_blocked_once', { decision: 'allow', reasonCode: 'already_blocked_once' }],
    ['unsupported', { decision: 'unsupported' }],
  ] as const)('does not upgrade %s to completed', async (probe, result) => {
    const f = fixture(() => result);
    const events = await drain(f.options);
    expect(f.step).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'query.failed', stopStatus: 'unknown' });
    expect(events.some(e => e.type === 'query.completed')).toBe(false);
    report(probe, events, f.attempts.length);
  });

  it('keeps timeout and handler failure unknown', async () => {
    expect(STOP_TIMEOUT_MS).toBe(3000);
    for (const failure of ['timeout', 'handler_failed']) {
      const f = fixture(() => allow);
      f.hooks.clear();
      f.hooks.registerInProcessHook({ event: 'Stop', name: 'failing', timeoutMs: 30,
        handler: () => { if (failure === 'handler_failed') throw new Error('private failure detail'); return new Promise(() => {}); } });
      const events = await drain(f.options);
      expect(events.at(-1)).toMatchObject({ type: 'query.failed', stopStatus: 'unknown', error: expect.stringContaining(failure) });
      expect(events.some(e => e.type === 'query.completed')).toBe(false);
      expect(JSON.stringify(events)).not.toContain('private failure detail');
      report(failure, events, 1);
    }
  });

  it('does not renew model budget or retry a failed provider', async () => {
    const budget = fixture(() => block, { maxSteps: 1 });
    const events = await drain(budget.options);
    expect(budget.step).toHaveBeenCalledTimes(1);
    expect(records(events).at(-1)).toMatchObject({ state: 'blocked', reasonCode: 'step_limit' });
    const failed = fixture(() => block, { retry: { enabled: false }, step: async () => ({ text: '', toolCalls: [],
      stopReason: 'error', errorMessage: 'synthetic provider failure' }) });
    expect((await drain(failed.options)).at(-1)).toMatchObject({ type: 'query.failed' });
    expect(failed.attempts).toHaveLength(0);
  });

  it('keeps the remaining-step closing tool refusal active during repair', async () => {
    const execute = vi.fn(async () => ({ success: true, output: 'must not execute' }));
    const f = fixture(() => block, { maxSteps: 2, tools: new Map([['read', { name: 'read', description: 'fixture', argsSchema: { type: 'object' }, execute }]]) });
    f.step.mockImplementationOnce(async () => ({ text: 'Candidate', toolCalls: [], stopReason: 'stop' }))
      .mockImplementationOnce(async (_messages, _signal, _listener, request) => {
        expect(request.allowTools).toBe(false);
        return { text: 'Tool attempt', toolCalls: [{ id: 'closing-tool', name: 'read', args: { path: 'irrelevant' } }], stopReason: 'stop' };
      });
    const events = await drain(f.options);
    expect(execute).not.toHaveBeenCalled();
    expect(events.some(event => event.type === 'query.completed')).toBe(false);
    expect(f.step).toHaveBeenCalledTimes(2);
  });

  it.each(['nonzero', 'timeout', 'empty'] as const)('does not complete after real command %s', async failure => {
    const f = fixture(() => allow);
    f.hooks.clear();
    f.hooks.registerCommandHook({ event: 'Stop', timeoutMs: 30,
      command: failure === 'nonzero' ? 'exit 1' : failure === 'timeout' ? 'sleep 1' : 'true' });
    const events = await drain(f.options);
    expect(events.some(e => e.type === 'query.completed')).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'query.failed', stopStatus: 'unknown' });
    expect(f.step).toHaveBeenCalledTimes(1);
    report(`command-${failure}`, events, 1);
  });

  it.each(['checking', 'repairing'] as const)('cancels during %s without a late completed event', async phase => {
    const controller = new AbortController();
    const f = fixture(payload => phase === 'checking' ? new Promise(() => {}) : payload.reentryCount ? allow : block,
      { signal: controller.signal });
    if (phase === 'repairing') f.step.mockImplementationOnce(async () => ({ text: 'Candidate', toolCalls: [], stopReason: 'stop' }))
      .mockImplementationOnce(async (_messages, signal) => {
        if (!signal.aborted) await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
        return { text: '', toolCalls: [], stopReason: 'stop' };
      });
    const events: QueryEvent[] = [];
    for await (const event of runTurn(f.options).events) {
      events.push(event);
      if (event.type === 'lifecycle.record' && event.kind === 'stop_state' && event.state === phase) controller.abort();
    }
    expect(events.some(e => e.type === 'query.completed')).toBe(false);
    expect(records(events).at(-1)).toMatchObject({ state: 'stopped', reasonCode: 'cancelled' });
  });

  it('cannot accept removal of the blocking hook as a successful repair', async () => {
    const f = fixture(() => block);
    f.step.mockImplementationOnce(async () => ({ text: 'Candidate', toolCalls: [], stopReason: 'stop' }))
      .mockImplementationOnce(async () => { f.hooks.clear(); return { text: 'Claimed repair', toolCalls: [], stopReason: 'stop' }; });
    const events = await drain(f.options);
    expect(events.at(-1)).toMatchObject({ type: 'query.failed', stopStatus: 'unknown', error: expect.stringContaining('missing_recheck') });
  });
});

it('persists five distinct kinds through the real shell and manager, then accepts another user turn', async () => {
  const root = path.resolve('.tmp/stop-lifecycle-tests');
  fs.mkdirSync(root, { recursive: true });
  const home = fs.mkdtempSync(path.join(root, 'home-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', home);
  try {
    const manager = new SessionManager();
    const session = manager.createNew();
    let steps = 0;
    let executions = 0;
    let permissions = 0;
    const f = fixture(() => block, { sessionId: session.id, workspaceRoot: home, permissionScope: 'ask',
      onMessage: message => manager.addTurn(session.id, message),
      escalationPromptHandler: async prompt => { permissions++; return { promptId: prompt.id, decision: 'allow-once', respondedAt: 1 }; },
      tools: new Map([['bash', { name: 'bash', description: 'synthetic repair effect', argsSchema: { type: 'object' },
        execute: async () => { executions++; fs.writeFileSync(path.join(home, 'repaired.txt'), 'repaired'); return { success: true, output: 'repair executed' }; } }]]),
      step: async () => ++steps === 2
        ? { text: '', toolCalls: [{ id: 'repair-call', name: 'bash', args: { command: 'synthetic-repair' } }], stopReason: 'tool_calls' }
        : { text: `Candidate ${steps}`, toolCalls: [], stopReason: 'stop' },
    });
    const runtime = new ShellSessionRuntime({ sessionManager: manager,
      renderer: { renderLine() {}, renderChunk() {} } as never,
      runPrompt: async function* (prompt, signal) { yield* runTurn({ ...f.options, prompt, signal }).events; } });
    await expect(runtime.executePrompt(session.id, 'repair')).rejects.toThrow('repeated_block');
    expect(executions).toBe(1); expect(permissions).toBe(1);
    expect(fs.readFileSync(path.join(home, 'repaired.txt'), 'utf8')).toBe('repaired');
    const durable = new SessionManager().getTranscriptEvents(session.id).filter(e => e.type === 'query-event').map(e => e.event);
    const saved = records(durable);
    expect(saved.every(event => isReadableTranscriptEvent({ type: 'query-event', event, timestamp: '2026-11-05T00:00:00Z' }))).toBe(true);
    for (const change of [{ reentryCount: -1 }, { sequence: 0 }, { kind: 'invented' }, { progressFingerprint: null }, { stop_hook_active: 'yes' }]) {
      expect(isReadableTranscriptEvent({ type: 'query-event', event: { ...saved[0], ...change }, timestamp: '2026-11-05T00:00:00Z' })).toBe(false);
    }
    expect(new Set(saved.map(e => e.kind))).toEqual(new Set(['model_answer', 'hook_result', 'permission', 'execution', 'proof_verdict', 'stop_state']));
    expect(saved.map(e => e.sequence)).toEqual(saved.map((_e, i) => i + 1));
    expect(new Set(saved.map(e => e.attemptId)).size).toBe(1);
    expect(saved.at(-1)).toMatchObject({ state: 'blocked', terminal: true, reentryCount: 1 });
    const state = JSON.parse(fs.readFileSync(path.join(manager.getSessionDirPath(session.id), 'state.json'), 'utf8'));
    expect(state.terminalClassification).toBe('stopped');
    expect(runtime.getState()).not.toBe('terminated');
    console.log('PERSISTED_STOP_RECORDS=' + JSON.stringify(saved));
    if (process.env.CHEERS_STOP_EVIDENCE) fs.writeFileSync(process.env.CHEERS_STOP_EVIDENCE, JSON.stringify(saved, null, 2) + '\n');
    f.hooks.clear();
    await expect(runtime.executePrompt(session.id, 'new request')).resolves.toContain('Candidate');
  } finally { fs.rmSync(home, { recursive: true, force: true }); }
});

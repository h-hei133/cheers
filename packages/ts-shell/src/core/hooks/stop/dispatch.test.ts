import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../hookDispatcher.js';
import { loadHookDeclarations } from '../config.js';
import { registerDeclaredHooks } from '../registration.js';
import { HookTrustStore } from '../trust.js';
import type { StopPayload } from '../types.js';
import { commandIdentity, normalizeStopResult, progressFingerprint, stopCheck } from './result.js';
import { stopDeadline } from './deadline.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync(path.resolve('.tmp/stop-hook-tests'), { recursive: true });
  root = fs.mkdtempSync(path.resolve('.tmp/stop-hook-tests/run-'));
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

function payload(): StopPayload {
  return { eventName: 'Stop', sessionId: 'test', workspaceRoot: root, timestamp: new Date().toISOString(),
    turnsExecuted: 1, finalOutput: 'candidate', attemptId: 'attempt', reentryCount: 0, stop_hook_active: false };
}

function configure(handler: unknown, group = {}): void {
  fs.mkdirSync(path.join(root, '.agents'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/hooks.json'), JSON.stringify({ hooks: { Stop: [{ ...group, hooks: [handler] }] } }));
}

describe('Stop command boundary', () => {
  it('keeps large positive timeout budgets instead of Node coercing them to one millisecond', async () => {
    vi.useFakeTimers();
    const expired = vi.fn();
    const cancel = stopDeadline(2 ** 31 + 100, expired);
    await vi.advanceTimersByTimeAsync(2 ** 31);
    expect(expired).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(expired).toHaveBeenCalledTimes(1);
    cancel();
  });

  it.each(['failed', 'not_proven', 'refuted'] as const)('preserves %s proof without accepting a contradictory allow', proofVerdict => {
    expect(normalizeStopResult({ decision: 'allow', reasonCode: 'proven', proofVerdict, evidenceIdentity: ['proof:one'] }))
      .toMatchObject({ decision: 'unknown', reasonCode: 'conflicting_verdict', proofVerdict, evidenceIdentity: ['proof:one'] });
  });
  it.each([80, 1200])('uses handler timeoutMs=%s from hooks.json with isolated trust and measured execution', async timeoutMs => {
    // Shell built-ins for output, a real child for the wait. Deadline kills the whole process group.
    const command = `sleep 0.35; printf '%s' '{"decision":"allow","reasonCode":"proven","proofVerdict":"proven"}'`;
    configure({ command, timeoutMs });
    const homeDir = path.join(root, 'home');
    fs.mkdirSync(homeDir);
    expect(loadHookDeclarations(root, { homeDir }).hooks[0].timeoutMs).toBe(timeoutMs);
    const hooks = new HookDispatcher();
    const approval = vi.fn(async () => 'allow-once' as const);
    registerDeclaredHooks(hooks, root, { homeDir, trustStore: new HookTrustStore(path.join(homeDir, 'trust.json')), requestApproval: approval });
    const before = Date.now();
    const result = await hooks.dispatch(payload());
    const elapsedMs = Date.now() - before;
    expect(approval).toHaveBeenCalledTimes(1);
    expect(result.decision).toBe(timeoutMs === 80 ? 'unknown' : 'allow');
    if (timeoutMs === 80) {
      expect(result.reasonCode).toBe('timeout');
      expect(elapsedMs).toBeGreaterThanOrEqual(60);
      expect(elapsedMs).toBeLessThan(1000);
    } else expect(elapsedMs).toBeGreaterThanOrEqual(300);
    console.log(JSON.stringify({ probe: 'hooks-json-timeout', configuration: JSON.parse(fs.readFileSync(path.join(root, '.agents/hooks.json'), 'utf8')),
      elapsedMs, approvalCalls: approval.mock.calls.length, decision: result.decision, reasonCode: result.reasonCode }));
  });

  it.each([0, -1, 1.5, '100', null, Number.MAX_SAFE_INTEGER + 1])('reports invalid timeout %s without discarding the hook', timeoutMs => {
    configure({ command: 'check', timeoutMs });
    const result = loadHookDeclarations(root, { includeUser: false });
    expect(result.hooks).toHaveLength(1);
    expect(result.hooks[0].timeoutMs).toBeUndefined();
    expect(result.problems).toEqual([expect.stringContaining('positive integer in milliseconds')]);
  });

  it('does not interpret group timeout or second-based timeout as handler timeoutMs', () => {
    configure({ command: 'check', timeout: 100 }, { timeoutMs: 1 });
    expect(loadHookDeclarations(root, { includeUser: false }).hooks[0].timeoutMs).toBeUndefined();
  });

  it.each([
    ['nonzero', 'exit 1', 'process_failed'],
    ['empty', 'true', 'empty_output'],
    ['malformed', `printf '%s' 'not-json'`, 'invalid_output'],
    ['unknown', `printf '%s' '{"decision":"unknown"}'`, 'unknown'],
    ['wire-unknown', `printf '%s' '{"decision":"allow","reasonCode":"could_not_judge"}'`, 'could_not_judge'],
    ['exit-2', `printf '%s' 'repair' >&2; exit 2`, 'exit_2'],
  ])('classifies actual process %s', async (probe, command, reasonCode) => {
    const hooks = new HookDispatcher({ commandHooks: [{ event: 'Stop', command }] });
    const result = await hooks.dispatch(payload());
    expect(result.decision).toBe(probe === 'exit-2' ? 'block' : 'unknown');
    expect(result.reasonCode).toBe(reasonCode);
    expect(result.stopChecks?.[0].command).toBe(commandIdentity(command));
    console.log(JSON.stringify({ probe, decision: result.decision, reasonCode: result.reasonCode }));
  });

  it('passes canonical lifecycle identity on stdin and cancels a real child', async () => {
    const script = path.join(root, 'check.cjs');
    fs.writeFileSync(script, `let text=''; process.stdin.on('data', chunk => text += chunk); process.stdin.on('end', () => {
      const p=JSON.parse(text); require('node:fs').writeFileSync('received.json', JSON.stringify(p)); setInterval(() => {}, 1000);
    });`);
    const hooks = new HookDispatcher({ commandHooks: [{ event: 'Stop', command: `exec node '${script}'`, timeoutMs: 10000 }] });
    const controller = new AbortController();
    const promise = hooks.dispatch({ ...payload(), reentryCount: 1, stop_hook_active: true }, { signal: controller.signal });
    await vi.waitFor(() => expect(fs.existsSync(path.join(root, 'received.json'))).toBe(true));
    controller.abort();
    expect(await promise).toMatchObject({ decision: 'unknown', reasonCode: 'cancelled' });
    expect(JSON.parse(fs.readFileSync(path.join(root, 'received.json'), 'utf8'))).toMatchObject({
      hook_event_name: 'Stop', attemptId: 'attempt', reentryCount: 1, stop_hook_active: true, cwd: root,
    });
  });

  it('does not run an unapproved project hook or persist a late approval after timeout', async () => {
    configure({ command: `touch must-not-exist`, timeoutMs: 25 });
    const homeDir = path.join(root, 'home'); fs.mkdirSync(homeDir);
    const trustStore = new HookTrustStore(path.join(homeDir, 'trust.json'));
    const hooks = new HookDispatcher();
    registerDeclaredHooks(hooks, root, { homeDir, trustStore });
    expect(await hooks.dispatch(payload())).toMatchObject({ decision: 'unknown', reasonCode: 'not_authorized' });
    let release!: (value: 'allow-always') => void;
    const recordTrust = vi.spyOn(trustStore, 'recordTrust');
    registerDeclaredHooks(hooks, root, { homeDir, trustStore,
      requestApproval: () => new Promise(resolve => { release = resolve; }) });
    expect(await hooks.dispatch(payload())).toMatchObject({ decision: 'unknown', reasonCode: 'timeout' });
    release('allow-always');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(recordTrust).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(root, 'must-not-exist'))).toBe(false);
  });

  it('fingerprints ignore command order, reason prose and evidence order but retain semantic components', () => {
    const a = stopCheck('  checker --mode "a  b"  ', { decision: 'block', reasonCode: 'open_obligations',
      proofVerdict: 'refuted', evidenceIdentity: ['b', 'a'], reason: '/a/first' }, 1);
    const b = stopCheck('other', { decision: 'allow', reasonCode: 'proven', proofVerdict: 'proven' }, 2);
    expect(progressFingerprint([a, b])).toEqual(progressFingerprint([b, { ...a, durationMs: 500, evidenceIdentity: ['a', 'b', 'a'] }]));
    for (const patch of [{ command: commandIdentity('checker --mode "a b"') }, { reasonCode: 'new_reason' },
      { proofVerdict: 'partial' as const }, { evidenceIdentity: ['c'] }]) {
      expect(progressFingerprint([a])).not.toEqual(progressFingerprint([{ ...a, ...patch }]));
    }
  });
});

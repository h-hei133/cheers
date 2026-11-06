import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HookDispatcher } from '../core/hooks/hookDispatcher.js';
import type { HookDecision } from '../core/hooks/types.js';
import type { QueryEvent } from '../core/query/runtime/events.js';
import { ShellSessionRuntime } from '../core/shell/sessionRuntime.js';
import { SessionManager } from '../session/SessionManager.js';
import { isReadableTranscriptEvent } from '../session/transcript/validation.js';
import { projectEvent } from '../collaboration/client/events.js';
import { TurnSink } from '../cli/interactive/turnSink.js';
import { Transcript } from '../presentation/tui/transcript/container.js';
import { runTurn } from './session.js';
import { applyCompactRetentionPlan } from '../session/continuation/retentionPlanner.js';
import { selectBranchResultMemory } from '../session/continuation/branch.js';
import { projectSessionReentrySummary } from '../session/presentation/sessionReentrySurface.js';
import { decodeReentrySummary } from '../session/recovery/reentry/codec.js';
import { formatSwitchedSessionLines } from '../core/shell/sessionStateSurface.js';

const contract = { name: 'normproof.completion-gate.stop', version: '0.1.0' };
const proven = { contract, decision: 'allow', reasonCode: 'proven', proofVerdict: 'proven', evidenceIdentity: ['proof:fixture'] };
let root: string;
beforeEach(() => {
  const base = path.resolve('../../.tmp/stop-envelope-validation'); fs.mkdirSync(base, { recursive: true });
  root = fs.mkdtempSync(path.join(base, 'session-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', path.dirname(root));
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

async function execute(handler?: (count: number) => unknown, command?: string) {
  const manager = new SessionManager(); const session = manager.createNew(root);
  const hooks = new HookDispatcher();
  if (handler) hooks.registerInProcessHook({ event: 'Stop', name: 'envelope-check', handler: payload => handler((payload as { reentryCount: number }).reentryCount) as HookDecision });
  if (command) hooks.registerCommandHook({ event: 'Stop', command });
  const events: QueryEvent[] = []; const lines: string[] = []; const settlements: string[] = []; const modelInputs: string[] = [];
  const transcript = new Transcript(); const sink = new TurnSink(transcript, () => {}); sink.begin('fixture', 'fixture');
  let steps = 0;
  const runtime = new ShellSessionRuntime({ sessionManager: manager,
    renderer: { renderLine: line => lines.push(line), renderChunk: chunk => lines.push(chunk) } as never,
    promptSettled: async (_metadata, _signal, outcome) => { settlements.push(outcome); },
    runPrompt: (prompt, signal) => runTurn({ sessionId: session.id, workspaceRoot: root, prompt, signal,
      step: async messages => { modelInputs.push(JSON.stringify(messages)); return { text: `Candidate ${++steps}`, toolCalls: [], stopReason: 'stop' }; },
      history: [], onMessage: message => manager.addTurn(session.id, message), hooks, maxSteps: 3, tools: new Map() }) });
  runtime.observeEvents(event => { events.push(event); sink.handleEvent(event); }, { renders: false });
  let error: unknown; let output: string | undefined;
  try { output = await runtime.executePrompt(session.id, 'fixture', { outputMode: 'print' }); } catch (caught) { error = caught; }
  sink.end();
  const fresh = new SessionManager();
  const state = JSON.parse(fs.readFileSync(path.join(manager.getSessionDirPath(session.id), 'state.json'), 'utf8'));
  const recovery = fresh.getRecoverySnapshot(session.id); const replay = fresh.getReplayPlan(session.id);
  const continuity = fresh.buildContinuitySnapshot(session.id);
  const saved = fresh.getTranscriptEvents(session.id);
  const result = { sessionId: session.id, events, error, output, steps, state, recovery, replay, continuity, saved, lines, settlements, modelInputs, runtime, sink, transcript };
  console.log(JSON.stringify({ probe: 'envelope-lifecycle', finalEvent: events.at(-1), steps,
    eventSequence: events.map(event => event.type === 'lifecycle.record' ? { type: event.type, ...event } : event),
    projections: { session: { status: state.status, durableStatus: state.durableStatus, classification: state.terminalClassification, reasonCode: state.terminalReasonCode },
      recovery: { durableStatus: recovery.durableStatus, classification: recovery.terminalClassification, reasonCode: recovery.terminalReasonCode },
      continuity: { classification: continuity.lastTerminalClassification, reasonCode: continuity.lastTerminalReasonCode },
      cli: lines, sinkInterrupted: sink.lastTurnFailed, settlement: settlements,
      relay: events.map((event, index) => projectEvent(event, index + 1, 0)).filter(Boolean),
      replayTerminal: replay.normalizedTranscriptEvents.filter(event => event.type === 'query-event' && event.event.type.startsWith('query.')) } }));
  return result;
}

function expectFailed(result: Awaited<ReturnType<typeof execute>>, reasonCode: string) {
  expect(result.error).toBeInstanceOf(Error);
  expect(result.events.at(-1)).toMatchObject({ type: 'query.failed', stopStatus: 'unknown', error: expect.stringContaining(reasonCode) });
  expect(result.events.some(event => event.type === 'query.completed' || event.type === 'query.completed_unproven')).toBe(false);
  expect(result.settlements).toEqual(['failed']);
}

function expectNeutral(result: Awaited<ReturnType<typeof execute>>, reasonCode: string) {
  expect(result.error).toBeUndefined(); expect(result.output).toContain('Candidate');
  expect(result.events.at(-1)).toMatchObject({ type: 'query.completed_unproven', reasonCode, proofVerdict: 'not_reported',
    result: { status: 'completed_unproven', terminalClassification: 'completed_unproven', terminalReason: 'completed_unproven' } });
  expect(result.events.some(event => event.type === 'query.completed' || event.type === 'query.failed')).toBe(false);
  expect(result.state).toMatchObject({ status: 'completed_unproven', durableStatus: 'completed_unproven',
    terminalClassification: 'completed_unproven', terminalReasonCode: reasonCode, runPhase: 'idle' });
  expect(result.state.lastError).toBeUndefined(); expect(result.state.pendingPrompt).toBeUndefined();
  expect(result.recovery).toMatchObject({ terminalClassification: 'completed_unproven', terminalReasonCode: reasonCode });
  expect(result.continuity).toMatchObject({ lastTerminalClassification: 'completed_unproven', lastTerminalReasonCode: reasonCode });
  expect(result.continuity.lastFailure).toBeUndefined();
  expect(result.continuity.unresolvedItems.some(item => item.startsWith('last-error:'))).toBe(false);
  expect(result.replay.continuationPrompt).toBeUndefined();
  expect(result.saved.every(isReadableTranscriptEvent)).toBe(true);
  expect(result.saved.filter(event => event.type === 'lifecycle').at(-1)).toMatchObject({ event: 'run-completed-unproven', detail: reasonCode });
  expect(result.lines.join('\n')).toContain('Outcome: completed_unproven');
  expect(result.sink.lastTurnFailed).toBe(false);
  expect(result.transcript.render(100).rows.join('\n')).toContain(reasonCode);
  expect(result.settlements).toEqual(['completed_unproven']); expect(result.runtime.getState()).toBe('idle');
}

describe('versioned Stop envelope end-to-end', () => {
  it.each([
    ['allow-default', { decision: 'allow' }, 'explicit_allow'],
    ['allow-custom', { decision: 'allow', reasonCode: 'lint_passed' }, 'lint_passed'],
    ['block-default', { decision: 'block', reason: 'Repair the gap.' }, 'hook_blocked'],
    ['block-custom', { decision: 'block', reasonCode: 'lint_failed' }, 'lint_failed'],
    ['retry-default', { decision: 'retry', reason: 'Repair the gap.' }, 'hook_blocked'],
    ['retry-custom', { decision: 'retry', reasonCode: 'need_more' }, 'need_more'],
  ])('preserves flat %s through a real command and terminal consumers', async (probe, input, reasonCode) => {
    const script = path.join(root, 'flat.cjs');
    fs.writeFileSync(script, `let text='';process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>{
      const payload=JSON.parse(text);console.log(JSON.stringify(payload.stop_hook_active?{decision:'allow'}:${JSON.stringify(input)}));
    });`);
    const result = await execute(undefined, `'${process.execPath}' '${script}'`);
    expect(result.error).toBeUndefined();
    expect(result.events.at(-1)).toMatchObject({ type: 'query.completed', result: { terminalClassification: 'success' } });
    expect(result.events.some(event => event.type === 'query.failed' || event.type === 'query.completed_unproven')).toBe(false);
    expect(result.state).toMatchObject({ status: 'completed', terminalClassification: 'success' });
    expect(result.recovery.terminalClassification).toBe('success');
    expect(result.continuity.lastTerminalClassification).toBe('success');
    expect(result.settlements).toEqual(['completed']);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'lifecycle.record', kind: 'hook_result',
      result: expect.objectContaining({ decision: input.decision, reasonCode, proofVerdict: 'not_reported' }) }));
    expect(result.steps).toBe(input.decision === 'allow' ? 1 : 2);
    const retries = result.events.filter(event => event.type === 'query.retrying');
    expect(retries).toHaveLength(input.decision === 'allow' ? 0 : 1);
    console.log(JSON.stringify({ probe: 'flat-compatibility', input, reasonCode, steps: result.steps,
      finalEvent: result.events.at(-1), retryCount: retries.length }));
  });

  it('keeps repeated flat blocks bounded and feeds their reason into repair', async () => {
    const result = await execute(() => ({ decision: 'block', reason: 'Repair the legacy gap.' }));
    expect(result.error).toBeInstanceOf(Error);
    expect(result.steps).toBe(2);
    expect(result.events.at(-1)).toMatchObject({ type: 'query.failed', stopStatus: 'blocked', error: expect.stringContaining('repeated_block') });
    expect(result.events.some(event => event.type === 'query.completed' || event.type === 'query.completed_unproven')).toBe(false);
    expect(JSON.parse(result.modelInputs[1]).at(-1)).toMatchObject({ role: 'system', content: expect.stringContaining('Repair the legacy gap.') });
  });

  it.each([
    ['unknown', { decision: 'unknown' }],
    ['unsupported', { decision: 'unsupported' }],
    ['unknown', { decision: 'allow', proofVerdict: 'unknown' }],
    ['could_not_judge', { decision: 'allow', reasonCode: 'could_not_judge' }],
    ['conflicting_verdict', { decision: 'allow', reasonCode: 'lint_passed', proofVerdict: 'not_proven' }],
    ['invalid_output', { decision: 'allow', proofVerdict: ['not_reported'] }],
    ['invalid_output', { contract, decision: 'allow', reasonCode: 'lint_passed', proofVerdict: 'not_reported' }],
    ['invalid_output', { contract, decision: 'retry', reasonCode: 'need_more', proofVerdict: 'not_reported' }],
    ['invalid_output', { contract, decision: 'block', reason: 'Repair the gap.', proofVerdict: 'not_proven' }],
    ['invalid_output', { contract, decision: 'allow', proofVerdict: 'not_reported' }],
  ])('keeps the flat compatibility boundary strict for %s', async (reasonCode, input) => {
    expectFailed(await execute(() => input), reasonCode as string);
  });

  it.each(['already_blocked_once', 'not_configured'] as const)('preserves neutral %s through terminal consumers', async reasonCode => {
    const result = await execute(count => reasonCode === 'already_blocked_once' && count === 0
      ? { contract, decision: 'block', reasonCode: 'actionable_gap', proofVerdict: 'not_proven', reason: 'Repair the gap.' }
      : { contract, decision: reasonCode === 'not_configured' ? 'unsupported' : 'allow', reasonCode, proofVerdict: 'not_reported' });
    expectNeutral(result, reasonCode); expect(result.steps).toBe(reasonCode === 'already_blocked_once' ? 2 : 1);
    const terminal = result.events.at(-1)!;
    expect(isReadableTranscriptEvent({ type: 'query-event', timestamp: '', event: { ...terminal, type: 'query.completed' } })).toBe(false);
    expect(projectEvent(terminal, 1, 0)?.kind).toBe('query.completed_unproven');
    if (terminal.type !== 'query.completed_unproven') throw new Error('missing neutral event');
    for (const change of [{ proofVerdict: 'proven' }, { reasonCode: 'could_not_judge' }, { reentryCount: 2 },
      { stop_hook_active: !terminal.stop_hook_active }, { result: { ...terminal.result, terminalClassification: 'success' } }]) {
      expect(isReadableTranscriptEvent({ type: 'query-event', timestamp: '2026-11-06T00:00:00Z', event: { ...terminal, ...change } })).toBe(false);
    }
    const summary = projectSessionReentrySummary({ session: new SessionManager().getSession(result.sessionId)!,
      recoverySnapshot: result.recovery, continuitySnapshot: result.continuity,
      trustBoundary: { recoverable: false, disposition: 'not-resumable', autoResumeReady: false, detail: 'No unfinished run' } });
    expect(decodeReentrySummary(summary, result.sessionId)?.terminalReasonCode).toBe(reasonCode);
    expect(formatSwitchedSessionLines(summary).join('\n')).toContain(`completed_unproven (${reasonCode})`);
    result.runtime.observeEvents(event => { if (event.type !== 'query.started') return;
      const state = JSON.parse(fs.readFileSync(path.join(new SessionManager().getSessionDirPath(result.sessionId), 'state.json'), 'utf8'));
      expect(state.terminalReasonCode).toBeUndefined();
    }, { renders: false });
    await expect(result.runtime.executePrompt(result.sessionId, 'next')).resolves.toContain('Candidate');
  });

  it.each(['already_blocked_once', 'not_configured'] as const)('keeps %s with unknown proof failed', async reasonCode => {
    expectFailed(await execute(() => ({ contract, decision: 'allow', reasonCode, proofVerdict: 'unknown' })), reasonCode);
  });

  it.each([
    ['could_not_judge', { contract, decision: 'unknown', reasonCode: 'could_not_judge', proofVerdict: 'not_reported' }],
    ['could_not_decide', { decision: 'allow', reasonCode: 'could_not_decide' }],
    ['invalid_output', { ...proven, reasonCode: undefined }],
    ['invalid_output', { ...proven, reasonCode: 'unrecognized_reason' }],
    ['invalid_output', { ...proven, proofVerdict: undefined }],
    ['invalid_output', { contract, decision: 'allow', reasonCode: 'not_configured', proofVerdict: ['not_reported'] }],
    ['incompatible_contract', { ...proven, contract: { ...contract, version: '99.0.0' } }],
    ['incompatible_contract', { ...proven, contract: { ...contract, name: 'other' } }],
    ['conflicting_verdict', { ...proven, proofVerdict: 'not_proven' }],
    ['conflicting_verdict', { contract, decision: 'allow', reasonCode: 'not_configured', proofVerdict: 'proven' }],
    ['conflicting_verdict', { ...proven, reasonCode: 'actionable_gap' }],
    ['conflicting_verdict', { contract, decision: 'block', reasonCode: 'already_blocked_once', proofVerdict: 'not_reported' }],
    ['internal_error', { contract, decision: 'failed', reasonCode: 'internal_error', proofVerdict: 'not_reported' }],
  ])('fails %s from malformed, incompatible or uncertain envelopes', async (reasonCode, envelope) => {
    expectFailed(await execute(() => envelope), reasonCode as string);
  });

  it('accepts the compatible proven positive control and defaults evidence identity', async () => {
    const result = await execute(() => ({ ...proven, evidenceIdentity: undefined }));
    expect(result.error).toBeUndefined(); expect(result.events.at(-1)).toMatchObject({ type: 'query.completed' });
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'lifecycle.record', kind: 'hook_result',
      result: expect.objectContaining({ evidenceIdentity: ['unspecified'] }) }));
  });

  it('replaces stale terminal facts at compaction and excludes neutral facts from another branch', async () => {
    const result = await execute(() => ({ contract, decision: 'allow', reasonCode: 'not_configured', proofVerdict: 'not_reported' }));
    const terminal = result.events.at(-1)!;
    const memory = applyCompactRetentionPlan({ workingMemory: { sourceTurnCount: 1,
      continuity: { lastTaskKind: 'edit-file', lastTerminalClassification: 'success', lastFailure: 'old failure' } },
      event: terminal, turnThreshold: 2, now: '2026-11-06', approvalAuditHistory: [], result: {
        taskKind: 'edit-file', source: { eventId: 'neutral', entryId: 'excluded' }, terminal: {
          terminalClassification: 'completed_unproven', terminalReason: 'completed_unproven', terminalReasonCode: 'not_configured', stopReason: 'not_configured' } } }) as { continuity: Record<string, unknown> };
    expect(memory).toMatchObject({ compacted: true, sourceTurnCount: 2, continuity: { lastTerminalClassification: 'completed_unproven', lastTerminalReasonCode: 'not_configured' } });
    expect(memory.continuity.lastFailure).toBeUndefined();
    expect(selectBranchResultMemory(memory, undefined, [{ type: 'query-event', id: 'neutral', sourceEntryId: 'other', timestamp: '', event: terminal }]))
      .toMatchObject({ continuity: {} });
  });

  it('consumes the same command block then re-entry yield without a fresh proof', async () => {
    const cli = process.env.CHEERS_R0A_CLI;
    const fixture = path.join(root, 'reentry.cjs');
    fs.writeFileSync(fixture, `let text='';process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>console.log(JSON.stringify(JSON.parse(text).stop_hook_active?${JSON.stringify({ contract, decision: 'allow', reasonCode: 'already_blocked_once', proofVerdict: 'not_reported' })}:${JSON.stringify({ contract, decision: 'block', reasonCode: 'actionable_gap', proofVerdict: 'not_proven' })})));`);
    if (cli) {
      const config = path.join(root, '.normproof'); fs.mkdirSync(config);
      const reference = path.resolve(path.dirname(cli), '../../../.normproof');
      fs.copyFileSync(path.join(reference, 'judge-input.json'), path.join(config, 'judge-input.json'));
      const manifest = JSON.parse(fs.readFileSync(path.join(reference, 'evidence-manifest.json'), 'utf8'));
      manifest.workspace = '.'; manifest.entries[0].source.path = 'missing-agents.md';
      fs.writeFileSync(path.join(config, 'evidence-manifest.json'), JSON.stringify(manifest));
    }
    const command = `'${process.execPath}' '${cli ?? fixture}' gate stop --emit-result`;
    console.log(JSON.stringify({ probe: 'command-reentry', command, realNormProof: Boolean(cli) }));
    const result = await execute(undefined, command); expectNeutral(result, 'already_blocked_once');
    expect(result.steps).toBe(2);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'lifecycle.record', kind: 'hook_result',
      result: expect.objectContaining({ decision: 'block', reasonCode: 'actionable_gap' }) }));
    expect(result.events.at(-1)).toMatchObject({ reentryCount: 1, stop_hook_active: true });
  });

  it('keeps the old gate stop command without --emit-result unknown', async () => {
    const cli = process.env.CHEERS_R0A_CLI;
    const fixture = path.join(root, 'gate.cjs');
    fs.writeFileSync(fixture, `if (process.argv.includes('--emit-result')) console.log(JSON.stringify(${JSON.stringify({ contract, decision: 'unsupported', reasonCode: 'not_configured', proofVerdict: 'not_reported' })}));`);
    const command = `'${process.execPath}' '${cli ?? fixture}' gate stop`;
    console.log(JSON.stringify({ probe: 'legacy-command', command, realNormProof: Boolean(cli) }));
    expectFailed(await execute(undefined, command), 'empty_output');
    expectNeutral(await execute(undefined, command + ' --emit-result'), 'not_configured');
  });

  it('consumes a legacy gate stop block without --emit-result before its empty re-entry yield', async () => {
    const cli = process.env.CHEERS_R0A_CLI;
    const fixture = path.join(root, 'legacy-block.cjs');
    fs.writeFileSync(fixture, `let text='';process.stdin.on('data',chunk=>text+=chunk);process.stdin.on('end',()=>{
      if(!JSON.parse(text).stop_hook_active)console.log(JSON.stringify({decision:'block',reason:'Repair the legacy gap.'}));
    });`);
    if (cli) {
      const config = path.join(root, '.normproof'); fs.mkdirSync(config);
      const reference = path.resolve(path.dirname(cli), '../../../.normproof');
      fs.copyFileSync(path.join(reference, 'judge-input.json'), path.join(config, 'judge-input.json'));
      const manifest = JSON.parse(fs.readFileSync(path.join(reference, 'evidence-manifest.json'), 'utf8'));
      manifest.workspace = '.'; manifest.entries[0].source.path = 'missing-agents.md';
      fs.writeFileSync(path.join(config, 'evidence-manifest.json'), JSON.stringify(manifest));
    }
    const command = `'${process.execPath}' '${cli ?? fixture}' gate stop`;
    const result = await execute(undefined, command);
    expectFailed(result, 'empty_output'); expect(result.steps).toBe(2);
    expect(result.events.filter(event => event.type === 'query.retrying')).toHaveLength(1);
    expect(result.events).toContainEqual(expect.objectContaining({ type: 'lifecycle.record', kind: 'hook_result',
      result: expect.objectContaining({ decision: 'block', reasonCode: 'hook_blocked', proofVerdict: 'not_reported' }) }));
    console.log(JSON.stringify({ probe: 'legacy-block-command', command, realNormProof: Boolean(cli), steps: result.steps,
      hookChecks: result.events.filter(event => event.type === 'lifecycle.record' && event.kind === 'hook_result'), finalEvent: result.events.at(-1) }));
  });

  it('does not bypass a later blocking hook after an unproven result', async () => {
    const hooks = new HookDispatcher();
    hooks.registerInProcessHook({ event: 'Stop', name: 'neutral', handler: () => ({ decision: 'allow', reasonCode: 'not_configured' }) });
    hooks.registerInProcessHook({ event: 'Stop', name: 'block', handler: () => ({ decision: 'block', reasonCode: 'actionable_gap' }) });
    const decision = await hooks.dispatch({ eventName: 'Stop', sessionId: 'fixture', workspaceRoot: root, timestamp: '',
      turnsExecuted: 1, finalOutput: '', attemptId: 'fixture', reentryCount: 0, stop_hook_active: false });
    expect(decision.decision).toBe('block'); expect(decision.stopChecks).toHaveLength(2);
  });
});

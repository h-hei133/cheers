import fs from 'node:fs';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { createAdvisorHarness, cleanupAdvisorHarnesses } from '../../test-utils/advisor.js';
import { fixture, startFixtureService } from '../../collaboration/__tests__/fixture.js';
import { startCollaborationService } from '../../collaboration/service/listener.js';
import { readProfile } from '../../collaboration/client/profile.js';
import { CollaborationClient } from '../../collaboration/client/service.js';
import { collaborationHosts } from './state.js';
import { installCollaborationRuntime, closeCollaborationFor, collaborationCommandFor } from '../runtime/collaboration.js';
import { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { QueryEvent } from '../../core/query/runtime/events.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import { admitCollaborationPrompt, settleCollaborationPrompt } from './acceptance.js';
import { collaborationPolicyFor } from './policy.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';
import { object } from '../../collaboration/contract/value.js';
import type { Acceptance } from '../../collaboration/contract/model.js';
import { readBoundSessionState } from '../../session/store/bound.js';
import { decodeRequestLedger } from '../../core/agent/request/codec.js';
import { runSessionGoalCommand } from '../../planning/goal/command.js';
import { runCollaborationCommand } from './command.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); cleanupAdvisorHarnesses(); vi.restoreAllMocks(); });

it('binds a pending collaboration test request to the host cancellation signal', async () => {
  const pending = new AbortController();
  let received: AbortSignal | undefined;
  const request = vi.fn((_operation: string, _input: unknown, _mutation: boolean, signal?: AbortSignal) =>
    new Promise((_, reject) => {
      received = signal;
      signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true });
    }));
  const host = {
    pending,
    client: {
      profile: { origin: 'https://collab.test', principal: 'alice', check() {} },
      request,
    },
  } as never;

  const running = runCollaborationCommand(host, 'collab', ['test'], {
    cwd: '/workspace',
    projectRoot: '/workspace',
    sessionId: 'sess_collab',
  } as never);
  await vi.waitFor(() => expect(request).toHaveBeenCalledOnce());
  pending.abort();
  const result = await running;

  expect(received).toBe(pending.signal);
  expect(result.kind).toBe('local');
  expect(result.kind === 'local' && result.output).toContain('Collaboration refused or unavailable');
}, 2_000);

async function setup(withGoal = false) {
  const session = createAdvisorHarness(false, false); const serviceFixture = fixture(); cleanups.push(serviceFixture.cleanup);
  if (withGoal) await runSessionGoalCommand(['set', 'Meter explicitly adopted remote work'],
    { cwd: session.root, projectRoot: session.root, sessionId: session.session.id }, session.manager, session.session);
  const service = await startFixtureService(serviceFixture.config); cleanups.push(service.close);
  const context = { cwd: session.root, projectRoot: session.root, session: session.session } as ShellRuntimeContext;
  let approve = true; let failBarrier = false; let failSave = false; let runs = 0; let purpose = ''; let outcomeSeen: unknown;
  const renderer = { renderLine() {}, renderChunk() {} } as never;
  const runtime = new ShellSessionRuntime({ sessionManager: session.manager, renderer,
    admitPrompt: admitCollaborationPrompt.bind(undefined, context),
    promptSettled: async (metadata, signal, outcome) => { outcomeSeen = outcome; await settleCollaborationPrompt(context, metadata, signal, outcome); },
    runPrompt: (_prompt, _signal) => (async function* (): AsyncGenerator<QueryEvent> {
      runs++;
      const policy = collaborationPolicyFor(context, goalRequestPolicy(session.manager, session.session))!;
      const attempt = policy.reserve({ requestId: 'native-' + runs, bodyDigest: 'a'.repeat(64), provider: 'fixture', model: 'm', endpoint: 'test', purpose: 'turn' });
      attempt.dispatch();
      const ledger = decodeRequestLedger(readBoundSessionState(session.manager, session.session).state.requestLedger)!;
      const pending = Object.values(ledger.scopes).flatMap(scope => Object.values(scope.pending));
      purpose = pending.find(value => value.requestId === 'native-' + runs)!.purpose;
      attempt.settle({ version: 1, inputTokens: 7, outputTokens: 3, complete: true });
      yield { type: 'query.completed', result: { status: 'completed', terminalReason: 'completed', terminalClassification: 'success', transcript: [],
        sharedContext: { sessionId: session.session.id, initialPrompt: 'adopted', notes: [], handoffs: [] }, finalOutput: 'native done' } as never };
    })(),
  });
  runtime.observeEvents(() => {}, { renders: true });
  const gate = (): ToolGateOptions => ({ workspaceRoot: session.root, sessionId: session.session.id, permissionScope: 'ask', hooks: new HookDispatcher(),
    emit: event => session.manager.appendQueryEvent(session.session.id, event), escalationPromptHandler: async () => ({ decision: approve ? 'allow-once' : 'deny' }) });
  installCollaborationRuntime(context, session.manager, runtime, gate);
  cleanups.push(async () => { try { await closeCollaborationFor(context); } catch { /* Expired remote effects remain unknown in their durable service fixture. */ } });
  const profileFile = path.join(session.root, 'alice.profile.json'); const tokenFile = path.join(session.root, 'alice.token');
  fs.writeFileSync(tokenFile, serviceFixture.tokens.alice, { mode: 0o600 });
  fs.writeFileSync(profileFile, JSON.stringify({ version: 1, origin: service.origin, principal: 'alice', tokenFile, addresses: ['127.0.0.1'] }), { mode: 0o600 });
  const command = (name: 'collab' | 'share' | 'dump', args: string[]) => collaborationCommandFor(context)(name, args,
    { cwd: session.root, projectRoot: session.root, sessionId: session.session.id });
  const bob = new CollaborationClient({ ...readProfile(profileFile), principal: 'bob', token: serviceFixture.tokens.bob, check() {} }); cleanups.push(() => bob.close());
  const proposal = async () => {
    const host = collaborationHosts.get(context)!.host!; const joined = object((await bob.request('join', { roomId: host.roomId, data: {} })).result);
    return object((await bob.request('propose', { roomId: host.roomId, ticket: String(joined.ticket), data: { kind: 'ask', text: 'Inspect only; keep existing approval.' } }, true)).result);
  };
  const originalBarrier = session.manager.persistUserPromptBarrier.bind(session.manager);
  vi.spyOn(session.manager, 'persistUserPromptBarrier').mockImplementation((...args) => { if (failBarrier) throw new Error('Synthetic barrier failure'); return originalBarrier(...args); });
  const originalSave = session.manager.saveCompleted.bind(session.manager); const originalError = session.manager.saveError.bind(session.manager);
  vi.spyOn(session.manager, 'saveCompleted').mockImplementation((...args) => { if (failSave) throw new Error('Synthetic terminal save failure'); return originalSave(...args); });
  vi.spyOn(session.manager, 'saveError').mockImplementation((...args) => { if (failSave) throw new Error('Synthetic error save failure'); return originalError(...args); });
  return { ...session, context, runtime, command, profileFile, serviceFixture, proposal, setApprove: (value: boolean) => { approve = value; },
    barrierFails: () => { failBarrier = true; }, saveFails: () => { failSave = true; }, runs: () => runs, purpose: () => purpose, outcome: () => outcomeSeen };
}
it('keeps share/dump preview and denied publication at zero service effects', async () => {
  const s = await setup(); expect((await s.command('share', ['preview'])).kind).toBe('local');
  expect((await s.command('dump', ['preview'])).kind).toBe('local');
  expect(JSON.parse(fs.readFileSync(s.serviceFixture.config.stateFile, 'utf8')).receipts).toHaveLength(0);
  await s.command('collab', ['profile', s.profileFile]); s.setApprove(false);
  const request = vi.spyOn(collaborationHosts.get(s.context)!.client!, 'request');
  const denied = await s.command('share', ['publish', 'bob', '60']); expect(denied.kind === 'local' && denied.output).toContain('refused');
  expect(request).not.toHaveBeenCalled();
  expect(JSON.parse(fs.readFileSync(s.serviceFixture.config.stateFile, 'utf8')).shares).toHaveLength(0); expect(s.runs()).toBe(0);
});
it.each([false, true])('dispatches only after explicit acceptance and retains native usage/provenance (goal=%s)', async withGoal => {
  const s = await setup(withGoal); await s.command('collab', ['profile', s.profileFile]); await s.command('collab', ['start', '{"bob":["observe","ask"]}']);
  const proposed = await s.proposal(); expect(s.runs()).toBe(0);
  const accepted = await s.command('collab', ['accept', String(proposed.proposalId)]);
  expect(accepted.kind, accepted.kind === 'local' ? accepted.output : undefined).toBe('prompt');
  if (accepted.kind !== 'prompt') throw new Error('No prompt');
  expect(s.runs()).toBe(0); await s.runtime.executePrompt(s.session.id, accepted.prompt, { promptMetadata: accepted.promptMetadata }); expect(s.runs()).toBe(1);
  const prompt = s.manager.getSession(s.session.id)!.turns.find(turn => turn.metadata?.collaboration);
  expect(object(prompt!.metadata!.collaboration).principal).toBe('bob'); expect(object(prompt!.metadata!.collaboration).acceptedBy).toBe('alice');
  const acceptanceId = String(object(accepted.promptMetadata!.collaboration).acceptanceId);
  expect(s.purpose()).toBe(`turn/collaboration/bob/${acceptanceId}`);
  const ledger = decodeRequestLedger(readBoundSessionState(s.manager, s.session).state.requestLedger)!;
  expect(Object.values(ledger.scopes)).toHaveLength(1);
  expect(Object.values(ledger.scopes)[0]).toMatchObject({ inputTokens: 7, outputTokens: 3, pending: {}, finalized: [[1, 1]] });
  expect(Object.keys(ledger.scopes)[0]!.startsWith('collaboration/')).toBe(!withGoal);
  expect(collaborationHosts.get(s.context)!.active).toBeUndefined();
  expect((await s.command('collab', ['accept', String(proposed.proposalId)])).kind).toBe('local');
  expect(s.manager.getSession(s.session.id)!.turns.some(turn => turn.metadata?.collaboration)).toBe(true);
});
it('rechecks ACL on an accepted but undispatched prompt and never submits revoked or restarted metadata', async () => {
  const s = await setup(); await s.command('collab', ['profile', s.profileFile]); await s.command('collab', ['start', '{"bob":["observe","ask"]}']);
  const proposed = await s.proposal(); const accepted = await s.command('collab', ['accept', String(proposed.proposalId)]);
  if (accepted.kind !== 'prompt') throw new Error('No prompt');
  await s.command('collab', ['revoke', 'bob']);
  await expect(s.runtime.executePrompt(s.session.id, accepted.prompt, { promptMetadata: accepted.promptMetadata })).rejects.toThrow();
  expect(s.runs()).toBe(0); expect(collaborationHosts.get(s.context)!.active).toBeUndefined();
  await expect(s.runtime.executePrompt(s.session.id, accepted.prompt, { promptMetadata: accepted.promptMetadata })).rejects.toThrow(); expect(s.runs()).toBe(0);
});
it.each(['barrier', 'terminal'] as const)('settles early %s persistence failure against the exact controller without false completion', async failure => {
  const s = await setup(); await s.command('collab', ['profile', s.profileFile]); await s.command('collab', ['start', '{"bob":["observe","ask"]}']);
  const proposed = await s.proposal(); const accepted = await s.command('collab', ['accept', String(proposed.proposalId)]);
  if (accepted.kind !== 'prompt') throw new Error('No prompt');
  if (failure === 'barrier') s.barrierFails(); else s.saveFails();
  await expect(s.runtime.executePrompt(s.session.id, accepted.prompt, { promptMetadata: accepted.promptMetadata })).rejects.toThrow(/Synthetic/);
  expect(collaborationHosts.get(s.context)!.active).toBeUndefined(); expect(s.runtime.getCurrentRunController()).toBeNull();
  expect(s.outcome()).toBe(failure === 'barrier' ? 'failed' : 'unknown');
  const state = JSON.parse(fs.readFileSync(s.serviceFixture.config.stateFile, 'utf8'));
  expect(state.rooms[0].proposals[0].outcome).toBe(failure === 'barrier' ? 'failed' : 'unknown'); expect(state.rooms[0].proposals[0].status).toBe('settled');
});
it.each(['response', 'failure'] as const)('fences a replaced host whose pending renewal returns a late %s', async completion => {
  const now = Date.now; let offset = 0;
  vi.spyOn(Date, 'now').mockImplementation(() => now() + offset);
  const s = await setup(); await s.command('collab', ['profile', s.profileFile]); await s.command('collab', ['start', '{"bob":["observe","ask"]}']);
  const composition = collaborationHosts.get(s.context)!; const old = composition.host!; const client = composition.client!;
  const request = client.request.bind(client); let release!: () => void; let arrived!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { arrived = resolve; });
  vi.spyOn(client, 'request').mockImplementation(async (operation, input, mutation) => {
    const response = await request(operation, input, mutation);
    if (operation === 'renew' && object(input.owner).generation === old.owner.generation) {
      arrived(); await held;
      if (completion === 'failure') throw new Error('Synthetic delayed renewal failure');
    }
    return response;
  });
  await pending;
  offset = 6000;
  const resumed = await s.command('collab', ['resume', old.roomId]);
  expect(resumed.kind === 'local' && resumed.output).toContain('Hosting room');
  const replacement = composition.host!; expect(replacement).not.toBe(old);
  expect(replacement.owner.generation).toBe(old.owner.generation + 1);
  const proposed = await s.proposal(); const accepted = await s.command('collab', ['accept', String(proposed.proposalId)]);
  if (accepted.kind !== 'prompt') throw new Error('No replacement acceptance');
  const acceptance = accepted.promptMetadata!.collaboration as Acceptance; const controller = new AbortController();
  // Preserve both pending and active replacement ownership while the obsolete request finishes.
  composition.active = { acceptance, controller, expiresAt: Date.now() + 5000 };
  const proposals = composition.proposals; release();
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(composition.accepted.get(acceptance.acceptanceId)).toEqual(acceptance);
  expect(controller.signal.aborted).toBe(false); expect(composition.proposals).toBe(proposals);
  expect(composition.host).toBe(replacement); expect(s.runs()).toBe(0);
});

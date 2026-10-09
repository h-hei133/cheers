import { afterEach, expect, it } from 'vitest';
import { researchHarness, cleanupResearch, finishResearch } from '../../test-utils/research.js';
import { researchLedger } from './policy.js';
import { updateRun } from './state.js';
import { createRequestPolicy } from '../../core/agent/request/policy.js';
import { createRequestLedger, initializeRequestScope } from '../../core/agent/request/ledger.js';
import type { PreparedRequest, RequestLedgerStore } from '../../core/agent/request/model.js';
import { writeGoal, readGoalEdit } from '../../planning/goal/store.js';
import { goalRequestPolicy } from '../../planning/goal/budget.js';

const request: PreparedRequest = { requestId: 'logical', bodyDigest: '0'.repeat(64), provider: 'test', model: 'model', endpoint: 'test', purpose: 'turn',
  bound: { inputTokens: 10, outputTokens: 10, source: 'fixture', version: '1' } };
afterEach(cleanupResearch);
it('initializes the native standalone scope before the primary request and fences dispatch while allowing original settlement', () => {
  const setup = researchHarness(); const run = setup.runtime.create({ question: 'q', depth: 'quick', save: false });
  expect(researchLedger(setup.manager, setup.session, run)).toMatchObject({ inputTokens: 0, outputTokens: 0, historyUnknown: false, pending: 0 });
  const policy = setup.runtime.policy(run.id)!; const attempt = policy.reserve(request); attempt.dispatch();
  setup.runtime.pause(); expect(() => policy.reserve(request)).toThrow(/inactive/);
  attempt.settle({ version: 1, inputTokens: 10, outputTokens: 2, complete: true });
  expect(researchLedger(setup.manager, setup.session, run)).toMatchObject({ inputTokens: 10, outputTokens: 2, pending: 0 });
});
it('inherits a paused unfinished goal scope/cap and admits original final response after a partial report', () => {
  const setup = researchHarness();
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'set', objective: 'Research under a shared cap' });
  writeGoal(setup.manager, setup.session, readGoalEdit(setup.manager, setup.session), { type: 'pause' });
  const run = setup.runtime.create({ question: 'q', depth: 'quick', save: false }); const goal = readGoalEdit(setup.manager, setup.session).goal!;
  expect(run.ledgerScopeId).toBe(goal.id);
  const inherited = goalRequestPolicy(setup.manager, setup.session)!; const policy = setup.runtime.policy(run.id, inherited)!;
  const first = policy.reserve(request); first.dispatch(); first.settle({ version: 1, inputTokens: 10, outputTokens: 2, complete: true });
  updateRun(setup.runtime.binding(), value => ({ ...value, status: 'partial', stage: 'report' }));
  const last = policy.reserve({ ...request, requestId: 'final' }); last.dispatch(); last.settle({ version: 1, inputTokens: 10, outputTokens: 2, complete: true });
  expect(researchLedger(setup.manager, setup.session, run)).toMatchObject({ scopeId: goal.id, inputTokens: 20, outputTokens: 4 });
});
it('requires explicit unknown-output reconciliation and keeps unknown ledger attempts after discard and resume', () => {
  const setup = finishResearch(researchHarness()); const policy = setup.runtime.policy(setup.created.id)!;
  const unknown = policy.reserve({ ...request, bound: undefined }); unknown.dispatch(); unknown.settle();
  setup.runtime.pause(); expect(() => setup.runtime.resume()).toThrow(/Unknown request/);
  const discarded = setup.runtime.discard(); expect(discarded.reconciledUnknown).toBeTruthy();
  const resumed = setup.runtime.resume(); expect(resumed.stage).toBe('reconcile'); expect(resumed.deadlineAt).toBe(setup.created.deadlineAt);
  expect(researchLedger(setup.manager, setup.session, resumed)).toMatchObject({ unknown: 1, pending: 1 });
});
it('checks derived admission inside both native transactions and preserves no-cap, history-unknown and breach behavior', () => {
  let ledger = initializeRequestScope(createRequestLedger({ sessionId: 's', sessionCreatedAt: 'now', directoryIdentity: 'd' }),
    { id: 'scope', workspacePath: '/workspace', workspaceIdentity: 'identity' }, false);
  let cap: number | undefined; let inside = false; let admit = true; let held = 500;
  const store: RequestLedgerStore = { transaction: (admission, update) => {
    inside = true; try { const result = update(ledger, admission ? { cap } : {}); ledger = result.ledger; return result.value; }
    finally { inside = false; }
  } };
  const policy = createRequestPolicy(store, 'scope').withAdmission!(() => { expect(inside).toBe(true); if (!admit) throw new Error('native fence'); }).withCompletionReserve!(() => held);
  // Reserve room is only meaningful when a cap exists.
  const first = policy.reserve(request); first.dispatch(); first.settle({ version: 1, inputTokens: 10, outputTokens: 2, complete: true });
  cap = 50; held = 10; const second = policy.reserve(request); admit = false; expect(() => second.dispatch()).toThrow(/native fence/); second.confirmUnsent();
  admit = true; held = 0; cap = undefined;
  const unknown = policy.reserve({ ...request, bound: undefined }); unknown.dispatch(); unknown.settle(); cap = 100;
  expect(() => policy.reserve(request)).toThrow(/history-unknown/); cap = undefined;
  const breach = policy.reserve(request); breach.dispatch(); expect(() => breach.settle({ version: 1, inputTokens: 11, outputTokens: 2, complete: true })).toThrow(/breach/);
  expect(() => policy.reserve(request)).toThrow(/breach/);
});

import fs from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanupResearch, researchHarness } from '../../test-utils/research.js';
import { reserveResearchEntry, researchReservationCurrent } from './reservation.js';
import { readResearch } from './store.js';
import { researchTurnPrompt } from './entry.js';
import { researchEntryDescriptors, researchTools, researchPreviewTools } from './tools.js';
import * as publication from '../../session/store/bound.js';

afterEach(cleanupResearch);
const request = { question: 'Versioned conditions', depth: 'quick' as const, save: false };
function fixture() {
  const setup = researchHarness(), edit = readResearch(setup.manager, setup.session);
  const prepared = reserveResearchEntry({ session: setup.session, scope: edit.bound.scope, state: edit.bound.state,
    directoryIdentity: edit.bound.directoryIdentity }, request);
  return { ...setup, edit, ...prepared };
}

it('hands the exact prospective ID, message and schemas to one real creation and refuses replay', () => {
  const setup = fixture(), before = fs.readFileSync(setup.edit.bound.layout.statePath);
  expect(setup.runtime.selected(setup.reservation.id)).toBeUndefined();
  expect(fs.readFileSync(setup.edit.bound.layout.statePath)).toEqual(before);
  const admitted = setup.runtime.create(request, setup.reservation);
  expect(admitted.id).toBe(setup.run.id); expect(researchTurnPrompt(admitted)).toBe(researchTurnPrompt(setup.run));
  expect(researchTools(setup.runtime, admitted.id).map(({ name, description, argsSchema }) => ({ name, description, argsSchema })))
    .toEqual(researchEntryDescriptors(setup.run));
  expect(researchReservationCurrent(setup.reservation)).toBe(false);
  const retained = fs.readFileSync(setup.edit.bound.layout.statePath);
  expect(() => setup.runtime.create(request, setup.reservation)).toThrow('expired or changed');
  expect(fs.readFileSync(setup.edit.bound.layout.statePath)).toEqual(retained);
});

it('refuses forged, expired and changed requests without starting or persisting a run', () => {
  const setup = fixture(), before = fs.readFileSync(setup.edit.bound.layout.statePath);
  expect(() => setup.runtime.create(request, { id: setup.reservation.id })).toThrow('expired or changed');
  expect(() => setup.runtime.create({ ...request, save: true }, setup.reservation)).toThrow('expired or changed');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 20001);
  expect(() => setup.runtime.create(request, setup.reservation)).toThrow('expired or changed');
  expect(fs.readFileSync(setup.edit.bound.layout.statePath)).toEqual(before);
});

it.each(['research', 'goal', 'requestLedger'] as const)('rechecks captured %s state before creation without overwriting it', field => {
  const setup = fixture();
  const state = JSON.parse(fs.readFileSync(setup.edit.bound.layout.statePath, 'utf8'));
  state[field] = field === 'research' ? { ...setup.edit.state, currentId: setup.run.id, runs: [setup.run] } : { changed: true };
  fs.writeFileSync(setup.edit.bound.layout.statePath, JSON.stringify(state));
  const before = fs.readFileSync(setup.edit.bound.layout.statePath);
  expect(() => setup.runtime.create(request, setup.reservation)).toThrow('changed before submission');
  expect(fs.readFileSync(setup.edit.bound.layout.statePath)).toEqual(before);
});

it('rechecks the captured owner state inside the actual publication lock', () => {
  const setup = fixture(); const publish = publication.publishBoundSessionState;
  vi.spyOn(publication, 'publishBoundSessionState').mockImplementation((host, session, baseline, matches, update) => {
    const state = JSON.parse(fs.readFileSync(baseline.layout.statePath, 'utf8'));
    state.goal = { changedDuringLock: true }; fs.writeFileSync(baseline.layout.statePath, JSON.stringify(state));
    return publish(host, session, baseline, matches, update);
  });
  expect(() => setup.runtime.create(request, setup.reservation)).toThrow('conflict');
  const state = JSON.parse(fs.readFileSync(setup.edit.bound.layout.statePath, 'utf8'));
  expect(state.goal).toEqual({ changedDuringLock: true }); expect(state.research).toBeUndefined(); expect(state.requestLedger).toBeUndefined();
});

it('does not grant execution or saving authority through preview tool definitions', async () => {
  const setup = fixture(), before = fs.readFileSync(setup.edit.bound.layout.statePath);
  for (const tool of researchPreviewTools({ ...setup.run, save: { requested: true, status: 'pending' } })) {
    expect(tool.prepare).toBeUndefined(); expect(tool.onRefusal).toBeUndefined();
    await expect(tool.execute({ runId: setup.reservation.id, path: 'report.md' }, {
      taskId: 'preview', sessionId: setup.session.id, workspaceRoot: setup.root })).rejects.toThrow('cannot execute');
  }
  expect(fs.readFileSync(setup.edit.bound.layout.statePath)).toEqual(before);
});

it('rejects a replacement session object and keeps the one-use identity consumed', () => {
  const setup = fixture(); const current = vi.spyOn(setup.runtime.host, 'current').mockReturnValue({ ...setup.session });
  const before = fs.readFileSync(setup.edit.bound.layout.statePath);
  expect(() => setup.runtime.create(request, setup.reservation)).toThrow('changed before submission');
  current.mockReturnValue(setup.session);
  expect(() => setup.runtime.create(request, setup.reservation)).toThrow('expired or changed');
  expect(fs.readFileSync(setup.edit.bound.layout.statePath)).toEqual(before);
});

it.each(['history', 'selection', 'roots'] as const)('rejects changed live %s before publication', field => {
  const setup = fixture(), before = fs.readFileSync(setup.edit.bound.layout.statePath);
  if (field === 'history') setup.session.turns.push({ role: 'user', content: 'New history', timestamp: new Date().toISOString() });
  else if (field === 'selection') setup.session.contextSelection = { version: 1, revision: 1, entries: [] };
  else setup.session.workspaceRoots = [];
  expect(() => setup.runtime.create(request, setup.reservation)).toThrow('changed before submission');
  expect(fs.readFileSync(setup.edit.bound.layout.statePath)).toEqual(before);
});

it('rejects a malformed or differently bound ledger and requests exceeding native entry limits', () => {
  const setup = researchHarness(), edit = readResearch(setup.manager, setup.session);
  const capture = { session: setup.session, scope: edit.bound.scope, state: edit.bound.state, directoryIdentity: edit.bound.directoryIdentity };
  for (const requestLedger of [{ malformed: true }, { schemaVersion: 1, meteringVersion: 1, sessionId: setup.session.id,
    sessionCreatedAt: setup.session.createdAt, directoryIdentity: 'another-directory', scopes: {} }]) {
    expect(() => reserveResearchEntry({ ...capture, state: { ...edit.bound.state, requestLedger } }, request)).toThrow('scope is unavailable');
  }
  expect(() => reserveResearchEntry(capture, { ...request, question: 'x'.repeat(9000) })).toThrow('entry request is invalid');
  expect(readResearch(setup.manager, setup.session).state.runs).toEqual([]);
});

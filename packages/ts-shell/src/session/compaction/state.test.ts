import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { claimCompactionStep, completeCompactionStep, dispatchCompactionStep, releaseCompactionStep,
  markCompactionStepUnknown, compactionOperationsPath } from './state.js';

let home: string;
let sessionId: string;
beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'compact-evidence-'));
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  sessionId = new SessionManager().createNew(home).id;
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(home, { force: true, recursive: true }); });
const operation = () => ({ sessionId, policyDigest: 'policy' });

it.each(['age', 'steps', 'operations'])('retains unknown request evidence across %s material eviction', kind => {
  const original = claimCompactionStep({ ...operation(), stepDigest: 'original' });
  dispatchCompactionStep(original); markCompactionStepUnknown(original, sessionId);
  if (kind === 'age') vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100 * 365 * 24 * 60 * 60_000);
  else for (let index = 0; index < 34; index++) {
    const claim = claimCompactionStep({ ...operation(), policyDigest: kind === 'operations' ? String(index) : 'policy', stepDigest: String(index) });
    dispatchCompactionStep(claim); completeCompactionStep(claim, sessionId, 'material');
  }
  expect(claimCompactionStep({ ...operation(), stepDigest: 'original' })).toMatchObject({ acquired: false, unknown: true });
});

it('evicts completed material to a tombstone that cannot authorize replay', () => {
  const original = claimCompactionStep({ ...operation(), stepDigest: 'original' });
  dispatchCompactionStep(original); completeCompactionStep(original, sessionId, 'summary');
  vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 100 * 365 * 24 * 60 * 60_000);
  expect(claimCompactionStep({ ...operation(), stepDigest: 'original' })).toMatchObject({ acquired: false, unknown: true });
});

it('releases only the exact proven prepared claim and never a replacement attempt', () => {
  const first = claimCompactionStep({ ...operation(), stepDigest: 'step' });
  releaseCompactionStep(first);
  const second = claimCompactionStep({ ...operation(), stepDigest: 'step' });
  expect(second.claimId).not.toBe(first.claimId);
  expect(() => dispatchCompactionStep(first)).toThrow(/ownership changed/);
  expect(() => releaseCompactionStep(first)).toThrow(/ownership changed/);
  dispatchCompactionStep(second);
  releaseCompactionStep(second);
  expect(claimCompactionStep({ ...operation(), stepDigest: 'step' })).toMatchObject({ unknown: true });
});

it('records prepared and dispatched as separate read-back states', () => {
  const claim = claimCompactionStep({ ...operation(), stepDigest: 'step' });
  const state = () => JSON.parse(fs.readFileSync(compactionOperationsPath(sessionId), 'utf8')).operations[claim.operation].steps.step;
  expect(state()).toMatchObject({ status: 'prepared', claimId: claim.claimId });
  dispatchCompactionStep(claim);
  expect(state()).toMatchObject({ status: 'dispatched', claimId: claim.claimId });
});

it('never gives a follower mutation authority over the acquired attempt', () => {
  const leader = claimCompactionStep({ ...operation(), stepDigest: 'step' });
  const follower = claimCompactionStep({ ...operation(), stepDigest: 'step' });
  for (const mutate of [() => dispatchCompactionStep(follower), () => releaseCompactionStep(follower),
    () => markCompactionStepUnknown(follower, sessionId), () => completeCompactionStep(follower, sessionId, 'forged'),
    () => dispatchCompactionStep({ ...follower, acquired: true })]) {
    expect(mutate).toThrow(/read-only/);
  }
  dispatchCompactionStep(leader); completeCompactionStep(leader, sessionId, 'owned');
  expect(claimCompactionStep({ ...operation(), stepDigest: 'step' })).toMatchObject({ summary: 'owned' });
});

it('refuses captured native storage deletion instead of issuing a file-free claim', () => {
  const manager = new SessionManager();
  const source = manager.captureCompactionSource(sessionId);
  fs.rmSync(source.directory!, { recursive: true });
  expect(() => claimCompactionStep({ ...operation(), source, stepDigest: 'deleted-source' })).toThrow();
  expect(fs.existsSync(source.directory!)).toBe(false);
});

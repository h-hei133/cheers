import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { cleanupResearch, finishResearch, researchHarness } from '../../test-utils/research.js';
import { SessionManager } from '../../session/SessionManager.js';
import { ResearchRuntime } from '../run/runtime.js';
import { researchSaveTool } from './save.js';
import { showResearch } from '../command.js';
import { readOperation } from '../../edit/recovery/operation/store.js';
import { savedOperationOutcome } from './recovery.js';
import { createProcessOwner } from '../../core/state/owner.js';
import { updateRun } from '../run/state.js';

afterEach(cleanupResearch);
it.each(['prepared', 'intent', 'target', 'receipt'])('recovers the original native report save after process exit at %s', phase => {
  const setup = finishResearch(researchHarness());
  setup.manager.saveInterrupted(setup.session.id);
  const child = spawnSync(process.execPath, [fileURLToPath(new URL('../../../../../node_modules/tsx/dist/cli.mjs', import.meta.url)),
    fileURLToPath(new URL('../../test-utils/research/save.ts', import.meta.url)), setup.root, setup.session.id, phase],
  { env: { ...process.env, CHEERS_PROVIDER_MODE: 'synthetic', CHEERS_REAL_HOME: '' }, encoding: 'utf8', timeout: 30000 });
  expect(child.status, child.stderr).toBe(81);
  const manager = new SessionManager(); const resumed = manager.tryResume(setup.session.id, setup.root);
  expect(resumed.ok).toBe(true); if (!resumed.ok) throw new Error('Expected retained session.');
  const runtime = new ResearchRuntime({ store: manager, current: () => resumed.session, report: () => {} });
  const recovered = runtime.current()!;
  expect(recovered.status).toBe('partial'); expect(recovered.owner).toBeUndefined();
  expect(recovered.save).toMatchObject({ status: phase === 'receipt' ? 'committed' : 'unknown', callId: `save-${phase}`, operationId: expect.stringMatching(/^op-/) });
  expect(fs.existsSync(path.join(setup.root, 'report.md'))).toBe(phase === 'target' || phase === 'receipt');
  if (phase === 'prepared') expect(() => readOperation(recovered, recovered.save.operationId!)).toThrow();
  else expect(readOperation(recovered, recovered.save.operationId!).status).toBe(phase === 'receipt' ? 'committed' : 'intent');
  if (phase === 'receipt') {
    expect(savedOperationOutcome({ ...recovered, save: { ...recovered.save, callId: 'another-call' } })).toBe('unknown');
    expect(savedOperationOutcome({ ...recovered, save: { ...recovered.save, path: path.join(setup.root, 'another.md') } })).toBe('unknown');
  } else {
    expect(showResearch(recovered)).toContain('file outcome is unconfirmed');
    expect(runtime.snapshot()).toContain('Save: unknown');
    runtime.arm(recovered);
    const tool = researchSaveTool(runtime, recovered.id);
    expect(() => tool.prepare!({ runId: recovered.id, path: 'replay.md' }, { taskId: 'replay', workspaceRoot: setup.root, sessionId: setup.session.id })).toThrow(/unconfirmed/);
    tool.onRefusal!({ runId: recovered.id }, { taskId: 'refused', workspaceRoot: setup.root, sessionId: setup.session.id }, 'denied');
    expect(runtime.current()!.save.status).toBe('unknown');
    expect(fs.existsSync(path.join(setup.root, 'replay.md'))).toBe(false);
  }
}, 40000);

it.each(['live', 'foreign'])('retains a %s save owner and displays an unconfirmed outcome without revoking authority', kind => {
  const setup = finishResearch(researchHarness()); const owner = createProcessOwner();
  updateRun(setup.binding, run => ({ ...run, owner: kind === 'live' ? owner : { ...owner, hostname: `${owner.hostname}-other` },
    save: { requested: true, status: 'pending', path: path.join(setup.root, 'report.md'), callId: 'pending' } }));
  const runtime = new ResearchRuntime({ store: setup.manager, current: () => setup.session, report: () => {} });
  const run = runtime.current()!; expect(run.save.status).toBe('pending'); expect(run.owner?.token).toBe(owner.token);
  expect(showResearch(run)).toContain('file outcome is unconfirmed'); expect(runtime.snapshot()).toContain('file outcome is unconfirmed');
  expect(() => runtime.discard()).toThrow(/live or unknown/);
});

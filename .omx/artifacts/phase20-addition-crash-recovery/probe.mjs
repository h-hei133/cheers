// A session killed mid-run (no clean shutdown) keeps status "active".
// Can /continue find it?
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '/home/wang/projects/cheers/scripts/start-lib.mjs';
const root = process.cwd();
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok);
const built = path.dirname(path.dirname(build.entry));
const load = f => import(pathToFileURL(path.join(built, f)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { evaluateSessionResumeEligibility } = await load('session/recovery/sessionResumeEligibility.js');
const { hasUnfinishedSessionWork } = await load('session/recovery/work.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/crash-continue'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'default', homeDir: home, env });
const receipt = { status: 'not-run' };
try {
  receipt.cases = withProfile(profile, () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.persistUserPromptBarrier(session.id, 'Do the work', undefined);
    manager.appendQueryEvent(session.id, { type: 'tool.started', toolName: 'write', taskId: 'call-live' });
    // No saveInterrupted: the process was killed.
    const saved = manager.getSession(session.id);
    const snapshot = manager.getRecoverySnapshot(session.id);
    const eligibility = evaluateSessionResumeEligibility({
      session: saved,
      loadRecoverySnapshot: id => manager.getRecoverySnapshot(id),
      createBlock: (target, code, detail) => ({ sessionId: target.id, code, detail }),
    });
    return { status: saved.status, runPhase: snapshot.runPhase,
      pendingTools: Object.keys(snapshot.pendingLifecycle.pendingTools),
      unfinished: hasUnfinishedSessionWork(snapshot),
      eligibility: { recoverable: eligibility.recoverable, disposition: eligibility.disposition, detail: eligibility.detail } };
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

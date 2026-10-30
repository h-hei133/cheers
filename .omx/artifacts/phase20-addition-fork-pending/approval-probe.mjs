// A fork inheriting an approval whose tool never started.
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
const { hasUnfinishedSessionWork } = await load('session/recovery/work.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/fork-approval'); fs.mkdirSync(base, { recursive: true });
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
    manager.persistUserPromptBarrier(session.id, 'Patch the file', undefined);
    // Approval asked before the tool started, then the run was interrupted.
    manager.appendQueryEvent(session.id, { type: 'approval.requested', toolName: 'apply_patch', taskId: 'call-approval' });
    manager.saveInterrupted(session.id, 'turn');
    const forked = manager.fork(session.id, project, {});
    const snapshot = manager.getRecoverySnapshot(forked.id);
    return { forkedPendingApprovals: Object.keys(snapshot.pendingLifecycle.pendingApprovals ?? {}),
      forkedPendingTools: Object.keys(snapshot.pendingLifecycle.pendingTools ?? {}),
      forkedUnfinished: hasUnfinishedSessionWork(snapshot) };
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

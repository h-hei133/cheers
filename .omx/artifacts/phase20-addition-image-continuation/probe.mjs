// An image-only interrupted turn: does the continuation evidence see it?
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
const { hasContinuationEvidence } = await load('session/sessionContinuationProjection.js');
const { hasUnfinishedSessionWork } = await load('session/recovery/work.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/image-continuation'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'default', homeDir: home, env });
const image = { type: 'image', data: 'QUJD', mimeType: 'image/png' };
const receipt = { status: 'not-run' };
try {
  receipt.cases = withProfile(profile, () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.persistUserPromptBarrier(session.id, '', undefined, [image]);
    manager.saveInterrupted(session.id, 'turn');
    const snapshot = manager.getRecoverySnapshot(session.id);
    // A text prompt for comparison, so the image case is not masked by runPhase.
    const textSession = manager.createNew(project);
    manager.persistUserPromptBarrier(textSession.id, 'A question', undefined);
    manager.saveInterrupted(textSession.id, 'turn');
    const textSnapshot = manager.getRecoverySnapshot(textSession.id);
    return {
      textContinuationEvidence: hasContinuationEvidence(textSnapshot),
      textRunPhase: textSnapshot.runPhase,
      pendingPrompt: snapshot.pendingPrompt,
      lastUserHasContent: Array.isArray(snapshot.lastUserMessage?.content),
      continuationEvidence: hasContinuationEvidence(snapshot),
      unfinishedWork: hasUnfinishedSessionWork(snapshot),
      runPhase: snapshot.runPhase,
      interruptedKind: snapshot.interruptedKind,
    };
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

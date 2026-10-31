// Process A leaves an unsettled tool call. Process B "recovers" the same session
// while A is conceptually still alive, then A's real result lands.
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
const { readTranscriptEvents } = await load('session/transcript/sessionTranscript.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/double-recovery'); fs.mkdirSync(base, { recursive: true });
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
    manager.persistUserPromptBarrier(session.id, 'Run the tool', undefined);
    // A's call started but its result has not been written yet.
    manager.appendQueryEvent(session.id, { type: 'tool.started', toolName: 'write', taskId: 'call-live' });
    // B "recovers" the same session.
    manager.reconcilePendingLifecycle(session.id);
    const afterReconcile = readTranscriptEvents(path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl'));
    const fabricated = afterReconcile.filter(e => e.type === 'query-event'
      && (e.event.type === 'tool.result' || e.event.type === 'approval.resolved')
      && e.event.compensated === true)
      .map(e => ({ type: e.event.type, taskId: e.event.taskId, success: e.event.success, outcome: e.event.outcome }));
    // A's real result now arrives.
    manager.appendQueryEvent(session.id, { type: 'tool.result', toolName: 'write', taskId: 'call-live', success: true });
    const final = readTranscriptEvents(path.join(manager.getSessionDirPath(session.id), 'transcript.jsonl')).filter(e => e.type === 'query-event'
      && e.event.taskId === 'call-live')
      .map(e => ({ type: e.event.type, success: e.event.success, compensated: e.event.compensated }));
    return { fabricated, finalRecordsForCall: final };
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

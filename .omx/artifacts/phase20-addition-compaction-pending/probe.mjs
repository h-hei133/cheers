// Compaction removes earlier messages. Does a pending tool call that belonged to
// a removed message survive as an owed call?
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
const { applyCompaction } = await load('session/compaction.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/compact-pending'); fs.mkdirSync(base, { recursive: true });
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
    manager.addTurn(session.id, { id: 'q1', role: 'user', content: 'Old question' });
    manager.appendQueryEvent(session.id, { type: 'tool.started', toolName: 'write', taskId: 'old-call' });
    for (let index = 0; index < 6; index++) manager.addTurn(session.id, { id: `a${index}`, role: 'assistant', content: `answer ${index}` });
    const before = manager.getRecoverySnapshot(session.id);
    // Drop the earliest half, as a compaction plan would.
    const messages = manager.getSession(session.id).turns;
    const plan = { cut: 4, head: 0, kept: messages.length - 4 };
    const compacted = applyCompaction(messages, plan, 'summary text');
    return { beforePending: Object.keys(before.pendingLifecycle.pendingTools),
      beforeUnfinished: hasUnfinishedSessionWork(before),
      compactedKept: compacted.length,
      compactedHasOldCall: compacted.some(m => m.id === 'q1') };
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

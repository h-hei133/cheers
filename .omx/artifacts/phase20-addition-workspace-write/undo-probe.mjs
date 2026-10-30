// A write through an attached root must be visible to the session's undo scan
// and restorable to its previous state.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '/home/wang/projects/cheers/scripts/start-lib.mjs';
const root = process.cwd();
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok, 'build not fresh');
const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { createCoreToolRegistry } = await load('core/tools/registry.js');
const { changeSessionWorkspaceRoots } = await load('session/continuation/workspace.js');
const { captureOperationScope, readOperations } = await load('edit/recovery/operation/store.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/undo-e2e'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project'), outside = path.join(scratch, 'outside');
fs.mkdirSync(home); fs.mkdirSync(project); fs.mkdirSync(outside);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'default', homeDir: home, env });
const receipt = { status: 'not-run' };
try {
  const setup = withProfile(profile, () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.addTurn(session.id, { id: 'q', role: 'user', content: 'A question' });
    return { sessionId: session.id, manager };
  });
  const target = path.join(outside, 'note.txt');
  fs.writeFileSync(target, 'before\n');
  withProfile(profile, () => changeSessionWorkspaceRoots({ manager: setup.manager,
    session: new SessionManager().getSession(setup.sessionId), busy: () => false, action: 'add', target: outside, access: 'write' }));
  await withProfile(profile, async () => {
    const session = new SessionManager().getSession(setup.sessionId);
    const tool = createCoreToolRegistry({}).get('write');
    const result = await tool.execute({ path: target, content: 'after\n' }, { workspaceRoot: project, workspaceRoots: session.workspaceRoots,
      sessionId: session.id, taskId: `w-${Date.now().toString(36)}`, cwd: project });
    receipt.writeOk = !result.isError;
  });
  receipt.contentAfterWrite = fs.readFileSync(target, 'utf8');
  // The session's undo scan uses the primary root; the operation must be there.
  const operations = withProfile(profile, () => {
    const scope = captureOperationScope({ sessionId: setup.sessionId, workspaceRoot: project, callId: 'scan' });
    return [...readOperations(scope)].map(op => ({ id: op.operationId, files: op.files.map(f => ({ path: f.path, workspace: f.workspace.path })) }));
  });
  receipt.operationCount = operations.length;
  receipt.operations = operations;
  receipt.visibleToUndo = operations.some(op => op.files.some(f => f.workspace === fs.realpathSync(outside)));
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

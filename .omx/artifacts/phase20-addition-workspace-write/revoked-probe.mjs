// After the grant is removed, an old snapshot must not restore through it.
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
const load = f => import(pathToFileURL(path.join(built, f)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
const { createCoreToolRegistry } = await load('core/tools/registry.js');
const { changeSessionWorkspaceRoots } = await load('session/continuation/workspace.js');
const { captureOperationScope, readOperations } = await load('edit/recovery/operation/store.js');
const { previewOperation } = await load('edit/recovery/operation/preview.js');
const { restoreOperation } = await load('edit/recovery/operation/restore.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/revoked'); fs.mkdirSync(base, { recursive: true });
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
  const grant = () => withProfile(profile, () => changeSessionWorkspaceRoots({ manager: setup.manager,
    session: new SessionManager().getSession(setup.sessionId), busy: () => false, action: 'add', target: outside, access: 'write' }));
  grant();
  await withProfile(profile, async () => {
    const session = new SessionManager().getSession(setup.sessionId);
    const tool = createCoreToolRegistry({}).get('write');
    await tool.execute({ path: target, content: 'after\n' }, { workspaceRoot: project, workspaceRoots: session.workspaceRoots,
      sessionId: session.id, taskId: `w-${Date.now().toString(36)}`, cwd: project });
  });
  receipt.afterWrite = fs.readFileSync(target, 'utf8');
  // Revoke the grant, then try to restore the old operation.
  withProfile(profile, () => changeSessionWorkspaceRoots({ manager: setup.manager,
    session: new SessionManager().getSession(setup.sessionId), busy: () => false, action: 'remove', target: outside }));
  receipt.restore = await withProfile(profile, async () => {
    const session = new SessionManager().getSession(setup.sessionId);
    const scope = captureOperationScope({ sessionId: setup.sessionId, workspaceRoot: project, callId: 'scan' });
    const [operation] = [...readOperations(scope)];
    const preview = await previewOperation(operation, { workspaceRoots: session.workspaceRoots });
    const result = await restoreOperation(preview, { operationId: operation.operationId, sessionId: setup.sessionId,
      workspaceIdentity: operation.workspace.identity, revision: preview.revision }, { workspaceRoots: session.workspaceRoots });
    return { canRestore: preview.canRestore, blockers: preview.blockers, status: result.status };
  });
  receipt.afterRestore = fs.readFileSync(target, 'utf8');
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

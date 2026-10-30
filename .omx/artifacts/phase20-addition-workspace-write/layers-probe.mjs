// One attached root must be judged the same way by every layer that can refuse
// or allow a write: binding, tool fence, sandbox policy, and the undo ledger.
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
const { captureWorkspaceRoot } = await load('core/workspace/roots.js');
const { workspaceToolBinding } = await load('core/workspace/tools.js');
const { workspaceSandboxPolicy } = await load('sandbox/workspace.js');
const { captureOperationScope, readOperations } = await load('edit/recovery/operation/store.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/layers'); fs.mkdirSync(base, { recursive: true });
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
  const writeRoot = captureWorkspaceRoot(outside, outside, 'write');
  const readRoot = captureWorkspaceRoot(outside, outside, 'read');
  const target = path.join(outside, 'note.txt');
  // 1. Binding: which root does the policy layer approve?
  receipt.bindingWrite = workspaceToolBinding('write', { path: target, content: 'x' }, project, [writeRoot]).root;
  receipt.bindingReadOnly = (() => {
    try { return workspaceToolBinding('write', { path: target, content: 'x' }, project, [readRoot]).root; }
    catch (error) { return 'refused: ' + (error instanceof Error ? error.message : String(error)); }
  })();
  // 2. Sandbox: which paths does a shell get?
  const policy = workspaceSandboxPolicy(project, [writeRoot, readRoot]);
  receipt.sandboxWrite = policy.rules.filesystem?.allowWrite?.includes(fs.realpathSync(outside));
  receipt.sandboxReadOnly = policy.readOnlyRoots.includes(fs.realpathSync(outside));
  // 3. Tool fence: does the writer accept it?
  withProfile(profile, () => changeSessionWorkspaceRoots({ manager: setup.manager,
    session: new SessionManager().getSession(setup.sessionId), busy: () => false, action: 'add', target: outside, access: 'write' }));
  receipt.fence = await withProfile(profile, async () => {
    const session = new SessionManager().getSession(setup.sessionId);
    const tool = createCoreToolRegistry({}).get('write');
    const result = await tool.execute({ path: target, content: 'x' }, { workspaceRoot: project,
      workspaceRoots: session.workspaceRoots, sessionId: session.id, taskId: `w-${Date.now().toString(36)}`, cwd: project });
    return !result.isError;
  });
  // 4. Ledger: is the write visible to the session's undo?
  receipt.ledger = withProfile(profile, () => {
    const scope = captureOperationScope({ sessionId: setup.sessionId, workspaceRoot: project, callId: 'scan' });
    return [...readOperations(scope)].length;
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

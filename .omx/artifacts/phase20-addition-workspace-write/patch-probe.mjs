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
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/patch2'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project'), outside = path.join(scratch, 'outside');
fs.mkdirSync(home); fs.mkdirSync(project); fs.mkdirSync(outside);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const receipt = { status: 'not-run' };
try {
  const setup = withProfile(profile, () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.addTurn(session.id, { id: 'q', role: 'user', content: 'A question' });
    return { sessionId: session.id, manager };
  });
  const run = async (patch) => withProfile(profile, async () => {
    const session = new SessionManager().getSession(setup.sessionId);
    const tool = createCoreToolRegistry({}).get('apply_patch');
    const ctx = { workspaceRoot: project, workspaceRoots: session.workspaceRoots, sessionId: session.id,
      taskId: `p-${Date.now().toString(36)}`, cwd: project };
    try {
      const prep = await tool.prepare({ input: patch }, ctx);
      const selected = prep.selections.map(group => group.id);
      const result = await prep.execute(ctx, selected, { revision: prep.selectionRevision });
      return { ok: !result.isError, output: String(result.output ?? ''), targets: prep.targets.map(t => t.path) };
    } catch (error) { return { ok: false, output: error instanceof Error ? error.message : String(error) }; }
  });
  const target = path.join(outside, 'made.txt');
  const patch = `*** Begin Patch\n*** Add File: ${target}\n+attached patch body\n*** End Patch\n`;
  const before = await run(patch);
  receipt.beforeGrant = { ok: before.ok, output: before.output.slice(0, 160), created: fs.existsSync(target) };
  withProfile(profile, () => changeSessionWorkspaceRoots({ manager: setup.manager,
    session: new SessionManager().getSession(setup.sessionId), busy: () => false, action: 'add', target: outside, access: 'write' }));
  const after = await run(patch);
  receipt.afterGrant = { ok: after.ok, output: after.output.slice(0, 200), created: fs.existsSync(target),
    content: fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined };
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

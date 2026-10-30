// A path reported by glob/grep under an attached root must be usable by read.
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
const base = path.join(root, '.tmp/path-roundtrip'); fs.mkdirSync(base, { recursive: true });
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
  fs.writeFileSync(path.join(outside, 'found.ts'), 'export const needle = 1\n');
  withProfile(profile, () => changeSessionWorkspaceRoots({ manager: setup.manager,
    session: new SessionManager().getSession(setup.sessionId), busy: () => false, action: 'add', target: outside, access: 'read' }));
  await withProfile(profile, async () => {
    const session = new SessionManager().getSession(setup.sessionId);
    const tools = createCoreToolRegistry({});
    const ctx = { workspaceRoot: project, workspaceRoots: session.workspaceRoots, sessionId: session.id,
      taskId: `p-${Date.now().toString(36)}`, cwd: project };
    const glob = await tools.get('glob').execute({ pattern: '*.ts', path: outside }, ctx);
    receipt.globOutput = String(glob.output ?? '').trim().split('\n').slice(0, 3);
    receipt.globOk = !glob.isError;
    // Every path the tool reported must be readable by the read tool as given.
    const reported = String(glob.output ?? '').trim().split('\n').filter(Boolean);
    const readable = [];
    for (const entry of reported.slice(0, 2)) {
      try {
        const read = await tools.get('read').execute({ path: entry }, ctx);
        readable.push({ entry, ok: !read.isError });
      } catch (error) { readable.push({ entry, ok: false, error: String(error).slice(0, 80) }); }
    }
    receipt.readAfterGlob = readable;
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

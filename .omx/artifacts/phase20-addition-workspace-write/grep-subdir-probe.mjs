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
const { createCoreToolRegistry } = await load('core/tools/registry.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/grep-subdir'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project); fs.mkdirSync(path.join(project, 'src'));
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
fs.writeFileSync(path.join(project, 'src', 'a.ts'), 'export const needleA = 1\n');
fs.writeFileSync(path.join(project, 'root.ts'), 'export const needleR = 1\n');
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'default', homeDir: home, env });
const receipt = { status: 'not-run' };
try {
  await withProfile(profile, async () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    const tools = createCoreToolRegistry({});
    const ctx = { workspaceRoot: project, taskId: 'g', cwd: project, sessionId: session.id };
    for (const [label, args] of [['root', { pattern: 'needle' }], ['subdir', { pattern: 'needle', path: 'src' }]]) {
      const r = await tools.get('grep').execute(args, ctx);
      const lines = String(r.output ?? '').trim().split('\n').filter(Boolean).slice(0, 3);
      receipt[label] = { lines, readable: lines.map(l => l.split(':')[0]) };
    }
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

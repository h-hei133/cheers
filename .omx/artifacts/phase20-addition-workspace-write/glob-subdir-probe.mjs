// glob with a subdirectory path: are the reported paths readable?
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
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/glob-subdir'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project); fs.mkdirSync(path.join(project, 'src'));
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
fs.writeFileSync(path.join(project, 'src', 'a.ts'), 'export const a = 1\n');
fs.writeFileSync(path.join(project, 'root.ts'), 'export const r = 1\n');
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'default', homeDir: home, env });
const receipt = { status: 'not-run' };
try {
  await withProfile(profile, async () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    const tools = createCoreToolRegistry({});
    const ctx = { workspaceRoot: project, taskId: 'g', cwd: project, sessionId: session.id };
    for (const [label, args] of [['root', { pattern: '*.ts' }], ['subdir', { pattern: '*.ts', path: 'src' }],
      ['abs-subdir', { pattern: '*.ts', path: path.join(project, 'src') }]]) {
      const r = await tools.get('glob').execute(args, ctx);
      const lines = String(r.output ?? '').trim().split('\n').filter(Boolean);
      const readable = [];
      for (const entry of lines.slice(0, 1)) {
        readable.push(await tools.get('read').execute({ path: entry }, ctx).then(x => !x.isError, () => false));
      }
      receipt[label] = { lines, readable };
    }
  });
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

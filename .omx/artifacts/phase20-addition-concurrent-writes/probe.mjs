// Two processes writing the same session: does the second wait, fail cleanly, or
// silently lose the first's turn?
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
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
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/concurrent-write'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'default', homeDir: home, env });
const receipt = { status: 'not-run' };
try {
  const setup = withProfile(profile, () => {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.addTurn(session.id, { id: 'base', role: 'user', content: 'Base question' });
    return { sessionId: session.id };
  });
  // Two child processes each append a turn to the same session.
  const child = (id) => spawn(process.execPath, ['-e', `
    import(${JSON.stringify(pathToFileURL(path.join(built, 'session/SessionManager.js')).href)}).then(async ({ SessionManager }) => {
      const paths = await import(${JSON.stringify(pathToFileURL(path.join(built, 'core/paths/profile/context.js')).href)});
      const profile = paths.createProfileContext({ name: 'default', homeDir: process.env.HOME, env: process.env });
      paths.withProfile(profile, () => {
        const manager = new SessionManager();
        for (let i = 0; i < 20; i++) manager.addTurn(${JSON.stringify(setup.sessionId)}, { id: '${id}-' + i, role: 'assistant', content: 'from ${id} ' + i });
      });
      process.exit(0);
    }).catch(error => { console.error(String(error)); process.exit(1); });
  `], { env, stdio: ['ignore', 'ignore', 'pipe'] });
  const a = child('a'), b = child('b');
  const codeOf = (proc) => new Promise(resolve => proc.once('close', resolve));
  const [codeA, codeB] = await Promise.all([codeOf(a), codeOf(b)]);
  receipt.exitCodes = [codeA, codeB];
  const saved = withProfile(profile, () => new SessionManager().getSession(setup.sessionId));
  const ids = saved.turns.map(turn => turn.id);
  receipt.totalTurns = ids.length;
  receipt.fromA = ids.filter(id => id?.startsWith('a-')).length;
  receipt.fromB = ids.filter(id => id?.startsWith('b-')).length;
  // The state file must still parse; a torn write would break every later open.
  const statePath = path.join(withProfile(profile, () => new SessionManager().getSessionDirPath(setup.sessionId)), 'state.json');
  let stateParsed = false;
  try { JSON.parse(fs.readFileSync(statePath, 'utf8')); stateParsed = true; } catch {}
  receipt.stateParsed = stateParsed;
  receipt.transcriptLines = fs.readFileSync(path.join(path.dirname(statePath), 'transcript.jsonl'), 'utf8').trim().split('\n').length;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = String(error).split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

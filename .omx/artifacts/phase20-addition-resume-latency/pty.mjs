// How long from opening /resume to the first painted rows, over a synthetic
// directory of many sessions? Small fixtures only; no 20k message run.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '/home/wang/projects/cheers/scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '/home/wang/projects/cheers/scripts/qa-pty-env.mjs';
const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-resume-latency');
fs.mkdirSync(archive, { recursive: true });
const count = Number(process.argv[2] ?? 200);
const mode = process.argv[3] ?? 'regular';
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok);
const built = path.dirname(path.dirname(build.entry));
const load = f => import(pathToFileURL(path.join(built, f)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/resume-latency'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768', CHEERS_PROBE_DEVICE: device };
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' });
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'),
  JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true, cacheWarming: 'off', hooks: {} }));
const current = withProfile(profile, () => {
  const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'q', role: 'user', content: 'Current session question' });
  manager.saveCompleted(session.id);
  return session.id;
});
withProfile(profile, () => {
  for (let index = 0; index < count; index++) {
    const manager = new SessionManager(), session = manager.createNew(project);
    manager.addTurn(session.id, { id: `q${index}`, role: 'user', content: `Saved question ${index}` });
    manager.saveCompleted(session.id);
  }
});
const receipt = { mode, sessions: count, status: 'not-run', buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  limits: { heapMiB: 768, wallSeconds: 60, outputBytes: 2097152 } };
let output = '', bytes = 0, closed = false, overflow = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe', '--session-id', current,
  '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length; if (bytes <= 2097152) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const deadline = setTimeout(() => child.kill('SIGTERM'), 60000);
try {
  const until = Date.now() + 20000;
  while (Date.now() < until && !output.includes('Ask anything, or / for commands')) {
    assert(!closed, 'closed-before-startup'); assert(!overflow); await pause(20);
  }
  assert(output.includes('Ask anything, or / for commands'), 'startup-not-ready');
  const started = Date.now();
  child.stdin.write('/resume\r');
  // The first painted row is the marker; wait for it rather than a fixed delay.
  const ready = Date.now() + 30000;
  let firstRowAt;
  // The panel title is painted only after the overlay opens; the typed command
  // echo appears earlier and would otherwise be mistaken for the panel.
  while (Date.now() < ready) {
    if (/Resume session/.test(output.slice(-6000))) { firstRowAt = Date.now() - started; break; }
    assert(!closed, 'closed-before-resume'); await pause(10);
  }
  // Then wait for a selectable row, which is what a person actually waits for.
  const rowReady = Date.now() + 30000;
  let rowAt;
  while (Date.now() < rowReady) {
    if (/Saved question \d+/.test(output.slice(-6000))) { rowAt = Date.now() - started; break; }
    assert(!closed, 'closed-before-rows'); await pause(10);
  }
  receipt.firstSelectableRowMs = rowAt;
  receipt.firstRowMs = firstRowAt;
  receipt.opened = firstRowAt !== undefined;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message.split('\n')[0] : String(error); }
finally {
  clearTimeout(deadline);
  child.stdin.write('\x1b\x1b');
  await pause(200);
  child.stdin.write('/exit\r');
  const shutdown = await Promise.race([close, pause(10000).then(() => undefined)]);
  if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  receipt.shutdown = shutdown ?? { code: null, signal: 'unknown' };
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow;
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, `${mode}-${count}-receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

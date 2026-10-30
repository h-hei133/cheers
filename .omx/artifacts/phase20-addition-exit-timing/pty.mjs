import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-exit-timing');
const base = path.join(root, '.tmp/exit-timing'); fs.mkdirSync(base, { recursive: true });
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const rounds = Number(process.argv[3] ?? 3); assert(Number.isInteger(rounds) && rounds >= 1 && rounds <= 5);
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext } = await load('core/paths/profile/context.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const scratch = fs.mkdtempSync(path.join(base, 'run-')), home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_BUILD: built };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const config = path.join(profile.root, 'config.json');
fs.writeFileSync(config, JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true, cacheWarming: 'off', hooks: {} }));
const receipt = { mode, rounds: [], status: 'not-run', buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  limits: { heapMiB: 768, perRoundSeconds: 30, outputBytes: 1048576 } };
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function runOnce(index) {
  const observation = path.join(scratch, `observe-${index}.json`), device = path.join(scratch, `device-${index}.json`);
  const roundEnv = { ...env, CHEERS_PROBE_RECEIPT: observation, CHEERS_PROBE_DEVICE: device };
  let output = '', bytes = 0, closed = false, overflow = false, timedOut = false;
  const started = Date.now();
  const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
    '--import', path.join(archive, 'observe.mjs'), path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
    '--no-context-files', '--no-skills', '--offline'], { cwd: project, env: roundEnv, detached: true });
  const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    bytes += chunk.length;
    if (bytes <= 1024 * 1024) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
  });
  const deadline = setTimeout(() => { timedOut = true; child.kill('SIGTERM'); }, 30000);
  try {
    const until = Date.now() + 15000;
    while (Date.now() < until && !(output.includes('Ask anything, or / for commands') && fs.existsSync(observation))) {
      assert(!closed, 'closed-before-startup'); assert(!overflow); await pause(20);
    }
    assert(output.includes('Ask anything, or / for commands'), 'startup-not-ready');
    const readyAt = Date.now() - started;
    // Both a bare command and a key exit path, so a queued or busy guard cannot
    // be the only thing measured.
    const command = index % 2 === 0;
    if (command) child.stdin.write('/exit\r'); else child.stdin.write('\x04');
    const exited = await Promise.race([close, pause(12000).then(() => undefined)]);
    clearTimeout(deadline);
    assert(exited, 'exit-timeout');
    assert.deepEqual(exited, { code: 0, signal: null });
    const total = Date.now() - started;
    const cooked = fs.existsSync(device) ? JSON.parse(fs.readFileSync(device, 'utf8')) : undefined;
    assert(cooked?.cookedFlagsRestored, 'cooked-not-restored');
    return { index, exit: command ? '/exit' : 'ctrl+d', readyAt, exitAt: total, afterReady: total - readyAt,
      outputBytes: bytes, cookedRestored: true, networkAttempts: fs.existsSync(observation)
        ? JSON.parse(fs.readFileSync(observation, 'utf8')).networkAttempts : undefined };
  } finally {
    clearTimeout(deadline);
    if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
      if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
    if (timedOut) throw Error('round-timeout-' + index);
  }
}
try {
  for (let index = 0; index < rounds; index++) { receipt.rounds.push(await runOnce(index)); }
  receipt.maxAfterReady = Math.max(...receipt.rounds.map(round => round.afterReady));
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error.message.split('\n')[0]; }
finally {
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n'); console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

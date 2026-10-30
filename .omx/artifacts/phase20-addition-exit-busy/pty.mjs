// Exit while a model request is in flight: the terminal must come back and the
// process must terminate within a bound, not wait for the request.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-exit-busy');
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext } = await load('core/paths/profile/context.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);
const base = path.join(root, '.tmp/exit-busy'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const slow = spawn(process.execPath, [path.join(archive, 'slow-server.mjs')], { stdio: ['ignore', 'pipe', 'pipe'] });
let slowLog = '';
slow.stderr.on('data', chunk => { slowLog += String(chunk); });
const slowPort = await new Promise((resolve, reject) => {
  slow.stdout.once('data', chunk => resolve(JSON.parse(String(chunk).trim()).port));
  slow.once('exit', code => reject(new Error('slow server exited ' + code)));
});
const device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_DEVICE: device, CHEERS_SLOW_PORT: String(slowPort),
  // The QA helper defaults to synthetic; this probe needs a real request that
  // stays in flight, so the mode is overridden for the child.
  CHEERS_PROVIDER_MODE: 'real' };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
fs.writeFileSync(path.join(profile.root, 'config.json'),
  JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: false, cacheWarming: 'off', hooks: {},
    provider: 'openai-compatible', providerConnections: [{ id: 'slow', provider: 'openai-compatible',
      authType: 'api-key', apiKey: 'probe-key', label: 'slow',
      baseUrl: `http://127.0.0.1:${slowPort}/v1`, model: 'slow-model',
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }] }));
const receipt = { mode, status: 'not-run', buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  limits: { heapMiB: 768, wallSeconds: 45, outputBytes: 1048576 } };
let output = '', bytes = 0, closed = false, overflow = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
// A relay that accepts the connection and never answers, so the request stays
// in flight for the whole observation.
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--no-context-files', '--no-skills'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length; if (bytes <= 1048576) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const deadline = setTimeout(() => child.kill('SIGTERM'), 45000);
try {
  const until = Date.now() + 15000;
  while (Date.now() < until && !output.includes('Ask anything, or / for commands')) {
    assert(!closed, 'closed-before-startup'); assert(!overflow); await pause(25);
  }
  assert(output.includes('Ask anything, or / for commands'), 'startup-not-ready');
  // Start a turn whose provider never answers, then exit while it is busy.
  child.stdin.write('a question that will not be answered\r');
  await pause(2500);
  receipt.afterSubmit = output.slice(-6000).replaceAll(scratch, '<scratch>');
  const busyUntil = Date.now() + 3000;
  while (Date.now() < busyUntil && !/working|thinking|Waiting/i.test(output.slice(-4000))) {
    assert(!closed, 'closed-before-busy'); await pause(25);
  }
  receipt.observedBusy = /working|thinking|Waiting/i.test(output.slice(-4000));
  receipt.busyWindow = output.slice(-1200).replaceAll(scratch, '<scratch>');
  receipt.slowRequests = slowLog.split('\n').filter(Boolean);
  const exitAt = Date.now();
  child.stdin.write('/exit\r');
  const exited = await Promise.race([close, pause(20000).then(() => undefined)]);
  clearTimeout(deadline);
  assert(exited, 'exit-timeout');
  receipt.exit = { code: exited.code, signal: exited.signal, elapsedMs: Date.now() - exitAt };
  receipt.cookedRestored = fs.existsSync(device) ? Boolean(JSON.parse(fs.readFileSync(device, 'utf8')).cookedFlagsRestored) : undefined;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message.split('\n')[0] : String(error); receipt.tail = output.slice(-800).replaceAll(scratch, '<scratch>'); }
finally {
  clearTimeout(deadline);
  if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow;
  try { slow.kill('SIGTERM'); } catch {}
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, mode + '-receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

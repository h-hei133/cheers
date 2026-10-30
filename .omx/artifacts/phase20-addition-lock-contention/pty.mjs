import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';
import { createQaPtyEnvironment } from '../../../scripts/qa-pty-env.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-lock-contention');
const mode = process.argv[2] ?? 'regular'; assert(['regular', 'fullscreen'].includes(mode));
const holdMs = Number(process.argv[3] ?? 2500); assert(Number.isInteger(holdMs) && holdMs >= 0 && holdMs <= 8000);
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
assert(build.ok); const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);

const base = path.join(root, '.tmp/lock-contention-pty'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
const device = path.join(scratch, 'device.json');
const env = { ...createQaPtyEnvironment(home, project), NODE_OPTIONS: '--max-old-space-size=768',
  CHEERS_PROBE_DEVICE: device };
assert.equal(spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, env, stdio: 'ignore' }).status, 0);
const profile = createProfileContext({ name: 'probe', homeDir: home, env });
const config = path.join(profile.root, 'config.json');
fs.writeFileSync(config, JSON.stringify({ tuiMode: mode, enableMcpTools: false, offline: true, cacheWarming: 'off', hooks: {} }));

const fixture = withProfile(profile, () => {
  const manager = new SessionManager(), session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'q', role: 'user', content: 'A public question' });
  manager.saveCompleted(session.id);
  return { sessionId: session.id, directory: manager.getSessionDirPath(session.id) };
});
const lockPath = path.join(fixture.directory, 'state.lock');
const receipt = { mode, holdMs, status: 'not-run', buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest,
  limits: { heapMiB: 768, wallSeconds: 40, outputBytes: 1048576 } };
let output = '', bytes = 0, overflow = false, closed = false;
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const child = spawn('python3', [path.join(root, '.omx/artifacts/phase20-addition-live-cli/relay.py'), '--', process.execPath,
  path.join(root, 'scripts/start.mjs'), '--project', project, '--profile', 'probe',
  '--session-id', fixture.sessionId, '--no-context-files', '--no-skills', '--offline'], { cwd: project, env, detached: true });
const close = new Promise(resolve => child.once('close', (code, signal) => { closed = true; resolve({ code, signal }); }));
for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
  bytes += chunk.length;
  if (bytes <= 1048576) output += chunk.toString('utf8'); else { overflow = true; child.kill('SIGTERM'); }
});
const deadline = setTimeout(() => child.kill('SIGTERM'), 40000);
try {
  const until = Date.now() + 15000;
  while (Date.now() < until && !output.includes('Ask anything, or / for commands')) {
    assert(!closed, 'closed-before-startup'); assert(!overflow); await pause(25);
  }
  assert(output.includes('Ask anything, or / for commands'), 'startup-not-ready');

  // Another live local process takes the session state lock, then the user exits.
  const holder = spawn(process.execPath, ['-e', `
    const fs = require('node:fs');
    const fd = fs.openSync(process.argv[1], 'wx');
    fs.writeFileSync(fd, JSON.stringify({ token: 'probe-holder', pid: process.pid,
      hostname: process.argv[2], createdAt: new Date().toISOString() }), 'utf8');
    process.stdout.write('held\\n');
    setTimeout(() => { try { fs.closeSync(fd); fs.unlinkSync(process.argv[1]); } catch {} }, Number(process.argv[3]));
  `, lockPath, os.hostname(), String(holdMs)], { stdio: ['ignore', 'pipe', 'ignore'] });
  await new Promise(resolve => holder.stdout.once('data', resolve));
  assert(fs.existsSync(lockPath), 'lock-not-held');
  const exitAt = Date.now();
  child.stdin.write('/exit\r');
  const exited = await Promise.race([close, pause(20000).then(() => undefined)]);
  clearTimeout(deadline);
  assert(exited, 'exit-timeout');
  receipt.exit = { code: exited.code, signal: exited.signal, elapsedMs: Date.now() - exitAt };
  receipt.reportedFailure = /Session state could not be saved|Session cleanup failed/.test(output);
  receipt.reportedCleanClose = /--resume/.test(output);
  receipt.outputTail = output.slice(-800).replaceAll(scratch, '<scratch>');
  receipt.lockStillHeldAfterExit = fs.existsSync(lockPath);
  // The holder may already have exited by the time the CLI finished.
  if (holder.exitCode === null && holder.signalCode === null) {
    await new Promise(resolve => holder.once('close', resolve));
  }
  receipt.lockReleasedByHolder = !fs.existsSync(lockPath);
  // A clean exit after the holder releases must still work.
  const saved = withProfile(profile, () => new SessionManager().getSession(fixture.sessionId));
  receipt.savedStatus = saved.status;
  receipt.cookedRestored = fs.existsSync(device) ? Boolean(JSON.parse(fs.readFileSync(device, 'utf8')).cookedFlagsRestored) : undefined;
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message.split('\n')[0] : String(error); receipt.tail = output.slice(-600); }
finally {
  clearTimeout(deadline);
  if (!closed) { child.kill('SIGTERM'); await Promise.race([close, pause(3000)]);
    if (!closed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} await close; } }
  try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}
  receipt.outputBytes = bytes; receipt.outputLimitExceeded = overflow;
  fs.rmSync(scratch, { recursive: true, force: true }); receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, `${mode}-${holdMs}-receipt.json`), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

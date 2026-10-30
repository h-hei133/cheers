// Measure a real cheers session write while another live process holds the
// session state lock. Everything here runs against the built product code.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { checkBuild } from '../../../scripts/start-lib.mjs';

const root = process.cwd(), archive = path.join(root, '.omx/artifacts/phase20-addition-lock-contention');
const build = checkBuild({ root, dist: path.join(root, 'packages/ts-shell/dist'),
  version: JSON.parse(fs.readFileSync('packages/ts-shell/package.json')).version, executablePolicy: 'ignore' });
if (!build.ok) throw new Error('build is not fresh');
const built = path.dirname(path.dirname(build.entry));
const load = file => import(pathToFileURL(path.join(built, file)));
const { createProfileContext, withProfile } = await load('core/paths/profile/context.js');
const { SessionManager } = await load('session/SessionManager.js');
(await load('observability/structuredLogger.js')).setFilePersistenceEnabled(false);

const base = path.join(root, '.tmp/lock-contention'); fs.mkdirSync(base, { recursive: true });
const scratch = fs.mkdtempSync(path.join(base, 'run-'));
const home = path.join(scratch, 'home'), project = path.join(scratch, 'project');
fs.mkdirSync(home); fs.mkdirSync(project);
spawnSync('rtk', ['git', 'init', '-q'], { cwd: project, stdio: 'ignore' });
const env = { ...process.env, HOME: home, USERPROFILE: home, CHEERS_TEST_ROOT: home };
const profile = createProfileContext({ name: 'probe', homeDir: home, env });

const fixture = withProfile(profile, () => {
  const manager = new SessionManager();
  const session = manager.createNew(project);
  manager.addTurn(session.id, { id: 'q', role: 'user', content: 'A question' });
  manager.saveCompleted(session.id);
  return { sessionId: session.id, directory: manager.getSessionDirPath(session.id) };
});

const lockPath = path.join(fixture.directory, 'state.lock');
const receipt = { buildId: build.manifest.buildId, inputsDigest: build.manifest.inputsDigest, holdMs: 900, status: 'not-run' };

function startHolder(holdMs) {
  const child = spawn(process.execPath, ['-e', `
    const fs = require('node:fs');
    const fd = fs.openSync(process.argv[1], 'wx');
    fs.writeFileSync(fd, JSON.stringify({ token: 'probe-holder', pid: process.pid,
      hostname: process.argv[2], createdAt: new Date().toISOString() }), 'utf8');
    process.stdout.write('held\\n');
    setTimeout(() => { try { fs.closeSync(fd); fs.unlinkSync(process.argv[1]); } catch {} }, Number(process.argv[3]));
  `, lockPath, os.hostname(), String(holdMs)], { stdio: ['ignore', 'pipe', 'ignore'] });
  const held = new Promise(resolve => child.stdout.once('data', () => resolve(true)));
  const done = new Promise(resolve => child.once('close', code => resolve(code)));
  return { held, done, child };
}

try {
  const holder = startHolder(receipt.holdMs);
  await holder.held;
  receipt.lockExisted = fs.existsSync(lockPath);

  // A real write through the product's own session owner, while the lock is held.
  const startedAt = Date.now();
  let writeError;
  try {
    withProfile(profile, () => {
      const manager = new SessionManager();
      manager.addTurn(fixture.sessionId, { id: 'later', role: 'assistant', content: 'A later answer' });
    });
  } catch (error) { writeError = error instanceof Error ? error.message : String(error); }
  const elapsed = Date.now() - startedAt;
  receipt.write = { elapsedMs: elapsed, failed: writeError !== undefined,
    ...(writeError ? { error: writeError.replace(scratch, '<scratch>').slice(0, 200) } : {}) };

  await holder.done;
  receipt.lockReleased = !fs.existsSync(lockPath);

  // After the holder releases, the same write must succeed.
  const retryAt = Date.now();
  let retryError;
  try {
    withProfile(profile, () => {
      const manager = new SessionManager();
      manager.addTurn(fixture.sessionId, { id: 'after', role: 'assistant', content: 'After release' });
    });
  } catch (error) { retryError = error instanceof Error ? error.message : String(error); }
  receipt.retryAfterRelease = { elapsedMs: Date.now() - retryAt, failed: retryError !== undefined };

  const saved = withProfile(profile, () => new SessionManager().getSession(fixture.sessionId));
  receipt.finalMessages = saved.turns.map(turn => turn.id);
  receipt.status = 'passed';
} catch (error) { receipt.status = 'failed'; receipt.failure = error instanceof Error ? error.message.split('\n')[0] : String(error); }
finally {
  try { if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath); } catch {}
  fs.rmSync(scratch, { recursive: true, force: true });
  receipt.scratchRemoved = !fs.existsSync(scratch);
  fs.writeFileSync(path.join(archive, 'receipt.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
if (receipt.status !== 'passed') process.exitCode = 1;

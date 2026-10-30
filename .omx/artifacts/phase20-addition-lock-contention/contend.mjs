// Hold a session state lock from another process, then measure what a real
// cheers process does when it needs the same lock.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import os from 'node:os';

const root = process.cwd();
const built = path.join(root, 'packages/ts-shell/dist');
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

// Hold the lock the way a live local owner would: a real process, real metadata.
const lockPath = path.join(fixture.directory, 'state.lock');
const holder = spawnSync(process.execPath, ['-e', `
  const fs = require('node:fs');
  const fd = fs.openSync(${JSON.stringify(lockPath)}, 'wx');
  fs.writeFileSync(fd, JSON.stringify({ token: 'probe-holder', pid: process.pid,
    hostname: ${JSON.stringify(os.hostname())}, createdAt: new Date().toISOString() }), 'utf8');
  const until = Date.now() + Number(process.argv[1]);
  while (Date.now() < until) { /* hold */ }
  fs.closeSync(fd);
  try { fs.unlinkSync(${JSON.stringify(lockPath)}); } catch {}
`, '900'], { stdio: 'ignore', timeout: 20000, detached: false });
// spawnSync above runs the holder to completion; redo it asynchronously so the
// measurement overlaps the hold.

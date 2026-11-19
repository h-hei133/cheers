import { spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { createSessionStoreLayout, projectSessionFileLayout } from './sessionFileLayout.js';
import { SessionCreationUnverifiedError } from './sessionStore.js';
import { SessionStoreAccess } from './sessionStoreAccess.js';

const id = 'shared-session';
let root: string;

beforeEach(() => {
  const base = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(base, { recursive: true });
  root = fs.mkdtempSync(path.join(base, 'session-create-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});

afterEach(() => {
  vi.restoreAllMocks();
  syncBuiltinESMExports();
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function startCreator(project: string, sessionDir: string) {
  const module = fileURLToPath(new URL('../SessionManager.ts', import.meta.url));
  const release = path.join(project, 'release');
  const child = spawn(process.execPath, [createRequire(import.meta.url).resolve('tsx/cli'), '--eval', `
    const fs = require('node:fs');
    const { syncBuiltinESMExports } = require('node:module');
    const target = ${JSON.stringify(sessionDir)};
    const release = ${JSON.stringify(release)};
    const mkdir = fs.mkdirSync;
    fs.mkdirSync = (name, options) => {
      if (name === target) {
        fs.writeSync(1, 'ready\\n');
        const cell = new Int32Array(new SharedArrayBuffer(4));
        const deadline = Date.now() + 15000;
        while (!fs.existsSync(release) && Date.now() < deadline) Atomics.wait(cell, 0, 0, 10);
        if (!fs.existsSync(release)) throw new Error('Reservation release timed out');
      }
      return mkdir(name, options);
    };
    syncBuiltinESMExports();
    const { SessionManager } = require(${JSON.stringify(module)});
    const manager = new SessionManager();
    try {
      manager.createNewWithId(${JSON.stringify(id)}, ${JSON.stringify(project)});
      fs.writeSync(1, 'created\\n');
    } catch (error) {
      fs.writeSync(1, error.message + '\\n');
    }
  `], { cwd: project, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', data => { stdout += data; });
  child.stderr.on('data', data => { stderr += data; });
  const done = new Promise<string>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(stdout) : reject(new Error(stderr || `Creator exited with ${code}`)));
  });
  void done.catch(() => undefined);
  return {
    ready: () => stdout.startsWith('ready\n'),
    go: () => fs.writeFileSync(release, ''),
    done,
    close: async () => { child.kill(); await done.catch(() => undefined); },
  };
}

it('allows one first writer when two processes reach the same session reservation', async () => {
  const store = new SessionStoreAccess();
  const layout = projectSessionFileLayout({ sessionsDir: store.sessionsDir, sessionId: id });
  const first = path.join(root, 'first');
  const second = path.join(root, 'second');
  fs.mkdirSync(first);
  fs.mkdirSync(second);
  const one = startCreator(first, layout.sessionDir);
  const two = startCreator(second, layout.sessionDir);
  try {
    await vi.waitFor(() => expect([one.ready(), two.ready()]).toEqual([true, true]), { timeout: 10000 });
    one.go();
    expect(await one.done).toBe('ready\ncreated\n');
    const paths = [layout.transcriptPath, layout.metadataPath, layout.statePath, createSessionStoreLayout().currentSessionStorePath];
    const snapshot = paths.map(file => fs.readFileSync(file, 'utf8'));
    two.go();
    expect(await two.done).toBe(`ready\nSession ${id} already exists\n`);
    expect(paths.map(file => fs.readFileSync(file, 'utf8'))).toEqual(snapshot);
    expect(store.load(id)).toMatchObject({ id, projectRoot: first });
    expect(store.readCurrentSessionSelection(first)).toMatchObject({ sessionId: id });
    expect(store.readCurrentSessionSelection(second)).toBeUndefined();
  } finally {
    await Promise.all([one.close(), two.close()]);
  }
}, 20000);

it.each(['file', 'dangling link', 'legacy directory', 'legacy dangling link'] as const)(
  'preserves an ID occupied by a %s',
  kind => {
    const canonical = createSessionStoreLayout().sessionsDir;
    const sessionsDir = kind.startsWith('legacy') ? path.join(root, '.cheer', 'sessions') : canonical;
    const occupied = path.join(sessionsDir, id);
    const missing = path.join(root, 'missing');
    fs.mkdirSync(sessionsDir, { recursive: true });
    if (kind === 'file') fs.writeFileSync(occupied, 'previous content');
    else if (kind === 'legacy directory') {
      fs.mkdirSync(occupied);
      fs.writeFileSync(path.join(occupied, 'preserved'), 'previous content');
    } else fs.symlinkSync(missing, occupied, 'junction');

    const manager = new SessionManager();
    const store = new SessionStoreAccess();
    expect(() => manager.createNewWithId(id, root)).toThrow(`Session ${id} already exists`);
    if (kind === 'file') expect(fs.readFileSync(occupied, 'utf8')).toBe('previous content');
    else if (kind === 'legacy directory') expect(fs.readdirSync(occupied)).toEqual(['preserved']);
    else expect(fs.readlinkSync(occupied)).toBe(missing);
    if (sessionsDir !== canonical) expect(fs.existsSync(path.join(canonical, id))).toBe(false);
    expect(store.readCurrentSessionSelection(root)).toBeUndefined();
  },
);

it('creates in the current layout when a legacy sessions path is a regular file', () => {
  const old = path.join(root, '.cheer', 'sessions');
  fs.mkdirSync(path.dirname(old));
  fs.writeFileSync(old, 'old content');
  const manager = new SessionManager();
  const record = manager.createNewWithId(id, root);
  expect(record.id).toBe(id);
  expect(new SessionStoreAccess().readCurrentSessionSelection(root)).toMatchObject({ sessionId: id });
  expect(fs.readFileSync(old, 'utf8')).toBe('old content');
});

it('keeps a partial record and reports unverified creation if the state write throws', () => {
  const manager = new SessionManager();
  const store = new SessionStoreAccess();
  const layout = projectSessionFileLayout({ sessionsDir: store.sessionsDir, sessionId: id });
  const cause = new Error('storage failure fixture');
  const rename = fs.renameSync;
  const spy = vi.spyOn(fs, 'renameSync').mockImplementation((from, to) => {
    if (to === layout.statePath) throw cause;
    rename(from, to);
  });
  syncBuiltinESMExports();
  try {
    expect(() => manager.createNewWithId(id, root)).toThrow(SessionCreationUnverifiedError);
    expect(spy).toHaveBeenCalledWith(expect.any(String), layout.statePath);
  } finally {
    spy.mockRestore();
    syncBuiltinESMExports();
  }

  const transcript = fs.readFileSync(layout.transcriptPath, 'utf8');
  const metadata = fs.readFileSync(layout.metadataPath, 'utf8');
  expect(JSON.parse(transcript)).toMatchObject({ id, cwd: root });
  expect(JSON.parse(metadata)).toMatchObject({ id, projectRoot: root });
  expect(fs.existsSync(layout.statePath)).toBe(false);
  expect(store.readCurrentSessionSelection(root)).toBeUndefined();
  expect(() => manager.createNewWithId(id, root)).toThrow(`Session ${id} already exists`);
  expect(fs.readFileSync(layout.transcriptPath, 'utf8')).toBe(transcript);
  expect(fs.readFileSync(layout.metadataPath, 'utf8')).toBe(metadata);
});

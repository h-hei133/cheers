import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { prepareShellStartup } from '../../../core/shell/bootstrap.js';
import { getWorkflowGitContext } from '../../../core/workspace/git.js';
import { StreamingRenderer } from '../../../presentation/terminal/streaming.js';
import { SessionManager } from '../../SessionManager.js';
import { readSessionRegistryStore } from '../currentSessionRegistry.js';
import { createSessionStoreLayout, locateExistingSessionLayout, type SessionFileLayout } from '../sessionFileLayout.js';
import { previewPendingSessionRecord } from '../sessionStore.js';
import { SessionStoreAccess } from '../sessionStoreAccess.js';
import { readSessionFileVersion } from '../version.js';
import { promptIntentPath } from './intent.js';

const stages = ['prepared', 'registry', 'metadata', 'cleared'] as const;
type Stage = typeof stages[number] | 'state';
const publishedAt = '2024-02-02T01:02:03.000Z';
let root: string;

beforeEach(() => {
  const base = path.join(os.tmpdir(), 'cheers-test');
  fs.mkdirSync(base, { recursive: true });
  root = fs.mkdtempSync(path.join(base, 'resume-'));
  vi.stubEnv('HOME', root);
  vi.stubEnv('USERPROFILE', root);
  vi.stubEnv('CHEERS_TEST_ROOT', root);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', root);
});

afterEach(() => {
  vi.unstubAllEnvs();
  fs.rmSync(root, { recursive: true, force: true });
});

function interruptResume(layout: SessionFileLayout, sessionId: string, registry: string, stage: Stage, destination?: string) {
  const [major, minor] = process.versions.node.split('.').map(Number);
  const loader = major! === 20 && minor! < 6 ? '--loader' : '--import';
  const tsx = pathToFileURL(createRequire(import.meta.url).resolve('tsx')).href;
  const input = { layout, sessionId, registry, stage, destination, publishedAt, version: readSessionFileVersion(layout), marker: promptIntentPath(layout) };
  const script = `
    import fs from 'node:fs';
    import { syncBuiltinESMExports } from 'node:module';
    import { SessionManager } from ${JSON.stringify(new URL('../../SessionManager.ts', import.meta.url).href)};
    const input = ${JSON.stringify(input)};
    const rename = fs.renameSync, unlink = fs.unlinkSync, sync = fs.fsyncSync;
    const phases = new Map([[input.marker, 'prepared'], [input.registry, 'registry'], [input.layout.statePath, 'state'], [input.layout.metadataPath, 'metadata']]);
    let phase;
    fs.renameSync = (from, to) => {
      rename(from, to);
      if (to === input.marker || phase) phase = phases.get(to) ?? phase;
      if (phase === 'state' && input.stage === 'state') process.kill(process.pid, 'SIGKILL');
    };
    fs.unlinkSync = target => {
      unlink(target);
      if (target === input.marker) phase = 'cleared';
    };
    fs.fsyncSync = fd => {
      sync(fd);
      if (phase === input.stage && fs.fstatSync(fd).isDirectory()) process.kill(process.pid, 'SIGKILL');
    };
    syncBuiltinESMExports();
    Date.prototype.toISOString = () => input.publishedAt;
    const manager = new SessionManager();
    if (input.destination) manager.rebindSessionProjectRoot(input.sessionId, input.destination);
    const result = manager.tryResume(input.sessionId, process.cwd(), {
      mode: 'continuity-only', expectedVersion: input.version,
    });
    process.exit(result.ok ? 2 : 3);
  `;
  return spawnSync(process.execPath, ['--conditions=cheers-source', loader, tsx, '--input-type=module', '--eval', script], {
    cwd: root, timeout: 10_000, encoding: 'utf8', maxBuffer: 65_536,
  });
}

it.skipIf(process.platform !== 'linux').each(stages)(
  'reopens the exact activation after a process exits at %s', stage => {
    const manager = new SessionManager();
    const source = manager.createNew(root);
    const target = manager.createNew(root, { activate: false });
    const profile = createSessionStoreLayout();
    const registry = profile.currentSessionStorePath;
    const store = new SessionStoreAccess();
    const layout = locateExistingSessionLayout(profile, target.id);
    const original = fs.readFileSync(layout.metadataPath, 'utf8');
    const beforeState = fs.readFileSync(layout.statePath);
    const beforeTranscript = fs.readFileSync(layout.transcriptPath);
    const child = interruptResume(layout, target.id, registry, stage);
    expect(child.error).toBeUndefined();
    expect(child.signal, child.stderr).toBe('SIGKILL');

    const committed = stage !== 'prepared';
    const expectedTime = committed ? publishedAt : target.updatedAt;
    expect(store.readCurrentSessionSelection(root)?.sessionId).toBe(committed ? target.id : source.id);
    if (stage === 'registry') {
      expect(fs.readFileSync(layout.metadataPath, 'utf8')).toBe(original);
      const committedRegistry = fs.readFileSync(registry, 'utf8');
      const wrongReceipt = JSON.parse(committedRegistry);
      wrongReceipt.resumeReceipts[target.id] = '0'.repeat(64);
      fs.writeFileSync(registry, JSON.stringify(wrongReceipt));
      expect(() => store.load(target.id)).toThrow('persistence is unknown');
      expect(fs.readFileSync(layout.metadataPath, 'utf8')).toBe(original);
      expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
      wrongReceipt.resumeReceipts[target.id] = null;
      const damaged = JSON.stringify(wrongReceipt);
      fs.writeFileSync(registry, damaged);
      expect(() => manager.setCurrentSessionForProject(root, source.id)).toThrow('activation is unavailable');
      expect(() => manager.clearCurrentSessionForProject(root)).toThrow('activation is unavailable');
      expect(fs.readFileSync(registry, 'utf8')).toBe(damaged);
      expect(() => store.load(target.id)).toThrow('persistence is unknown');
      fs.writeFileSync(registry, committedRegistry);
      manager.setCurrentSessionForProject(root, source.id);
      expect(readSessionRegistryStore(registry).store.resumeReceipts?.[target.id]).toMatch(/^[a-f0-9]{64}$/);
      const superseded = fs.readFileSync(registry, 'utf8');
      const { schemaVersion, byProjectRoot } = JSON.parse(superseded);
      fs.writeFileSync(registry, JSON.stringify({ schemaVersion, byProjectRoot }));
      expect(() => store.load(target.id)).toThrow('persistence is unknown');
      expect(fs.readFileSync(layout.metadataPath, 'utf8')).toBe(original);
      expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
      fs.writeFileSync(registry, superseded);
    }
    if (stage === 'prepared') {
      manager.setCurrentSessionForProject(root, source.id);
      expect(readSessionRegistryStore(registry).store.resumeStoreId).toMatch(/^[a-f0-9-]{36}$/);
    }
    const pending = previewPendingSessionRecord({ layout, sessionId: target.id, cwd: root, registryPath: registry });
    if (stage === 'cleared') expect(pending).toBeUndefined();
    else expect(pending?.snapshot.session.updatedAt).toBe(expectedTime);

    const selection = store.readCurrentSessionSelection(root);
    expect(store.load(target.id).updatedAt).toBe(expectedTime);
    expect(store.load(target.id).updatedAt).toBe(expectedTime);
    expect(store.readCurrentSessionSelection(root)).toEqual(selection);
    expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
    expect(fs.readFileSync(layout.statePath)).toEqual(beforeState);
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(beforeTranscript);
    if (stage === 'cleared') {
      expect(manager.tryResume(target.id, root, { mode: 'continuity-only', expectedVersion: readSessionFileVersion(layout) }).ok).toBe(true);
    }
    expect(readSessionRegistryStore(registry).store.resumeReceipts).toBeUndefined();
  }, 20_000,
);

it.skipIf(process.platform !== 'linux')('settles the committed activation through staged shell startup', () => {
  const manager = new SessionManager();
  manager.createNew(root);
  const target = manager.createNew(root, { activate: false });
  const profile = createSessionStoreLayout();
  const layout = locateExistingSessionLayout(profile, target.id);
  const child = interruptResume(layout, target.id, profile.currentSessionStorePath, 'registry');
  expect(child.signal, child.stderr).toBe('SIGKILL');

  const startup = prepareShellStartup({ cwd: root, runtimeConfig: getRuntimeConfig(root), gitContext: getWorkflowGitContext(root),
    sessionManager: manager, renderer: new StreamingRenderer(), adoptCurrentSession: true, emitLifecycleMessages: false });
  expect(startup.binding.sessionId).toBe(target.id);
  expect(fs.existsSync(promptIntentPath(layout))).toBe(true);
  expect(startup.activate().context.session.id).toBe(target.id);
  expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
  expect(readSessionRegistryStore(profile.currentSessionStorePath).store.resumeReceipts).toBeUndefined();
}, 20_000);

it.skipIf(process.platform !== 'linux').each(['prepared', 'registry', 'state', 'metadata', 'cleared'] as const)(
  'reopens a root rebind after the writer dies at %s', stage => {
    const manager = new SessionManager();
    const destination = path.join(root, 'destination');
    fs.mkdirSync(destination);
    const source = manager.createNew(root);
    const priorDestination = manager.createNew(destination);
    const profile = createSessionStoreLayout();
    const registryPath = profile.currentSessionStorePath;
    const layout = locateExistingSessionLayout(profile, source.id);
    const metadata = JSON.parse(fs.readFileSync(layout.metadataPath, 'utf8'));
    delete metadata.projectRoot;
    fs.writeFileSync(layout.metadataPath, JSON.stringify(metadata));
    const transcript = fs.readFileSync(layout.transcriptPath);
    const child = interruptResume(layout, source.id, registryPath, stage, destination);
    expect(child.error).toBeUndefined();
    expect(child.signal, child.stderr).toBe('SIGKILL');
    const committed = stage !== 'prepared';
    const rootAfter = committed ? destination : root;
    const store = new SessionStoreAccess();
    expect(store.readCurrentSessionSelection(destination)?.sessionId).toBe(committed ? source.id : priorDestination.id);
    if (stage === 'registry') manager.setCurrentSessionForProject(destination, priorDestination.id);
    if (stage === 'state') {
      expect(JSON.parse(fs.readFileSync(layout.statePath, 'utf8')).projectRoot).toBe(destination);
      expect(JSON.parse(fs.readFileSync(layout.metadataPath, 'utf8')).projectRoot).toBeUndefined();
    }
    const pointer = store.readCurrentSessionSelection(destination);
    const preview = previewPendingSessionRecord({ layout, sessionId: source.id, cwd: root, registryPath });
    if (stage === 'cleared') expect(preview).toBeUndefined();
    else expect(preview?.snapshot).toMatchObject({ session: { projectRoot: rootAfter }, state: { projectRoot: rootAfter } });
    expect(store.readSnapshot(source.id)).toMatchObject({ session: { id: source.id, projectRoot: rootAfter }, state: { projectRoot: rootAfter } });
    expect(store.readSnapshot(source.id).session.projectRoot).toBe(rootAfter);
    expect(store.readCurrentSessionSelection(destination)).toEqual(pointer);
    expect(fs.existsSync(promptIntentPath(layout))).toBe(false);
    expect(fs.readFileSync(layout.transcriptPath)).toEqual(transcript);
    if (stage !== 'cleared') expect(readSessionRegistryStore(registryPath).store.resumeReceipts).toBeUndefined();
  }, 20_000,
);

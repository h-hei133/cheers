import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProfileContext, withProfile, type ProfileContext } from './context.js';
import { ProjectTrustStore } from '../../security/trust/store.js';
import { ArtifactManager } from '../../session/artifactManager.js';
import { createCoreToolRegistry } from '../../tools/registry.js';
import { adaptTools, type ToolGateOptions } from '../../../turn/tools.js';
import { createProjectMemoryLocalStore } from '../../../memory/projectMemoryLocalStore.js';
import { projectMemoryRootFor } from '../../../memory/projectMemoryRoot.js';
import type { ProjectMemoryRecord } from '../../../memory/projectMemoryStoreContract.js';
import { RotatingFileSink } from '../../../observability/rotatingFileSink.js';
import type { StructuredLogEntry } from '../../../observability/types.js';
import { appendPromptHistory, loadPromptHistory } from '../../../cli/interactive/historyStore.js';
import { projectStatePath, writeProjectState } from '../../state/projectState.js';
import { currentBinding } from '../../../cli/collaboration/projection.js';
import type { CollaborationComposition } from '../../../cli/collaboration/model.js';
import { cursorPath, readCursor, saveCursor } from '../../../collaboration/client/cursor.js';
import { accessToken, forgetAccessToken } from '../../../provider/google/auth.js';

let home: string;
let workspace: string;
let a: ProfileContext;
let b: ProfileContext;
const record: ProjectMemoryRecord = { id: 'same', version: 1, createdAt: '2026-10-16', candidateId: 'fact',
  candidateKind: 'project-fact', retentionClass: 'project-scoped-candidate', approvedAt: '2026-10-16', approvedBySourceCommand: '/memory',
  memoryText: 'Approved project fact.', evidence: ['checked'], source: 'system-derived', routeReferences: [], safety: 'safe', redactions: [] };

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'profile-storage-'));
  workspace = path.join(home, 'workspace'); fs.mkdirSync(workspace);
  a = createProfileContext({ homeDir: home, name: 'a', env: {} });
  b = createProfileContext({ homeDir: home, name: 'b', env: {} });
});
afterEach(() => { vi.restoreAllMocks(); forgetAccessToken(); fs.rmSync(home, { recursive: true, force: true }); });

it('refuses durable trust imported through a linked leaf', () => {
  withProfile(b, () => new ProjectTrustStore().setProjectTrust(workspace, 'trusted'));
  fs.symlinkSync(path.join(b.root, 'trust.json'), path.join(a.root, 'trust.json'));
  withProfile(a, () => {
    const trust = new ProjectTrustStore();
    expect(trust.decision(workspace)).toBe('unavailable');
    expect(() => trust.setProjectTrust(workspace, 'trusted')).toThrow();
  });
});

it('isolates artifact IDs and reads them through the actual tool adapter with parent denials', async () => {
  const first = withProfile(a, () => ArtifactManager.getShared(workspace, 'same'));
  const second = withProfile(b, () => ArtifactManager.getShared(workspace, 'same'));
  const saved = await withProfile(a, () => first.save('A output'));
  expect(second.resolve(saved.uri)).toBeNull();
  const other = await withProfile(b, () => second.save('B output'));
  expect(other.uri).toBe(saved.uri);
  const pool = new Map([['read', createCoreToolRegistry().get('read')!]]);
  for (const [profile, expected] of [[a, 'A output'], [b, 'B output']] as const) {
    await withProfile(profile, async () => {
      const options: ToolGateOptions = { workspaceRoot: workspace, sessionId: 'same', emit: () => {}, hooks: {} as ToolGateOptions['hooks'] };
      const result = await adaptTools(pool, options)[0]!.execute('read', { path: saved.uri });
      expect(result.isError).toBe(false); expect(result.output).toContain(expected);
      const denied = await adaptTools(pool, { ...options, denyRules: [{ tool: 'read', pattern: ArtifactManager.getShared(workspace, 'same').resolve(saved.uri)! }] })[0]!
        .execute('read', { path: saved.uri });
      expect(denied.isError).toBe(true); expect(denied.output).not.toContain(expected);
    });
  }
  expect(fs.existsSync(path.join(workspace, '.ts-shell'))).toBe(false);
  fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  await expect(first.save('late')).rejects.toThrow('changed identity');
});

it.each(['root', 'records'] as const)('fences captured memory after replacing its %s', async replacement => {
  const first = withProfile(a, () => createProjectMemoryLocalStore({ ref: { mode: 'explicit-local', root: projectMemoryRootFor(workspace) } }));
  const second = withProfile(b, () => createProjectMemoryLocalStore({ ref: { mode: 'explicit-local', root: projectMemoryRootFor(workspace) } }));
  expect((await withProfile(b, () => first.write({ storeRef: first.ref, record }))).written).toBe(true);
  expect((await second.write({ storeRef: second.ref, record: { ...record, memoryText: 'B fact.' } })).written).toBe(true);
  const otherFile = second.ref.recordsFile!;
  const before = fs.readFileSync(otherFile, 'utf8');
  if (replacement === 'root') {
    fs.renameSync(a.root, `${a.root}-retired`); fs.symlinkSync(b.root, a.root, 'dir');
  } else {
    fs.unlinkSync(first.ref.recordsFile!); fs.symlinkSync(otherFile, first.ref.recordsFile!);
  }
  await expect(first.list()).rejects.toThrow();
  await expect(first.write({ storeRef: first.ref, record: { ...record, id: 'late' } })).rejects.toThrow();
  await expect(first.delete({ recordId: 'same', deletedAt: '2026-10-16', sourceCommand: '/memory' })).rejects.toThrow();
  expect(fs.readFileSync(otherFile, 'utf8')).toBe(before);
});

it.each(['root', 'logs'] as const)('fences a cached log sink after replacing %s', replacement => {
  const first = withProfile(a, () => new RotatingFileSink());
  const second = withProfile(b, () => new RotatingFileSink());
  const entry: StructuredLogEntry = { timestamp: '2026-10-16', level: 'info', component: 'test', message: 'B entry',
    traceId: 'trace', spanId: 'span', fields: {} };
  first.write({ ...entry, message: 'A entry' }); second.write(entry);
  const target = second.getCurrentFilePath(); const before = fs.readFileSync(target, 'utf8');
  if (replacement === 'root') {
    fs.renameSync(a.root, `${a.root}-retired`); fs.symlinkSync(b.root, a.root, 'dir');
  } else {
    const directory = first.getLogDir(); fs.renameSync(directory, `${directory}-retired`); fs.symlinkSync(second.getLogDir(), directory, 'dir');
  }
  first.write({ ...entry, message: 'late A entry' });
  expect(() => first.clear()).toThrow();
  expect(first.getRecentLines()).toEqual([]);
  expect(fs.readFileSync(target, 'utf8')).toBe(before);
});

it('keeps prompt history and project choices private, including linked terminal files', () => {
  withProfile(a, () => { appendPromptHistory(workspace, 'A prompt'); writeProjectState(workspace, { thinkingEffort: 'high' }); });
  withProfile(b, () => { expect(loadPromptHistory(workspace)).toEqual([]); appendPromptHistory(workspace, 'B prompt'); });
  expect(withProfile(a, () => loadPromptHistory(workspace))).toEqual(['A prompt']);
  expect(withProfile(b, () => loadPromptHistory(workspace))).toEqual(['B prompt']);
  const target = withProfile(a, () => projectStatePath(workspace));
  fs.unlinkSync(target); fs.symlinkSync(path.join(b.root, 'private-state.json'), target);
  expect(() => withProfile(a, () => writeProjectState(workspace, { thinkingEffort: 'low' }))).toThrow('symbolic links');
  expect(fs.existsSync(path.join(b.root, 'private-state.json'))).toBe(false);
});

it('binds shared collaboration routes and captured cursors to the owning profile', () => {
  const binding = (profile: ProfileContext) => withProfile(profile, () => currentBinding({ context: { profile, projectRoot: workspace,
    session: { id: 'same', createdAt: '2026-10-16' } } } as CollaborationComposition));
  expect(binding(a).projectId).not.toBe(binding(b).projectId);
  const target = withProfile(a, () => cursorPath('https://relay.example', 'same', 'room', 'local'));
  saveCursor(target, undefined, { cursor: 1 }, a);
  expect(readCursor(target, a)).toEqual({ cursor: 1 });
  fs.renameSync(a.root, `${a.root}-retired`); fs.mkdirSync(a.root);
  expect(() => saveCursor(target, { cursor: 1 }, { cursor: 2 }, a)).toThrow('changed identity');
});

it('separates delegated Google token caches by profile and explicit credential source', async () => {
  const credential = (name: string) => {
    const target = path.join(home, `${name}.json`);
    fs.writeFileSync(target, JSON.stringify({ type: 'authorized_user', client_id: 'synthetic', client_secret: 'synthetic', refresh_token: name }));
    return { HOME: home, GOOGLE_APPLICATION_CREDENTIALS: target };
  };
  const first = credential('first'); const other = credential('other');
  let sequence = 0;
  const send = vi.fn(async () => new Response(JSON.stringify({ access_token: `token-${++sequence}`, expires_in: 3600 })));
  const request = (profile: ProfileContext, env: typeof first) => withProfile(profile, () => accessToken({ env, fetchImpl: send as typeof fetch }));
  const tokenA = await request(a, first); const tokenB = await request(b, first); const tokenOther = await request(a, other);
  expect(new Set([tokenA.token, tokenB.token, tokenOther.token]).size).toBe(3);
  expect((await request(a, first)).token).toBe(tokenA.token);
  expect(send).toHaveBeenCalledTimes(3);
});

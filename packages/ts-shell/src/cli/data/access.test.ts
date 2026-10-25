import fs, { promises as fsp } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { installCommandGate, sourceAccessFor, sourceReaderFor, sourceReaderForAsync } from './access.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { SessionManager } from '../../session/SessionManager.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { ToolGateOptions } from '../../turn/tools.js';
import * as files from '../../core/workspace/files.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';

let root: string;
beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/source-access-');
  const home = path.join(root, 'home'); fs.mkdirSync(home); vi.stubEnv('CHEERS_TEST_ROOT', home); vi.stubEnv('USERPROFILE', home);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

const fixture = () => {
  const cwd = path.join(root, 'workspace'); fs.mkdirSync(cwd); const manager = new SessionManager();
  const context = createShellRuntimeContext({ cwd, originalCwd: cwd, projectRoot: cwd, rootMode: 'direct', targetPathBase: cwd,
    gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(cwd), session: manager.createNew(cwd) });
  const file = path.join(cwd, 'notes.md'); fs.writeFileSync(file, '\uFEFFexact\r\n中文');
  const gate = vi.fn((): ToolGateOptions => ({ permissionScope: 'ask' })); installCommandGate(context, gate);
  return { cwd, manager, context, file, gate };
};

it('uses the same strict UTF-8 digest and bounds through synchronous and asynchronous readers', async () => {
  const { context, file } = fixture();
  expect(await sourceReaderForAsync(context)(file, 100)).toEqual(sourceReaderFor(context)(file, 100));
  fs.writeFileSync(file, Buffer.from([0xff])); await expect(sourceReaderForAsync(context)(file, 100)).rejects.toThrow('UTF-8');
  fs.writeFileSync(file, 'oversized'); await expect(sourceReaderForAsync(context)(file, 3)).rejects.toThrow('size limit');
});

it('checks live grants without reading content and rejects revoked owners or stale identities', () => {
  const { context, file, manager, cwd, gate } = fixture(); const check = sourceAccessFor(context);
  const sync = vi.spyOn(files, 'inspectWorkspaceFile'); const asyncRead = vi.spyOn(files, 'inspectWorkspaceFileAsync');
  check(file); expect(sync).not.toHaveBeenCalled(); expect(asyncRead).not.toHaveBeenCalled();
  gate.mockReturnValue({ permissionScope: 'ask', denyRules: [{ tool: 'read', pattern: 'notes.md' }] }); expect(() => check(file)).toThrow();
  installCommandGate(context, () => ({ permissionScope: 'ask' })); context.session = manager.createNew(cwd);
  expect(() => check(file)).toThrow('changed');
});

it('rejects absent gate, outside paths and cancelled reads before descriptor acquisition', async () => {
  const { context, file } = fixture(); const open = vi.spyOn(fsp, 'open'); const controller = new AbortController(); controller.abort();
  await expect(sourceReaderForAsync(context, controller.signal)(file, 100)).rejects.toMatchObject({ name: 'AbortError' });
  await expect(sourceReaderForAsync(context)(path.join(root, 'outside'), 100)).rejects.toThrow();
  await expect(sourceReaderForAsync(context)(file, 0)).rejects.toThrow('size limit'); expect(open).not.toHaveBeenCalled();
  const unowned = { ...context }; expect(() => sourceAccessFor(unowned)(file)).toThrow('owner is unavailable');
});

it.each(['deny', 'session', 'configuration'] as const)('revalidates %s after asynchronous acquisition and never returns the old content', async change => {
  const { context, file, cwd, manager, gate } = fixture(); const original = files.inspectWorkspaceFileAsync;
  vi.spyOn(files, 'inspectWorkspaceFileAsync').mockImplementation(async (...args) => {
    const value = await original(...args);
    if (change === 'deny') gate.mockReturnValue({ permissionScope: 'ask', denyRules: [{ tool: 'read', pattern: 'notes.md' }] });
    else if (change === 'session') context.session = manager.createNew(cwd);
    else context.configuration.transition(context.configuration.current.binding);
    return value;
  });
  await expect(sourceReaderForAsync(context)(file, 100)).rejects.toThrow();
});

it('holds the descriptor until a cancelled read settles and closes it before rejecting', async () => {
  const { context, file } = fixture(); const controller = new AbortController(); const original = fsp.open;
  let release!: () => void; let began!: () => void; const started = new Promise<void>(resolve => { began = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; }); let handle!: Awaited<ReturnType<typeof fsp.open>>;
  vi.spyOn(fsp, 'open').mockImplementation(async (...args) => {
    const opened = await original(...args); if (String(args[0]) !== file) return opened; handle = opened;
    const read = opened.read.bind(opened);
    opened.read = (async (...readArgs) => { began(); await held; return read(...readArgs); }) as typeof opened.read;
    return opened;
  });
  const pending = sourceReaderForAsync(context, controller.signal)(file, 100); const rejection = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await started; controller.abort(); expect(handle.fd).not.toBe(-1); release(); await rejection; expect(handle.fd).toBe(-1);
});

it('preserves authorized additional roots and refuses their removal during acquisition', async () => {
  const { context } = fixture(); const extra = path.join(root, 'extra'); fs.mkdirSync(extra); const target = path.join(extra, 'notes.md'); fs.writeFileSync(target, 'additional');
  context.session = { ...context.session, workspaceRoots: [captureWorkspaceRoot(extra, root, 'read')] };
  expect((await sourceReaderForAsync(context)(target, 100)).state).toBe('exists');
  const original = files.inspectWorkspaceFileAsync;
  vi.spyOn(files, 'inspectWorkspaceFileAsync').mockImplementation(async (...args) => {
    const value = await original(...args); context.session = { ...context.session, workspaceRoots: [] }; return value;
  });
  await expect(sourceReaderForAsync(context)(target, 100)).rejects.toThrow('outside');
});

it('rejects a primary root replaced while a read is settling', async () => {
  const { context, cwd, file } = fixture(); const original = files.inspectWorkspaceFileAsync;
  vi.spyOn(files, 'inspectWorkspaceFileAsync').mockImplementation(async (...args) => {
    const value = await original(...args); fs.renameSync(cwd, path.join(root, 'old-workspace')); fs.mkdirSync(cwd); fs.writeFileSync(file, 'replacement'); return value;
  });
  await expect(sourceReaderForAsync(context)(file, 100)).rejects.toThrow('changed');
});

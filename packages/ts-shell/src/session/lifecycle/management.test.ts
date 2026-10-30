import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionManager } from '../SessionManager.js';
import { prepareSessionManagement, applySessionManagement, invalidSessionTitle } from './management.js';
import { sessionManagementPicker } from '../../cli/interactive/picker/session/management.js';
import { sessionPickerHost } from '../../cli/interactive/picker/session/host.js';
import { pickerFor, type PickerHost } from '../../cli/interactive/picker/registry.js';
import { runSessionManagement } from '../../cli/runtime/management.js';
import { sessionCommandFor } from '../../cli/runtime/sessionCommands.js';
import { OverlayHost } from '../../cli/interactive/overlay.js';
import { parseKeyEvent } from '../../presentation/tui/input/keys.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { ConfigState } from '../../config/state.js';
import * as sessionStore from '../store/sessionStore.js';
import { sessionPicker } from '../../cli/interactive/picker/session.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'session-management-')); roots.push(root);
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  const manager = new SessionManager();
  const current = manager.createNew(root); const target = manager.createNew(root);
  manager.renameSession(target.id, 'Saved work');
  const context = { sessionId: current.id, projectRoot: root, busy: false };
  const host = { sessionManager: manager, sessionContext: () => ({ ...context }) };
  const runtimeContext = { session: current, projectRoot: root, runtimeConfig: getRuntimeConfig(root) } as ShellRuntimeContext;
  runtimeContext.configuration = new ConfigState(runtimeContext.runtimeConfig, configurationBinding(runtimeContext));
  return { root, manager, current, target, context, host, runtimeContext };
}

it.each(['delete', 'pin'] as const)('uses metadata and state without synchronously acquiring conversation content for %s', async action => {
  const h = fixture();
  const read = vi.spyOn(fs, 'readFileSync');
  const record = vi.spyOn(sessionStore, 'readSessionRecordSnapshot');
  const prepared = await prepareSessionManagement(h.manager, h.host.sessionContext, action, h.target.id);
  expect(prepared.preview).toBeDefined();
  expect(applySessionManagement(h.manager, h.host.sessionContext, prepared.preview!)).toMatchObject({ status: 'changed' });
  expect(record).not.toHaveBeenCalled();
  expect(read.mock.calls.filter(([target]) => String(target).endsWith('transcript.jsonl'))).toHaveLength(0);
});

it.each(['missing', 'project', 'identity', 'empty'] as const)('refuses a cached picker mutation at the native writer boundary after %s changes', async change => {
  const h = fixture();
  h.manager.addTurn(h.target.id, { role: 'user', content: 'Saved target for management' });
  const actions = sessionPickerHost({ runtimeContext: h.runtimeContext, sessionManager: h.manager,
    busy: () => false, resume: async () => undefined });
  const picker = sessionPicker({ sessionManager: h.manager, context: h.host.sessionContext,
    resume: async () => undefined, delete: actions.deleteSession, rename: actions.renameSession });
  try {
    await picker.load();
    await new Promise<void>(resolve => { picker.subscribe!(rows => {
      if (rows.some(row => row.id === h.target.id) && picker.status?.(rows)?.includes('End of this session page range')) resolve();
    }); });
    const get = vi.spyOn(h.manager, 'getSession'), remove = vi.spyOn(h.manager, 'deleteSession'), rename = vi.spyOn(h.manager, 'renameSession');
    const directory = h.manager.getSessionDirPath(h.target.id);
    if (change === 'missing') fs.rmSync(directory, { recursive: true });
    else if (change === 'project' || change === 'identity') {
      const target = path.join(directory, 'metadata.json'), metadata = JSON.parse(fs.readFileSync(target, 'utf8'));
      if (change === 'project') metadata.projectRoot = path.join(h.root, 'other'); else metadata.id = 'other';
      fs.writeFileSync(target, JSON.stringify(metadata));
    } else {
      const transcript = path.join(directory, 'transcript.jsonl'), header = fs.readFileSync(transcript, 'utf8').split('\n')[0]!;
      fs.writeFileSync(transcript, header + '\n');
      const target = path.join(directory, 'state.json'), state = JSON.parse(fs.readFileSync(target, 'utf8'));
      fs.writeFileSync(target, JSON.stringify({ ...state, status: 'active' }));
    }
    expect(await picker.onDelete!(h.target.id)).toBeTruthy();
    expect(await picker.onRename!(h.target.id, 'New title')).toBeTruthy();
    expect(get).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(rename).not.toHaveBeenCalled();
  } finally { picker.previewEnd?.(); }
});

it('renames one session through the shared owner without changing the active identity or transcript', async () => {
  const h = fixture(); const before = fs.readFileSync(path.join(h.manager.getSessionDirPath(h.target.id), 'transcript.jsonl'));
  const prepared = await prepareSessionManagement(h.manager, h.host.sessionContext, 'rename', h.target.id);
  expect(prepared.preview).toBeDefined();
  expect(applySessionManagement(h.manager, h.host.sessionContext, prepared.preview!, 'New title')).toMatchObject({ status: 'changed' });
  expect(h.manager.getSession(h.target.id)?.title).toBe('New title'); expect(h.context.sessionId).toBe(h.current.id);
  expect(fs.readFileSync(path.join(h.manager.getSessionDirPath(h.target.id), 'transcript.jsonl'))).toEqual(before);
});

it('persists pin and unpin through metadata without changing conversation bytes', async () => {
  const h = fixture();
  const transcript = fs.readFileSync(path.join(h.manager.getSessionDirPath(h.target.id), 'transcript.jsonl'));
  const state = fs.readFileSync(path.join(h.manager.getSessionDirPath(h.target.id), 'state.json'));

  const pin = await prepareSessionManagement(h.manager, h.host.sessionContext, 'pin', h.target.id);
  expect(applySessionManagement(h.manager, h.host.sessionContext, pin.preview!)).toMatchObject({ status: 'changed' });
  expect(new SessionManager().getSession(h.target.id)?.pinned).toBe(true);
  expect(fs.readFileSync(path.join(h.manager.getSessionDirPath(h.target.id), 'transcript.jsonl'))).toEqual(transcript);
  expect(fs.readFileSync(path.join(h.manager.getSessionDirPath(h.target.id), 'state.json'))).toEqual(state);

  const unpin = await prepareSessionManagement(new SessionManager(), h.host.sessionContext, 'pin', h.target.id);
  expect(applySessionManagement(new SessionManager(), h.host.sessionContext, unpin.preview!)).toMatchObject({ status: 'changed' });
  expect(new SessionManager().getSession(h.target.id)?.pinned).not.toBe(true);
});

it('routes bare pin through the real saved metadata owner and rejects an offered version that changed', async () => {
  const h = fixture();
  const directory = h.manager.getSessionDirPath(h.target.id);
  const transcriptPath = path.join(directory, 'transcript.jsonl');
  fs.appendFileSync(transcriptPath, JSON.stringify({ type: 'message', id: 'pin-question', role: 'user',
    content: 'Saved pin target', timestamp: h.target.createdAt }) + '\n');
  const transcript = fs.readFileSync(transcriptPath);
  const state = fs.readFileSync(path.join(directory, 'state.json'));
  const resume = vi.fn(async () => undefined);
  const actions = sessionPickerHost({ runtimeContext: h.runtimeContext, sessionManager: h.manager,
    busy: () => h.context.busy, resume });
  const host = { ...actions, sessionManager: h.manager, commandContext: { cwd: h.root } } as unknown as PickerHost;
  const picker = pickerFor('/pin', host)!;
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await vi.waitFor(() => expect(overlay.render(100, 30).join('\n')).toContain('Saved work'));
  const pinned = (await picker.apply([h.target.id]))!.next!;
  expect(new SessionManager().getSession(h.target.id)?.pinned).toBe(true);
  overlay.open(pinned);
  await vi.waitFor(() => expect(overlay.render(100, 30).join('\n')).toContain('pinned'));
  const unpinned = (await pinned.apply([h.target.id]))!.next!;
  expect(new SessionManager().getSession(h.target.id)?.pinned).toBeUndefined();
  overlay.open(unpinned);
  await vi.waitFor(() => expect(overlay.render(100, 30).join('\n')).toContain('Saved work'));
  h.manager.renameSession(h.target.id, 'External update');
  const refused = await unpinned.apply([h.target.id]);
  expect(refused?.note).toContain('changed after the preview');
  expect(refused?.next).toBeUndefined();
  expect(new SessionManager().getSession(h.target.id)?.pinned).toBeUndefined();
  expect(fs.readFileSync(transcriptPath)).toEqual(transcript);
  expect(fs.readFileSync(path.join(directory, 'state.json'))).toEqual(state);
  expect(h.runtimeContext.session.id).toBe(h.current.id);
  expect(resume).not.toHaveBeenCalled();
  overlay.close();
});

it.each(['current', 'busy', 'running', 'foreign'] as const)('blocks %s deletion before any writer', async kind => {
  const h = fixture(); const remove = vi.spyOn(h.manager, 'deleteSession'); let id = h.target.id;
  if (kind === 'current') id = h.current.id;
  if (kind === 'busy') h.context.busy = true;
  if (kind === 'running') {
    const file = path.join(h.manager.getSessionDirPath(id), 'state.json');
    const state = JSON.parse(fs.readFileSync(file, 'utf8')); state.runPhase = 'turn-active'; state.status = 'active'; fs.writeFileSync(file, JSON.stringify(state));
  }
  if (kind === 'foreign') id = h.manager.createNew(path.join(h.root, 'foreign')).id;
  const prepared = await prepareSessionManagement(h.manager, h.host.sessionContext, 'delete', id);
  expect(prepared.preview).toBeUndefined(); expect(prepared.note).toBeTruthy(); expect(remove).not.toHaveBeenCalled();
});

it.each(['storage', 'runtime', 'busy', 'replacement'] as const)('rejects a %s change after approval preview', async kind => {
  const h = fixture(); const prepared = (await prepareSessionManagement(h.manager, h.host.sessionContext, 'delete', h.target.id)).preview!;
  const remove = vi.spyOn(h.manager, 'deleteSession');
  if (kind === 'storage') h.manager.renameSession(h.target.id, 'Externally renamed');
  if (kind === 'runtime') h.context.sessionId = h.target.id;
  if (kind === 'busy') h.context.busy = true;
  if (kind === 'replacement') {
    const dir = h.manager.getSessionDirPath(h.target.id); fs.renameSync(dir, `${dir}-old`); fs.cpSync(`${dir}-old`, dir, { recursive: true });
  }
  expect(applySessionManagement(h.manager, h.host.sessionContext, prepared).status).toBe('unchanged');
  expect(remove).not.toHaveBeenCalled(); expect(h.manager.sessionExists(h.target.id)).toBe(true);
});

it('keeps failed or partially executed writes unknown without exposing the error text', async () => {
  const h = fixture(); const prepared = (await prepareSessionManagement(h.manager, h.host.sessionContext, 'delete', h.target.id)).preview!;
  const original = h.manager.deleteSession.bind(h.manager);
  vi.spyOn(h.manager, 'deleteSession').mockImplementation(id => { original(id); throw new Error('PRIVATE_PROVIDER_RESPONSE'); });
  const result = applySessionManagement(h.manager, h.host.sessionContext, prepared);
  expect(result.status).toBe('unknown'); expect(result.note).toContain('could not be confirmed'); expect(result.note).not.toContain('PRIVATE');
  expect(h.manager.sessionExists(h.target.id)).toBe(false);
});

it('defaults deletion to Cancel and only removes the previewed session after a deliberate choice', async () => {
  const h = fixture(); const remove = vi.spyOn(h.manager, 'deleteSession');
  const action = { kind: 'shell-action', action: 'manage-session', sessionOperation: 'delete', sessionId: h.target.id } as const;
  const picker = sessionManagementPicker(h.host, action); const overlay = new OverlayHost(() => {}); overlay.open(picker);
  await vi.waitFor(() => expect(overlay.render(100, 24).join('\n')).toContain('Permanently delete'));
  const selected = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), selected);
  expect(selected).toHaveBeenCalledWith(picker, ['cancel']); await picker.apply(['cancel']); expect(remove).not.toHaveBeenCalled();
  await picker.load(); expect((await picker.apply(['apply']))?.note).toContain('Deleted session');
  expect(remove).toHaveBeenCalledOnce(); expect(remove).toHaveBeenCalledWith(h.target.id); expect(h.manager.sessionExists(h.current.id)).toBe(true);
});

it('uses the title editor for bare rename and rechecks its original preview when the user submits', async () => {
  const h = fixture(); const picker = sessionManagementPicker(h.host, { kind: 'shell-action', action: 'manage-session', sessionOperation: 'rename' });
  await picker.load(); const editor = (await picker.apply(['apply']))!.next!;
  expect(editor.input).toBeDefined(); expect(editor.input!.validate('')).toBeTruthy();
  expect(h.manager.getSession(h.current.id)?.title).toBeUndefined();
  h.manager.renameSession(h.current.id, 'Other process');
  expect((await editor.input!.apply('My title'))?.note).toContain('changed after the preview');
  expect(h.manager.getSession(h.current.id)?.title).toBe('Other process');
});

it('binds session-list callbacks to the offered version and uses the same busy/current protection', async () => {
  const h = fixture(); const host = sessionPickerHost({ runtimeContext: h.runtimeContext, sessionManager: h.manager, busy: () => h.context.busy, resume: async () => undefined });
  const prepared = (await prepareSessionManagement(h.manager, h.host.sessionContext, 'rename', h.target.id)).preview!;
  h.manager.renameSession(h.target.id, 'External title');
  expect(await host.renameSession(h.target.id, 'Stale title', prepared.version)).toContain('changed after the preview');
  expect(await host.deleteSession(h.current.id)).toContain('current session cannot be deleted');
  h.context.busy = true; expect(await host.deleteSession(h.target.id)).toContain('operation is running');
  expect(h.manager.getSession(h.target.id)?.title).toBe('External title');
});

it.each(['rename', 'delete', 'pin'] as const)('honors surface admission before %s preparation and after its asynchronous resolution', async action => {
  const h = fixture();
  const directory = h.manager.getSessionDirPath(h.target.id);
  const bytes = () => ['metadata.json', 'state.json', 'transcript.jsonl'].map(name => fs.readFileSync(path.join(directory, name)));
  const before = bytes();
  let issue: string | undefined = 'The surface was cancelled.';
  const admission = vi.fn(() => issue);
  const host = sessionPickerHost({ runtimeContext: h.runtimeContext, sessionManager: h.manager,
    busy: () => false, admission, resume: async () => undefined });
  const run = () => action === 'rename' ? host.renameSession(h.target.id, 'Changed')
    : action === 'delete' ? host.deleteSession(h.target.id) : host.pinSession!(h.target.id);
  const resolve = vi.spyOn(h.manager.catalog, 'resolve');
  expect(await run()).toContain('cancelled');
  expect(resolve).not.toHaveBeenCalled();
  expect(bytes()).toEqual(before);
  issue = undefined;
  const original = h.manager.catalog.resolve.bind(h.manager.catalog);
  resolve.mockRestore();
  vi.spyOn(h.manager.catalog, 'resolve').mockImplementation(async (...args) => {
    const result = await original(...args);
    issue = 'The surface closed during resolution.';
    return result;
  });
  expect(await run()).toContain('closed during resolution');
  expect(bytes()).toEqual(before);
  expect(admission.mock.calls.length).toBeGreaterThan(1);
});

it.each(['rename', 'delete', 'pin'] as const)('rechecks %s admission inside the original lock before starting a writer', async action => {
  const h = fixture();
  const directory = h.manager.getSessionDirPath(h.target.id);
  const bytes = () => ['metadata.json', 'state.json', 'transcript.jsonl'].map(name => fs.readFileSync(path.join(directory, name)));
  const before = bytes();
  let issue: string | undefined;
  const prepared = await prepareSessionManagement(h.manager, h.host.sessionContext, action, h.target.id, undefined, () => issue);
  const locate = h.manager.getSessionDirPath.bind(h.manager);
  vi.spyOn(h.manager, 'getSessionDirPath').mockImplementation(id => {
    // apply resolves this path from inside the existing state lock.
    issue = 'Session selection expired.';
    return locate(id);
  });
  expect(applySessionManagement(h.manager, h.host.sessionContext, prepared.preview!, 'New title')).toMatchObject({ status: 'unchanged', note: issue });
  expect(bytes()).toEqual(before);
});

it('does not retain direct delete authority after cancellation or apply it twice', async () => {
  const h = fixture();
  const remove = vi.spyOn(h.manager, 'deleteSession');
  const picker = sessionManagementPicker(h.host, { kind: 'shell-action', action: 'manage-session', sessionOperation: 'delete', sessionId: h.target.id });
  await picker.load();
  await picker.apply(['cancel']);
  expect((await picker.apply(['apply']))?.note).toContain('not offered');
  expect(remove).not.toHaveBeenCalled();
  await picker.load(); picker.previewEnd?.();
  expect((await picker.apply(['apply']))?.note).toContain('not offered');
  expect(remove).not.toHaveBeenCalled();
  await picker.load();
  expect((await picker.apply(['apply']))?.note).toContain('Deleted');
  await picker.apply(['apply']);
  expect(remove).toHaveBeenCalledOnce();
});

it('cancels or consumes a handed-off title editor without retaining its preview', async () => {
  const h = fixture();
  const rename = vi.spyOn(h.manager, 'renameSession');
  const picker = sessionManagementPicker(h.host, { kind: 'shell-action', action: 'manage-session', sessionOperation: 'rename', sessionId: h.target.id });
  await picker.load();
  const editor = (await picker.apply(['apply']))!.next!;
  editor.previewEnd?.();
  expect((await editor.input!.apply('Cancelled'))?.note).toContain('expired');
  expect(rename).not.toHaveBeenCalled();
  await picker.load();
  const accepted = (await picker.apply(['apply']))!.next!;
  expect((await accepted.input!.apply('Accepted'))?.note).toContain('Renamed');
  await accepted.input!.apply('Second');
  expect(rename).toHaveBeenCalledOnce();
  expect(h.manager.getSession(h.target.id)?.title).toBe('Accepted');
});

it('preserves outer admission through an actual parent-to-editor overlay handoff', async () => {
  const h = fixture();
  const picker = sessionManagementPicker(h.host, { kind: 'shell-action', action: 'manage-session', sessionOperation: 'rename', sessionId: h.target.id });
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await vi.waitFor(() => expect(overlay.render(100, 24).join('\n')).toContain('Edit session title'));
  const editor = (await picker.apply(['apply']))!.next!;
  overlay.open(editor);
  expect((await editor.input!.apply('Transferred title'))?.note).toContain('Renamed');
  expect(h.manager.getSession(h.target.id)?.title).toBe('Transferred title');
  overlay.close();
});

it('rejects a cancelled direct command preparation and safe-fails an admission exception', async () => {
  const h = fixture();
  const admission = vi.fn(() => 'Direct action closed.');
  const picker = sessionManagementPicker({ ...h.host, commandContext: { admission } as PickerHost['commandContext'] },
    { kind: 'shell-action', action: 'manage-session', sessionOperation: 'delete', sessionId: h.target.id });
  expect((await picker.load()).map(row => row.id)).toEqual(['cancel']);
  expect(h.manager.sessionExists(h.target.id)).toBe(true);
  const prepared = await prepareSessionManagement(h.manager, h.host.sessionContext, 'delete', h.target.id, undefined,
    () => { throw new Error('PRIVATE_REASON'); });
  expect(prepared.note).toContain('unavailable');
  expect(prepared.note).not.toContain('PRIVATE_REASON');
});

it('retains legacy-location data and refuses symlink substitution', async () => {
  const h = fixture(); const targetDir = h.manager.getSessionDirPath(h.target.id);
  const legacyDir = path.join(h.root, '.coding-agents', 'sessions'); fs.mkdirSync(legacyDir, { recursive: true });
  fs.renameSync(targetDir, path.join(legacyDir, h.target.id));
  const legacyManager = new SessionManager();
  const prepared = await prepareSessionManagement(legacyManager, h.host.sessionContext, 'rename', h.target.id);
  expect(prepared.preview).toBeDefined();
  expect(applySessionManagement(legacyManager, h.host.sessionContext, prepared.preview!, 'Legacy title').status).toBe('changed');
  expect(fs.existsSync(targetDir)).toBe(false); expect(legacyManager.getSession(h.target.id)?.title).toBe('Legacy title');
  fs.symlinkSync(path.join(legacyDir, h.target.id), targetDir, 'dir');
  expect((await prepareSessionManagement(legacyManager, h.host.sessionContext, 'delete', h.target.id)).preview).toBeUndefined();
  expect(fs.existsSync(path.join(legacyDir, h.target.id))).toBe(true);
});

it('keeps scripted deletion a preview and scripted explicit rename uses the same owner', async () => {
  const h = fixture(); const renderer = { renderLine: vi.fn() } as unknown as StreamingRenderer;
  await runSessionManagement({ sessionManager: h.manager, runtimeContext: h.runtimeContext, renderer },
    { kind: 'shell-action', action: 'manage-session', sessionOperation: 'delete', sessionId: h.target.id });
  expect(renderer.renderLine).toHaveBeenLastCalledWith(expect.stringContaining('Confirmation is required'));
  expect(h.manager.sessionExists(h.target.id)).toBe(true);
  await runSessionManagement({ sessionManager: h.manager, runtimeContext: h.runtimeContext, renderer },
    { kind: 'shell-action', action: 'manage-session', sessionOperation: 'rename', sessionTitle: 'Scripted title' });
  expect(h.manager.getSession(h.current.id)?.title).toBe('Scripted title');
});

it('rejects scripted rename when configuration authority changes during resolution', async () => {
  const h = fixture();
  const before = fs.readFileSync(path.join(h.manager.getSessionDirPath(h.current.id), 'metadata.json'));
  const resolve = h.manager.catalog.resolve.bind(h.manager.catalog);
  vi.spyOn(h.manager.catalog, 'resolve').mockImplementationOnce(async (...args) => {
    const result = await resolve(...args);
    h.runtimeContext.workspaceIssue = 'Workspace authority revoked during resolution.';
    return result;
  });
  const renderer = { renderLine: vi.fn() } as unknown as StreamingRenderer;
  await runSessionManagement({ sessionManager: h.manager, runtimeContext: h.runtimeContext, renderer },
    { kind: 'shell-action', action: 'manage-session', sessionOperation: 'rename', sessionTitle: 'Rejected title' });
  expect(renderer.renderLine).toHaveBeenCalledWith(expect.stringContaining('authority revoked'));
  expect(fs.readFileSync(path.join(h.manager.getSessionDirPath(h.current.id), 'metadata.json'))).toEqual(before);
});

it('rejects scripted pin when configuration authority changes during resolution and allows a fresh explicit pin', async () => {
  const h = fixture();
  const directory = h.manager.getSessionDirPath(h.target.id);
  const before = fs.readFileSync(path.join(directory, 'metadata.json'));
  const transcript = fs.readFileSync(path.join(directory, 'transcript.jsonl'));
  const state = fs.readFileSync(path.join(directory, 'state.json'));
  const resolve = h.manager.catalog.resolve.bind(h.manager.catalog);
  vi.spyOn(h.manager.catalog, 'resolve').mockImplementationOnce(async (...args) => {
    const result = await resolve(...args);
    h.runtimeContext.workspaceIssue = 'Workspace authority revoked during resolution.';
    return result;
  });
  const command = sessionCommandFor({ sessionManager: h.manager, runtimeContext: h.runtimeContext,
    sessionRuntime: { getCurrentRunController: () => null } })!;
  expect(await command('pin', [h.target.id, 'on'])).toMatchObject({ kind: 'local', output: expect.stringContaining('authority revoked') });
  expect(fs.readFileSync(path.join(directory, 'metadata.json'))).toEqual(before);
  h.runtimeContext.workspaceIssue = undefined;
  expect(await command('pin', [h.target.id, 'on'])).toMatchObject({ kind: 'local', state: { status: 'changed' } });
  expect(new SessionManager().getSession(h.target.id)?.pinned).toBe(true);
  expect(fs.readFileSync(path.join(directory, 'transcript.jsonl'))).toEqual(transcript);
  expect(fs.readFileSync(path.join(directory, 'state.json'))).toEqual(state);
  expect(h.runtimeContext.session.id).toBe(h.current.id);
});

it.each(['', '\x1b[31munsafe', 'line\nline', 'x'.repeat(4097)])('rejects an invalid title without writing: %j', title => {
  expect(invalidSessionTitle(title)).toBeTruthy();
});

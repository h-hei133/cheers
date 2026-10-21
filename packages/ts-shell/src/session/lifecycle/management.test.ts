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
import { OverlayHost } from '../../cli/interactive/overlay.js';
import { parseKeyEvent } from '../../presentation/tui/input/keys.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { StreamingRenderer } from '../../presentation/terminal/streaming.js';

const roots: string[] = [];
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-management-')); roots.push(root);
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  const manager = new SessionManager();
  const current = manager.createNew(root); const target = manager.createNew(root);
  manager.renameSession(target.id, 'Saved work');
  const context = { sessionId: current.id, projectRoot: root, busy: false };
  const host = { sessionManager: manager, sessionContext: () => ({ ...context }) };
  const runtimeContext = { session: current, projectRoot: root } as ShellRuntimeContext;
  return { root, manager, current, target, context, host, runtimeContext };
}

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

it.each(['', '\x1b[31munsafe', 'line\nline', 'x'.repeat(4097)])('rejects an invalid title without writing: %j', title => {
  expect(invalidSessionTitle(title)).toBeTruthy();
});

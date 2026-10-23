import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { restorePicker } from '../restore.js';
import { restoreSelection } from './state.js';
import * as catalog from '../../../../edit/recovery/catalog.js';
import * as index from '../../../../edit/recovery/recoveryAuthorityIndex.js';
import { captureRecoveryAuthorityRecord } from '../../../../edit/recovery/recoveryAuthorityStore.js';
import { snapshotRoot } from '../../../../edit/recovery/root.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { pickerFor } from '../registry.js';
import type { PickerHost } from '../registry.js';
import { createProfileContext, withProfile } from '../../../../core/paths/profile/context.js';

let root: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-selection-')); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const context = () => ({ sessionId: 'selection-session', projectRoot: root, busy: false });
async function capture(recordId = 'record-a') {
  const result = await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot: snapshotRoot(root), authorityId: 'edit-a', recordId,
    workspaceRelativePath: `${recordId}.txt`, operationKind: 'create', beforeState: 'absent', expectedCurrentState: 'exists', expectedCurrentContent: 'after' });
  expect(result.status).toBe('captured');
}

it('makes actual overlay cancellation consume the old picker without rereading or producing a draft', async () => {
  await capture(); const picker = restorePicker(root, undefined, { context });
  const host = new OverlayHost(() => {}); host.open(picker);
  await vi.waitFor(() => expect(host.render(120, 40).join('\n')).toContain('record-a.txt'));
  host.handleKey(parseKeyEvent('\x1b'), () => { throw new Error('Cancellation cannot apply'); });
  expect(host.active).toBe(false);
  const listing = vi.spyOn(catalog, 'readRecoveryCatalogPage');
  await expect(picker.load()).rejects.toThrow('closed');
  await expect(picker.search!('record')).rejects.toThrow('closed');
  expect(picker.onSearchClear?.()).toBeUndefined();
  expect(await picker.apply(['edit-a:record-a'])).toBeUndefined();
  expect(listing).not.toHaveBeenCalled();
});

it('aborts delayed browsing and rejects late results instead of repopulating released records', async () => {
  await capture(); const page = await catalog.readRecoveryCatalogPage({ ledgerRoot: snapshotRoot(root) });
  let resolve!: (value: catalog.RecoveryCatalogPage) => void;
  let signal: AbortSignal | undefined;
  vi.spyOn(catalog, 'readRecoveryCatalogPage').mockImplementation(input => {
    signal = input.signal; return new Promise(value => { resolve = value; });
  });
  const picker = restorePicker(root, undefined, { context }); const loading = picker.load();
  expect(picker.previewEnd).toBeTypeOf('function');
  picker.previewEnd!(); expect(signal!.aborted).toBe(true); resolve(page);
  await expect(loading).rejects.toThrow('closed');
  expect(await picker.apply(['edit-a:record-a'])).toBeUndefined();
});

it.each(['load', 'search'] as const)('refuses %s publication when admission changes after the inner read returns', async action => {
  await capture(); const page = await catalog.readRecoveryCatalogPage({ ledgerRoot: snapshotRoot(root) });
  vi.spyOn(catalog, 'readRecoveryCatalogPage').mockResolvedValue(page);
  let checks = 0; let blocked = false;
  const picker = restorePicker(root, undefined, { context, admission: () => {
    if (++checks === 2) queueMicrotask(() => { blocked = true; });
    return blocked ? 'Changed grant' : undefined;
  } });
  await expect(action === 'load' ? picker.load() : picker.search!('record')).rejects.toThrow('opening is unavailable');
  expect(picker.isCurrent!()).toBe(true);
  expect((await picker.apply(['edit-a:record-a']))?.note).toContain('unavailable');
});

it('refuses load publication when cancellation happens after the inner read returns', async () => {
  await capture(); const page = await catalog.readRecoveryCatalogPage({ ledgerRoot: snapshotRoot(root) });
  vi.spyOn(catalog, 'readRecoveryCatalogPage').mockResolvedValue(page);
  let checks = 0; let picker: ReturnType<typeof restorePicker>;
  picker = restorePicker(root, undefined, { context, admission: () => {
    if (++checks === 2) queueMicrotask(() => picker.previewEnd!());
    return undefined;
  } });
  await expect(picker.load()).rejects.toThrow('closed');
  expect(picker.onSearchClear?.()).toBeUndefined();
  expect(await picker.apply(['edit-a:record-a'])).toBeUndefined();
});

it('consumes accepted metadata selection once while preserving read-only draft semantics', async () => {
  await capture(); const picker = restorePicker(root, undefined, { context }); const rows = await picker.load();
  const outcome = await picker.apply([rows[0]!.id]); expect(outcome?.draft).toContain('/restore preview');
  const listing = vi.spyOn(index, 'listRecoveryAuthorityRecords');
  expect(await picker.apply([rows[0]!.id])).toBeUndefined();
  expect(listing).not.toHaveBeenCalled(); await expect(picker.load()).rejects.toThrow('closed');
  expect(fs.existsSync(path.join(root, 'record-a.txt'))).toBe(false);
});

it('consumes continuation handoff and preserves the original opening owner across pages', async () => {
  for (let number = 0; number < 101; number++) await capture(`record-${number}`);
  const owner = context(); const picker = restorePicker(root, undefined, { context: () => owner });
  const rows = await picker.load(); const more = rows.find(row => row.id === ':more')!;
  const next = (await picker.apply([more.id]))!.next!;
  expect(await picker.apply([more.id])).toBeUndefined(); await expect(picker.load()).rejects.toThrow('closed');
  expect(await next.load()).toHaveLength(1);
  owner.sessionId = 'changed-session';
  const listing = vi.spyOn(catalog, 'readRecoveryCatalogPage');
  await expect(next.load()).rejects.toThrow('owner changed');
  expect(listing).not.toHaveBeenCalled(); expect(next.isCurrent!()).toBe(false);
});

it('checks original registry admission before catalogue acquisition and preserves same-owner refusal visibility', async () => {
  await capture(); let blocked = false;
  const host = { projectRoot: root, sessionContext: context, commandContext: { cwd: root, sessionId: 'selection-session',
    admission: () => blocked ? 'Configuration changed' : undefined } } as unknown as PickerHost;
  const picker = pickerFor('/restore', host)!; blocked = true;
  const listing = vi.spyOn(catalog, 'readRecoveryCatalogPage');
  await expect(picker.load()).rejects.toThrow('opening is unavailable');
  expect(listing).not.toHaveBeenCalled(); expect(picker.isCurrent!()).toBe(true);
  expect((await picker.apply(['edit-a:record-a']))?.note).toContain('unavailable');
});

it('passes admission into active catalogue reading rather than checking only around the call', async () => {
  await capture(); let blocked = false;
  const picker = restorePicker(root, undefined, { context, admission: () => blocked ? 'Changed grant' : undefined });
  vi.spyOn(catalog, 'readRecoveryCatalogPage').mockImplementation(async input => {
    blocked = true; expect(input.readAccess?.check).toBeTypeOf('function'); input.readAccess!.check!();
    throw new Error('Admission should have refused');
  });
  await expect(picker.load()).rejects.toThrow('opening is unavailable');
});

it('revokes original admission inside the actual metadata reader and closes its file before another chunk', async () => {
  await capture(); let blocked = false;
  const recordFile = path.join(snapshotRoot(root), 'edit-a', 'records', 'record-a.json');
  const original = fs.readFileSync(recordFile);
  fs.writeFileSync(recordFile, JSON.stringify({ ...JSON.parse(original.toString()), extra: 'x'.repeat(96 * 1024) }));
  const files = await import('node:fs/promises');
  const open = files.default.open.bind(files.default);
  let chunks = 0; let closed = 0;
  vi.spyOn(files.default, 'open').mockImplementation(async (...args: Parameters<typeof files.default.open>) => {
    const handle = await Reflect.apply(open, files.default, args);
    const read = handle.read.bind(handle); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof handle.read>) => {
      const result = await Reflect.apply(read, handle, args); chunks++; blocked = true; return result;
    });
    vi.spyOn(handle, 'close').mockImplementation(async () => { closed++; await close(); });
    return handle;
  });
  const picker = restorePicker(root, undefined, { context, admission: () => blocked ? 'Changed grant' : undefined });
  await expect(picker.load()).rejects.toThrow('opening is unavailable');
  expect(chunks).toBe(1); expect(closed).toBe(1);
  expect(await picker.apply(['edit-a:record-a'])).not.toHaveProperty('draft');
});

it('refuses late accepted selection after its original admission changes without drafting', async () => {
  await capture(); let blocked = false;
  const picker = restorePicker(root, undefined, { context, admission: () => blocked ? 'Changed configuration' : undefined });
  const rows = await picker.load(); const read = index.listRecoveryAuthorityRecords;
  vi.spyOn(index, 'listRecoveryAuthorityRecords').mockImplementation(async input => {
    const value = await read(input); blocked = true; return value;
  });
  await expect(picker.apply([rows[0]!.id])).rejects.toThrow('opening is unavailable');
  expect(picker.isCurrent!()).toBe(true); expect(await picker.apply([rows[0]!.id])).toBeUndefined();
});

it('cancels one search without poisoning later scans and detaches browsing signal before accepted action', async () => {
  await capture(); const picker = restorePicker(root, undefined, { context });
  const loaded = new AbortController(); const rows = await picker.load(loaded.signal); loaded.abort();
  const search = new AbortController(); search.abort(new Error('Search cancelled'));
  await expect(picker.search!('record-a', search.signal)).rejects.toThrow('Search cancelled');
  expect(await picker.search!('record-a')).toHaveLength(1);
  await expect(picker.apply([rows[0]!.id])).resolves.toHaveProperty('draft', expect.stringContaining('/restore preview'));
});

it('checks the captured workspace identity before reading after directory replacement', () => {
  const selection = restoreSelection({ context }, root);
  fs.renameSync(root, root + '-old'); fs.mkdirSync(root);
  try { expect(selection.isCurrent()).toBe(false); expect(() => selection.check()).toThrow(); }
  finally { fs.rmSync(root, { recursive: true }); fs.renameSync(root + '-old', root); }
});

it('preserves profile ownership across asynchronous local scope changes', () => {
  const home = path.join(root, 'home'); fs.mkdirSync(home);
  const first = createProfileContext({ name: 'first', homeDir: home });
  const second = createProfileContext({ name: 'second', homeDir: home });
  const selection = withProfile(first, () => restoreSelection({ context }, root));
  expect(withProfile(first, () => selection.isCurrent())).toBe(true);
  expect(withProfile(second, () => selection.isCurrent())).toBe(false);
  expect(() => withProfile(second, () => selection.check())).toThrow('owner changed');
});

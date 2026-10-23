import fs from 'node:fs'; import fsp from 'node:fs/promises'; import os from 'node:os'; import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureRecoveryAuthorityRecord } from '../recoveryAuthorityStore.js';
import { previewRecoveryAuthorityRestore } from '../restorePreview.js';
import { runExplicitRestoreBridge } from '../restoreExecutionBridge.js';
import { runRestoreLocalCommand } from '../../../core/commands/restoreCommandRuntime.js';
import { RecoveryReadLimitError } from '../read.js';
vi.mock('./limits.js', () => ({ RESTORE_PREVIEW_LIMITS: { fileBytes: 8 * 1024, totalBytes: 32 * 1024 } }));
import { RESTORE_PREVIEW_LIMITS } from './limits.js';
const limits = RESTORE_PREVIEW_LIMITS as { fileBytes: number; totalBytes: number };
let root: string; let ledger: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-preparation-')); ledger = path.join(root, 'ledger'); limits.fileBytes = 8 * 1024; limits.totalBytes = 32 * 1024; });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
async function capture(id = 'a', before = 'before😀', after = 'after😀') {
  fs.writeFileSync(path.join(root, id + '.txt'), after);
  expect((await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot: ledger, authorityId: 'edit-a', recordId: id,
    workspaceRelativePath: id + '.txt', operationKind: 'update', beforeState: 'exists', beforeContent: before, expectedCurrentState: 'exists', expectedCurrentContent: after })).status).toBe('captured');
}
const input = (recordIds = ['a']) => ({ ledgerRoot: ledger, workspaceRoot: root, authorityId: 'edit-a', recordIds });

it('charges index and prepared metadata plus blob/current exact source bytes without changing preview files', async () => {
  await capture(); const metadata = fs.statSync(path.join(ledger, 'edit-a/records/a.json')).size;
  limits.totalBytes = 2 * metadata + Buffer.byteLength('before😀') + Buffer.byteLength('after😀');
  expect((await previewRecoveryAuthorityRestore(input())).canAttemptExplicitRestore).toBe(true);
  limits.totalBytes--;
  await expect(previewRecoveryAuthorityRestore(input())).rejects.toThrow(RecoveryReadLimitError);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('refuses cumulative preparation after an earlier eligible file before an execute bridge starts writing', async () => {
  await capture('a', 'a'.repeat(4096), 'A'.repeat(4096)); await capture('b', 'b'.repeat(4096), 'B'.repeat(4096));
  const metadata = ['a', 'b'].reduce((sum, id) => sum + fs.statSync(path.join(ledger, `edit-a/records/${id}.json`)).size, 0);
  limits.totalBytes = 2 * metadata + 4 * 4096 - 1;
  await expect(runExplicitRestoreBridge({ ...input(), recordSelection: ['a', 'b'], mode: 'execute' })).rejects.toThrow(RecoveryReadLimitError);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('A'.repeat(4096));
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('B'.repeat(4096));
});

it('refuses current file bytes before current source allocation even when stored content is small', async () => {
  await capture('a', 'before', 'x'.repeat(8 * 1024 + 1));
  await expect(previewRecoveryAuthorityRestore(input())).rejects.toThrow(RecoveryReadLimitError);
  expect(fs.statSync(path.join(root, 'a.txt')).size).toBe(8 * 1024 + 1);
});

it('checks original command admission before any ledger metadata acquisition', async () => {
  await capture(); const open = vi.spyOn(fsp, 'open');
  await expect(runRestoreLocalCommand(['preview', '--ledger-root', ledger, '--authority-id=edit-a', '--record=a'],
    { cwd: root, admission: () => 'Original command revoked' })).rejects.toThrow();
  expect(open).not.toHaveBeenCalled();
});

it('stops actual metadata chunks under parent cancellation and closes without drafting or writing', async () => {
  await capture(); const file = path.join(ledger, 'edit-a/records/a.json');
  fs.writeFileSync(file, JSON.stringify({ ...JSON.parse(fs.readFileSync(file, 'utf8')), extra: 'x'.repeat(96 * 1024) }));
  limits.totalBytes = 256 * 1024; const controller = new AbortController(); const open = fsp.open.bind(fsp); let chunks = 0; let closed = 0;
  vi.spyOn(fsp, 'open').mockImplementation(async (...args: Parameters<typeof fsp.open>) => { const handle = await Reflect.apply(open, fsp, args); const read = handle.read.bind(handle); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof handle.read>) => { const result = await Reflect.apply(read, handle, args); chunks++; controller.abort(new Error('Preparation cancelled')); return result; });
    vi.spyOn(handle, 'close').mockImplementation(async () => { closed++; await close(); }); return handle; });
  await expect(runRestoreLocalCommand(['preview', '--ledger-root', ledger, '--authority-id=edit-a', '--record=a'], { cwd: root, signal: controller.signal })).rejects.toThrow('Preparation cancelled');
  expect(chunks).toBe(1); expect(closed).toBe(1); expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('rejects original admission changed by a final target inspection instead of publishing restorable files', async () => {
  await capture(); let blocked = false;
  const read = fs.readSync.bind(fs);
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => { const result = Reflect.apply(read, fs, args); blocked = true; return result; });
  await expect(previewRecoveryAuthorityRestore({ ...input(), admission: () => blocked ? 'Changed grant' : undefined })).rejects.toThrow();
});

it('charges all-selection metadata within the original preparation total before workspace capture can change', async () => {
  await capture(); const metadata = fs.statSync(path.join(ledger, 'edit-a/records/a.json')).size;
  limits.totalBytes = 3 * metadata + Buffer.byteLength('before😀') + Buffer.byteLength('after😀') - 1;
  await expect(runExplicitRestoreBridge({ ...input(), mode: 'preview', recordSelection: 'all' })).rejects.toThrow(RecoveryReadLimitError);
});

it.each(['preview', 'execute'] as const)('checks late original admission before bridge %s publication or writing', async mode => {
  await capture(); let inspected = false; let checks = 0; let blocked = false;
  const read = fs.readSync.bind(fs);
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => { const result = Reflect.apply(read, fs, args); inspected = true; return result; });
  await expect(runExplicitRestoreBridge({ ...input(), mode, recordSelection: ['a'], admission: () => {
    if (blocked) return 'Late bridge refusal';
    if (inspected && ++checks === 2) queueMicrotask(() => { blocked = true; });
    return undefined;
  } })).rejects.toThrow('Late bridge refusal');
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('blocks later files and keeps earlier unknown publication visible when admission changes during execute', async () => {
  await capture('a', 'before-a', 'after-a'); await capture('b', 'before-b', 'after-b');
  let blocked = false; const rename = fs.renameSync.bind(fs);
  vi.spyOn(fs, 'renameSync').mockImplementation((...args: Parameters<typeof fs.renameSync>) => {
    const result = Reflect.apply(rename, fs, args); if (String(args[1]).endsWith('/b.txt')) blocked = true; return result;
  });
  const result = await runExplicitRestoreBridge({ ...input(), mode: 'execute', recordSelection: ['a', 'b'], admission: () => blocked ? 'Write owner revoked' : undefined });
  expect(result.outcome).toBe('unknown'); expect(result.unknownFiles.map(file => file.workspaceRelativePath)).toEqual(['b.txt']);
  expect(result.blockedFiles.map(file => file.workspaceRelativePath)).toContain('a.txt');
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after-a');
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('before-b');
});

it('checks original command admission after the bridge returns before formatting a preview', async () => {
  await capture(); let inspected = false; let checks = 0; let blocked = false; const read = fs.readSync.bind(fs);
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => { const result = Reflect.apply(read, fs, args); inspected = true; return result; });
  await expect(runRestoreLocalCommand(['preview', '--ledger-root', ledger, '--authority-id=edit-a', '--record=a'], { cwd: root, admission: () => {
    if (blocked) return 'Late command refused'; if (inspected && ++checks === 3) queueMicrotask(() => { blocked = true; }); return undefined;
  } })).rejects.toThrow('Late command refused');
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureRecoveryAuthorityRecord } from '../recoveryAuthorityStore.js';
import { restoreRecoveryAuthorityRecord } from '../restorePrimitive.js';
import { runExplicitRestoreBridge } from '../restoreExecutionBridge.js';
import { restoreReadAccess } from './read.js';
import { RecoveryReadLimitError } from '../read.js';
import { withFileLock } from '../../../runtime/execution/fileLock.js';

vi.mock('./limits.js', () => ({ RESTORE_WRITE_READ_LIMITS: { fileBytes: 8 * 1024, totalBytes: 24 * 1024 } }));
vi.mock('../preview/limits.js', () => ({ RESTORE_PREVIEW_LIMITS: { fileBytes: 8 * 1024, totalBytes: 32 * 1024 } }));
import { RESTORE_WRITE_READ_LIMITS } from './limits.js';
import { RESTORE_PREVIEW_LIMITS } from '../preview/limits.js';
const targets = RESTORE_WRITE_READ_LIMITS as { fileBytes: number; totalBytes: number };
const preparation = RESTORE_PREVIEW_LIMITS as { fileBytes: number; totalBytes: number };
let root: string;
let ledger: string;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-writer-')); ledger = path.join(root, 'ledger');
  targets.fileBytes = 8 * 1024; targets.totalBytes = 24 * 1024; preparation.fileBytes = 8 * 1024; preparation.totalBytes = 32 * 1024; });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
async function capture(id = 'a', before = 'before😀', after = 'after😀') {
  fs.writeFileSync(path.join(root, id + '.txt'), after);
  expect((await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot: ledger, authorityId: 'edit-a', recordId: id,
    workspaceRelativePath: id + '.txt', operationKind: 'update', beforeState: 'exists', beforeContent: before,
    expectedCurrentState: 'exists', expectedCurrentContent: after })).status).toBe('captured');
}
const input = (id = 'a') => ({ ledgerRoot: ledger, workspaceRoot: root, authorityId: 'edit-a', recordId: id, workspaceRelativePath: id + '.txt' });

it('charges prepared metadata/blob and every original locked primitive/commit inspection', async () => {
  await capture(); const metadata = fs.statSync(path.join(ledger, 'edit-a/records/a.json')).size;
  const before = Buffer.byteLength('before😀'), current = Buffer.byteLength('after😀'), admitted: number[] = [];
  targets.totalBytes = 3 * current + before;
  const result = await restoreRecoveryAuthorityRecord({ ...input(), readAccess: { admit: bytes => admitted.push(bytes) } });
  expect(result.outcome).toBe('restored-verified'); expect(admitted).toEqual([metadata, before, current, current, current, before]);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('before😀');
});

it('refuses an oversized current descriptor before target body reading or starting a writer', async () => {
  await capture('a', 'before', 'x'.repeat(8 * 1024 + 1)); const read = vi.spyOn(fs, 'readSync');
  const result = await restoreRecoveryAuthorityRecord(input());
  expect(result.outcome).toBe('blocked'); expect(read).not.toHaveBeenCalled();
  expect(fs.statSync(path.join(root, 'a.txt')).size).toBe(8 * 1024 + 1);
});

it('shares target source across files and retains earlier verified writes when the next preflight refuses', async () => {
  await capture('a', 'a'.repeat(4096), 'A'.repeat(4096)); await capture('b', 'b'.repeat(4096), 'B'.repeat(4096));
  targets.totalBytes = 4 * 4096;
  const result = await runExplicitRestoreBridge({ ...input(), mode: 'execute', recordSelection: ['a', 'b'] });
  expect(result.outcome).toBe('partial'); expect(result.restoredFiles).toEqual(['b.txt']);
  expect(result.blockedFiles.map(file => file.workspaceRelativePath)).toEqual(['a.txt']);
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('b'.repeat(4096));
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('A'.repeat(4096));
});

it('keeps post-publication verification refusal unknown and blocks later files without reading them', async () => {
  await capture('a', 'a'.repeat(4096), 'A'.repeat(4096)); await capture('b', 'b'.repeat(4096), 'B'.repeat(4096));
  targets.totalBytes = 4 * 4096 - 1;
  const open = fsp.open.bind(fsp); const prepared: string[] = [];
  vi.spyOn(fsp, 'open').mockImplementation(async (...args: Parameters<typeof fsp.open>) => { prepared.push(String(args[0])); return Reflect.apply(open, fsp, args); });
  const result = await runExplicitRestoreBridge({ ...input(), mode: 'execute', recordSelection: ['a', 'b'] });
  expect(result.outcome).toBe('unknown'); expect(result.unknownFiles.map(file => file.workspaceRelativePath)).toEqual(['b.txt']);
  expect(result.blockedFiles.map(file => file.workspaceRelativePath)).toEqual(['a.txt']);
  expect(prepared.filter(file => file.endsWith('/a.json'))).toHaveLength(2);
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('b'.repeat(4096));
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('A'.repeat(4096));
});

it('shares failed fresh metadata/blob preparation charges without refunding or continuing after refusal', async () => {
  await capture('a', 'a'.repeat(4096)); await capture('b', 'b'.repeat(4096));
  const metadata = ['a', 'b'].reduce((sum, id) => sum + fs.statSync(path.join(ledger, `edit-a/records/${id}.json`)).size, 0);
  preparation.totalBytes = metadata + 2 * 4096 - 1;
  const reads = restoreReadAccess(input());
  expect((await restoreRecoveryAuthorityRecord(input('b'), reads)).outcome).toBe('restored-verified');
  expect((await restoreRecoveryAuthorityRecord(input('a'), reads)).outcome).toBe('blocked');
  const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord(input('a'), reads)).outcome).toBe('blocked'); expect(open).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('retains a one-shot caller byte refusal across primitive calls and cleanup', async () => {
  await capture(); let calls = 0;
  const reads = restoreReadAccess({ ...input(), readAccess: { admit: () => { calls++; throw new Error('Caller source refused'); } } });
  expect((await restoreRecoveryAuthorityRecord(input(), reads)).outcome).toBe('blocked');
  const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord(input(), reads)).outcome).toBe('blocked'); expect(open).not.toHaveBeenCalled(); expect(calls).toBe(1);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('preserves both caller and primitive cancellation and checks caller controls before target reading', async () => {
  await capture(); const owner = new AbortController(), call = new AbortController(); owner.abort(new Error('Owner cancelled'));
  const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord({ ...input(), abortSignal: call.signal, readAccess: { signal: owner.signal } })).outcome).toBe('blocked');
  expect(open).not.toHaveBeenCalled();
  let charged = 0; const read = vi.spyOn(fs, 'readSync');
  expect((await restoreRecoveryAuthorityRecord({ ...input(), readAccess: { admit: bytes => { charged += bytes; }, check: () => { if (charged) throw new Error('Caller cancelled'); } } })).outcome).toBe('blocked');
  expect(read).not.toHaveBeenCalled();
});

it('keeps refused target budget latched even when a later smaller descriptor would fit', async () => {
  await capture(); targets.totalBytes = 1; const access = restoreReadAccess(input());
  await expect(Promise.resolve().then(() => access.admitCurrent(2))).rejects.toThrow(RecoveryReadLimitError);
  await expect(Promise.resolve().then(() => access.admitCurrent(1))).rejects.toThrow(RecoveryReadLimitError);
});

it('refuses target growth while waiting for the original shared file lock before reading its body', async () => {
  await capture(); const target = path.join(root, 'a.txt'); let release!: () => void; let locked!: () => void;
  const started = new Promise<void>(resolve => { locked = resolve; });
  const held = withFileLock(target, async () => { locked(); await new Promise<void>(resolve => { release = resolve; }); });
  await started; const read = vi.spyOn(fs, 'readSync'); let ready!: () => void;
  const prepared = new Promise<void>(resolve => { ready = resolve; }); let admissions = 0;
  const restoration = restoreRecoveryAuthorityRecord({ ...input(), readAccess: { admit: () => { if (++admissions === 2) ready(); } } });
  try {
    await prepared; fs.writeFileSync(target, 'x'.repeat(8 * 1024 + 1)); release();
    expect((await restoration).outcome).toBe('blocked'); expect(read).not.toHaveBeenCalled();
    expect(fs.statSync(target).size).toBe(8 * 1024 + 1);
  } finally { release(); await held; await restoration; }
});

it('does not refund a blob read whose descriptor later fails and stops subsequent preparation on the shared bound', async () => {
  await capture('a', 'a'.repeat(4096)); await capture('b', 'b'.repeat(4096));
  const metadata = ['a', 'b'].reduce((sum, id) => sum + fs.statSync(path.join(ledger, `edit-a/records/${id}.json`)).size, 0);
  preparation.totalBytes = metadata + 2 * 4096 - 1; const reads = restoreReadAccess(input()); const open = fsp.open.bind(fsp); let bodyReads = 0;
  vi.spyOn(fsp, 'open').mockImplementation(async (...args: Parameters<typeof fsp.open>) => {
    const handle = await Reflect.apply(open, fsp, args);
    if (String(args[0]).endsWith('.content')) {
      const read = handle.read.bind(handle);
      vi.spyOn(handle, 'read').mockImplementation(async (...readArgs: Parameters<typeof handle.read>) => {
        const result = await Reflect.apply(read, handle, readArgs); bodyReads++; throw new Error('Blob source failed after read');
      });
    }
    return handle;
  });
  expect((await restoreRecoveryAuthorityRecord(input('b'), reads)).outcome).toBe('blocked');
  expect((await restoreRecoveryAuthorityRecord(input('a'), reads)).outcome).toBe('blocked'); expect(bodyReads).toBe(1);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀'); expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('after😀');
});

it('keeps each original caller control and bytes effective when a shared owner is supplied', async () => {
  await capture(); const reads = restoreReadAccess(input()); const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord({ ...input(), readAccess: { check: () => { throw new Error('Original call refused'); } } }, reads)).outcome).toBe('blocked');
  expect(open).not.toHaveBeenCalled(); expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
  const admitted: number[] = [];
  expect((await restoreRecoveryAuthorityRecord({ ...input(), readAccess: { admit: bytes => admitted.push(bytes) } }, restoreReadAccess(input()))).outcome).toBe('restored-verified');
  expect(admitted).toHaveLength(6);
});

it('rechecks cancellation set by caller byte admission before target body reading or writer start', async () => {
  await capture(); const controller = new AbortController(); let count = 0; const read = vi.spyOn(fs, 'readSync');
  expect((await restoreRecoveryAuthorityRecord({ ...input(), abortSignal: controller.signal, readAccess: {
    admit: () => { if (++count === 3) controller.abort(new Error('Target read cancelled')); },
  } })).outcome).toBe('blocked');
  expect(read).not.toHaveBeenCalled(); expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('refuses a shared read owner from another workspace before metadata acquisition', async () => {
  await capture(); const other = path.join(root, 'other'); fs.mkdirSync(other); const reads = restoreReadAccess({ workspaceRoot: other });
  const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord(input(), reads)).outcome).toBe('blocked'); expect(open).not.toHaveBeenCalled();
});

it('captures the original shared workspace string before callers replace input fields', async () => {
  await capture(); const other = path.join(root, 'other'); fs.mkdirSync(other);
  const opening = { ...input(), workspaceRoot: other }; const reads = restoreReadAccess(opening); opening.workspaceRoot = root;
  const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord(input(), reads)).outcome).toBe('blocked'); expect(open).not.toHaveBeenCalled();
});

it('latches an already cancelled invocation before its preparation signal can bypass owner checks', async () => {
  await capture(); const reads = restoreReadAccess(input()); const controller = new AbortController(); controller.abort(new Error('Original call cancelled'));
  const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord({ ...input(), abortSignal: controller.signal }, reads)).outcome).toBe('blocked');
  expect((await restoreRecoveryAuthorityRecord(input(), reads)).outcome).toBe('blocked'); expect(open).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('latches a distinct invocation signal cancelled during metadata body reading across the shared attempt', async () => {
  await capture(); const reads = restoreReadAccess(input()); const controller = new AbortController(), open = fsp.open.bind(fsp); let chunks = 0;
  vi.spyOn(fsp, 'open').mockImplementation(async (...args: Parameters<typeof fsp.open>) => {
    const handle = await Reflect.apply(open, fsp, args); const read = handle.read.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async (...readArgs: Parameters<typeof handle.read>) => {
      const result = await Reflect.apply(read, handle, readArgs); chunks++; controller.abort(new Error('Original metadata cancelled')); return result;
    }); return handle;
  });
  expect((await restoreRecoveryAuthorityRecord({ ...input(), abortSignal: controller.signal }, reads)).outcome).toBe('blocked');
  expect((await restoreRecoveryAuthorityRecord(input(), reads)).outcome).toBe('blocked'); expect(chunks).toBe(1);
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('rechecks control after locked current body reading before marking any writer started', async () => {
  await capture(); const controller = new AbortController(), read = fs.readSync.bind(fs); let bodies = 0;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const value = Reflect.apply(read, fs, args); bodies++; controller.abort(new Error('Current read cancelled')); return value;
  });
  const result = await restoreRecoveryAuthorityRecord({ ...input(), abortSignal: controller.signal });
  expect(result.outcome).toBe('blocked'); expect(bodies).toBe(1); expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('refuses a workspace alias retargeted during preparation before reading or writing the replacement', async () => {
  await capture(); const other = path.join(root, 'other'), alias = path.join(root, 'alias'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'a.txt'), 'after😀');
  fs.symlinkSync(root, alias, 'dir'); const open = fsp.open.bind(fsp); let changed = false; const read = vi.spyOn(fs, 'readSync');
  vi.spyOn(fsp, 'open').mockImplementation(async (...args: Parameters<typeof fsp.open>) => {
    const handle = await Reflect.apply(open, fsp, args);
    if (!changed && String(args[0]).endsWith('.content')) { changed = true; fs.unlinkSync(alias); fs.symlinkSync(other, alias, 'dir'); }
    return handle;
  });
  const result = await restoreRecoveryAuthorityRecord({ ...input(), workspaceRoot: alias });
  expect(result.outcome).toBe('blocked'); expect(read).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀'); expect(fs.readFileSync(path.join(other, 'a.txt'), 'utf8')).toBe('after😀');
});

it('retains the initial alias binding through bridge preview settlement and execution acquisition', async () => {
  await capture(); const other = path.join(root, 'other'), alias = path.join(root, 'alias'); fs.mkdirSync(other); fs.writeFileSync(path.join(other, 'a.txt'), 'after😀'); fs.symlinkSync(root, alias, 'dir');
  const read = fs.readSync.bind(fs); let changed = false;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const value = Reflect.apply(read, fs, args);
    if (!changed) { changed = true; fs.unlinkSync(alias); fs.symlinkSync(other, alias, 'dir'); }
    return value;
  });
  await expect(runExplicitRestoreBridge({ ...input(), workspaceRoot: alias, mode: 'execute', recordSelection: ['a'] })).rejects.toThrow('workspace changed');
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀'); expect(fs.readFileSync(path.join(other, 'a.txt'), 'utf8')).toBe('after😀');
});

it('preserves post-publication verification-body cancellation as unknown and latches later files', async () => {
  await capture('a'); await capture('b'); const reads = restoreReadAccess(input()); const controller = new AbortController(), read = fs.readSync.bind(fs); let bodies = 0;
  vi.spyOn(fs, 'readSync').mockImplementation((...args: Parameters<typeof fs.readSync>) => {
    const value = Reflect.apply(read, fs, args); if (++bodies === 4) controller.abort(new Error('Verification cancelled')); return value;
  });
  expect((await restoreRecoveryAuthorityRecord({ ...input('b'), abortSignal: controller.signal }, reads)).outcome).toBe('unknown');
  expect((await restoreRecoveryAuthorityRecord(input('a'), reads)).outcome).toBe('blocked'); expect(bodies).toBe(4);
  expect(fs.readFileSync(path.join(root, 'b.txt'), 'utf8')).toBe('before😀'); expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

it('retains a one-shot original file-access refusal across the shared source attempt', async () => {
  await capture(); const reads = restoreReadAccess(input()); let checks = 0;
  expect((await restoreRecoveryAuthorityRecord({ ...input(), assertFileAccess: () => { checks++; throw new Error('File source refused'); } }, reads)).outcome).toBe('blocked');
  const open = vi.spyOn(fsp, 'open');
  expect((await restoreRecoveryAuthorityRecord(input(), reads)).outcome).toBe('blocked'); expect(checks).toBe(1); expect(open).not.toHaveBeenCalled();
  expect(fs.readFileSync(path.join(root, 'a.txt'), 'utf8')).toBe('after😀');
});

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { listRecoveryAuthorityNamespaces, listRecoveryAuthorityRecords } from '../recoveryAuthorityIndex.js';
import { captureRecoveryAuthorityRecord } from '../recoveryAuthorityStore.js';
import { runExplicitRestoreBridge } from '../restoreExecutionBridge.js';
import { RecoveryReadControlError, RecoveryReadLimitError } from '../read.js';

vi.mock('./limits.js', () => ({ RECOVERY_INDEX_LIMITS: { metadataBytes: 32 * 1024, records: 20, directoryEntries: 50 } }));
import { RECOVERY_INDEX_LIMITS } from './limits.js';
const limits = RECOVERY_INDEX_LIMITS as { metadataBytes: number; records: number; directoryEntries: number };
let root: string;
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'restore-index-')); limits.metadataBytes = 32 * 1024; limits.records = 20; limits.directoryEntries = 50; });
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });
async function capture(recordId = 'record-a') {
  expect((await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot: root, authorityId: 'edit-a', recordId,
    workspaceRelativePath: recordId + '.txt', operationKind: 'create', beforeState: 'absent', expectedCurrentState: 'exists', expectedCurrentContent: 'after' })).status).toBe('captured');
}

it('lists sorted original records and namespaces without full readdir or blob/workspace body reads', async () => {
  await capture('z'); await capture('a');
  vi.spyOn(fs, 'readdir').mockImplementation(async () => { throw new Error('Full directory arrays are forbidden'); });
  expect(await listRecoveryAuthorityNamespaces({ ledgerRoot: root })).toMatchObject({ status: 'listed', authorityIds: ['edit-a'] });
  expect((await listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a' })).records.map(record => record.recordId)).toEqual(['a', 'z']);
});

it.each(['namespaces', 'records'] as const)('counts ignored %s directory names and closes its handle on inventory refusal', async kind => {
  await capture(); const directory = kind === 'records' ? path.join(root, 'edit-a', 'records') : root;
  for (let index = 0; index < 5; index++) await fs.writeFile(path.join(directory, `ignored-${index}`), 'not metadata');
  const read = () => kind === 'namespaces' ? listRecoveryAuthorityNamespaces({ ledgerRoot: root }) : listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a' });
  limits.directoryEntries = 6; expect((await read()).status).toBe('listed');
  const directories: Awaited<ReturnType<typeof fs.opendir>>[] = []; const open = fs.opendir.bind(fs);
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args: Parameters<typeof fs.opendir>) => { const value = await Reflect.apply(open, fs, args); directories.push(value); return value; });
  limits.directoryEntries = 5; await expect(read()).rejects.toThrow('inventory limit');
  expect(directories).toHaveLength(1); await expect(Promise.resolve().then(() => directories[0]!.read())).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' });
});

it('rejects explicit selected record count before metadata I/O and does not silently deduplicate', async () => {
  await capture(); limits.records = 2;
  expect((await listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', recordIds: ['record-a', 'record-a'] })).records).toHaveLength(2);
  const open = vi.spyOn(fs, 'open');
  await expect(listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', recordIds: ['record-a', 'record-a', 'record-a'] })).rejects.toThrow('inventory limit');
  expect(open).not.toHaveBeenCalled();
});

it('detaches the admitted explicit IDs before callers mutate the array during metadata reading', async () => {
  await capture(); limits.records = 1; const ids = ['record-a']; const open = fs.open.bind(fs); let changed = false;
  vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await Reflect.apply(open, fs, args);
    if (!changed) { changed = true; ids.push('missing-a', 'missing-b'); }
    return handle;
  });
  const result = await listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', recordIds: ids });
  expect(result.status).toBe('listed'); expect(result.records).toHaveLength(1); expect(result.missingRecords).toEqual([]);
  expect(ids).toHaveLength(3);
});

it.each(['namespaces', 'records'] as const)('rejects %s retained name count without relying on later explicit ID checks', async kind => {
  await capture('one'); await capture('two');
  if (kind === 'namespaces') await fs.mkdir(path.join(root, 'edit-b'));
  limits.records = 1;
  const read = kind === 'namespaces' ? listRecoveryAuthorityNamespaces({ ledgerRoot: root })
    : listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a' });
  await expect(read).rejects.toThrow('inventory limit');
});

it('charges exact default metadata bytes and malformed acquisitions before body reads without refunding', async () => {
  await capture('a'); await capture('b');
  const records = path.join(root, 'edit-a', 'records'), sizeA = (await fs.stat(path.join(records, 'a.json'))).size, sizeB = (await fs.stat(path.join(records, 'b.json'))).size;
  limits.metadataBytes = sizeA + sizeB;
  expect((await listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a' })).records).toHaveLength(2);
  await fs.writeFile(path.join(records, 'a.json'), 'x'.repeat(512)); await fs.writeFile(path.join(records, 'b.json'), 'y'.repeat(512)); limits.metadataBytes = 1023;
  const reads: number[] = []; const open = fs.open.bind(fs);
  vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => { const handle = await Reflect.apply(open, fs, args); const index = reads.push(0) - 1; const read = handle.read.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof handle.read>) => { const value = await Reflect.apply(read, handle, args); reads[index] += value.bytesRead; return value; }); return handle; });
  await expect(listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a' })).rejects.toThrow(RecoveryReadLimitError);
  expect(reads).toEqual([512, 0]);
});

it('keeps caller byte admission and access signal effective alongside default index controls', async () => {
  await capture(); let charged = 0;
  expect((await listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', readAccess: { admit: bytes => { charged += bytes; } } })).status).toBe('listed');
  expect(charged).toBe((await fs.stat(path.join(root, 'edit-a', 'records', 'record-a.json'))).size);
  const owner = new AbortController(); owner.abort(new Error('Original index cancelled')); const call = new AbortController();
  await expect(listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', signal: call.signal, readAccess: { signal: owner.signal } })).rejects.toThrow('Original index cancelled');
});

it('propagates a one-shot caller byte refusal instead of treating a read metadata record as missing', async () => {
  await capture(); let calls = 0;
  const read = listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', readAccess: {
    admit: () => { if (++calls === 1) throw new Error('Caller read refused'); },
  } });
  await expect(read).rejects.toThrow(RecoveryReadControlError);
  await expect(read).rejects.toThrow('Caller read refused');
  expect(calls).toBe(1);
});

it.each(['namespaces', 'records'] as const)('preserves %s cancellation during actual directory read and closes once', async kind => {
  await capture(); const controller = new AbortController(); const reason = new Error('Directory read cancelled');
  const open = fs.opendir.bind(fs); let closed = 0;
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args: Parameters<typeof fs.opendir>) => {
    const handle = await Reflect.apply(open, fs, args); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async () => { controller.abort(reason); throw Object.assign(new Error('Read failed'), { code: 'EIO' }); });
    vi.spyOn(handle, 'close').mockImplementation(async () => { closed++; await close(); }); return handle;
  });
  const read = kind === 'namespaces' ? listRecoveryAuthorityNamespaces({ ledgerRoot: root, signal: controller.signal })
    : listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', signal: controller.signal });
  await expect(read).rejects.toBe(reason); expect(closed).toBe(1);
});

it('checks namespace admission after the inner inventory returns before publishing a list', async () => {
  await capture(); let finished = false; let blocked = false; const open = fs.opendir.bind(fs);
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args: Parameters<typeof fs.opendir>) => {
    const handle = await Reflect.apply(open, fs, args); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); finished = true; }); return handle;
  });
  await expect(listRecoveryAuthorityNamespaces({ ledgerRoot: root, readAccess: { check: () => {
    if (blocked) throw new Error('Late namespace refused');
    if (finished) queueMicrotask(() => { blocked = true; });
  } } })).rejects.toThrow('Late namespace refused');
});

it.each(['control', 'limit'] as const)('preserves a one-shot %s refusal when closing the directory also fails', async kind => {
  await capture(); let refuse = false; let closed = 0; const open = fs.opendir.bind(fs);
  const reason = new RecoveryReadControlError(new Error('One-shot index refusal'));
  if (kind === 'limit') limits.directoryEntries = 0;
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args: Parameters<typeof fs.opendir>) => {
    const handle = await Reflect.apply(open, fs, args); const read = handle.read.bind(handle); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async () => { const entry = await read(); refuse = true; return entry; });
    vi.spyOn(handle, 'close').mockImplementation(async () => { closed++; await close(); throw Object.assign(new Error('Concurrent close failed'), { code: 'EIO' }); }); return handle;
  });
  const read = listRecoveryAuthorityNamespaces({ ledgerRoot: root, readAccess: { check: () => { if (kind === 'control' && refuse) { refuse = false; throw reason; } } } });
  if (kind === 'control') await expect(read).rejects.toBe(reason);
  else await expect(read).rejects.toThrow(RecoveryReadLimitError);
  expect(closed).toBe(1);
});

it('preserves a one-shot metadata byte refusal when the opened file close also fails', async () => {
  await capture(); const open = fs.open.bind(fs); let closed = 0; let admissions = 0;
  vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await Reflect.apply(open, fs, args); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'close').mockImplementation(async () => { closed++; await close(); throw Object.assign(new Error('File close failed'), { code: 'EIO' }); });
    return handle;
  });
  await expect(listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', readAccess: {
    admit: () => { admissions++; throw new Error('Original byte admission refused'); },
  } })).rejects.toThrow('Original byte admission refused');
  expect(closed).toBe(1); expect(admissions).toBe(1);
});

it('keeps the original source limit class when a refused metadata file close also fails', async () => {
  await capture(); const open = fs.open.bind(fs); limits.metadataBytes = 0; let closed = 0;
  vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await Reflect.apply(open, fs, args); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'close').mockImplementation(async () => { closed++; await close(); throw Object.assign(new Error('File close failed'), { code: 'EIO' }); });
    return handle;
  });
  await expect(listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a' })).rejects.toThrow(RecoveryReadLimitError);
  expect(closed).toBe(1);
});

it.each(['EACCES', 'ENOENT'] as const)('preserves namespace cancellation when opendir also fails with %s', async code => {
  const controller = new AbortController(); const reason = new Error('Namespace read cancelled');
  vi.spyOn(fs, 'opendir').mockImplementation(async () => { controller.abort(reason); throw Object.assign(new Error('Directory failed'), { code }); });
  await expect(listRecoveryAuthorityNamespaces({ ledgerRoot: root, signal: controller.signal })).rejects.toBe(reason);
});

it('refuses an explicit all bridge inventory instead of producing an empty success preview', async () => {
  await capture('one'); await capture('two'); limits.records = 1;
  await expect(runExplicitRestoreBridge({ mode: 'preview', ledgerRoot: root, authorityId: 'edit-a', workspaceRoot: root, recordSelection: 'all' })).rejects.toThrow('inventory limit');
});

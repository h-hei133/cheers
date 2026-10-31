import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { captureRecoveryAuthorityRecord } from '../recoveryAuthorityStore.js';
import { listRecoveryAuthorityRecords } from '../recoveryAuthorityIndex.js';
import { readRecoveryCatalogPage } from '../catalog.js';
import { RecoveryReadControlError, RecoveryReadLimitError } from '../read.js';
import { RECOVERY_CATALOG_LIMITS } from './limits.js';

vi.mock('./limits.js', () => ({ RECOVERY_CATALOG_LIMITS: { metadataBytes: 32 * 1024, records: 20, directoryEntries: 50 } }));
const limits = RECOVERY_CATALOG_LIMITS as { metadataBytes: number; records: number; directoryEntries: number };
let root: string;
beforeEach(async () => {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); await fs.mkdir(scratch, { recursive: true });
  root = await fs.mkdtemp(path.join(scratch, 'restore-catalog-'));
  limits.metadataBytes = 32 * 1024; limits.records = 20; limits.directoryEntries = 50;
});
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }); });

async function capture(authorityId = 'edit-a', recordId = 'record-a') {
  const captured = await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot: root, authorityId, recordId,
    workspaceRelativePath: `${recordId}.txt`, operationKind: 'create', beforeState: 'absent', expectedCurrentState: 'exists',
    expectedCurrentContent: 'after😀', createdAt: '2026-10-23T00:00:00.000Z' });
  expect(captured.status).toBe('captured');
}

it('admits exact metadata bytes and rejects another acquisition across authority namespaces', async () => {
  await capture('edit-a'); await capture('edit-b');
  const size = (await fs.stat(path.join(root, 'edit-a', 'records', 'record-a.json'))).size;
  expect((await fs.stat(path.join(root, 'edit-b', 'records', 'record-a.json'))).size).toBe(size);
  limits.metadataBytes = 2 * size;
  expect(await readRecoveryCatalogPage({ ledgerRoot: root })).toMatchObject({ matches: 2, unavailable: 0 });
  limits.metadataBytes--;
  await expect(readRecoveryCatalogPage({ ledgerRoot: root })).rejects.toThrow(RecoveryReadLimitError);
});

it('counts malformed metadata source reads without refunding or reading the next refused body', async () => {
  const records = path.join(root, 'edit-a', 'records'); await fs.mkdir(records, { recursive: true });
  await fs.writeFile(path.join(records, 'a.json'), 'x'.repeat(512));
  await fs.writeFile(path.join(records, 'b.json'), 'y'.repeat(512));
  limits.metadataBytes = 1023;
  const reads: number[] = [];
  const open = fs.open.bind(fs);
  vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await Reflect.apply(open, fs, args);
    const index = reads.push(0) - 1;
    const read = handle.read.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof handle.read>) => {
      const result = await Reflect.apply(read, handle, args); reads[index] += result.bytesRead; return result;
    });
    return handle;
  });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root })).rejects.toThrow(RecoveryReadLimitError);
  expect(reads).toEqual([512, 0]);
});

it('counts record candidates across authorities and rejects the whole catalogue before returning a page', async () => {
  await capture('edit-a', 'one'); await capture('edit-a', 'two'); await capture('edit-b', 'three'); await capture('edit-b', 'four');
  limits.records = 4;
  expect((await readRecoveryCatalogPage({ ledgerRoot: root })).matches).toBe(4);
  limits.records = 3;
  await expect(readRecoveryCatalogPage({ ledgerRoot: root, query: 'one' })).rejects.toThrow('inventory limit');
});

it.each(['ledger', 'records'])('counts unrelated %s names as directory work', async location => {
  await capture();
  const directory = location === 'ledger' ? root : path.join(root, 'edit-a', 'records');
  for (let index = 0; index < 5; index++) await fs.writeFile(path.join(directory, `unrelated-${index}`), 'ignored');
  limits.directoryEntries = 7; // One authority + one record + five unrelated entries.
  expect((await readRecoveryCatalogPage({ ledgerRoot: root })).matches).toBe(1);
  limits.directoryEntries = 6;
  await expect(readRecoveryCatalogPage({ ledgerRoot: root })).rejects.toThrow('inventory limit');
});

it('stops inside the first metadata chunk and closes file and both directory handles on cancellation', async () => {
  await capture();
  const recordFile = path.join(root, 'edit-a', 'records', 'record-a.json');
  const record = JSON.parse(await fs.readFile(recordFile, 'utf8'));
  await fs.writeFile(recordFile, JSON.stringify({ ...record, extra: 'x'.repeat(96 * 1024) }));
  limits.metadataBytes = 128 * 1024;
  const controller = new AbortController();
  const directories: Awaited<ReturnType<typeof fs.opendir>>[] = [];
  const opendir = fs.opendir.bind(fs);
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args: Parameters<typeof fs.opendir>) => {
    const directory = await Reflect.apply(opendir, fs, args); directories.push(directory); return directory;
  });
  const open = fs.open.bind(fs);
  let chunks = 0; let closed = 0;
  vi.spyOn(fs, 'open').mockImplementation(async (...args: Parameters<typeof fs.open>) => {
    const handle = await Reflect.apply(open, fs, args); const read = handle.read.bind(handle); const close = handle.close.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof handle.read>) => {
      const result = await Reflect.apply(read, handle, args); chunks++; controller.abort(new Error('Cancelled actual metadata read')); return result;
    });
    vi.spyOn(handle, 'close').mockImplementation(async () => { closed++; await close(); });
    return handle;
  });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root, signal: controller.signal })).rejects.toThrow('Cancelled actual metadata read');
  expect(chunks).toBe(1); expect(closed).toBe(1); expect(directories).toHaveLength(2);
  for (const directory of directories) await expect(Promise.resolve().then(() => directory.read())).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' });
});

it('propagates a one-shot index admission refusal through the metadata read', async () => {
  await capture();
  let calls = 0;
  await expect(listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', recordIds: ['record-a'], readAccess: {
    check: () => { if (++calls === 4) throw new Error('One-shot index admission revoked'); },
  } })).rejects.toThrow(RecoveryReadControlError);
  expect(calls).toBe(4);
});

it('checks cancellation after blob stat instead of returning a successful metadata listing', async () => {
  const captured = await captureRecoveryAuthorityRecord({ mode: 'non-default', ledgerRoot: root, authorityId: 'edit-a', recordId: 'record-a',
    workspaceRelativePath: 'note.txt', operationKind: 'update', beforeState: 'exists', beforeContent: 'before',
    expectedCurrentState: 'exists', expectedCurrentContent: 'after' });
  expect(captured.status).toBe('captured');
  const controller = new AbortController();
  const stat = fs.stat.bind(fs);
  vi.spyOn(fs, 'stat').mockImplementation(async (...args: Parameters<typeof fs.stat>) => {
    const result = await Reflect.apply(stat, fs, args);
    if (String(args[0]).includes('/blobs/')) controller.abort(new Error('Cancelled blob stat'));
    return result;
  });
  await expect(listRecoveryAuthorityRecords({ ledgerRoot: root, authorityId: 'edit-a', recordIds: ['record-a'],
    readAccess: { signal: controller.signal } })).rejects.toThrow('Cancelled blob stat');
});

it.each(['EACCES', 'ENOENT'])('preserves actual cancellation when root opendir also fails with %s', async code => {
  const controller = new AbortController();
  const reason = new Error('Cancelled root snapshot read');
  vi.spyOn(fs, 'opendir').mockImplementation(async () => {
    controller.abort(reason); throw Object.assign(new Error('Directory open failed'), { code });
  });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root, signal: controller.signal })).rejects.toBe(reason);
});

function deferredDirectory(read: () => Promise<import('node:fs').Dirent | null>, close = vi.fn(async () => {})) {
  const cursor = { read: vi.fn(read), close,
    async *[Symbol.asyncIterator]() {
      try { for (;;) { const entry = await cursor.read(); if (!entry) break; yield entry; } }
      finally { await cursor.close(); }
    },
  };
  vi.spyOn(fs, 'opendir').mockResolvedValue(cursor as unknown as Awaited<ReturnType<typeof fs.opendir>>);
  return cursor;
}

it('treats a deferred first-read missing ledger as empty without creating it', async () => {
  const ledgerRoot = path.join(root, 'absent');
  const cursor = deferredDirectory(async () => { throw Object.assign(new Error('source details'), { code: 'ENOENT' }); });
  await expect(readRecoveryCatalogPage({ ledgerRoot })).resolves.toEqual({ records: [], matches: 0, unavailable: 0 });
  expect(cursor.read).toHaveBeenCalledOnce(); expect(cursor.close).toHaveBeenCalledOnce();
  await expect(fs.stat(ledgerRoot)).rejects.toMatchObject({ code: 'ENOENT' });
});

it.each(['EACCES', 'EIO', 'ENOTDIR'])('projects a deferred ledger %s as a fixed read failure', async code => {
  const cursor = deferredDirectory(async () => { throw Object.assign(new Error('source details'), { code }); });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root })).rejects.toThrow(/^Edit snapshots could not be read\.$/);
  expect(cursor.close).toHaveBeenCalledOnce();
});

it('refuses a missing ledger after discovery started instead of claiming it was empty', async () => {
  let reads = 0;
  const cursor = deferredDirectory(async () => {
    if (reads++ === 0) return { name: 'unrelated', isDirectory: () => false } as import('node:fs').Dirent;
    throw Object.assign(new Error('source details'), { code: 'ENOENT' });
  });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root })).rejects.toThrow(/^Edit snapshots could not be read\.$/);
  expect(cursor.read).toHaveBeenCalledTimes(2); expect(cursor.close).toHaveBeenCalledOnce();
});

it('keeps cancellation ahead of a deferred missing ledger', async () => {
  const controller = new AbortController(); const reason = new Error('cancelled deferred ledger read');
  const cursor = deferredDirectory(async () => { controller.abort(reason); throw Object.assign(new Error('source details'), { code: 'ENOENT' }); });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root, signal: controller.signal })).rejects.toBe(reason);
  expect(cursor.close).toHaveBeenCalledOnce();
});

it('rechecks caller admission before accepting a deferred missing ledger', async () => {
  let refused = false;
  const cursor = deferredDirectory(async () => { refused = true; throw Object.assign(new Error('source details'), { code: 'ENOENT' }); });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root, readAccess: {
    check: () => { if (refused) throw new Error('caller revoked'); },
  } })).rejects.toBeInstanceOf(RecoveryReadControlError);
  expect(cursor.close).toHaveBeenCalledOnce();
});

it('preserves close failure after a deferred missing ledger instead of reporting empty', async () => {
  const reason = Object.assign(new Error('ledger close was not confirmed'), { code: 'ENOENT' });
  const cursor = deferredDirectory(async () => { throw Object.assign(new Error('source details'), { code: 'ENOENT' }); },
    vi.fn(async () => { throw reason; }));
  await expect(readRecoveryCatalogPage({ ledgerRoot: root })).rejects.toBe(reason);
  expect(cursor.close).toHaveBeenCalledOnce();
});

it.each(['admission', 'inventory'] as const)('keeps a primary %s refusal when closing also fails', async kind => {
  let read = false; let refused = false;
  if (kind === 'inventory') limits.directoryEntries = 0;
  const cursor = deferredDirectory(async () => {
    read = true;
    return { name: 'unrelated', isDirectory: () => false } as import('node:fs').Dirent;
  }, vi.fn(async () => { throw new Error('secondary close failure'); }));
  await expect(readRecoveryCatalogPage({ ledgerRoot: root, readAccess: { check: () => {
    if (kind === 'admission' && read && !refused) { refused = true; throw new Error('primary admission refusal'); }
  } } })).rejects.toBeInstanceOf(kind === 'admission' ? RecoveryReadControlError : RecoveryReadLimitError);
  expect(cursor.close).toHaveBeenCalledOnce();
});

it.each(['ledger', 'records'])('preserves cancellation when the %s iterator fails and closes its handles', async location => {
  await capture();
  const controller = new AbortController(); const reason = new Error('Cancelled snapshot iteration');
  const opened: Awaited<ReturnType<typeof fs.opendir>>[] = [];
  const reads: ReturnType<typeof vi.spyOn>[] = [];
  const open = fs.opendir.bind(fs);
  vi.spyOn(fs, 'opendir').mockImplementation(async (...args: Parameters<typeof fs.opendir>) => {
    const directory = await Reflect.apply(open, fs, args); opened.push(directory);
    if (location === 'ledger' && String(args[0]) === root) {
      reads.push(vi.spyOn(directory, 'read').mockImplementation(async () => {
        controller.abort(reason); throw Object.assign(new Error('Directory read failed'), { code: 'EIO' });
      }));
    } else if (location === 'records' && String(args[0]) === path.join(root, 'edit-a', 'records')) {
      directory[Symbol.asyncIterator] = async function* () {
        try { controller.abort(reason); throw Object.assign(new Error('Iterator read failed'), { code: 'EIO' }); }
        finally { await directory.close(); }
      };
    }
    return directory;
  });
  await expect(readRecoveryCatalogPage({ ledgerRoot: root, signal: controller.signal })).rejects.toBe(reason);
  expect(opened).toHaveLength(location === 'ledger' ? 1 : 2);
  for (const read of reads) read.mockRestore();
  for (const directory of opened) await expect(Promise.resolve().then(() => directory.read())).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' });
});

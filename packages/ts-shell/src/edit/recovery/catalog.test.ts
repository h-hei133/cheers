import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureRecoveryAuthorityRecord } from './recoveryAuthorityStore.js';
import * as index from './recoveryAuthorityIndex.js';
import { readRecoveryCatalogPage } from './catalog.js';
import { RecoveryReadControlError, RecoveryReadLimitError } from './read.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function ledger(count: number) {
  const ledgerRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'recovery-catalog-'));
  roots.push(ledgerRoot);
  for (let number = 0; number < count; number++) {
    const recordId = `record-${String(number).padStart(3, '0')}`;
    const captured = await captureRecoveryAuthorityRecord({
      mode: 'non-default', ledgerRoot, authorityId: 'edit-a', recordId,
      workspaceRelativePath: `${recordId}.txt`, operationKind: 'update', beforeState: 'exists',
      beforeContent: 'before', expectedCurrentState: 'exists', expectedCurrentContent: 'after',
      createdAt: new Date(Date.UTC(2026, 9, 21) + number * 1000).toISOString(),
    });
    expect(captured.status).toBe('captured');
  }
  return ledgerRoot;
}

describe('recovery catalogue pages', () => {
  it('reaches every record in bounded pages without loading complete directory arrays', async () => {
    const ledgerRoot = await ledger(205);
    vi.spyOn(fs, 'readdir').mockRejectedValue(new Error('Unbounded directory read forbidden'));
    const list = vi.spyOn(index, 'listRecoveryAuthorityRecords');
    const first = await readRecoveryCatalogPage({ ledgerRoot });
    expect(first.records).toHaveLength(100);
    expect(first.matches).toBe(205);
    expect(first.records[0]?.recordId).toBe('record-204');
    list.mockClear();
    const second = await readRecoveryCatalogPage({ ledgerRoot, after: first.next });
    const third = await readRecoveryCatalogPage({ ledgerRoot, after: second.next });
    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls.every(([input]) => input.recordIds?.length === 100 || input.recordIds?.length === 5)).toBe(true);
    expect(second.records).toHaveLength(100);
    expect(third.records).toHaveLength(5);
    expect(third.next).toBeUndefined();
    expect(new Set([...first.records, ...second.records, ...third.records].map(record => record.recordId)).size).toBe(205);
    const search = await readRecoveryCatalogPage({ ledgerRoot, query: 'record-001' });
    expect(search.records.map(record => record.recordId)).toEqual(['record-001']);
    expect(search.matches).toBe(1);
    expect(search.next).toBeUndefined();
    expect(fs.readdir).not.toHaveBeenCalled();
  });

  it('rejects a continuation after ledger membership changes', async () => {
    const ledgerRoot = await ledger(101);
    const first = await readRecoveryCatalogPage({ ledgerRoot });
    await captureRecoveryAuthorityRecord({
      mode: 'non-default', ledgerRoot, authorityId: 'edit-a', recordId: 'record-new',
      workspaceRelativePath: 'record-new.txt', operationKind: 'update', beforeState: 'exists',
      beforeContent: 'before', expectedCurrentState: 'exists', expectedCurrentContent: 'after',
      createdAt: '2026-10-22T00:00:00.000Z',
    });
    await expect(readRecoveryCatalogPage({ ledgerRoot, after: first.next })).rejects.toThrow('changed');
  });

  it('rejects a continuation whose cursor revision or position was altered', async () => {
    const ledgerRoot = await ledger(101);
    const first = await readRecoveryCatalogPage({ ledgerRoot });
    expect(first.next).toBeDefined();
    await expect(readRecoveryCatalogPage({ ledgerRoot,
      after: { ...first.next!, revision: 'altered-cursor-revision' } })).rejects.toThrow('changed');
    await expect(readRecoveryCatalogPage({ ledgerRoot,
      after: { ...first.next!, recordId: first.records[0]!.recordId } })).rejects.toThrow('changed');
  });

  it('charges every continuation page to one cumulative source budget without rescanning directories', async () => {
    const ledgerRoot = await ledger(205);
    const first = await readRecoveryCatalogPage({ ledgerRoot });
    expect(first.next).toBeDefined();
    const opendir = vi.spyOn(fs, 'opendir');
    const callerAdmissions: number[] = [];
    const readAccess = { admit: (bytes: number): void => { callerAdmissions.push(bytes); } };
    const second = await readRecoveryCatalogPage({ ledgerRoot, after: first.next, readAccess });
    expect(opendir).not.toHaveBeenCalled();
    expect(second.records).toHaveLength(100);
    expect(second.next).toBeDefined();
    expect(callerAdmissions).toHaveLength(100);
    const file = path.join(ledgerRoot, 'edit-a', 'records', 'record-000.json');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify({ ...record, padding: 'x'.repeat(96 * 1024) }));
    await expect(readRecoveryCatalogPage({ ledgerRoot, after: second.next, readAccess })).rejects.toBeInstanceOf(RecoveryReadLimitError);
    expect(opendir).not.toHaveBeenCalled();
  });

  it('refuses concurrent replay of the same continuation cursor before reading a second page', async () => {
    const ledgerRoot = await ledger(101);
    const first = await readRecoveryCatalogPage({ ledgerRoot });
    expect(first.next).toBeDefined();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let entered!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const original = index.listRecoveryAuthorityRecords;
    const list = vi.spyOn(index, 'listRecoveryAuthorityRecords').mockImplementation(async input => {
      entered();
      await gate;
      return original(input);
    });
    const left = readRecoveryCatalogPage({ ledgerRoot, after: first.next });
    await started;
    const replay = readRecoveryCatalogPage({ ledgerRoot, after: first.next });
    let outcome: unknown;
    try {
      outcome = await Promise.race([
        replay.then(() => 'fulfilled', error => error),
        new Promise(resolve => setTimeout(() => resolve('pending'), 250)),
      ]);
      expect(outcome).toMatchObject({ message: expect.stringMatching(/already being read/) });
    } finally {
      release();
      await Promise.allSettled([left, replay]);
    }
    expect(list).toHaveBeenCalledOnce();
  });

  it('preserves continuation caller cancellation and admission controls', async () => {
    const ledgerRoot = await ledger(101);
    const continuation = async () => {
      const page = await readRecoveryCatalogPage({ ledgerRoot });
      expect(page.next).toBeDefined();
      return page.next!;
    };
    const cancelled = new AbortController();
    const reason = new Error('caller cancelled continuation');
    cancelled.abort(reason);
    await expect(readRecoveryCatalogPage({ ledgerRoot, after: await continuation(), readAccess: { signal: cancelled.signal } }))
      .rejects.toBe(reason);
    await expect(readRecoveryCatalogPage({ ledgerRoot, after: await continuation(),
      readAccess: { check: () => { throw new Error('one-shot caller refusal'); } } }))
      .rejects.toBeInstanceOf(RecoveryReadControlError);
    await expect(readRecoveryCatalogPage({ ledgerRoot, after: await continuation(),
      readAccess: { admit: () => { throw new Error('caller admission refusal'); } } }))
      .rejects.toBeInstanceOf(RecoveryReadControlError);
    const admitted: number[] = [];
    const page = await readRecoveryCatalogPage({ ledgerRoot, after: await continuation(),
      readAccess: { admit: bytes => { admitted.push(bytes); } } });
    expect(page.records).toHaveLength(1);
    expect(admitted).toHaveLength(1);
  });

  it('latches a caller check refusal during continuation verification', async () => {
    const ledgerRoot = await ledger(101);
    const first = await readRecoveryCatalogPage({ ledgerRoot });
    expect(first.next).toBeDefined();
    let checks = 0;
    const readAccess = { check: (): void => {
      if (++checks === 10) throw new Error('caller revoked during verification');
    } };
    await expect(readRecoveryCatalogPage({ ledgerRoot, after: first.next, readAccess }))
      .rejects.toBeInstanceOf(RecoveryReadControlError);
    expect(checks).toBe(10);
  });

  it('rejects a continuation when a page record changes before it is read', async () => {
    const ledgerRoot = await ledger(205);
    const first = await readRecoveryCatalogPage({ ledgerRoot });
    const file = path.join(ledgerRoot, 'edit-a', 'records', 'record-104.json');
    const record = JSON.parse(await fs.readFile(file, 'utf8'));
    await fs.writeFile(file, JSON.stringify({ ...record, expectedCurrentMode: 0o600 }));
    await expect(readRecoveryCatalogPage({ ledgerRoot, after: first.next })).rejects.toThrow('changed');
  });

  it('keeps unavailable records and edits separate from empty and no-match results', async () => {
    const ledgerRoot = await ledger(1);
    await fs.writeFile(path.join(ledgerRoot, 'edit-a', 'records', 'broken.json'), '{broken');
    await fs.mkdir(path.join(ledgerRoot, 'missing-edit'));
    const page = await readRecoveryCatalogPage({ ledgerRoot });
    expect(page).toMatchObject({ matches: 1, unavailable: 2 });
    const noMatch = await readRecoveryCatalogPage({ ledgerRoot, query: 'no-matching-snapshot' });
    expect(noMatch).toMatchObject({ records: [], matches: 0, unavailable: 2 });
    await fs.rm(path.join(ledgerRoot, 'edit-a', 'records', 'record-000.json'));
    await expect(readRecoveryCatalogPage({ ledgerRoot })).rejects.toThrow('could be read');
    await expect(readRecoveryCatalogPage({ ledgerRoot: path.join(ledgerRoot, 'absent') })).resolves.toMatchObject({ records: [], matches: 0 });
    await fs.writeFile(path.join(ledgerRoot, 'ordinary-file'), 'not a directory');
    await expect(readRecoveryCatalogPage({ ledgerRoot: path.join(ledgerRoot, 'ordinary-file') })).rejects.toThrow('could not be read');
  });

  it('closes both directory handles when cancellation interrupts a record scan', async () => {
    const ledgerRoot = await ledger(3);
    const controller = new AbortController();
    const opened: Awaited<ReturnType<typeof fs.opendir>>[] = [];
    const open = fs.opendir.bind(fs);
    vi.spyOn(fs, 'opendir').mockImplementation(async (...args) => {
      const directory = await open(...args);
      opened.push(directory);
      return directory;
    });
    const read = index.listRecoveryAuthorityRecords;
    vi.spyOn(index, 'listRecoveryAuthorityRecords').mockImplementation(async input => {
      const result = await read(input);
      controller.abort(new Error('cancelled snapshot scan'));
      return result;
    });
    await expect(readRecoveryCatalogPage({ ledgerRoot, signal: controller.signal })).rejects.toThrow('cancelled snapshot scan');
    expect(opened).toHaveLength(2);
    // Node 20.3 may throw synchronously here while newer Node versions return a
    // rejected promise; normalize both forms without weakening the close check.
    for (const directory of opened) {
      await expect(Promise.resolve().then(() => directory.read())).rejects.toMatchObject({ code: 'ERR_DIR_CLOSED' });
    }
  });
});

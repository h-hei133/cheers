import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { hashContent } from './recoveryAuthorityStore.js';
import { listRecoveryAuthorityRecords, type RecoveryAuthorityRecordIndexEntry } from './recoveryAuthorityIndex.js';
import { assertRecoveryReadAccess, recoveryReadBudget, RecoveryReadControlError, RecoveryReadLimitError, type RecoveryReadAccess } from './read.js';
import { RECOVERY_CATALOG_LIMITS } from './catalog/limits.js';

type RecordPosition = Pick<RecoveryAuthorityRecordIndexEntry, 'createdAt' | 'authorityId' | 'recordId'>;
export interface RecoveryCatalogCursor extends RecordPosition {
  readonly attemptId: string;
  readonly revision: string;
}

export interface RecoveryCatalogPage {
  readonly records: readonly RecoveryAuthorityRecordIndexEntry[];
  readonly matches: number;
  readonly unavailable: number;
  readonly next?: RecoveryCatalogCursor;
}

interface ScanEntry {
  readonly key: string;
  readonly record?: RecoveryAuthorityRecordIndexEntry;
}

interface DirectoryVersion {
  readonly path: string;
  readonly identity: string;
}

interface CatalogAttempt {
  readonly ledgerRoot: string;
  readonly query: string;
  readonly revision: string;
  readonly matches: number;
  readonly unavailable: number;
  readonly records: readonly RecoveryAuthorityRecordIndexEntry[];
  readonly directories: readonly DirectoryVersion[];
  readonly verification: { readonly limit: number; used: number };
  claimed: boolean;
  cursor: RecordPosition;
}

const attempts = new Map<string, CatalogAttempt>();
const MAX_ATTEMPTS = 16;

/** Scan metadata with bounded directory buffers and retain only one sorted page. */
export async function readRecoveryCatalogPage(input: {
  readonly ledgerRoot: string;
  readonly query?: string;
  readonly after?: RecoveryCatalogCursor;
  readonly signal?: AbortSignal;
  readonly readAccess?: RecoveryReadAccess;
}): Promise<RecoveryCatalogPage> {
  const pageSize = 100;
  const query = input.query?.trim().toLowerCase() ?? '';
  const ledgerRoot = path.resolve(input.ledgerRoot);
  const attemptId = input.after?.attemptId ?? randomUUID();
  if (input.after) {
    const attempt = attempts.get(attemptId);
    if (!attempt || attempt.ledgerRoot !== ledgerRoot || attempt.query !== query) {
      throw new Error('Snapshot page expired. Reopen /restore before continuing.');
    }
    if (attempt.revision !== input.after.revision) {
      throw new Error('Snapshot catalogue changed. Reopen /restore before continuing.');
    }
    if (comparePosition(attempt.cursor, input.after) !== 0) {
      throw new Error('Snapshot catalogue changed. Reopen /restore before continuing.');
    }
    if (attempt.claimed) throw new Error('Snapshot page is already being read. Reopen /restore before continuing.');
    attempt.claimed = true;
    attempts.delete(attemptId);
    attempts.set(attemptId, attempt);
    await validateDirectories(attempt.directories, input);
    const remaining = entriesAfter(attempt.records, input.after);
    const page = remaining.slice(0, pageSize);
    const records = await verifyPage(page, input, attempt.verification);
    const last = records.at(-1);
    if (remaining.length > pageSize && last) {
      attempt.cursor = last;
      attempt.claimed = false;
    }
    return {
      records,
      matches: attempt.matches,
      unavailable: attempt.unavailable,
      ...(remaining.length > pageSize && last ? { next: {
        attemptId,
        createdAt: last.createdAt,
        authorityId: last.authorityId,
        recordId: last.recordId,
        revision: attempt.revision,
      } } : {}),
    };
  }
  const records: RecoveryAuthorityRecordIndexEntry[] = [];
  let matches = 0;
  let unavailable = 0;
  let scanned = 0;
  // Order-independent change detector; selection still revalidates its records.
  let fingerprint = 0n;
  const budget = recoveryReadBudget(RECOVERY_CATALOG_LIMITS.metadataBytes, input.signal ?? input.readAccess?.signal,
    () => { assertRecoveryReadAccess(input.readAccess ?? {}); return undefined; },
    'Snapshot browsing exceeds its source size limit.');
  let directoryEntries = 0;
  let candidates = 0;
  const authorities = new Set<string>();
  const inventory = (record = false): void => {
    budget.check();
    if (++directoryEntries > RECOVERY_CATALOG_LIMITS.directoryEntries
      || (record && ++candidates > RECOVERY_CATALOG_LIMITS.records)) {
      throw new RecoveryReadLimitError('Snapshot browsing exceeds its inventory limit.');
    }
  };
  try {
    for await (const entry of scanLedger(input.ledgerRoot, budget, inventory)) {
      authorities.add(entry.key.split('/')[0]!);
      const record = entry.record;
      scanned++;
      fingerprint ^= BigInt(`0x${hashContent(JSON.stringify([entry.key, record?.recordDigest, record?.hasContentBlob]))}`);
      if (!record) { unavailable++; continue; }
      if (query && !`${record.workspaceRelativePath} ${record.authorityId} ${record.recordId} ${record.operationKind}`.toLowerCase().includes(query)) continue;
      matches++;
      records.push(record);
    }
  } catch (error) { budget.check(); throw error; }
  budget.check();
  const revision = hashContent(`${scanned}:${fingerprint.toString(16)}`);
  if (!scanned || scanned !== unavailable) {
    records.sort(comparePosition);
    const page = records.slice(0, pageSize);
    const hasMore = records.length > pageSize;
    const last = page.at(-1);
    if (hasMore) {
      const directories = await directoryVersions(ledgerRoot, authorities, input);
      const admitted = RECOVERY_CATALOG_LIMITS.metadataBytes - budget.remaining();
      attempts.set(attemptId, { ledgerRoot, query, revision, matches, unavailable, records, directories,
        verification: { limit: admitted, used: 0 }, claimed: false, cursor: last! });
      while (attempts.size > MAX_ATTEMPTS) attempts.delete(attempts.keys().next().value!);
    }
    return { records: page, matches, unavailable, ...(hasMore && last ? { next: {
      attemptId, createdAt: last.createdAt, authorityId: last.authorityId, recordId: last.recordId, revision,
    } } : {}) };
  }
  throw new Error('No snapshot records could be read.');
}

async function verifyPage(page: readonly RecoveryAuthorityRecordIndexEntry[],
  input: { readonly ledgerRoot: string; readonly signal?: AbortSignal; readonly readAccess?: RecoveryReadAccess },
  verification: { readonly limit: number; used: number }): Promise<RecoveryAuthorityRecordIndexEntry[]> {
  const groups = new Map<string, RecoveryAuthorityRecordIndexEntry[]>();
  for (const entry of page) {
    const group = groups.get(entry.authorityId);
    if (group) group.push(entry);
    else groups.set(entry.authorityId, [entry]);
  }
  const current = new Map<string, RecoveryAuthorityRecordIndexEntry>();
  for (const [authorityId, entries] of groups) {
    input.signal?.throwIfAborted();
    assertRecoveryReadAccess(input.readAccess ?? {});
    const listed = await listRecoveryAuthorityRecords({
      ledgerRoot: input.ledgerRoot,
      authorityId,
      recordIds: entries.map(entry => entry.recordId),
      ...(input.signal ? { signal: input.signal } : {}),
      readAccess: continuationReadAccess(input, verification),
    });
    if (listed.status !== 'listed' || listed.missingRecords.length) {
      throw new Error('Snapshot catalogue changed. Reopen /restore before continuing.');
    }
    for (const record of listed.records) current.set(`${record.authorityId}/${record.recordId}`, record);
  }
  return page.map(entry => {
    const latest = current.get(`${entry.authorityId}/${entry.recordId}`);
    if (!latest || latest.recordDigest !== entry.recordDigest) {
      throw new Error('Snapshot catalogue changed. Reopen /restore before continuing.');
    }
    return latest;
  });
}

function continuationReadAccess(input: {
  readonly signal?: AbortSignal;
  readonly readAccess?: RecoveryReadAccess;
}, verification: { readonly limit: number; used: number }): RecoveryReadAccess {
  const caller = input.readAccess ?? {};
  const signal = input.signal ?? caller.signal;
  let refused = false;
  let refusal: unknown;
  const check = (): void => {
    if (refused) throw refusal;
    try {
      signal?.throwIfAborted();
      assertRecoveryReadAccess(caller);
    } catch (error) {
      refused = true;
      refusal = error;
      throw error;
    }
  };
  const admit = (bytes: number): void => {
    check();
    if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > verification.limit - verification.used) {
      const error = new RecoveryReadLimitError('Snapshot continuation exceeds its cumulative source limit.');
      refused = true;
      refusal = error;
      throw error;
    }
    try {
      caller.admit?.(bytes);
    } catch (error) {
      refused = true;
      refusal = error instanceof RecoveryReadLimitError || error instanceof RecoveryReadControlError
        ? error : new RecoveryReadControlError(error);
      throw refusal;
    }
    verification.used += bytes;
  };
  return { signal, check, admit };
}

async function directoryVersions(ledgerRoot: string, authorities: ReadonlySet<string>,
  input: { readonly signal?: AbortSignal; readonly readAccess?: RecoveryReadAccess }): Promise<readonly DirectoryVersion[]> {
  const paths = [ledgerRoot, ...[...authorities].map(authority => path.join(ledgerRoot, authority, 'records'))];
  const versions: DirectoryVersion[] = [];
  for (const target of paths) {
    input.signal?.throwIfAborted();
    assertRecoveryReadAccess(input.readAccess ?? {});
    try {
      const stat = await fs.lstat(target);
      versions.push({ path: target, identity: JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]) });
    } catch (error) {
      input.signal?.throwIfAborted();
      assertRecoveryReadAccess(input.readAccess ?? {});
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') versions.push({ path: target, identity: 'missing' });
      else throw error;
    }
  }
  return versions;
}

async function validateDirectories(directories: readonly DirectoryVersion[],
  input: { readonly signal?: AbortSignal; readonly readAccess?: RecoveryReadAccess }): Promise<void> {
  for (const directory of directories) {
    input.signal?.throwIfAborted();
    assertRecoveryReadAccess(input.readAccess ?? {});
    try {
      const stat = await fs.lstat(directory.path);
      const identity = JSON.stringify([stat.dev, stat.ino, stat.size, stat.mtimeMs, stat.ctimeMs]);
      if (identity !== directory.identity) throw new Error();
    } catch (error) {
      input.signal?.throwIfAborted();
      assertRecoveryReadAccess(input.readAccess ?? {});
      if (directory.identity === 'missing' && error instanceof Error && 'code' in error && error.code === 'ENOENT') continue;
      throw new Error('Snapshot catalogue changed. Reopen /restore before continuing.');
    }
  }
}

async function* scanLedger(ledgerRoot: string, access: RecoveryReadAccess, inventory: (record?: boolean) => void): AsyncGenerator<ScanEntry> {
  access.check?.();
  let directory;
  try { directory = await fs.opendir(ledgerRoot, { bufferSize: 32 }); }
  catch (error) {
    access.check?.();
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return;
    throw new Error('Edit snapshots could not be read.');
  }
  for await (const authority of directory) {
    inventory();
    if (authority.isDirectory()) yield* scanAuthority(ledgerRoot, authority.name, access, inventory);
  }
}

async function* scanAuthority(ledgerRoot: string, authorityId: string, access: RecoveryReadAccess, inventory: (record?: boolean) => void): AsyncGenerator<ScanEntry> {
  access.check?.();
  let directory;
  try { directory = await fs.opendir(path.join(ledgerRoot, authorityId, 'records'), { bufferSize: 32 }); }
  catch { access.check?.(); yield { key: authorityId }; return; }
  for await (const file of directory) {
    inventory(file.isFile() && file.name.endsWith('.json'));
    if (!file.isFile() || !file.name.endsWith('.json')) continue;
    const recordId = file.name.slice(0, -5);
    const listed = await listRecoveryAuthorityRecords({ ledgerRoot, authorityId, recordIds: [recordId], readAccess: access });
    yield { key: `${authorityId}/${recordId}`, record: listed.records[0] };
  }
}

function comparePosition(left: RecordPosition, right: RecordPosition): number {
  if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? -1 : 1;
  if (left.authorityId !== right.authorityId) return left.authorityId < right.authorityId ? -1 : 1;
  return left.recordId === right.recordId ? 0 : left.recordId < right.recordId ? -1 : 1;
}

function entriesAfter(records: readonly RecoveryAuthorityRecordIndexEntry[],
  after: RecoveryCatalogCursor): readonly RecoveryAuthorityRecordIndexEntry[] {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (comparePosition(records[middle]!, after) <= 0) low = middle + 1;
    else high = middle;
  }
  return records.slice(low);
}

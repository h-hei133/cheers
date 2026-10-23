import fs from 'node:fs/promises';
import path from 'node:path';
import { hashContent } from './recoveryAuthorityStore.js';
import { listRecoveryAuthorityRecords, type RecoveryAuthorityRecordIndexEntry } from './recoveryAuthorityIndex.js';
import { assertRecoveryReadAccess, recoveryReadBudget, RecoveryReadLimitError, type RecoveryReadAccess } from './read.js';
import { RECOVERY_CATALOG_LIMITS } from './catalog/limits.js';

type RecordPosition = Pick<RecoveryAuthorityRecordIndexEntry, 'createdAt' | 'authorityId' | 'recordId'>;
export interface RecoveryCatalogCursor extends RecordPosition {
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

/** Scan metadata with bounded directory buffers and retain only one sorted page. */
export async function readRecoveryCatalogPage(input: {
  readonly ledgerRoot: string;
  readonly query?: string;
  readonly after?: RecoveryCatalogCursor;
  readonly signal?: AbortSignal;
  readonly readAccess?: RecoveryReadAccess;
}): Promise<RecoveryCatalogPage> {
  const pageSize = 100;
  const records: RecoveryAuthorityRecordIndexEntry[] = [];
  const query = input.query?.trim().toLowerCase() ?? '';
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
  const inventory = (record = false): void => {
    budget.check();
    if (++directoryEntries > RECOVERY_CATALOG_LIMITS.directoryEntries
      || (record && ++candidates > RECOVERY_CATALOG_LIMITS.records)) {
      throw new RecoveryReadLimitError('Snapshot browsing exceeds its inventory limit.');
    }
  };
  try {
    for await (const entry of scanLedger(input.ledgerRoot, budget, inventory)) {
      const record = entry.record;
      scanned++;
      fingerprint ^= BigInt(`0x${hashContent(JSON.stringify([entry.key, record?.recordDigest, record?.hasContentBlob]))}`);
      if (!record) { unavailable++; continue; }
      if (query && !`${record.workspaceRelativePath} ${record.authorityId} ${record.recordId} ${record.operationKind}`.toLowerCase().includes(query)) continue;
      matches++;
      if (input.after && comparePosition(record, input.after) <= 0) continue;
      retainRecord(records, record, pageSize + 1);
    }
  } catch (error) { budget.check(); throw error; }
  budget.check();
  const revision = hashContent(`${scanned}:${fingerprint.toString(16)}`);
  if (input.after && revision !== input.after.revision) throw new Error('Snapshot catalogue changed. Reopen /restore before continuing.');
  if (!scanned || scanned !== unavailable) {
    const hasMore = records.length > pageSize;
    if (hasMore) records.pop();
    const last = records.at(-1);
    return { records, matches, unavailable, ...(hasMore && last ? { next: {
      createdAt: last.createdAt, authorityId: last.authorityId, recordId: last.recordId, revision,
    } } : {}) };
  }
  throw new Error('No snapshot records could be read.');
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

function retainRecord(records: RecoveryAuthorityRecordIndexEntry[], record: RecoveryAuthorityRecordIndexEntry, limit: number): void {
  let low = 0;
  let high = records.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (comparePosition(records[middle]!, record) <= 0) low = middle + 1;
    else high = middle;
  }
  if (low >= limit) return;
  records.splice(low, 0, record);
  if (records.length > limit) records.pop();
}

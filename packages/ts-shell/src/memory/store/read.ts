import { foldProjectMemoryEntries, readEntries, recordsFileFor, type MemoryRead } from '../memoryPersistence.js';
import { projectMemoryStoreRefIsWritable, type ProjectMemoryListOptions, type ProjectMemoryListResult,
  type ProjectMemoryReadOptions, type ProjectMemoryReader, type ProjectMemoryStoreHealth, type ProjectMemoryStoreRef } from '../projectMemoryStoreContract.js';
import { assertMemoryOwner } from './owner.js';

export async function readMemoryRecords(ref: ProjectMemoryStoreRef, options: ProjectMemoryListOptions = {}): Promise<ProjectMemoryListResult> {
  return listResult(await readEntries(ref, options.readOptions), options);
}

export async function readMemoryHealth(ref: ProjectMemoryStoreRef, options?: ProjectMemoryReadOptions): Promise<ProjectMemoryStoreHealth> {
  return healthResult(ref, await readEntries(ref, options));
}

/** Health, selection and lifecycle lookups share one decoded acquisition. */
export async function memoryReadSnapshot(ref: ProjectMemoryStoreRef, options: ProjectMemoryReadOptions): Promise<ProjectMemoryReader> {
  assertMemoryOwner(ref); options.signal?.throwIfAborted();
  const captured = await readEntries(ref, options);
  assertMemoryOwner(ref); options.signal?.throwIfAborted();
  const all = foldProjectMemoryEntries(captured.entries, { includeInvalidated: true });
  const records = new Map(all.map(record => [record.id, record]));
  const health = healthResult(ref, captured);
  const admit = (readOptions?: ProjectMemoryReadOptions) => {
    assertMemoryOwner(ref); options.signal?.throwIfAborted(); readOptions?.signal?.throwIfAborted();
  };
  return {
    ref,
    async list(listOptions = {}) {
      admit(listOptions.readOptions);
      return listResult(captured, listOptions, all.filter(record => listOptions.includeInvalidated || !record.invalidatedAt).map(record => structuredClone(record)));
    },
    async get(id, readOptions) { admit(readOptions); const record = records.get(id); return record ? structuredClone(record) : undefined; },
    async health(readOptions) { admit(readOptions); return structuredClone(health); },
  };
}

function listResult(snapshot: MemoryRead, options: ProjectMemoryListOptions, records = foldProjectMemoryEntries(snapshot.entries, options)): ProjectMemoryListResult {
  return {
    records, diagnostics: [...snapshot.diagnostics],
    evidence: ['project-memory-local-store:list', ...snapshot.diagnostics,
      options.includeInvalidated ? 'project-memory-local-store:include-invalidated-explicit' : 'project-memory-local-store:exclude-invalidated-default',
      'project-memory-local-store:no-retrieval-injection'],
  };
}

function healthResult(ref: ProjectMemoryStoreRef, snapshot: MemoryRead): ProjectMemoryStoreHealth {
  if (!projectMemoryStoreRefIsWritable(ref)) return {
    mode: ref.mode, ok: ref.mode === 'disabled', writable: false, readable: false,
    detail: 'No explicit local memory store root configured.',
    evidence: ['project-memory-local-store:disabled', 'project-memory-local-store:no-default-path'],
  };
  return {
    mode: ref.mode, ok: snapshot.readable && snapshot.diagnostics.length === 0,
    writable: snapshot.readable && snapshot.diagnostics.length === 0, readable: snapshot.readable,
    diagnostics: snapshot.diagnostics, recordCount: foldProjectMemoryEntries(snapshot.entries, { includeInvalidated: true }).length,
    storeRoot: ref.root, recordsFile: recordsFileFor(ref),
    detail: snapshot.diagnostics.join(' ') || 'Explicit local JSONL memory store is configured.',
    evidence: ['project-memory-local-store:health', ...snapshot.diagnostics, 'project-memory-local-store:explicit-local'],
  };
}

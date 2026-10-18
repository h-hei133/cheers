import fs from 'node:fs';
import { isRecord } from '../../core/values/record.js';
import { sameValue } from '../../config/values.js';
import { writeJsonFileAtomic } from '../store/sessionFileStore.js';
import { CompactionOperationError, type OperationFile, type OperationRecord, type StepRecord } from './contract.js';

export function readOperations(file: string): OperationFile {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: 2, operations: {} };
    throw new CompactionOperationError('Compaction operation state could not be read.');
  }
  // V1 could have already evicted uncertain requests. Its absence cannot prove unsent.
  if (isRecord(raw) && raw.version === 1) throw new CompactionOperationError('Legacy compaction operation state has incomplete replay evidence; automatic replay is refused.');
  if (!isRecord(raw) || raw.version !== 2 || !isRecord(raw.operations)) throw new CompactionOperationError('Compaction operation state has an unsupported shape.');
  const operations: Record<string, OperationRecord> = {};
  for (const [key, value] of Object.entries(raw.operations)) {
    if (!isRecord(value) || !Number.isSafeInteger(value.updatedAt) || !isRecord(value.steps)) throw new CompactionOperationError('Compaction operation state contains an invalid operation.');
    const steps: Record<string, StepRecord> = {};
    for (const [step, record] of Object.entries(value.steps)) {
      if (!isRecord(record) || typeof record.claimId !== 'string' || !record.claimId
        || !['prepared', 'dispatched', 'unknown', 'completed'].includes(String(record.status))
        || !Number.isSafeInteger(record.updatedAt) || (record.summary !== undefined && typeof record.summary !== 'string')) {
        throw new CompactionOperationError('Compaction operation state contains an invalid step.');
      }
      steps[step] = record as unknown as StepRecord;
    }
    operations[key] = { updatedAt: value.updatedAt as number, steps };
  }
  return { version: 2, operations };
}
export function writeOperations(file: string, state: OperationFile): void {
  writeJsonFileAtomic(file, state);
  if (!sameValue(readOperations(file), state)) throw new CompactionOperationError('Compaction operation state write could not be verified.');
}
/** Only reusable material expires. Every request identity remains a replay tombstone. */
export function retainMaterial(operations: Record<string, OperationRecord>, now: number): void {
  const material = Object.values(operations).flatMap(operation => Object.entries(operation.steps).map(([key, step]) => ({ operation, key, step })))
    .filter(item => item.step.summary !== undefined).sort((a, b) => b.step.updatedAt - a.step.updatedAt);
  const retainedOperations = new Set<OperationRecord>();
  const perOperation = new Map<OperationRecord, number>();
  for (const item of material) {
    const count = perOperation.get(item.operation) ?? 0;
    const retain = item.step.updatedAt >= now - 7 * 24 * 60 * 60_000 && count < 32
      && (retainedOperations.has(item.operation) || retainedOperations.size < 16);
    if (retain) { retainedOperations.add(item.operation); perOperation.set(item.operation, count + 1); }
    else { const { summary: _summary, ...evidence } = item.step; item.operation.steps[item.key] = evidence; }
  }
}

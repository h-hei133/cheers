import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createSessionStoreLayout, locateExistingSessionLayout, validateSessionId } from './store/sessionFileLayout.js';
import { withFileLock, writeJsonFileAtomic } from './store/sessionFileStore.js';
import { isRecord } from '../core/values/record.js';
import { sameValue } from '../config/values.js';

/**
 * Durable compaction steps.
 *
 * A summary request is a logical operation with real steps. Retrying the same
 * operation after a restart must not pay for the same step twice, and a step
 * whose outcome is unknown must not be replayed: the provider may already have
 * produced (and charged for) a summary this process never received.
 */
export type CompactionStepStatus = 'dispatched' | 'unknown' | 'completed';

interface StepRecord {
  readonly status: CompactionStepStatus;
  readonly summary?: string;
  readonly updatedAt: number;
}
interface OperationRecord {
  readonly updatedAt: number;
  readonly steps: Record<string, StepRecord>;
}
interface OperationFile { readonly version: number; readonly operations: Record<string, OperationRecord> }

const VERSION = 1;
const OPERATION_LIMIT = 16;
const STEP_LIMIT = 32;
const RETENTION_MS = 7 * 24 * 60 * 60_000;

export interface CompactionOperationInput {
  readonly sessionId: string;
  readonly provider?: string;
  readonly model?: string;
  readonly policyDigest: string;
  readonly instructions?: string;
}

export interface CompactionStepClaim {
  readonly operation: string;
  readonly step: string;
  readonly acquired: boolean;
  readonly summary?: string;
  readonly unknown?: boolean;
}

export class CompactionOperationError extends Error {}

function sessionDirectory(sessionId: string): string {
  const id = validateSessionId(sessionId);
  if (id === '.' || id === '..') throw new CompactionOperationError('Invalid session id.');
  return path.dirname(locateExistingSessionLayout(createSessionStoreLayout(), id).statePath);
}

export function compactionOperationsPath(sessionId: string): string {
  return path.join(sessionDirectory(sessionId), 'compaction-operations.json');
}

/** No session directory means no durable record to write; a projected id is not a session. */
function operationsFile(sessionId: string): string | undefined {
  const directory = sessionDirectory(sessionId);
  return fs.existsSync(directory) ? path.join(directory, 'compaction-operations.json') : undefined;
}

function operationKey(input: CompactionOperationInput): string {
  return createHash('sha256').update(JSON.stringify([input.sessionId, input.provider ?? '', input.model ?? '',
    input.policyDigest, input.instructions ?? ''])).digest('hex');
}

export function compactionStepDigest(input: {
  readonly history: readonly unknown[];
  readonly prefix?: readonly unknown[];
  readonly previousSummary?: string;
  readonly instructions?: string;
}): string {
  return createHash('sha256').update(JSON.stringify([input.history, input.prefix ?? [], input.previousSummary ?? '',
    input.instructions ?? ''])).digest('hex');
}

function readFile(file: string): OperationFile {
  let raw: unknown;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { version: VERSION, operations: {} };
    throw new CompactionOperationError('Compaction operation state could not be read.');
  }
  if (!isRecord(raw) || raw.version !== VERSION || !isRecord(raw.operations)) throw new CompactionOperationError('Compaction operation state has an unsupported shape.');
  const operations: Record<string, OperationRecord> = {};
  for (const [key, value] of Object.entries(raw.operations)) {
    if (!isRecord(value) || !Number.isSafeInteger(value.updatedAt) || !isRecord(value.steps)) throw new CompactionOperationError('Compaction operation state contains an invalid operation.');
    const steps: Record<string, StepRecord> = {};
    for (const [step, record] of Object.entries(value.steps)) {
      if (!isRecord(record) || !['dispatched', 'unknown', 'completed'].includes(String(record.status))
        || !Number.isSafeInteger(record.updatedAt)
        || (record.summary !== undefined && typeof record.summary !== 'string')) throw new CompactionOperationError('Compaction operation state contains an invalid step.');
      steps[step] = { status: record.status as CompactionStepStatus, updatedAt: record.updatedAt as number,
        ...(record.summary !== undefined ? { summary: record.summary as string } : {}) };
    }
    operations[key] = { updatedAt: value.updatedAt as number, steps };
  }
  return { version: VERSION, operations };
}

function writeFile(file: string, state: OperationFile): void {
  writeJsonFileAtomic(file, state);
  if (!sameValue(readFile(file).operations, state.operations)) throw new CompactionOperationError('Compaction operation state write could not be verified.');
}

function mutate<T>(file: string, action: (operations: Record<string, OperationRecord>, now: number) => T): T {
  return withFileLock(`${file}.lock`, () => {
    const state = readFile(file);
    const operations = { ...state.operations };
    const now = Date.now();
    for (const [key, value] of Object.entries(operations)) {
      if (value.updatedAt < now - RETENTION_MS) delete operations[key];
    }
    const result = action(operations, now);
    writeFile(file, { version: VERSION, operations });
    return result;
  });
}

/** Claim a step before its request is dispatched; completed steps return their summary. */
export function claimCompactionStep(input: CompactionOperationInput & { readonly stepDigest: string }): CompactionStepClaim {
  const operation = operationKey(input);
  const step = input.stepDigest;
  const file = operationsFile(input.sessionId);
  if (!file) return { operation, step, acquired: true };
  return mutate(file, (operations, now) => {
    const current = operations[operation] ?? { updatedAt: now, steps: {} };
    const existing = current.steps[step];
    if (existing?.status === 'completed' && existing.summary !== undefined) {
      return { operation, step, acquired: false, summary: existing.summary };
    }
    if (existing && existing.status !== 'completed') return { operation, step, acquired: false, unknown: true };
    const steps = { ...current.steps, [step]: { status: 'dispatched' as const, updatedAt: now } };
    operations[operation] = { updatedAt: now, steps: Object.fromEntries(Object.entries(steps).slice(-STEP_LIMIT)) };
    while (Object.keys(operations).length > OPERATION_LIMIT) {
      const oldest = Object.entries(operations).sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0]!;
      delete operations[oldest[0]];
    }
    return { operation, step, acquired: true };
  });
}

export function completeCompactionStep(claim: CompactionStepClaim, sessionId: string, summary: string): void {
  const file = operationsFile(sessionId);
  if (!file) return;
  mutate(file, (operations, now) => {
    const current = operations[claim.operation];
    if (!current || current.steps[claim.step]?.status !== 'dispatched') throw new CompactionOperationError('Compaction step ownership changed before completion.');
    operations[claim.operation] = { updatedAt: now, steps: { ...current.steps, [claim.step]: { status: 'completed', summary, updatedAt: now } } };
  });
}

/** The provider may have produced a summary this process never received. */
export function markCompactionStepUnknown(claim: CompactionStepClaim, sessionId: string): void {
  const file = operationsFile(sessionId);
  if (!file) return;
  mutate(file, (operations, now) => {
    const current = operations[claim.operation];
    if (!current || current.steps[claim.step]?.status !== 'dispatched') return;
    operations[claim.operation] = { updatedAt: now, steps: { ...current.steps, [claim.step]: { status: 'unknown', updatedAt: now } } };
  });
}

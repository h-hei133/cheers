import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { assertSessionStoreProfile, createSessionStoreLayout, locateExistingSessionLayout, validateSessionId } from '../store/sessionFileLayout.js';
import { withFileLock } from '../store/sessionFileStore.js';
import { readOperations, retainMaterial, writeOperations } from './codec.js';
import { CompactionOperationError, type CompactionOperationInput, type CompactionStepClaim, type OperationRecord, type StepRecord } from './contract.js';
import { assertCurrentProfile, currentProfile } from '../../core/paths/profile/context.js';

const ownedClaims = new WeakSet<CompactionStepClaim>();

export function digest(value: unknown): string { return createHash('sha256').update(JSON.stringify(value) ?? 'undefined').digest('hex'); }
export function directoryIdentity(directory: string): string {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory()) throw new CompactionOperationError('Compaction storage is unavailable.');
  return `${fs.realpathSync(directory)}:${stat.dev}:${stat.ino}:${stat.birthtimeMs}`;
}
export function compactionOperationsPath(sessionId: string): string {
  const id = validateSessionId(sessionId);
  if (id === '.' || id === '..') throw new CompactionOperationError('Invalid session id.');
  return path.join(locateExistingSessionLayout(createSessionStoreLayout(), id).sessionDir, 'compaction-operations.json');
}
export function compactionOperationKey(input: CompactionOperationInput): string {
  return digest([input.sessionId, input.provider ?? '', input.model ?? '', input.policyDigest, input.instructions ?? '',
    input.source?.replayIdentity ?? input.source?.identity ?? '', input.identity ?? '']);
}
export function compactionStepDigest(input: { readonly history: readonly unknown[]; readonly prefix?: readonly unknown[];
  readonly previousSummary?: string; readonly instructions?: string; readonly stage?: string }): string {
  return digest([input.history, input.prefix ?? [], input.previousSummary ?? '', input.instructions ?? '', input.stage ?? '']);
}
function verifyOwner(claim: CompactionStepClaim): void {
  if (claim.profile) assertCurrentProfile(claim.profile);
  if (claim.file && directoryIdentity(path.dirname(claim.file)) !== claim.directoryIdentity) throw new CompactionOperationError('Compaction storage owner changed.');
}
function mutate<T>(claim: CompactionStepClaim, action: (operations: Record<string, OperationRecord>, now: number) => T): T {
  verifyOwner(claim);
  return withFileLock(`${claim.file}.lock`, () => {
    verifyOwner(claim);
    const state = readOperations(claim.file!);
    const now = Date.now();
    retainMaterial(state.operations, now);
    const result = action(state.operations, now);
    retainMaterial(state.operations, now);
    writeOperations(claim.file!, state);
    verifyOwner(claim);
    return result;
  }, { createParent: false });
}
/** Preparation never asserts a request has been sent. A restart still cannot replay an owned preparation. */
export function claimCompactionStep(input: CompactionOperationInput & { readonly stepDigest: string }): CompactionStepClaim {
  const operation = compactionOperationKey(input);
  const step = input.stepDigest;
  const file = input.source?.directory ? path.join(input.source.directory, 'compaction-operations.json') : compactionOperationsPath(input.sessionId);
  assertSessionStoreProfile(createSessionStoreLayout(), file);
  if (input.source?.directory && directoryIdentity(input.source.directory) !== input.source.directoryIdentity) {
    throw new CompactionOperationError('Compaction storage owner changed.');
  }
  const claim: CompactionStepClaim = Object.freeze({ operation, step, claimId: randomUUID(), acquired: true,
    ...(currentProfile() ? { profile: currentProfile() } : {}),
    ...(input.source?.directory || fs.existsSync(path.dirname(file))
      ? { file, directoryIdentity: input.source?.directoryIdentity ?? directoryIdentity(path.dirname(file)) } : {}) });
  if (!claim.file) { ownedClaims.add(claim); return claim; }
  const result = mutate(claim, (operations, now) => {
    const current = operations[operation] ?? { updatedAt: now, steps: {} };
    const existing = current.steps[step];
    if (existing) return Object.freeze({ ...claim, acquired: false, claimId: existing.claimId,
      ...(existing.status === 'completed' && existing.summary !== undefined ? { summary: existing.summary } : { unknown: true }) });
    // Capacity refuses new work; it never removes evidence to make room for a send.
    if (Object.values(operations).reduce((count, record) => count + Object.keys(record.steps).length, 0) >= 8192) {
      throw new CompactionOperationError('Compaction replay evidence is full; no new summary request was authorized.');
    }
    current.steps[step] = { claimId: claim.claimId, status: 'prepared', updatedAt: now };
    operations[operation] = { ...current, updatedAt: now };
    return claim;
  });
  if (result.acquired) ownedClaims.add(result);
  return result;
}
function update(claim: CompactionStepClaim, action: (step: StepRecord, now: number) => StepRecord | undefined): void {
  if (!claim.acquired || !ownedClaims.has(claim)) throw new CompactionOperationError('Compaction step claim is read-only.');
  if (!claim.file) return;
  mutate(claim, (operations, now) => {
    const current = operations[claim.operation];
    const step = current?.steps[claim.step];
    if (!step || step.claimId !== claim.claimId) throw new CompactionOperationError('Compaction step ownership changed.');
    const next = action(step, now);
    if (next) current!.steps[claim.step] = next;
    else delete current!.steps[claim.step];
  });
}
export function dispatchCompactionStep(claim: CompactionStepClaim): void {
  update(claim, (step, now) => {
    if (step.status !== 'prepared') throw new CompactionOperationError('Compaction step was already dispatched.');
    return { ...step, status: 'dispatched', updatedAt: now };
  });
}
/** Only a known prepared claim owned by this exact attempt proves no handoff occurred. */
export function releaseCompactionStep(claim: CompactionStepClaim): void {
  update(claim, step => step.status === 'prepared' ? undefined : step);
}
export function completeCompactionStep(claim: CompactionStepClaim, _sessionId: string, summary: string): void {
  update(claim, (step, now) => {
    if (step.status !== 'dispatched') throw new CompactionOperationError('Compaction step ownership changed before completion.');
    return { ...step, status: 'completed', summary, updatedAt: now };
  });
}
export function markCompactionStepUnknown(claim: CompactionStepClaim, _sessionId: string): void {
  update(claim, (step, now) => step.status === 'completed' ? step : { ...step, status: 'unknown', updatedAt: now });
}

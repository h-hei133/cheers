import { randomUUID } from 'node:crypto';
import { sameValue } from '../../../../config/values.js';
import { RefreshLeaseError, type LeaseFile, type RefreshBinding, type RefreshClaim, type RefreshProduction, type RefreshAttempt, type RefreshStore } from './model.js';

export function claimAttempt(state: LeaseFile, claim: RefreshClaim): RefreshAttempt {
  const row = state.leases[claim.key];
  const attempt = row?.attempts[claim.attemptId];
  if (!attempt || attempt.grantId !== claim.grantId || attempt.generation !== claim.binding.generation
    || attempt.owner !== claim.owner) throw new RefreshLeaseError('Refresh attempt ownership changed.');
  return attempt;
}

/** Terminal consumption remains immutable; only its exact produced storage grants a successor. */
export function finalize(state: LeaseFile, claim: RefreshClaim, saved: RefreshBinding, now: number): void {
  const attempt = claimAttempt(state, claim);
  const produced = attempt.production;
  const row = state.leases[claim.key]!;
  if (!produced || !sameValue(saved, { owner: produced.owner, generation: produced.generation, storage: produced.storage })) {
    throw new RefreshLeaseError('Refresh completion has no matching native storage proof.');
  }
  if (attempt.phase === 'rotated-persisted') return;
  if (row.active !== claim.attemptId || row.grant?.id !== claim.grantId
    || row.grant.owner !== claim.binding.owner || row.grant.generation !== claim.binding.generation) {
    throw new RefreshLeaseError('Refresh grant changed before completion.');
  }
  const successor = state.leases[produced.lineage] ??= { attempts: {} };
  if (Object.values(state.legacy).some(record => record.phase !== 'prepared')
    || (successor !== row && (successor.grant || successor.enrollment || Object.keys(successor.attempts).length))
    || (successor === row && successor.grant?.id !== claim.grantId)) {
    throw new RefreshLeaseError('The returned refresh authorization already has consumption history.');
  }
  row.attempts[attempt.id] = { ...attempt, phase: 'rotated-persisted', updatedAt: now };
  delete row.active;
  successor.grant = { ...saved, id: randomUUID(), origin: 'rotation', predecessor: attempt.id };
}

/** Recovery uses the durable native fingerprint and exact current storage, never another HTTP. */
export function recover(state: LeaseFile, key: string, binding: RefreshBinding, store: RefreshStore, now: number): boolean {
  for (const [previous, row] of Object.entries(state.leases)) {
    for (const attempt of Object.values(row.attempts)) {
      const produced = attempt.production;
      if (attempt.phase === 'rotated-persisted' || !produced || produced.lineage !== key
        || !sameValue(binding, { owner: produced.owner, generation: produced.generation, storage: produced.storage })) continue;
      if (!row.grant) continue;
      finalize(state, { ...store, key: previous, grantId: attempt.grantId, attemptId: attempt.id, owner: attempt.owner,
        binding: { owner: row.grant.owner, generation: row.grant.generation, storage: row.grant.storage } }, binding, now);
      return true;
    }
  }
  return false;
}

export function producedAttempt(state: LeaseFile, claim: RefreshClaim, production: RefreshProduction, now: number): void {
  const attempt = claimAttempt(state, claim);
  const row = state.leases[claim.key]!;
  if (attempt.production) {
    if (!sameValue(attempt.production, production)) throw new RefreshLeaseError('Native refresh response changed.');
    return;
  }
  if (row.active !== claim.attemptId || row.grant?.id !== claim.grantId || attempt.phase !== 'dispatched') {
    throw new RefreshLeaseError('Refresh response does not belong to the dispatched attempt.');
  }
  row.attempts[attempt.id] = { ...attempt, production, updatedAt: now };
}

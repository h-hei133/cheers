import { randomUUID } from 'node:crypto';
import { decodeGoal } from '../../planning/goal/codec.js';
import { researchLimits, type ResearchRequest } from '../brief/model.js';
import type { BoundSessionScope } from '../../session/store/contract.js';
import type { ResearchRun } from './model.js';
import { runEvent } from './state.js';

/** Capture a prospective run without persistence, a ledger or execution authority. */
export function prepareResearchRun(input: { readonly scope: BoundSessionScope; readonly goal?: unknown }, request: ResearchRequest,
  identity: { readonly id: string; readonly now: number } = { id: randomUUID(), now: Date.now() }): ResearchRun {
  const goal = decodeGoal(input.goal);
  const associated = goal && !['complete', 'dropped'].includes(goal.phase) ? goal : undefined;
  const { id, now } = identity;
  return runEvent({ ...input.scope, schemaVersion: 1, id, revision: 0, epoch: 0,
    createdAt: new Date(now).toISOString(), deadlineAt: new Date(now + researchLimits[request.depth].deadlineMs).toISOString(), request,
    ledgerScopeId: associated?.id ?? id, ...(associated ? { goal: { id: associated.id, controlRevision: associated.controlRevision } } : {}),
    briefRevision: 1, briefs: [], status: 'ready', stage: 'brief', investigationRounds: 0, gapQuestions: [],
    sources: [], claims: [], fragments: [], children: [], events: [],
    save: { requested: request.save, status: request.save ? 'pending' : 'not-requested' } }, 'created', request.question);
}

import { isRecord } from '../../core/values/record.js';
import { freezeDeep } from '../../core/values/freeze.js';
import type { GoalScope, SessionGoal } from './model.js';
import { decodeRunOwner, decodeScheduling } from './run/codec.js';
import { decodeVerifiedCompletion } from './acceptance/codec.js';

const PHASES = new Set(['active', 'paused', 'complete', 'dropped']);
const PAUSE_REASONS = new Set(['user', 'session-reentry', 'legacy-import']);

export function decodeGoal(value: unknown): SessionGoal | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !text(value.id) || !text(value.objective)
    || typeof value.revision !== 'number' || !Number.isSafeInteger(value.revision) || value.revision < 1
    || value.controlRevision !== undefined && (typeof value.controlRevision !== 'number' || !Number.isSafeInteger(value.controlRevision)
      || value.controlRevision < 1 || value.controlRevision > value.revision)
    || !text(value.sessionId) || !timestamp(value.sessionCreatedAt) || !timestamp(value.createdAt) || !timestamp(value.updatedAt)
    || typeof value.phase !== 'string' || !PHASES.has(value.phase)
    || (value.origin !== 'user' && value.origin !== 'legacy-project')
    || (value.runOwner !== null && !decodeRunOwner(value.runOwner))
    || (value.scheduling !== undefined && !decodeScheduling(value.scheduling))
    || (value.runOwner !== null && value.scheduling === undefined)
    || !isRecord(value.workspace) || !text(value.workspace.path) || !text(value.workspace.identity)
    || (value.pauseReason !== undefined && (typeof value.pauseReason !== 'string' || !PAUSE_REASONS.has(value.pauseReason)))
    || (value.tokenBudget !== undefined && (typeof value.tokenBudget !== 'number' || !Number.isSafeInteger(value.tokenBudget) || value.tokenBudget < 0))) return undefined;
  const completion = value.completion;
  if (value.phase === 'complete') {
    if (!decodeVerifiedCompletion(completion) && (!isRecord(completion) || completion.source !== 'user-declared' || !timestamp(completion.timestamp)
      || completion.declaration !== '/goal complete')) return undefined;
  } else if (completion !== undefined) return undefined;
  return freezeDeep({
    schemaVersion: 1, id: value.id as string, revision: value.revision,
    controlRevision: typeof value.controlRevision === 'number' ? value.controlRevision : value.revision, objective: value.objective as string,
    sessionId: value.sessionId as string, sessionCreatedAt: value.sessionCreatedAt as string,
    workspace: { path: value.workspace.path as string, identity: value.workspace.identity as string },
    phase: value.phase as SessionGoal['phase'], origin: value.origin,
    createdAt: value.createdAt as string, updatedAt: value.updatedAt as string, runOwner: value.runOwner === null ? null : decodeRunOwner(value.runOwner)!,
    ...(value.scheduling !== undefined ? { scheduling: decodeScheduling(value.scheduling)! } : {}),
    ...(value.tokenBudget !== undefined ? { tokenBudget: value.tokenBudget as number } : {}),
    ...(value.pauseReason !== undefined ? { pauseReason: value.pauseReason as SessionGoal['pauseReason'] } : {}),
    ...(completion !== undefined ? { completion: decodeVerifiedCompletion(completion) ?? { source: 'user-declared' as const,
      timestamp: (completion as Record<string, unknown>).timestamp as string, declaration: '/goal complete' as const } } : {}),
  });
}

export function goalMatchesScope(goal: SessionGoal, scope: GoalScope): boolean {
  return goal.sessionId === scope.sessionId && goal.sessionCreatedAt === scope.sessionCreatedAt
    && goal.workspace.path === scope.workspace.path && goal.workspace.identity === scope.workspace.identity;
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 16_384 && !/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(value);
}

function timestamp(value: unknown): value is string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

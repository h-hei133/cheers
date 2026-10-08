import { isRecord } from '../../../core/values/record.js';
import type { GoalRunOwner, GoalScheduling } from './model.js';

const REASONS = new Set(['user', 'cancelled', 'session-reentry', 'recovery-required', 'exhausted', 'unsupported', 'history-unknown', 'breach', 'unavailable', 'replay', 'failure', 'refused', 'session-changed']);

export function decodeRunOwner(value: unknown): GoalRunOwner | undefined {
  if (!isRecord(value) || typeof value.token !== 'string' || !/^[\da-f-]{36}$/.test(value.token)
    || typeof value.pid !== 'number' || !Number.isSafeInteger(value.pid) || value.pid < 1 || value.pid > 2 ** 31 - 1
    || typeof value.hostname !== 'string' || !value.hostname || value.hostname.length > 255
    || typeof value.startedAt !== 'string' || !Number.isFinite(Date.parse(value.startedAt))) return undefined;
  return { token: value.token, pid: value.pid, hostname: value.hostname, startedAt: value.startedAt };
}

export function decodeScheduling(value: unknown): GoalScheduling | undefined {
  if (!isRecord(value) || value.schemaVersion !== 1 || !['ready', 'running', 'draining', 'paused'].includes(String(value.phase))
    || typeof value.round !== 'number' || !Number.isSafeInteger(value.round) || value.round < 0
    || typeof value.pendingRound !== 'boolean' || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))
    || (value.reason !== undefined && !REASONS.has(String(value.reason)))
    || (value.drain !== undefined && !['settled', 'pending', 'unknown'].includes(String(value.drain)))
    || (value.lastOutcome !== undefined && !['answer', 'step-limit', 'failure', 'refused', 'cancelled'].includes(String(value.lastOutcome)))
    || ((value.phase === 'running' || value.phase === 'draining') && !value.pendingRound)
    || (value.phase === 'ready' && value.pendingRound)) return undefined;
  return { schemaVersion: 1, phase: value.phase as GoalScheduling['phase'], round: value.round, pendingRound: value.pendingRound, updatedAt: value.updatedAt,
    ...(value.reason !== undefined ? { reason: value.reason as GoalScheduling['reason'] } : {}),
    ...(value.drain !== undefined ? { drain: value.drain as GoalScheduling['drain'] } : {}),
    ...(value.lastOutcome !== undefined ? { lastOutcome: value.lastOutcome as GoalScheduling['lastOutcome'] } : {}) };
}

import { isRecord } from '../../core/values/record.js';

const VERDICTS = new Set<unknown>(['proven', 'partial', 'refuted', 'failed', 'not_proven', 'unknown', 'not_reported']);
const STATES = new Set<unknown>(['checking', 'blocked', 'repairing', 'accepted', 'stopped', 'unknown']);
const HASH = /^[a-f0-9]{64}$/;

function strings(value: unknown): boolean {
  return Array.isArray(value) && value.every(item => typeof item === 'string');
}

function check(value: unknown): boolean {
  return isRecord(value) && typeof value.command === 'string' && HASH.test(value.command)
    && typeof value.reasonCode === 'string' && VERDICTS.has(value.proofVerdict) && strings(value.evidenceIdentity);
}

/** New lifecycle facts have an explicit read contract, including attempt ordering identity. */
export function readableLifecycleRecord(value: Record<string, unknown>): boolean {
  const fingerprint = value.progressFingerprint;
  if (typeof value.attemptId !== 'string' || !value.attemptId || !Number.isSafeInteger(value.sequence) || Number(value.sequence) < 1
    || !Number.isSafeInteger(value.reentryCount) || Number(value.reentryCount) < 0
    || value.stop_hook_active !== (Number(value.reentryCount) > 0)
    || !isRecord(fingerprint) || fingerprint.version !== 1 || !Array.isArray(fingerprint.checks)
    || !fingerprint.checks.every(check)) return false;
  switch (value.kind) {
    case 'model_answer': return typeof value.messageIdentity === 'string' && HASH.test(value.messageIdentity)
      && Number.isSafeInteger(value.step) && Number(value.step) >= 1 && ['answered', 'failed'].includes(String(value.status));
    case 'hook_result': return check(value.result) && isRecord(value.result)
      && ['allow', 'block', 'retry', 'unknown'].includes(String(value.result.decision))
      && typeof value.result.durationMs === 'number' && Number.isFinite(value.result.durationMs) && value.result.durationMs >= 0;
    case 'proof_verdict': return typeof value.command === 'string' && HASH.test(value.command)
      && VERDICTS.has(value.verdict) && strings(value.evidenceIdentity);
    case 'permission': return typeof value.toolName === 'string' && typeof value.taskId === 'string'
      && ['requested', 'approved', 'denied'].includes(String(value.status));
    case 'execution': return typeof value.toolName === 'string' && typeof value.taskId === 'string'
      && ['reported_success', 'reported_failure'].includes(String(value.status));
    case 'stop_state': return STATES.has(value.state) && typeof value.reasonCode === 'string' && typeof value.terminal === 'boolean';
    default: return false;
  }
}

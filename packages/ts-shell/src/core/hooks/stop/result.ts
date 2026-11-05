import { createHash } from 'node:crypto';
import { isRecord } from '../../values/record.js';
import type { HookDecision } from '../types.js';
import type { ProgressFingerprint, ProofVerdict, StopCheck } from './model.js';

const VERDICTS = new Set(['proven', 'partial', 'refuted', 'failed', 'not_proven', 'unknown', 'not_reported']);
const UNCERTAIN = new Set(['could_not_decide', 'could_not_judge', 'already_blocked_once', 'not_configured']);

export function commandIdentity(command: string): string {
  return createHash('sha256').update(command.trim()).digest('hex');
}

export function stopUnknown(reasonCode: string): HookDecision {
  return { decision: 'unknown', reasonCode, proofVerdict: 'unknown' };
}

/** Reason prose is feedback, never identity. Missing proof is never synthesized. */
export function normalizeStopResult(value: unknown): HookDecision {
  if (!isRecord(value)) return stopUnknown('empty_output');
  if (value.proofVerdict !== undefined && !VERDICTS.has(String(value.proofVerdict))) return stopUnknown('invalid_output');
  const reasonCode = typeof value.reasonCode === 'string' && /^[a-z][a-z0-9_]{0,79}$/.test(value.reasonCode)
    ? value.reasonCode : undefined;
  const proofVerdict = typeof value.proofVerdict === 'string' && VERDICTS.has(value.proofVerdict)
    ? value.proofVerdict as ProofVerdict : 'not_reported';
  const evidenceIdentity = Array.isArray(value.evidenceIdentity) && value.evidenceIdentity.length > 0
    && value.evidenceIdentity.every(id => typeof id === 'string' && /^[a-zA-Z0-9_:.-]{1,160}$/.test(id))
    ? [...new Set(value.evidenceIdentity as string[])].sort() : ['unspecified'];
  if (UNCERTAIN.has(reasonCode ?? '') || proofVerdict === 'unknown'
    || (isRecord(value.hookVerdict) && value.hookVerdict.status === 'unknown')) {
    return { ...stopUnknown(reasonCode ?? 'unknown'), evidenceIdentity };
  }
  if (value.decision === 'unknown' || value.decision === 'unsupported') return { ...stopUnknown(reasonCode ?? value.decision), evidenceIdentity };
  if (!['allow', 'block', 'retry'].includes(String(value.decision))) return stopUnknown('invalid_output');
  if (value.decision === 'allow' && ['refuted', 'failed', 'not_proven'].includes(proofVerdict)) {
    return { ...stopUnknown('conflicting_verdict'), proofVerdict, evidenceIdentity };
  }
  return { decision: value.decision as 'allow' | 'block' | 'retry',
    reasonCode: reasonCode ?? (value.decision === 'allow' ? 'explicit_allow' : 'hook_blocked'),
    proofVerdict,
    evidenceIdentity,
    ...(typeof value.reason === 'string' ? { reason: value.reason.slice(0, 4_000) } : {}),
    ...(typeof value.feedback === 'string' ? { feedback: value.feedback.slice(0, 4_000) } : {}) };
}

export function stopCheck(command: string, result: HookDecision, durationMs: number): StopCheck {
  return { command: commandIdentity(command), decision: result.decision as StopCheck['decision'],
    reasonCode: result.reasonCode ?? 'unknown', proofVerdict: result.proofVerdict ?? 'not_reported',
    evidenceIdentity: result.evidenceIdentity ?? ['unspecified'], durationMs };
}

export function progressFingerprint(checks: readonly StopCheck[]): ProgressFingerprint {
  const identities = checks.map(({ command, reasonCode, proofVerdict, evidenceIdentity }) =>
    ({ command, reasonCode, proofVerdict, evidenceIdentity: [...new Set(evidenceIdentity)].sort() }));
  return { version: 1, checks: [...new Map(identities.map(check => [JSON.stringify(check), check])).entries()]
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, check]) => check) };
}

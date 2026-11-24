import { isRecord } from '../../values/record.js';

/** Host completion policy; independent of provider retry and model-step budgets. */
export const MAX_STOP_REENTRIES = 1;
export const MAX_STOP_REPAIR_ROUNDS = 3;
export const STOP_REPAIR_PROTOCOL = 1;
export const STOP_TIMEOUT_MS = 20_000;

export interface StopRepairProgress {
  readonly version: typeof STOP_REPAIR_PROTOCOL;
  readonly chainId: string;
  readonly round: number;
  readonly maxRounds: number;
  readonly progressDigest: string;
}

const DIGEST = /^[a-f0-9]{64}$/;

export function parseStopRepair(value: unknown): StopRepairProgress | undefined {
  if (!isRecord(value) || Object.keys(value).length !== 5) return undefined;
  const { version, chainId, round, maxRounds, progressDigest } = value;
  if (version !== STOP_REPAIR_PROTOCOL || typeof chainId !== 'string' || !DIGEST.test(chainId)
    || typeof progressDigest !== 'string' || !DIGEST.test(progressDigest)
    || typeof maxRounds !== 'number' || !Number.isSafeInteger(maxRounds) || maxRounds < 2 || maxRounds > MAX_STOP_REPAIR_ROUNDS
    || typeof round !== 'number' || !Number.isSafeInteger(round) || round < 1 || round > maxRounds) return undefined;
  return { version, chainId, round, maxRounds, progressDigest };
}

export function readableStopReentry(value: Record<string, unknown>): boolean {
  const count = value.reentryCount;
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 0 || value.stop_hook_active !== (count > 0)) return false;
  return value.stopRepair === undefined ? count <= MAX_STOP_REENTRIES : parseStopRepair(value.stopRepair)?.round === count;
}

export interface StopAttempt {
  readonly attemptId: string;
  readonly reentryCount: number;
  readonly stop_hook_active: boolean;
  readonly stopRepair?: StopRepairProgress;
}

export type ProofVerdict = 'proven' | 'partial' | 'refuted' | 'failed' | 'not_proven' | 'unknown' | 'not_reported';
export type UnprovenCompletionReason = 'already_blocked_once' | 'not_configured';

export interface ProgressFingerprint {
  readonly version: 1;
  readonly checks: readonly {
    /** SHA-256 of the trimmed shell command or stable in-process name. */
    readonly command: string;
    readonly reasonCode: string;
    readonly proofVerdict: ProofVerdict;
    readonly evidenceIdentity: readonly string[];
    readonly stopRepair?: StopRepairProgress;
  }[];
}

export interface StopCheck {
  readonly command: string;
  readonly decision: 'allow' | 'block' | 'retry' | 'unknown';
  readonly reasonCode: string;
  readonly proofVerdict: ProofVerdict;
  readonly evidenceIdentity: readonly string[];
  readonly durationMs: number;
  /** Host observation of the workspace that ran the packaged architecture check. */
  readonly architecture?: ArchitectureCheck;
  readonly stopDisposition?: 'completed_unproven';
  readonly stopRepair?: StopRepairProgress;
}

export interface ArchitectureCheck {
  readonly sessionId: string;
  readonly workspaceIdentity: string;
  readonly verdict: 'proven' | 'partial';
}

export interface StopDispatchOptions {
  readonly signal?: AbortSignal;
  readonly onResult?: (result: StopCheck) => void;
}

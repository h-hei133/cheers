/** Host completion policy; independent of provider retry and model-step budgets. */
export const MAX_STOP_REENTRIES = 1;
export const STOP_TIMEOUT_MS = 3_000;

export interface StopAttempt {
  readonly attemptId: string;
  readonly reentryCount: number;
  readonly stop_hook_active: boolean;
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
  }[];
}

export interface StopCheck {
  readonly command: string;
  readonly decision: 'allow' | 'block' | 'retry' | 'unknown';
  readonly reasonCode: string;
  readonly proofVerdict: ProofVerdict;
  readonly evidenceIdentity: readonly string[];
  readonly durationMs: number;
  readonly stopDisposition?: 'completed_unproven';
}

export interface StopDispatchOptions {
  readonly signal?: AbortSignal;
  readonly onResult?: (result: StopCheck) => void;
}

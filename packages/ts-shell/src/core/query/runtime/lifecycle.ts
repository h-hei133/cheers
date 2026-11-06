import type { ProgressFingerprint, StopAttempt, StopCheck } from '../../hooks/stop/model.js';

export type StopTerminalStatus = 'stopped' | 'blocked' | 'unknown' | 'completed_unproven';
export type StopState = 'checking' | 'blocked' | 'repairing' | 'accepted' | 'stopped' | 'unknown' | 'completed_unproven';

export type LifecycleFact =
  | { readonly kind: 'model_answer'; readonly messageIdentity: string; readonly step: number; readonly status: 'answered' | 'failed' }
  | { readonly kind: 'hook_result'; readonly result: StopCheck }
  | { readonly kind: 'proof_verdict'; readonly command: string; readonly verdict: StopCheck['proofVerdict']; readonly evidenceIdentity: readonly string[] }
  | { readonly kind: 'permission'; readonly toolName: string; readonly taskId: string; readonly status: 'requested' | 'approved' | 'denied' }
  | { readonly kind: 'execution'; readonly toolName: string; readonly taskId: string; readonly status: 'reported_success' | 'reported_failure' }
  | { readonly kind: 'stop_state'; readonly state: StopState; readonly reasonCode: string; readonly terminal: boolean };

export type LifecycleRecord = StopAttempt & LifecycleFact & {
  readonly type: 'lifecycle.record';
  readonly sequence: number;
  readonly progressFingerprint: ProgressFingerprint;
};

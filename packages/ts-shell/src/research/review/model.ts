import type { ClaimReference } from '../evidence/model.js';

export interface ReviewFinding {
  readonly claimId: string;
  readonly outcome: 'counterevidence' | 'condition-mismatch' | 'insufficient' | 'none-found';
  readonly reason: string;
  readonly references: readonly ClaimReference[];
}
export interface ReviewRecord {
  readonly role: 'independent';
  readonly correlation: 'same-model-independent-context' | 'different-model';
  readonly inputDigest: string;
  readonly childId: string;
  readonly status: 'not-run' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
  readonly findings: readonly ReviewFinding[];
  readonly uncovered: readonly string[];
  readonly limitation: string;
}

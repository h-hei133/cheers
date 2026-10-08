import type { PlanCriterion } from '../../plan/model.js';
import type { NativeCommandProof, NativeCommandStart } from '../../../runtime/execution/proof.js';
export type TargetVersion = { readonly state: 'absent' } | { readonly state: 'exists'; readonly hash: string; readonly identity: string; readonly mode: number };
export interface TargetObservation { readonly path: string; readonly version: TargetVersion }
export interface CheckEvidence {
  readonly criterionId: string;
  readonly sourcePromptEntryId: string;
  readonly native: NativeCommandProof;
  readonly targets: readonly TargetObservation[];
  readonly operationSequence: number;
  readonly known: boolean;
}
export interface AcceptanceState {
  readonly schemaVersion: 1;
  readonly goalId: string;
  readonly definitionDigest: string;
  readonly planVersion: string;
  readonly criteria: readonly PlanCriterion[];
  readonly approvedAt: string;
  readonly operationBaseline: number;
  readonly checks: Readonly<Record<string, CheckEvidence>>;
  readonly pending: Readonly<Record<string, { readonly native: NativeCommandStart; readonly sourcePromptEntryId: string;
    readonly targets: Readonly<Record<string, readonly TargetObservation[]>>; readonly known: boolean }>>;
}
export interface AcceptanceEvidence {
  readonly criterionId: string;
  readonly kind: 'command' | 'artifact';
  readonly targets: readonly TargetObservation[];
  readonly operationReceipts: readonly { readonly operationId: string; readonly revision: number; readonly sequence: number }[];
  readonly native?: NativeCommandProof;
  readonly sourcePromptEntryId?: string;
}
export interface VerifiedCompletion {
  readonly source: 'verified-acceptance';
  readonly timestamp: string;
  readonly planVersion: string;
  readonly definitionDigest: string;
  readonly criteria: readonly PlanCriterion[];
  readonly evidence: readonly AcceptanceEvidence[];
}

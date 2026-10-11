import type { BoundSessionScope } from '../../session/store/contract.js';
import type { ContentVersion } from '../../edit/recovery/operation/model.js';

export interface Metric {
  readonly name: string;
  readonly direction: 'higher' | 'lower';
  readonly threshold: number;
}
export interface Sample { readonly id: string; readonly split: 'train' | 'holdout'; readonly input: unknown; readonly expected: unknown }
export interface EvaluationSpec {
  readonly version: 1;
  readonly entry: string;
  readonly candidateEntry: string;
  readonly evaluator: readonly string[];
  readonly editable: readonly string[];
  readonly context: readonly string[];
  readonly runtime: 'node' | 'bun';
  readonly target: Metric;
  readonly guardrails: readonly Metric[];
  readonly samples: readonly Sample[];
  readonly repetitions: number;
  readonly maxRounds: number;
  readonly timeoutMs: number;
}
export interface Asset extends Extract<ContentVersion, { state: 'exists' }> {
  readonly path: string;
  readonly identity: string;
}
export interface FrozenEvaluation {
  readonly spec: EvaluationSpec;
  readonly manifest: Asset;
  readonly sources: readonly Asset[];
  readonly executable: { readonly path: string; readonly version: string };
}
export interface Measurement {
  readonly sample: string;
  readonly repetition: number;
  readonly metrics: Readonly<Record<string, number>>;
  readonly receiptId: string;
  readonly candidateReceiptId: string;
}
export interface EvaluationRound {
  readonly id: string;
  readonly kind: 'baseline' | 'candidate' | 'final';
  readonly digest: string;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  readonly measurements: readonly Measurement[];
  readonly verdict?: 'baseline' | 'improved' | 'rejected';
  readonly startedAt: number;
}
export interface Evaluation {
  readonly id: string;
  readonly scope: BoundSessionScope;
  readonly frozen: FrozenEvaluation;
  readonly directory?: { readonly path: string; readonly identity: string };
  readonly phase: 'creating' | 'active' | 'retained' | 'published' | 'unknown';
  readonly rounds: readonly EvaluationRound[];
  readonly operationId?: string;
}
export interface EvaluationState { readonly version: 1; readonly revision: number; readonly runs: readonly Evaluation[] }

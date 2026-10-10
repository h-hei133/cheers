import type { BoundSessionScope } from '../../session/store/bound.js';
import type { ModelChoice } from '../../core/models/selection.js';
export interface Handoff {
  readonly id: string;
  readonly scope: BoundSessionScope;
  readonly directory: { readonly path: string; readonly identity: string };
  readonly source: ModelChoice;
  readonly target: ModelChoice;
  readonly modelRevision?: string;
  readonly createdAt: number;
  readonly phase: 'armed' | 'running' | 'switched' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  readonly runId?: string;
  readonly promptEntryId?: string;
  readonly switchedBy?: string;
  readonly endedAt?: number;
  /** Releases only the pending model selection; an uncertain earlier turn stays unknown. */
  readonly retired?: true;
}
export interface HandoffState { readonly version: 1; readonly revision: number; readonly cycles: readonly Handoff[] }

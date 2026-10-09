import type { BoundSessionScope } from '../../session/store/bound.js';
import type { ProcessOwner } from '../../core/state/owner.js';
import type { ResearchBrief, ResearchRequest } from '../brief/model.js';
import type { SourceRecord, ClaimRecord, ResearchDraft } from '../evidence/model.js';
import type { ReviewRecord } from '../review/model.js';

export type ResearchStage = 'brief' | 'investigate' | 'gaps' | 'draft' | 'review' | 'report' | 'reconcile';
export type ResearchStatus = 'ready' | 'running' | 'paused' | 'partial' | 'completed' | 'blocked' | 'stale';
export interface ResearchChild {
  readonly id: string;
  readonly stage: ResearchStage;
  readonly briefRevision: number;
  readonly startedAt: string;
  readonly endedAt?: string;
  readonly status: 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';
  readonly requestIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly failure?: string;
}
export interface ResearchEvent {
  readonly sequence: number;
  readonly timestamp: string;
  readonly kind: 'created' | 'stage-started' | 'stage-completed' | 'tool' | 'paused' | 'resumed' | 'steered' | 'source-changed' | 'stopped' | 'saved';
  readonly stage: ResearchStage;
  readonly detail: string;
}
export interface ReportFragment {
  readonly index: number;
  readonly title: string;
  readonly text: string;
  readonly claimIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly inputDigest: string;
}
export interface ResearchRun extends BoundSessionScope {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly revision: number;
  readonly epoch: number;
  readonly createdAt: string;
  readonly deadlineAt: string;
  readonly request: ResearchRequest;
  readonly ledgerScopeId: string;
  readonly briefRevision: number;
  readonly brief?: ResearchBrief;
  readonly briefs: readonly ResearchBrief[];
  readonly status: ResearchStatus;
  readonly stage: ResearchStage;
  readonly investigationRounds: number;
  readonly gapQuestions: readonly string[];
  readonly sources: readonly SourceRecord[];
  readonly claims: readonly ClaimRecord[];
  readonly draft?: ResearchDraft;
  readonly review?: ReviewRecord;
  readonly fragments: readonly ReportFragment[];
  readonly children: readonly ResearchChild[];
  readonly events: readonly ResearchEvent[];
  readonly pending?: { readonly childId: string; readonly owner: ProcessOwner; readonly epoch: number };
  readonly owner?: ProcessOwner;
  readonly goal?: { readonly id: string; readonly controlRevision: number };
  readonly stopReason?: string;
  readonly resumeStage?: ResearchStage;
  readonly reconciledUnknown?: string;
  readonly save: { readonly requested: boolean; readonly status: 'not-requested' | 'pending' | 'committed' | 'denied' | 'failed' | 'unknown'; readonly path?: string; readonly operationId?: string };
}

export interface ResearchState extends BoundSessionScope {
  readonly schemaVersion: 1;
  readonly currentId?: string;
  readonly runs: readonly ResearchRun[];
}

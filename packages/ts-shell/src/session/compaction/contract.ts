import type { AgentMessage } from '../../core/agent/state.js';
import type { SessionMessage } from '../schema/sessionMessage.js';

/** Captured before generation; never recaptured to authorize a late result. */
export interface CompactionSource {
  readonly sessionId: string;
  readonly identity: string;
  /** Logical request replay identity, unaffected by routine metadata publication. */
  readonly replayIdentity?: string;
  readonly directory?: string;
  readonly directoryIdentity?: string;
  readonly history: readonly SessionMessage[];
  /** Root-to-leaf branch captured before generation, including compacted turns. */
  readonly sourceActivePath?: readonly string[];
  readonly promptEntryId?: string;
}
export interface CompactionCommitInput {
  readonly source: CompactionSource;
  readonly summary: string;
  readonly keptMessages: number;
  readonly tokensBefore: number;
  readonly signal?: AbortSignal;
  readonly admission?: () => string | undefined;
}
export type CompactionCommit = { readonly status: 'committed' } |
  { readonly status: 'refused' | 'unverified'; readonly reason: string };
export interface CompactionAuthority {
  readonly identity?: string;
  capture(messages?: readonly AgentMessage[]): CompactionSource;
  commit(input: CompactionCommitInput): CompactionCommit;
  readonly admission?: () => string | undefined;
}
export interface CompactionDispatch {
  /** Verify known-unsent admission before the provider records its own handoff. */
  readonly checkAdmission?: () => void;
  /** Called at the existing attempt transport's actual handoff boundary. */
  readonly dispatch: () => void;
}
/**
 * What a summarizer is asked to condense, and what is already known about it.
 *
 * `previousSummary` is the checkpoint this history already begins with, so the
 * messages beside it are what has been added since. Handing both over lets the
 * summarizer revise that checkpoint instead of summarizing the conversation a
 * second time — and a summary of a summary sheds a little of what it said on
 * every pass.
 */
export interface SummarizeRequest {
  readonly dispatch?: CompactionDispatch;
  readonly messages: readonly AgentMessage[];
  readonly previousSummary?: string;
  /** What the user asked the summary to pay attention to, if anything. */
  readonly instructions?: string;
  readonly signal?: AbortSignal;
}

/** One admitted request capture, shared by scheduling, replay identity and send. */
export interface PreparedSummaryStep {
  readonly identity: string;
  /** Converted history only; the complete request has separately passed preflight. */
  readonly tokens: number;
  readonly send: (dispatch?: CompactionDispatch) => Promise<string | undefined>;
}

export interface SummarizeHistory {
  readonly dispatchAware?: boolean;
  (request: SummarizeRequest): Promise<string | undefined>;
  readonly prepare?: (request: SummarizeRequest) => Promise<PreparedSummaryStep>;
  /** Pure local validation, before durable request claims or any summary send. */
  readonly preflight?: (request: SummarizeRequest) => void;
}

/**
 * What the token budget was reached in the middle of a turn, so the opening of
 * that turn is summarized on its own.
 *
 * A separate summarizer because the prefix is asked a different question: not
 * "what happened so far" but "what was being attempted here", since the kept
 * tail is the work that followed it.
 */
export interface SummarizeTurnPrefix {
  (messages: readonly AgentMessage[], signal?: AbortSignal, dispatch?: CompactionDispatch): Promise<string | undefined>;
  readonly dispatchAware?: boolean;
  readonly prepare?: (messages: readonly AgentMessage[], signal?: AbortSignal) => Promise<PreparedSummaryStep>;
  /** Pure local validation, before durable request claims or any summary send. */
  readonly preflight?: (messages: readonly AgentMessage[], signal?: AbortSignal) => void;
}
export interface CompactionOperationInput {
  readonly sessionId: string;
  readonly provider?: string;
  readonly model?: string;
  readonly policyDigest: string;
  readonly instructions?: string;
  readonly source?: CompactionSource;
  readonly identity?: string;
}
export interface CompactionStepClaim {
  readonly operation: string;
  readonly step: string;
  readonly claimId: string;
  readonly acquired: boolean;
  readonly summary?: string;
  readonly unknown?: boolean;
  readonly file?: string;
  readonly directoryIdentity?: string;
  readonly profile?: import('../../core/paths/profile/context.js').ProfileContext;
}
export class CompactionOperationError extends Error {}

/** A fresh read only confirms the original branch. The original snapshot remains the write authority. */
export function bindCompactionSource(source: CompactionSource, read: () => CompactionSource): () => void {
  return () => {
    if (read().identity !== source.identity) throw new CompactionOperationError('The session source changed before the summary was generated.');
  };
}
/** A local request/schedule refusal whose detail is safe to show to the caller. */
export class SummaryAdmissionError extends Error {}
/** Uncertain publication must stop automatic continuation until the saved history is inspected. */
export class CompactionPublicationError extends Error {
  constructor() {
    super('Compaction publication is unverified; inspect the saved session before continuing.');
    this.name = 'CompactionPublicationError';
  }
}
export type CompactionStepStatus = 'prepared' | 'dispatched' | 'unknown' | 'completed';
export interface StepRecord {
  /** Present only for a captured request; legacy identities may be unmappable. */
  readonly preparedIdentity?: string;
  readonly claimId: string;
  readonly status: CompactionStepStatus;
  readonly summary?: string;
  readonly updatedAt: number;
}
export interface OperationRecord {
  readonly updatedAt: number;
  readonly steps: Record<string, StepRecord>;
}
export interface OperationFile { readonly version: 2; readonly operations: Record<string, OperationRecord> }

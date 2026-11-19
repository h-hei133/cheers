import type { AgentMessage } from '../../core/agent/state.js';

export type CompactionReason = 'manual' | 'threshold' | 'overflow';

interface CompactionStart {
  readonly reason: CompactionReason;
  readonly tokensBefore: number;
  readonly messageCount: number;
}

export interface CompactionPreparation extends CompactionStart {
  readonly keptMessages: number;
  readonly messages: readonly AgentMessage[];
  readonly turnPrefix: readonly AgentMessage[];
  readonly previousSummary?: string;
  readonly instructions?: string;
}

export interface CompactionNotice {
  readonly reason: CompactionReason;
  readonly summary: string;
  readonly tokensBefore: number;
  readonly keptMessages: number;
}

export interface CompactionDecision {
  readonly cancel?: 'hook' | 'extension';
  readonly summary?: string;
  readonly admission?: () => string | undefined;
  readonly published?: (event: CompactionNotice & { readonly fromExtension: boolean }) => Promise<void> | void;
}

export interface CompactionLifecycle {
  readonly before?: (input: CompactionStart) => Promise<boolean> | boolean;
  readonly decide?: (input: CompactionPreparation, signal?: AbortSignal) => Promise<CompactionDecision | undefined> | CompactionDecision | undefined;
  readonly after?: (input: CompactionNotice) => Promise<void> | void;
}

/** Notify the original audience only after the writer confirms the compaction. */
export async function reportCompaction(lifecycle: CompactionLifecycle | undefined, result: {
  readonly summary: string;
  readonly plan: { readonly tokensBefore: number; readonly keptMessages: number };
  readonly decision?: CompactionDecision;
},
  reason: CompactionReason): Promise<void> {
  const event: CompactionNotice = { reason, summary: result.summary, tokensBefore: result.plan.tokensBefore,
    keptMessages: result.plan.keptMessages };
  try { await lifecycle?.after?.(event); }
  finally { await result.decision?.published?.({ ...event, fromExtension: result.decision?.summary !== undefined }); }
}

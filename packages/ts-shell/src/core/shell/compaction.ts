import { markContextUnknown } from "../../observability/usageTelemetry.js";
import { selectModelContext } from '../../session/context/selection.js';
import { defaultHookDispatcher, type HookDispatcher } from "../hooks/hookDispatcher.js";
import { recordCompactionCheckpoint } from "../../context/compact/checkpoint/compactionCheckpoint.js";
import type { CompactLiveCheckpointStore } from "../../context/compact/checkpoint/compactLiveCheckpoint.js";
import type { CompactInjectionStateStore } from "../../context/compact/injection/compactInjectionState.js";
import type { CompactionLifecycle, CompactionReason } from "../../session/compaction.js";
export type { CompactionReason };
import {
  condenseContext,
  type CompactionDecline,
  type CompactionPolicy,
  type CondenseOutcome,
  type SummarizeHistory,
  type SummarizeTurnPrefix,
} from "../../session/compaction.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import type { CompactionAuthority, CompactionCommit, CompactionCommitInput, CompactionSource } from '../../session/compaction/contract.js';
import { digest } from '../../session/compaction/state.js';
import { CompactionOperationError, SummaryAdmissionError } from '../../session/compaction/contract.js';
import { ModelAdmissionError } from '../agent/request/model.js';

/**
 * The lifecycle a compaction reports through, built once for both entry points.
 *
 * `CompactionLifecycle` is what the engine offers, and the automatic path
 * already used it to dispatch hooks while the manual path did not — which is the
 * same split this module exists to close. Building it here means a hook sees one
 * shape of event whether the user typed `/compact` or the window filled up, and
 * `reason` is what tells those two apart.
 */
export function buildCompactionLifecycle(input: {
  readonly hooks?: HookDispatcher;
  readonly sessionId: string;
  readonly workspaceRoot?: string;
  readonly reason: CompactionReason;
}): CompactionLifecycle {
  const hooks = input.hooks ?? defaultHookDispatcher;
  const workspaceRoot = input.workspaceRoot ?? process.cwd();
  return {
    before: async ({ tokensBefore, messageCount }) => {
      const decision = await hooks.dispatch({
        eventName: "PreCompact",
        sessionId: input.sessionId,
        workspaceRoot,
        timestamp: new Date().toISOString(),
        reason: input.reason,
        tokensBefore,
        messageCount,
      });
      return decision.decision !== "block";
    },
    after: async ({ summary, keptMessages, tokensBefore }) => {
      await hooks.dispatch({
        eventName: "PostCompact",
        sessionId: input.sessionId,
        workspaceRoot,
        timestamp: new Date().toISOString(),
        reason: input.reason,
        summary,
        keptMessages,
        tokensBefore,
      });
    },
  };
}

/**
 * The `/compact` command, applied to a stored session.
 *
 * Condensing is decided in one place — `session/compaction.ts` — and this is
 * the manual entry point to it. The two used to compute the cut themselves,
 * which is how the manual path came to keep a fixed count of messages while the
 * automatic path worked to a token budget: the same history compacted two ways
 * depending on who asked. Here the only manual-specific work is reading the
 * stored turns, handing them to the engine, and recording what it decided.
 *
 * What the user asked the summary to focus on travels through to the
 * summarizer, so `/compact <instructions>` steers the checkpoint it produces.
 */

export type CompactionOutcome =
  | {
      readonly status: "compacted";
      readonly summarized: number;
      readonly kept: number;
      readonly tokensBefore: number;
      readonly tokensAfter: number;
    }
  | { readonly status: "nothing"; readonly reason: string }
  | { readonly status: "failed"; readonly reason: string }
  | { readonly status: "busy" };

export interface CompactionStore {
  /** Explicit test-only synchronous writer; production stores use native verified commit. */
  readonly syntheticCompaction?: true;
  getSession(sessionId: string): { readonly turns: readonly SessionMessage[] } | undefined;
  appendCompactionEntry(
    sessionId: string,
    input: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore?: number },
  ): void;
  captureCompactionSource?(sessionId: string): CompactionSource;
  appendCompactionIfCurrent?(input: CompactionCommitInput): CompactionCommit;
}

export interface CompactionInput {
  readonly authority?: CompactionAuthority;
  readonly store: CompactionStore;
  readonly sessionId: string;
  /** The window, reserve, and recent-tail budget the compaction works to. */
  readonly policy: CompactionPolicy;
  /** The summarizer; injectable so a test never reaches a provider. */
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
  readonly signal?: AbortSignal;
  readonly instructions?: string;
  /** Defaults to the process-wide dispatcher; injectable so a test need not install a hook. */
  readonly hooks?: HookDispatcher;
  /** Where the hook payload says the work happened. */
  readonly workspaceRoot?: string;
  /**
   * Which trigger this is. Defaults to `manual`, which is the only caller this
   * path had before the reason was threaded through.
   */
  readonly reason?: CompactionReason;
  /**
   * Where to record the checkpoint a completed compaction produces.
   *
   * Absent means nothing is recorded, which is what a caller that keeps its own
   * record — a test, or a surface that only reports — wants. Present means the
   * one producer runs, here, so a checkpoint exists exactly when a condensation
   * happened rather than whenever a command was typed.
   */
  readonly checkpoint?: {
    readonly sessionScopeId: string;
    readonly sourceCommand: "/compact" | "/handoff" | "internal";
    readonly projectRoot: string;
    readonly checkpointStore?: CompactLiveCheckpointStore;
    readonly injectionStateStore?: CompactInjectionStateStore;
  };
}

/**
 * What to tell the user when the engine declined to condense.
 *
 * Most declines are decisions, not faults, and the wording has to say which
 * decision: a conversation that has not yet outgrown what compaction would keep
 * anyway is a different situation from one whose tool calls are all still open.
 * A summarizer that returned nothing is the exception — the request went out and
 * came back unusable, so that one is reported as a failure.
 */
function declineOutcome(reason: CompactionDecline): CompactionOutcome {
  switch (reason) {
    case "blocked-by-hook":
      // A refusal, not an emptiness: the caller must be able to tell a project
      // rule from "there was nothing to do", or a policy that blocks every
      // compaction reads as a conversation that never needed one.
      return { status: "failed", reason: "Compaction was refused by a PreCompact hook." };
    case "fits-budget":
      return {
        status: "nothing",
        reason:
          "There is nothing older than the recent history that compaction keeps, so there is nothing to condense yet.",
      };
    case "below-threshold":
      return {
        status: "nothing",
        reason: "The context has not outgrown its window yet, so there is nothing to compact.",
      };
    case "no-legal-cut":
      return {
        status: "nothing",
        reason:
          "Every point this conversation could be split at would separate a tool call from its result, so there is nowhere safe to cut.",
      };
    case "would-not-shrink":
      return {
        status: "nothing",
        reason:
          "The summary would be at least as large as the messages it replaces, so compacting would not free any context.",
      };
    case "unsummarized":
      return { status: "failed", reason: "The provider returned no summary." };
    case "step-unknown":
      return { status: "failed", reason: "A previous summary step may already have been sent; it was not repeated. Add a turn or change the instructions, then retry." };
    case 'cancelled': return { status: 'failed', reason: 'Compaction was cancelled.' };
  }
}

export async function compactSessionHistory(input: CompactionInput): Promise<CompactionOutcome> {
  let source: CompactionSource;
  try {
    if (!input.authority && !input.store.captureCompactionSource && !input.store.syntheticCompaction) {
      return { status: 'failed', reason: 'A verified compaction storage owner is required.' };
    }
    source = input.authority?.capture() ?? input.store.captureCompactionSource?.(input.sessionId) ?? {
      sessionId: input.sessionId, identity: digest(input.store.getSession(input.sessionId)),
      history: structuredClone(selectModelContext(input.store.getSession(input.sessionId))) };
  } catch { return { status: 'failed', reason: 'Compaction source is unavailable.' }; }
  const turns = source.history;
  const reason = input.reason ?? "manual";
  const lifecycle = buildCompactionLifecycle({
    ...(input.hooks ? { hooks: input.hooks } : {}),
    sessionId: input.sessionId,
    ...(input.workspaceRoot ? { workspaceRoot: input.workspaceRoot } : {}),
    reason,
  });

  // The user asked for this, so the size threshold does not stand in the way:
  // `/compact` on a conversation under the limit still condenses it. The
  // engine's own refusal to grow the context applies either way.
  let condensed: CondenseOutcome;
  try {
    condensed = await condenseContext({
      messages: turns,
      policy: input.policy,
      summarize: input.summarize,
      summarizeTurnPrefix: input.summarizeTurnPrefix,
      instructions: input.instructions,
      signal: input.signal,
      lifecycle,
      force: true,
      operation: { sessionId: input.sessionId, source,
        ...(input.authority?.identity ? { identity: input.authority.identity } : {}) },
    });
  } catch (error) {
    if (input.signal?.aborted) return { status: "failed", reason: "Compaction was cancelled." };
    const reason = error instanceof CompactionOperationError || error instanceof ModelAdmissionError
      || error instanceof SummaryAdmissionError
      ? error.message : 'The summary request failed; history was retained.';
    return { status: "failed", reason };
  }
  if (condensed.status === "declined") {
    return declineOutcome(condensed.reason);
  }
  if (input.signal?.aborted) return { status: 'failed', reason: 'Compaction was cancelled.' };
  const commitInput: CompactionCommitInput = { source,
    summary: condensed.summary,
    keptMessages: condensed.plan.keptMessages,
    tokensBefore: condensed.plan.tokensBefore,
    signal: input.signal, admission: input.authority?.admission };
  const committed = input.authority ? input.authority.commit(commitInput) : input.store.appendCompactionIfCurrent?.(commitInput);
  if (committed && committed.status !== 'committed') return { status: 'failed', reason: committed.reason };
  if (!committed) {
    if (!input.store.syntheticCompaction) return { status: 'failed', reason: 'A verified compaction commit is required.' };
    if (digest(input.store.getSession(input.sessionId)) !== source.identity) return { status: 'failed', reason: 'The session source changed while its summary was generated.' };
    try { input.store.appendCompactionEntry(input.sessionId, commitInput); }
    catch { return { status: 'failed', reason: 'Compaction append could not be verified.' }; }
  }

  // The gauge showed the last request's context; that request predates the
  // checkpoint, so its number is no longer a fact until the next response.
  markContextUnknown(input.sessionId);
  await lifecycle.after?.({ reason, summary: condensed.summary,
    keptMessages: condensed.plan.keptMessages, tokensBefore: condensed.plan.tokensBefore });
  // After the entry is stored, so a reader of the checkpoint and a reader of the
  // session see the same compaction.
  if (input.checkpoint) {
    recordCompactionCheckpoint({
      sessionScopeId: input.checkpoint.sessionScopeId,
      sourceCommand: input.checkpoint.sourceCommand,
      projectRoot: input.checkpoint.projectRoot,
      ...(input.checkpoint.checkpointStore
        ? { checkpointStore: input.checkpoint.checkpointStore }
        : {}),
      ...(input.checkpoint.injectionStateStore
        ? { injectionStateStore: input.checkpoint.injectionStateStore }
        : {}),
    });
  }
  return {
    status: "compacted",
    summarized: condensed.summarized,
    kept: condensed.plan.keptMessages,
    tokensBefore: condensed.plan.tokensBefore,
    tokensAfter: condensed.tokensAfter,
  };
}

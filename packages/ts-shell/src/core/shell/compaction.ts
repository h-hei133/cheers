import { markContextUnknown } from "../../observability/usageTelemetry.js";
import {
  condenseContext,
  type CompactionDecline,
  type CompactionPolicy,
  type CondenseOutcome,
  type SummarizeHistory,
  type SummarizeTurnPrefix,
} from "../../session/compaction.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";

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
  getSession(sessionId: string): { readonly turns: readonly SessionMessage[] } | undefined;
  appendCompactionEntry(
    sessionId: string,
    input: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore?: number },
  ): void;
}

export interface CompactionInput {
  readonly store: CompactionStore;
  readonly sessionId: string;
  /** The window, reserve, and recent-tail budget the compaction works to. */
  readonly policy: CompactionPolicy;
  /** The summarizer; injectable so a test never reaches a provider. */
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
  readonly signal?: AbortSignal;
  readonly instructions?: string;
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
  }
}

export async function compactSessionHistory(input: CompactionInput): Promise<CompactionOutcome> {
  const turns = input.store.getSession(input.sessionId)?.turns ?? [];
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
      force: true,
    });
  } catch (error) {
    if (input.signal?.aborted) return { status: "failed", reason: "Compaction was cancelled." };
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
  if (condensed.status === "declined") {
    return declineOutcome(condensed.reason);
  }
  input.store.appendCompactionEntry(input.sessionId, {
    summary: condensed.summary,
    keptMessages: condensed.plan.keptMessages,
    tokensBefore: condensed.plan.tokensBefore,
  });
  // The gauge showed the last request's context; that request predates the
  // checkpoint, so its number is no longer a fact until the next response.
  markContextUnknown(input.sessionId);
  return {
    status: "compacted",
    summarized: condensed.summarized,
    kept: condensed.plan.keptMessages,
    tokensBefore: condensed.plan.tokensBefore,
    tokensAfter: condensed.tokensAfter,
  };
}

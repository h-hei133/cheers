import { markContextUnknown } from "../../observability/usageTelemetry.js";
import { estimateTokens } from "../../session/context.js";
import type { SessionMessage } from "../../session/schema/sessionMessage.js";
import { toChatMessages } from "../../turn/prompt.js";
import {
  requestCompactionSummary,
  type CompactionProvider,
  type CompactionRequest,
} from "../query/compaction/summarize.js";

/**
 * Compaction of a session's history.
 *
 * Everything before a cut point is condensed into one checkpoint message and
 * everything from the cut point on is kept verbatim, so the model keeps the
 * exact wording of the most recent exchange while the older turns shrink to a
 * summary. The cut always lands on a user message: a kept tail that begins
 * mid-tool-call would hand the provider an answer without its question.
 *
 * The result is durable — a compaction entry in the transcript — which is what
 * the next request's history is projected from. Nothing here rewrites the
 * screen; the host decides what to show about it.
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

/** Messages kept verbatim after the checkpoint, at minimum. */
export const KEEP_RECENT_MESSAGES = 4;

/**
 * Whether the compacted head leaves a tool call without its result.
 *
 * A tail beginning on a tool result would hand the provider an answer whose
 * question was just discarded. The head must therefore close every call it
 * keeps: a call made before the cut needs its result before the cut too.
 */
function hasDanglingCalls(turns: readonly SessionMessage[], cut: number): boolean {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const turn of turns.slice(0, cut)) {
    for (const call of turn.tool_calls ?? []) {
      calls.add(call.id);
    }
    if (turn.tool_call_id) {
      results.add(turn.tool_call_id);
    }
  }
  for (const id of calls) {
    if (!results.has(id)) return true;
  }
  return false;
}

/**
 * Index of the first message to keep, or nothing when there is too little to
 * condense: the newest user message that still leaves `keepRecent` messages
 * after it, provided at least one full exchange precedes it and the head it
 * leaves behind closes its own tool calls.
 */
export function compactionCut(turns: readonly SessionMessage[], keepRecent = KEEP_RECENT_MESSAGES): number | undefined {
  for (let index = turns.length - keepRecent; index >= 2; index--) {
    if (turns[index]?.role !== "user") continue;
    if (hasDanglingCalls(turns, index)) continue;
    return index;
  }
  return undefined;
}

export interface CompactionInput {
  readonly store: CompactionStore;
  readonly sessionId: string;
  readonly provider: CompactionProvider;
  readonly signal?: AbortSignal;
  readonly instructions?: string;
  readonly keepRecent?: number;
  /** The summarizer; injectable so a test never reaches a provider. */
  readonly summarize?: (request: CompactionRequest) => Promise<string | undefined>;
}

export async function compactSessionHistory(input: CompactionInput): Promise<CompactionOutcome> {
  const turns = input.store.getSession(input.sessionId)?.turns ?? [];
  const cut = compactionCut(turns, input.keepRecent ?? KEEP_RECENT_MESSAGES);
  if (cut === undefined) {
    return { status: "nothing", reason: "The conversation is too short to compact." };
  }
  const older = turns.slice(0, cut);
  const kept = turns.slice(cut);
  const tokensBefore = estimateTokens(turns);
  let summary: string | undefined;
  try {
    summary = await (input.summarize ?? requestCompactionSummary)({
      provider: input.provider,
      messages: toChatMessages(older),
      signal: input.signal,
      instructions: input.instructions,
    });
  } catch (error) {
    if (input.signal?.aborted) return { status: "failed", reason: "Compaction was cancelled." };
    return { status: "failed", reason: error instanceof Error ? error.message : String(error) };
  }
  if (!summary) return { status: "failed", reason: "The provider returned no summary." };
  input.store.appendCompactionEntry(input.sessionId, {
    summary,
    keptMessages: kept.length,
    tokensBefore,
  });
  // The gauge showed the last request's context; that request predates the
  // checkpoint, so its number is no longer a fact until the next response.
  markContextUnknown(input.sessionId);
  return {
    status: "compacted",
    summarized: older.length,
    kept: kept.length,
    tokensBefore,
    tokensAfter: estimateTokens([{ role: "user", content: summary }, ...kept]),
  };
}

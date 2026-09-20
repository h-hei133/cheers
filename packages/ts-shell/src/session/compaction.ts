import type { NextStepSnapshot, NextStepUpdate } from "../core/agent/loop.js";
import type { AgentMessage } from "../core/agent/state.js";
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS, estimateTokens, messageCharCount } from "./context.js";

export const KEEP_RECENT_TOKENS = 20_000;

export interface CompactionPolicy {
  readonly contextWindow: number;
  readonly reserveTokens?: number;
  /**
   * Tokens of recent history to keep verbatim.
   *
   * A budget in tokens rather than a count of messages: four short messages and
   * four enormous ones mean completely different amounts of context, and only
   * one of those is what "keep the recent exchange" is asking for.
   */
  readonly keepRecentTokens?: number;
  readonly enabled?: boolean;
  /**
   * What the provider reported the context costs, given the messages on hand.
   *
   * A callback rather than a number because it changes as the turn proceeds: the
   * measured value covers the prompt that was sent, and every message added since
   * has to be counted on top of it. Returns nothing when no measurement exists,
   * in which case the caller estimates instead.
   */
  readonly measureContextTokens?: (messages: readonly AgentMessage[]) => number | undefined;
}

export interface CompactionPlan {
  readonly cut: number;
  readonly keptMessages: number;
  readonly tokensBefore: number;
}

/** Why a compaction ran, so a hook can tell a scheduled one from a rescue. */
export type CompactionReason = "manual" | "threshold" | "overflow";

/**
 * What the caller wants told about a compaction, before and after.
 *
 * `before` may refuse: a compaction discards the wording of everything it
 * condenses, so a caller that can see the conversation is allowed to stop it.
 */
export interface CompactionLifecycle {
  readonly before?: (input: {
    readonly reason: CompactionReason;
    readonly tokensBefore: number;
    readonly messageCount: number;
  }) => Promise<boolean> | boolean;
  readonly after?: (input: {
    readonly reason: CompactionReason;
    readonly summary: string;
    readonly keptMessages: number;
    readonly tokensBefore: number;
  }) => Promise<void> | void;
}

export type SummarizeHistory = (
  messages: readonly AgentMessage[],
  signal?: AbortSignal,
) => Promise<string | undefined>;

export function shouldCompact(
  tokens: number,
  contextWindow: number,
  reserveTokens: number,
  enabled = true,
): boolean {
  if (!enabled) {
    return false;
  }
  return tokens > contextWindow - reserveTokens;
}

/**
 * Index of the first message to keep, or nothing when there is too little to
 * condense.
 *
 * Takes the earliest user boundary whose tail still fits the budget, so the kept
 * messages are exactly the recent ones. Stops at the first boundary that cannot
 * fit: every earlier one keeps even more.
 *
 * Two properties hold the cut together. The tail must begin on a user message —
 * starting mid-tool-call would hand the provider a result without its call. And
 * the head must close on its own — a call whose result lands in the kept tail is
 * a result whose call has already been discarded.
 *
 * When nothing fits, the newest boundary still wins. Reaching this function
 * means the context was already judged too large, so declining to condense
 * would leave the request exactly as oversized as before.
 */
export function findCompactionCut(
  messages: readonly AgentMessage[],
  keepRecentTokens: number,
): number | undefined {
  const budgetChars = keepRecentTokens * CHARS_PER_TOKEN;
  let accumulated = 0;
  let fits: number | undefined;
  let overran: number | undefined;
  for (let index = messages.length - 1; index >= 2; index -= 1) {
    accumulated += messageCharCount(messages[index]!);
    if (messages[index]!.role !== "user" || hasDanglingCalls(messages, index)) continue;
    if (accumulated > budgetChars) {
      // This boundary keeps more than the budget allows, so it is the candidate
      // to cut at — but only if every boundary was over. Otherwise the earlier
      // one that fits is the better answer.
      overran ??= index;
      break;
    }
    fits = index;
  }
  // `fits` is the earliest boundary whose tail stays inside the budget. When
  // even the newest boundary overruns, condensing that much is still the only
  // way to shrink the request, so the overrunning boundary is used. When
  // nothing overran, the budget covers everything and there is nothing to cut.
  return fits ?? overran;
}

/**
 * Whether the compacted head leaves calls without results behind.
 *
 * Only the head is dropped, so only the head must be self-closed: every
 * tool call before `cut` needs its result before `cut` as well. Results
 * after the cut stay paired with their own assistant message in the kept
 * tail, which always starts on a user boundary.
 */
function hasDanglingCalls(messages: readonly AgentMessage[], cut: number): boolean {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const message of messages.slice(0, cut)) {
    for (const call of message.tool_calls ?? []) {
      calls.add(call.id);
    }
    if (message.tool_call_id) {
      results.add(message.tool_call_id);
    }
  }
  for (const id of calls) {
    if (!results.has(id)) {
      return true;
    }
  }
  return false;
}

export function planCompaction(
  messages: readonly AgentMessage[],
  policy: CompactionPolicy,
): CompactionPlan | undefined {
  const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const available = Math.max(0, policy.contextWindow - reserve);
  // A budget at or above what the window can hold would swallow the whole
  // conversation, so no cut would ever be found and compaction would never run
  // — the opposite of what the budget is for. Clamp it to the space that
  // actually exists.
  const keepRecentTokens = Math.min(policy.keepRecentTokens ?? KEEP_RECENT_TOKENS, available);
  const estimated = estimateTokens(messages);
  // The provider's own count wins when it exists: it measured the prompt that
  // was actually sent, while the estimate only measures the text we kept.
  const tokensBefore = policy.measureContextTokens?.(messages) ?? estimated;
  if (!shouldCompact(tokensBefore, policy.contextWindow, reserve, policy.enabled ?? true)) {
    return undefined;
  }
  const cut = findCompactionCut(messages, keepRecentTokens);
  if (cut === undefined) {
    return undefined;
  }
  return { cut, keptMessages: messages.length - cut, tokensBefore: estimated };
}

export function applyCompaction(
  messages: readonly AgentMessage[],
  plan: CompactionPlan,
  summary: string,
): AgentMessage[] {
  const checkpoint: AgentMessage = {
    role: "user",
    content: `[Context Checkpoint]\n${summary}`,
  };
  const head = messages[0]?.role === "system" ? [messages[0]] : [];
  return [...head, checkpoint, ...messages.slice(plan.cut)];
}

export function createCompactionStep(
  policy: CompactionPolicy,
  summarize: SummarizeHistory,
  onError?: (error: unknown) => void,
  onCompact?: (input: { readonly summary: string; readonly keptMessages: number; readonly tokensBefore: number }) => void,
  lifecycle?: CompactionLifecycle,
  reason: CompactionReason = "threshold",
): (snapshot: NextStepSnapshot, signal?: AbortSignal) => Promise<NextStepUpdate | undefined> {
  return async (snapshot, signal) => {
    if (signal?.aborted) {
      return undefined;
    }
    const plan = planCompaction(snapshot.messages, policy);
    if (!plan) {
      return undefined;
    }
    const proceed = await lifecycle?.before?.({
      reason,
      tokensBefore: plan.tokensBefore,
      messageCount: snapshot.messages.length,
    });
    if (proceed === false) {
      return undefined;
    }
    let summary: string | undefined;
    try {
      summary = await summarize(snapshot.messages.slice(0, plan.cut), signal);
    } catch (error) {
      if (signal?.aborted) {
        return undefined;
      }
      onError?.(error);
      return undefined;
    }
    if (!summary) {
      return undefined;
    }
    onCompact?.({ summary, keptMessages: plan.keptMessages, tokensBefore: plan.tokensBefore });
    await lifecycle?.after?.({
      reason,
      summary,
      keptMessages: plan.keptMessages,
      tokensBefore: plan.tokensBefore,
    });
    return { messages: applyCompaction(snapshot.messages, plan, summary) };
  };
}

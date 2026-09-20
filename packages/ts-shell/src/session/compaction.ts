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

/**
 * Where a cut falls, and whether it lands inside a turn.
 *
 * A turn opens on a user message. Condensing can leave the kept tail starting
 * on an assistant message when a single turn is larger than the whole budget —
 * the alternative is refusing to compact at all, which leaves the request just
 * as oversized as before. When that happens the opening of the turn has to be
 * summarized separately, because it is neither kept nor covered by the rest of
 * the history, so the cut has to name it.
 */
export interface CompactionCut {
  /** Index of the first message kept verbatim. */
  readonly cut: number;
  /** Index of the user message opening the turn being split, or -1 when none. */
  readonly turnStart: number;
  /** Whether the cut falls inside a turn instead of on its opening message. */
  readonly splitsTurn: boolean;
}

export interface CompactionPlan extends CompactionCut {
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
 * Whether a message may begin the kept tail.
 *
 * Any message except a tool result. A tool result answers an earlier call, so a
 * tail opening on one would hand the provider an answer whose question was just
 * discarded. An assistant message is allowed: its own tool results follow it and
 * stay in the tail, which keeps the pair together.
 */
function canStartTail(message: AgentMessage): boolean {
  return message.role !== "tool";
}

/** Whether the message opens a turn, which is what the tail would rather start on. */
function opensTurn(message: AgentMessage): boolean {
  return message.role === "user";
}

/**
 * The user message opening the turn `index` falls in, searching back to `from`.
 *
 * Cutting inside a turn leaves its opening request out of both the summary and
 * the kept tail, so the opener has to be found and summarized on its own.
 */
function findTurnStart(messages: readonly AgentMessage[], index: number, from: number): number {
  for (let cursor = index; cursor >= from; cursor -= 1) {
    if (opensTurn(messages[cursor]!)) {
      return cursor;
    }
  }
  return -1;
}

/**
 * The newest legal cut at or before `from`, given how many calls are open at
 * each position.
 *
 * Searching downwards keeps at least the budget: every earlier position keeps
 * more, so the newest qualifying one is the closest fit without keeping less
 * than the budget asked for.
 */
function newestCutBelow(
  messages: readonly AgentMessage[],
  openCalls: readonly number[],
  from: number,
): CompactionCut | undefined {
  for (let index = from; index >= 2; index -= 1) {
    const message = messages[index];
    if (!message || !canStartTail(message)) continue;
    // A call left open at the cut would lose its result with the head.
    if (openCalls[index] !== 0) continue;
    const splitsTurn = !opensTurn(message);
    const turnStart = splitsTurn ? findTurnStart(messages, index, 0) : -1;
    // Cutting inside a turn needs its opener to summarize; without one the
    // request that the kept tail answers would be lost silently.
    if (splitsTurn && turnStart === -1) continue;
    return { cut: index, turnStart, splitsTurn };
  }
  return undefined;
}

/**
 * Where to cut so the kept tail costs about `keepRecentTokens`.
 *
 * Walks back from the newest message adding up size until the budget is spent,
 * then takes the newest legal cut at or before that point. Legal means any
 * message but a tool result: a tail starting on a tool result would hand the
 * provider an answer whose call was just discarded, while an assistant message
 * keeps its own tool calls and their results together in the tail.
 *
 * Returns nothing only when no legal cut exists anywhere, which means there is
 * nothing this function can do rather than that nothing should be done. Whether
 * to compact is the caller's question, asked by `planCompaction`.
 *
 * The walk measures estimated tokens while the caller may have measured the
 * request for real. The two can disagree — a provider counts per-message
 * overhead the estimate cannot see — so when the budget is never reached the
 * newest legal cut is used rather than giving up. Declining here would leave an
 * already-oversized context untouched, which is the one outcome that cannot help.
 */
export function findCompactionCut(
  messages: readonly AgentMessage[],
  keepRecentTokens: number,
): CompactionCut | undefined {
  const budgetChars = keepRecentTokens * CHARS_PER_TOKEN;
  const openCalls = openCallsBefore(messages);
  let accumulated = 0;
  for (let index = messages.length - 1; index >= 2; index -= 1) {
    accumulated += messageCharCount(messages[index]!);
    if (accumulated < budgetChars) continue;
    // The budget is spent. Take the newest legal cut at or before here; the
    // earliest ones would keep more than the budget allows.
    const atBudget = newestCutBelow(messages, openCalls, index);
    if (atBudget) return atBudget;
    break;
  }
  // Either everything fits the budget, or the budget was spent inside a run of
  // tool results. Cut as late as legality allows in both cases.
  return newestCutBelow(messages, openCalls, messages.length - 1);
}

/**
 * How many tool calls are still unanswered before each position.
 *
 * Only the head is dropped, so only the head must be self-closed: a call before
 * the cut whose result also falls before the cut. Counting the open calls
 * arriving at every index answers that for all candidate cuts in one pass,
 * rather than rescanning the head once per candidate.
 *
 * A result for a call that was never seen is ignored, since it cannot close
 * anything.
 */
function openCallsBefore(messages: readonly AgentMessage[]): number[] {
  const open = new Set<string>();
  const counts = new Array<number>(messages.length + 1).fill(0);
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    for (const call of message.tool_calls ?? []) {
      open.add(call.id);
    }
    if (message.tool_call_id) {
      open.delete(message.tool_call_id);
    }
    counts[index + 1] = open.size;
  }
  return counts;
}

/**
 * The plan for condensing `messages`, without asking whether it is time to.
 *
 * Kept separate from the threshold check so a caller that already knows the
 * context is too large — a provider that refused the request — can act on that
 * instead of on an estimate. The estimate is exactly what cannot be trusted
 * there: the refused request never reported its usage.
 */
export function planCompactionCut(
  messages: readonly AgentMessage[],
  policy: CompactionPolicy,
): CompactionPlan | undefined {
  const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const available = Math.max(0, policy.contextWindow - reserve);
  const estimated = estimateTokens(messages);
  const measured = policy.measureContextTokens?.(messages);
  // The estimate is what the walk can see per message; the provider's count is
  // what the whole request actually costs. Dividing costs by characters is not
  // a constant — a script with wide characters spends more tokens per character
  // than Latin prose does — so the two disagree by a factor that varies with the
  // conversation. Scaling the budget by the ratio found in this very
  // conversation keeps the walk landing where the real number says it should,
  // instead of reaching the end of the history and finding no cut at all.
  const scale = measured !== undefined && measured > 0 && estimated > 0 ? estimated / measured : 1;
  // A budget at or above what the window can hold would swallow the whole
  // conversation, so no cut would ever be found and compaction would never run
  // — the opposite of what the budget is for. Clamp it to the space that
  // actually exists.
  const keepRecent = Math.min(policy.keepRecentTokens ?? KEEP_RECENT_TOKENS, available) * scale;
  const cut = findCompactionCut(messages, keepRecent);
  if (cut === undefined) {
    return undefined;
  }
  return { ...cut, keptMessages: messages.length - cut.cut, tokensBefore: estimated };
}

export function planCompaction(
  messages: readonly AgentMessage[],
  policy: CompactionPolicy,
): CompactionPlan | undefined {
  const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const plan = planCompactionCut(messages, policy);
  if (!plan) {
    return undefined;
  }
  // The provider's own count wins when it exists: it measured the prompt that
  // was actually sent, while the estimate only measures the text we kept.
  const tokensBefore = policy.measureContextTokens?.(messages) ?? plan.tokensBefore;
  if (!shouldCompact(tokensBefore, policy.contextWindow, reserve, policy.enabled ?? true)) {
    return undefined;
  }
  return { ...plan, tokensBefore };
}

/**
 * What the token budget was reached in the middle of a turn, so the opening of
 * that turn is summarized on its own.
 *
 * A separate summarizer because the prefix is asked a different question: not
 * "what happened so far" but "what was being attempted here", since the kept
 * tail is the work that followed it.
 */
export type SummarizeTurnPrefix = (
  messages: readonly AgentMessage[],
  signal?: AbortSignal,
) => Promise<string | undefined>;

/** Marks where the framing of a split turn begins inside a merged checkpoint. */
const TURN_CONTEXT_MARKER = "**Turn Context (split turn):**";

export interface CondensedContext {
  readonly plan: CompactionPlan;
  readonly summary: string;
  readonly messages: AgentMessage[];
}

/**
 * The one place a compaction actually happens: choose the cut, summarize what
 * is dropped, and build the replacement context.
 *
 * Both the scheduled path (a step that notices the context grew too large) and
 * the rescue path (a provider that refused the request) go through here, so the
 * two cannot disagree about where the cut is or what the summary contains. They
 * used to compute it separately, which is how the rescue path came to run
 * without the budget clamp the scheduled path applied.
 *
 * Returns nothing when there is no cut to make or nothing worth summarizing.
 */
export async function condenseContext(input: {
  readonly messages: readonly AgentMessage[];
  readonly policy: CompactionPolicy;
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
  readonly signal?: AbortSignal;
  /**
   * Whether to condense regardless of the threshold.
   *
   * Set by a caller that already knows the context is too large — a provider
   * that refused the request. The threshold is measured from the last reported
   * usage, and the refused request never reported any, so leaving the check on
   * would have the rescue judge an oversized context by the estimate that
   * missed its size in the first place.
   */
  readonly force?: boolean;
}): Promise<CondensedContext | undefined> {
  const plan = input.force
    ? planCompactionCut(input.messages, input.policy)
    : planCompaction(input.messages, input.policy);
  if (!plan) {
    return undefined;
  }
  // A leading system message is carried over verbatim by applyCompaction, so
  // summarizing it as well would pay to restate what is still there.
  const head = input.messages[0]?.role === "system" ? 1 : 0;
  // When the cut sits inside a turn, that turn's opening message is neither kept
  // nor part of the older history, so the history stops where the turn begins
  // and the opener is summarized separately.
  const historyEnd = plan.splitsTurn ? plan.turnStart : plan.cut;
  const history = input.messages.slice(head, historyEnd);
  const prefix = plan.splitsTurn ? input.messages.slice(Math.max(plan.turnStart, head), plan.cut) : [];

  let historyText: string | undefined;
  if (history.length > 0) {
    historyText = await input.summarize(history, input.signal);
    if (!historyText) {
      return undefined;
    }
  }

  let summary = historyText;
  if (prefix.length > 0) {
    const prefixText = await input.summarizeTurnPrefix?.(prefix, input.signal);
    // The request the tail is answering lives in the prefix, so losing it costs
    // real context. Refusing to compact costs more: the request was already
    // judged too large, and declining leaves it exactly as large as before.
    if (prefixText) {
      summary = historyText ? `${historyText}\n\n---\n\n${TURN_CONTEXT_MARKER}\n\n${prefixText}` : prefixText;
    }
  }
  if (!summary) {
    return undefined;
  }
  return { plan, summary, messages: applyCompaction(input.messages, plan, summary) };
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

export interface CompactionStepOptions {
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
  readonly onError?: (error: unknown) => void;
  readonly onCompact?: (input: {
    readonly summary: string;
    readonly keptMessages: number;
    readonly tokensBefore: number;
  }) => void;
  readonly lifecycle?: CompactionLifecycle;
  readonly reason?: CompactionReason;
}

/**
 * The scheduled path: before the next model step, condense the context when it
 * has outgrown its budget.
 */
export function createCompactionStep(
  policy: CompactionPolicy,
  options: CompactionStepOptions,
): (snapshot: NextStepSnapshot, signal?: AbortSignal) => Promise<NextStepUpdate | undefined> {
  const reason = options.reason ?? "threshold";
  return async (snapshot, signal) => {
    if (signal?.aborted) {
      return undefined;
    }
    // A compaction whose size is known before the summary is requested can be
    // refused by the caller without paying for a summary that gets thrown away.
    const tokensBefore = planCompaction(snapshot.messages, policy)?.tokensBefore;
    if (tokensBefore === undefined) {
      return undefined;
    }
    const proceed = await options.lifecycle?.before?.({
      reason,
      tokensBefore,
      messageCount: snapshot.messages.length,
    });
    if (proceed === false) {
      return undefined;
    }
    let condensed: CondensedContext | undefined;
    try {
      condensed = await condenseContext({
        messages: snapshot.messages,
        policy,
        summarize: options.summarize,
        summarizeTurnPrefix: options.summarizeTurnPrefix,
        signal,
      });
    } catch (error) {
      if (signal?.aborted) {
        return undefined;
      }
      options.onError?.(error);
      return undefined;
    }
    if (!condensed) {
      return undefined;
    }
    const { plan, summary } = condensed;
    options.onCompact?.({ summary, keptMessages: plan.keptMessages, tokensBefore: plan.tokensBefore });
    await options.lifecycle?.after?.({
      reason,
      summary,
      keptMessages: plan.keptMessages,
      tokensBefore: plan.tokensBefore,
    });
    return { messages: condensed.messages };
  };
}

import { messageToText } from "../model-adapters/multimodal.js";
import { ModelAdmissionError } from '../core/agent/request/model.js';
import type { NextStepSnapshot, NextStepUpdate } from "../core/agent/loop.js";
import type { AgentMessage } from "../core/agent/state.js";
import { CHARS_PER_TOKEN, DEFAULT_RESERVE_TOKENS, estimateRequestTokens, estimateTokens, messageCharCount, type RequestOverhead } from "./context.js";
import { requestBudget } from '../context/request/budget.js';
import { digest } from './compaction/state.js';
import { generateCompaction, CompactionStepUnknown } from './compaction/generation.js';
import type { CompactionAuthority, CompactionOperationInput, CompactionSource, SummarizeHistory, SummarizeTurnPrefix } from './compaction/contract.js';
import { CompactionPublicationError } from './compaction/contract.js';
import { freezeDeep } from '../core/values/freeze.js';
import type { PromptMeasurementIdentity } from '../observability/usage/model.js';

export type { SummarizeHistory, SummarizeRequest, SummarizeTurnPrefix } from './compaction/contract.js';

export const KEEP_RECENT_TOKENS = 20_000;

export interface CompactionPolicy {
  /** Digest of the captured summary target, effort and model capabilities; never credentials. */
  readonly summaryIdentity?: string;
  /** Maximum tokens per legal history/prefix/merge request. */
  readonly segmentTokens?: number;
  readonly contextWindow: number;
  /** Independent prompt ceiling when the model publishes one. */
  readonly inputLimit?: number;
  readonly reserveTokens?: number;
  /**
   * The output ceiling of the request being budgeted.
   *
   * When present, the threshold uses the same `P + O + H <= W` calculation as
   * the request path and fires at its soft band. Without it, callers retain the
   * older reserve-only threshold.
   */
  readonly outputTokens?: number;
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
   * What the provider reported the whole request costs, given the messages on
   * hand.
   *
   * A callback rather than a number because it changes as the turn proceeds: the
   * measured value covers the prompt that was sent, and every message added since
   * has to be counted on top of it. Returns nothing when no measurement exists,
   * in which case the caller estimates instead.
   *
   * Used for the threshold — "has the context outgrown its window" — and never
   * for the cut. The two questions need different numbers: the threshold is
   * about the request as a whole, which only the provider can size, while the
   * cut is about the conversation, which the walk measures per message. Feeding
   * the provider's count into the cut scaled the budget by the fixed overhead of
   * the system prompt and tool schemas, so a conversation comfortably inside the
   * budget still produced a cut, and the cut shrank as that overhead grew.
   */
  readonly measureContextTokens?: (messages: readonly AgentMessage[],
    identity?: Pick<PromptMeasurementIdentity, 'schemaDigest' | 'systemDigest'>) => number | undefined;
  /** Effective schema/system identity of the request that produced the measurement. */
  readonly promptIdentity?: Pick<PromptMeasurementIdentity, 'schemaDigest' | 'systemDigest'>;
  /**
   * What the request carries besides the conversation: the instruction, and the
   * tool declarations.
   *
   * Only the fallback estimate reads it. The provider's own count already
   * includes these, so adding them there would double-count; but when no request
   * has reported yet — a cold start, or just after a compaction — the estimate
   * is all there is, and it measures `messages` alone. On a cold start that is
   * nearly the whole request, so leaving it out under-reports the context by
   * several thousand tokens at exactly the moment the threshold is being
   * decided.
   *
   * The cut deliberately does not use it: the budget is about the conversation,
   * and the overhead is a fixed cost that does not shrink as history is dropped.
   */
  readonly overhead?: RequestOverhead;
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
 * Whether the request has reached the budget's soft band.
 *
 * The old reserve-only check could not see output headroom. A model with a
 * large output ceiling could therefore be treated as having more input room
 * than it did, and a model with a small ceiling compacted later than its soft
 * budget. The budget owner already defines the shared calculation; this helper
 * only decides whether it is a trigger.
 */
function reachedBudgetThreshold(tokens: number, policy: CompactionPolicy, measured: boolean): boolean {
  if (policy.enabled === false) return false;
  if (policy.outputTokens === undefined && policy.inputLimit === undefined) {
    return shouldCompact(tokens, policy.contextWindow, policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS,
      policy.enabled ?? true);
  }
  const budget = requestBudget({
    window: policy.contextWindow,
    inputLimit: policy.inputLimit,
    promptTokens: tokens,
    outputTokens: policy.outputTokens,
    reserveTokens: policy.reserveTokens,
    measured,
  });
  if (budget.ok) return budget.soft;
  // A provider-owned output ceiling leaves the full window unproven, but the
  // independent input limit is still a usable bound. Apply the same soft band
  // to that bound instead of falling back to the older reserve-only threshold.
  if (budget.reason === 'unknown' && policy.inputLimit !== undefined) {
    const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
    const availableInput = Math.max(0, policy.inputLimit - reserve);
    const softLimit = Math.min(Math.floor(policy.contextWindow * 0.9), availableInput);
    return tokens >= softLimit || tokens + reserve > policy.inputLimit;
  }
  // Unknown limits keep the old conservative behavior rather than claiming a
  // threshold the runtime cannot prove.
  if (budget.reason === 'unknown') {
    return shouldCompact(tokens, policy.contextWindow, policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS,
      policy.enabled ?? true);
  }
  return true;
}

function availableTailTokens(policy: CompactionPolicy): number {
  const reserve = policy.reserveTokens ?? DEFAULT_RESERVE_TOKENS;
  const windowInput = policy.contextWindow - reserve - (policy.outputTokens ?? 0);
  const limitInput = policy.inputLimit === undefined ? Number.POSITIVE_INFINITY : policy.inputLimit - reserve;
  return Math.max(0, Math.min(windowInput, limitInput));
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
 * The outcome of searching for a cut: where it is, or why there is none.
 *
 * The two reasons are kept apart because they mean different things to whoever
 * reads them. A conversation that fits the budget is not too small — it is
 * growing, and has simply not yet outgrown what compaction would have kept
 * anyway. A conversation with no legal cut is a different situation entirely:
 * there is history to replace, but every boundary would strand a tool call from
 * its result.
 */
type CutSearch =
  | { readonly cut: CompactionCut }
  | { readonly reason: "fits-budget" | "no-legal-cut" };

/**
 * Where to cut so the kept tail costs about `keepRecentTokens`.
 *
 * Walks back from the newest message adding up size until the budget is spent,
 * then takes the newest legal cut at or before that point. Legal means any
 * message but a tool result: a tail starting on a tool result would hand the
 * provider an answer whose call was just discarded, while an assistant message
 * keeps its own tool calls and their results together in the tail.
 *
 * Reports "fits-budget" when the whole conversation is smaller than the budget,
 * so there is no history beyond the tail to condense and a checkpoint would
 * replace less than it costs. Condensing anyway is what makes a context grow on
 * every pass.
 *
 * When the budget is spent inside a run of tool results — the one case where it
 * cannot be met without starting the tail on a result — the newest legal cut
 * anywhere is used, which keeps less than the budget asked for rather than
 * giving up.
 */
function locateCut(messages: readonly AgentMessage[], keepRecentTokens: number): CutSearch {
  const budgetChars = keepRecentTokens * CHARS_PER_TOKEN;
  const openCalls = openCallsBefore(messages);
  let accumulated = 0;
  for (let index = messages.length - 1; index >= 2; index -= 1) {
    accumulated += messageCharCount(messages[index]!);
    if (accumulated < budgetChars) continue;
    // The budget is spent, so there is history to replace; only legality can
    // fail from here. The earliest qualifying cut would keep more than the
    // budget allows.
    const cut =
      newestCutBelow(messages, openCalls, index) ?? newestCutBelow(messages, openCalls, messages.length - 1);
    return cut ? { cut } : { reason: "no-legal-cut" };
  }
  return { reason: "fits-budget" };
}

/**
 * Where to cut, or nothing when there is no cut to make.
 *
 * A thin view over `locateCut` for callers that only need the position; a
 * caller that has to explain the refusal should ask `explainNoCut` instead.
 */
export function findCompactionCut(
  messages: readonly AgentMessage[],
  keepRecentTokens: number,
): CompactionCut | undefined {
  const found = locateCut(messages, keepRecentTokens);
  return "cut" in found ? found.cut : undefined;
}

/**
 * Why no cut could be made, for a caller that has to tell the user.
 *
 * Only meaningful once a cut has been found absent: it re-runs the search to
 * read its reason, which is why it is not part of the planning result. Callers
 * that decline are already refusing, so the second walk costs nothing that
 * matters.
 */
export function explainNoCut(
  messages: readonly AgentMessage[],
  policy: CompactionPolicy,
): "fits-budget" | "no-legal-cut" {
  const available = availableTailTokens(policy);
  const keepRecent = Math.min(policy.keepRecentTokens ?? KEEP_RECENT_TOKENS, available);
  const found = locateCut(messages, keepRecent);
  return "cut" in found ? "no-legal-cut" : found.reason;
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
  const available = availableTailTokens(policy);
  const estimated = estimateTokens(messages);
  // A budget at or above what the window can hold would swallow the whole
  // conversation, so no cut would ever be found and compaction would never run
  // — the opposite of what the budget is for. Clamp it to the space that
  // actually exists.
  const keepRecent = Math.min(policy.keepRecentTokens ?? KEEP_RECENT_TOKENS, available);
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
  const plan = planCompactionCut(messages, policy);
  if (!plan) {
    return undefined;
  }
  // The provider's own count wins when it exists: it measured the prompt that
  // was actually sent, while the estimate only measures the text we kept.
  const measuredTokens = policy.measureContextTokens?.(messages, policy.promptIdentity);
  const tokensBefore = measuredTokens ?? estimateRequestTokens(messages, policy.overhead);
  const measured = measuredTokens !== undefined;
  if (!reachedBudgetThreshold(tokensBefore, policy, measured)) {
    return undefined;
  }
  return { ...plan, tokensBefore };
}

/**
 * Whether the threshold is what stopped a plan, for a caller that has to say so.
 *
 * `planCompaction` declines for two different reasons — no cut to make, or a
 * context still inside its window — and only the first is about the
 * conversation's shape. Asking this after a decline keeps the distinction out
 * of the plan itself, which callers that do not speak to a user never need.
 */
function isBelowThreshold(
  messages: readonly AgentMessage[],
  policy: CompactionPolicy,
): boolean {
  const measuredTokens = policy.measureContextTokens?.(messages, policy.promptIdentity);
  const tokensBefore = measuredTokens ?? estimateRequestTokens(messages, policy.overhead);
  const measured = measuredTokens !== undefined;
  return !reachedBudgetThreshold(tokensBefore, policy, measured);
}

export interface CondensedContext {
  readonly plan: CompactionPlan;
  readonly summary: string;
  readonly messages: AgentMessage[];
  /** How many messages the checkpoint replaced, counting any earlier checkpoint. */
  readonly summarized: number;
  /** What the context is estimated to cost after the checkpoint replaces the head. */
  readonly tokensAfter: number;
}

/** Opens the message a compaction leaves in place of the history it condensed. */
export const CONTEXT_CHECKPOINT_MARKER = "[Context Checkpoint]";

/** The message that stands in for a span of condensed history. */
export function formatContextCheckpoint(summary: string): string {
  return `${CONTEXT_CHECKPOINT_MARKER}\n${summary}`;
}

/**
 * The summary a checkpoint message carries, or nothing when it is not one.
 *
 * A conversation that has already been compacted opens with its own checkpoint,
 * so a later compaction has to recognize it. That text is itself a summary, and
 * condensing a condensation loses a little of what it said every time, so the
 * engine hands it back as the checkpoint to revise rather than as history.
 */
export function readContextCheckpoint(content: string): string | undefined {
  if (!content.startsWith(CONTEXT_CHECKPOINT_MARKER)) {
    return undefined;
  }
  return content.slice(CONTEXT_CHECKPOINT_MARKER.length).replace(/^\n/, "");
}

/**
 * Why a condensation did not happen.
 *
 * Kept apart from a failure: nothing went wrong here, the engine looked at what
 * it had and decided the operation would not help. A caller that can speak to
 * the user is expected to say so rather than report an error.
 */
export type CompactionDecline =
  /**
   * Refused by a `PreCompact` hook.
   *
   * Not a judgement about the conversation: nothing was examined and nothing
   * changed. The caller reports it as a policy refusal, which is why it needs its
   * own reason rather than sharing one with the size-based declines.
   */
  | "blocked-by-hook"
  /**
   * The conversation already fits inside the recent-tail budget, so there is
   * nothing older than the kept tail to replace. This is the common case: a
   * conversation that is growing but has not yet outgrown what compaction would
   * have kept anyway.
   */
  | "fits-budget"
  /**
   * The context has not yet outgrown its window, so there is nothing to do
   * until it does. Reported only by a caller that asked for the threshold to be
   * applied; an explicit `/compact` bypasses it.
   */
  | "below-threshold"
  /**
   * There is history to replace, but nowhere legal to cut it: every candidate
   * boundary would strand a tool call from its result. Rare, and worth telling
   * apart from "fits budget" because the remedy differs — the conversation is
   * not too small, its calls are simply all still open.
   */
  | "no-legal-cut"
  /** The summary would cost at least what it replaces, so the context could only grow. */
  | "would-not-shrink"
  /** The summarizer produced nothing usable. */
  | "unsummarized"
  /** A previous step may already have been sent; replaying it is not authorized. */
  | "step-unknown"
  | "cancelled";

export type CondenseOutcome =
  | ({ readonly status: "condensed" } & CondensedContext)
  | { readonly status: "declined"; readonly reason: CompactionDecline };

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
 * Reports a decline, rather than nothing, whenever there was no condensation to
 * make: a caller that can speak to the user has to tell "there was nothing worth
 * replacing" apart from "the summarizer failed".
 */
export interface CondenseInput {
  readonly messages: readonly AgentMessage[];
  readonly policy: CompactionPolicy;
  readonly summarize: SummarizeHistory;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
  readonly signal?: AbortSignal;
  /** What the user asked the summary to pay attention to, if anything. */
  readonly instructions?: string;
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
  /**
   * Before generation may refuse it; callers dispatch after only following verified commit.
   *
   * Both entry points pass one so a hook sees the same event with the same
   * `reason` whether the user typed `/compact` or the window filled up.
   */
  readonly lifecycle?: CompactionLifecycle;
  /**
   * Which trigger this is, for the lifecycle hooks.
   *
   * Separate from `lifecycle` because the reason is a fact about the call while
   * the lifecycle is the mechanism reporting it, and a caller that supplies a
   * lifecycle without a reason is the manual case.
   */
  readonly lifecycleReason?: CompactionReason;
  /** Durable step identity; absent disables cross-restart reuse (tests, callers without a session). */
  readonly operation?: Omit<CompactionOperationInput, "policyDigest">;
}

const pendingCompactions = new Map<string, Promise<CondenseOutcome>>();

/** Identical work in this process joins one generation; other processes consult durable claims. */
export async function condenseContext(input: CondenseInput): Promise<CondenseOutcome> {
  const original = freezeDeep(structuredClone(input.messages));
  const source = input.operation?.source;
  // Triggering uses the caller's complete request; generation uses the same
  // captured stored conversation for manual, automatic and overflow callers.
  if (source && !input.force && isBelowThreshold(original, input.policy)) {
    return { status: 'declined', reason: 'below-threshold' };
  }
  const captured = { ...input, messages: source ? freezeDeep(structuredClone(source.history)) : original,
    ...(source ? { force: true } : {}),
    policy: Object.freeze({ ...input.policy }), operation: input.operation && freezeDeep({ ...input.operation }) };
  const key = captured.operation ? digest([{ ...captured.operation,
    source: captured.operation.source && { sessionId: captured.operation.source.sessionId,
      identity: captured.operation.source.replayIdentity ?? captured.operation.source.identity } },
    captured.messages, captured.instructions, captured.policy.summaryIdentity,
    captured.policy.contextWindow, captured.policy.inputLimit, captured.policy.reserveTokens,
    captured.policy.outputTokens, captured.policy.keepRecentTokens, captured.policy.segmentTokens,
    captured.policy.enabled, Boolean(captured.summarizeTurnPrefix)]) : undefined;
  const joined = key ? pendingCompactions.get(key) : undefined;
  const pending = joined ?? generateContext(captured);
  if (key && !joined) pendingCompactions.set(key, pending);
  try {
    const result = await pending;
    if (input.signal?.aborted) return { status: 'declined', reason: 'cancelled' };
    if (result.status !== 'condensed' || !source) return result;
    // Shared generation never shares a caller's runtime system prefix or opening
    // envelope. Rebuild its checkpoint and exact kept tail from that caller.
    const offset = original.length - captured.messages.length;
    const plan = { ...result.plan, cut: result.plan.cut + offset,
      turnStart: result.plan.turnStart < 0 ? -1 : result.plan.turnStart + offset,
      tokensBefore: input.force ? estimateTokens(original)
        : input.policy.measureContextTokens?.(original, input.policy.promptIdentity) ?? estimateRequestTokens(original, input.policy.overhead) };
    const messages = applyCompaction(original, plan, result.summary);
    return { ...result, plan, messages, tokensAfter: estimateTokens(messages) };
  } finally {
    if (key && !joined && pendingCompactions.get(key) === pending) pendingCompactions.delete(key);
  }
}

async function generateContext(input: CondenseInput): Promise<CondenseOutcome> {
  const plan = input.force
    ? planCompactionCut(input.messages, input.policy)
    : planCompaction(input.messages, input.policy);
  if (!plan) {
    // Which refusal this is matters to whoever reads it. An explicit `/compact`
    // skips the threshold, so its refusal is always about the conversation's
    // shape; a scheduled step can also be refusing because nothing is due yet.
    if (!input.force && isBelowThreshold(input.messages, input.policy)) {
      return { status: "declined", reason: "below-threshold" };
    }
    return { status: "declined", reason: explainNoCut(input.messages, input.policy) };
  }
  // A leading system message is carried over verbatim by applyCompaction, so
  // summarizing it as well would pay to restate what is still there.
  const head = input.messages[0]?.role === "system" ? 1 : 0;
  // A conversation that was compacted before opens with the checkpoint that
  // compaction left. That text is already a summary, so it travels back to the
  // summarizer as the summary to revise rather than as history to condense —
  // condensing a condensation sheds a little of it on every pass.
  const existing = input.messages[head];
  const previousSummary = existing ? readContextCheckpoint(messageToText(existing.content)) : undefined;
  const historyStart = previousSummary === undefined ? head : head + 1;
  // When the cut sits inside a turn, that turn's opening message is neither kept
  // nor part of the older history, so the history stops where the turn begins
  // and the opener is summarized separately.
  const historyEnd = plan.splitsTurn ? plan.turnStart : plan.cut;
  // Asked before the summary is requested, so a refusal costs nothing. The
  // tokens are the same estimate the rest of this function works from.
  const proceed = await input.lifecycle?.before?.({
    reason: input.lifecycleReason ?? "manual",
    tokensBefore: plan.tokensBefore,
    messageCount: input.messages.length,
  });
  if (proceed === false) {
    return { status: "declined", reason: "blocked-by-hook" };
  }

  const history = input.messages.slice(historyStart, historyEnd);
  const prefix = plan.splitsTurn ? input.messages.slice(Math.max(plan.turnStart, head), plan.cut) : [];
  const operation = input.operation ? { ...input.operation,
    policyDigest: digest([input.policy.contextWindow, input.policy.reserveTokens, input.policy.outputTokens, input.policy.keepRecentTokens,
      input.policy.enabled, input.policy.summaryIdentity, input.policy.segmentTokens, input.instructions, plan,
      'bounded-segments-v2', Boolean(input.summarizeTurnPrefix),
      input.messages]) } : undefined;
  let summary: string | undefined;
  try {
    summary = await generateCompaction({ history, prefix, previousSummary, instructions: input.instructions,
      signal: input.signal, maxTokens: input.policy.segmentTokens, operation,
      summarize: input.summarize, summarizeTurnPrefix: input.summarizeTurnPrefix });
  } catch (error) {
    if (input.signal?.aborted) return { status: 'declined', reason: 'cancelled' };
    if (error instanceof CompactionStepUnknown) return { status: 'declined', reason: 'step-unknown' };
    throw error;
  }
  if (input.signal?.aborted) return { status: 'declined', reason: 'cancelled' };
  if (!summary) {
    return { status: "declined", reason: "unsummarized" };
  }
  const messages = applyCompaction(input.messages, plan, summary);
  // A compaction earns its cost by leaving the context smaller than it found
  // it. Both sides are measured the same way — an estimate against an estimate
  // — because the comparison is between two contexts and the provider has
  // measured neither. A summary can be larger than what it replaces when the
  // history it condenses was mostly short messages, which is how a context
  // grows on every pass instead of shrinking.
  const before = estimateTokens(input.messages);
  const after = estimateTokens(messages);
  if (after >= before) {
    return { status: "declined", reason: "would-not-shrink" };
  }
  // The head the checkpoint replaces spans from the first message it discards
  // to the cut, which includes any earlier checkpoint it was merged with.
  const summarized = plan.cut - head;
  return { status: "condensed", plan, summary, messages, summarized, tokensAfter: after };
}

export function applyCompaction(
  messages: readonly AgentMessage[],
  plan: CompactionPlan,
  summary: string,
): AgentMessage[] {
  const checkpoint: AgentMessage = {
    role: "user",
    content: formatContextCheckpoint(summary),
  };
  const head = messages[0]?.role === "system" ? [messages[0]] : [];
  return [...head, checkpoint, ...messages.slice(plan.cut)];
}

export interface CompactionStepOptions {
  readonly summarize: SummarizeHistory;
  readonly authority?: CompactionAuthority;
  /** Enables durable step reuse across restarts; absent keeps the old in-memory behaviour. */
  readonly sessionId?: string;
  readonly provider?: string;
  readonly model?: string;
  readonly summarizeTurnPrefix?: SummarizeTurnPrefix;
  readonly onError?: (error: unknown) => void;
  readonly onCompact?: (input: {
    readonly summary: string;
    readonly keptMessages: number;
    readonly tokensBefore: number;
  }) => void | boolean;
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
  const step = async (snapshot: NextStepSnapshot, signal?: AbortSignal): Promise<NextStepUpdate | undefined> => {
    if (signal?.aborted) {
      return undefined;
    }
    // A compaction whose size is known before the summary is requested can be
    // refused by the caller without paying for a summary that gets thrown away.
    const tokensBefore = planCompaction(snapshot.messages, policy)?.tokensBefore;
    if (tokensBefore === undefined) {
      return undefined;
    }
    // The lifecycle travels into `condenseContext` rather than being invoked
    // here: one place dispatches the hooks, so the manual and automatic paths
    // cannot report different payloads for the same event.
    let condensed: CondenseOutcome;
    let source: CompactionSource | undefined;
    try {
      source = options.authority?.capture(snapshot.messages);
      condensed = await condenseContext({
        messages: snapshot.messages,
        policy,
        summarize: options.summarize,
        summarizeTurnPrefix: options.summarizeTurnPrefix,
        signal,
        ...(options.lifecycle ? { lifecycle: options.lifecycle } : {}),
        lifecycleReason: reason,
        ...(options.sessionId ? { operation: { sessionId: options.sessionId,
          ...(source ? { source } : {}), ...(options.authority?.identity ? { identity: options.authority.identity } : {}),
          ...(options.provider ? { provider: options.provider } : {}), ...(options.model ? { model: options.model } : {}) } } : {}),
      });
    } catch (error) {
      if (error instanceof ModelAdmissionError) throw error;
      if (signal?.aborted) {
        return undefined;
      }
      options.onError?.(error);
      return undefined;
    }
    // A decline is not a failure: the engine found the context either too small
    // to cut or a summary that would not pay for itself. Either way the step
    // runs on the context it already has.
    if (condensed.status === "declined") {
      return undefined;
    }
    if (signal?.aborted) return undefined;
    const { plan, summary } = condensed;
    if (source && options.authority) {
      const committed = options.authority.commit({ source, summary, keptMessages: plan.keptMessages,
        tokensBefore: plan.tokensBefore, signal, admission: options.authority.admission });
      if (committed.status === 'unverified') throw new CompactionPublicationError();
      if (committed.status !== 'committed') return undefined;
    }
    if (options.onCompact?.({ summary, keptMessages: plan.keptMessages, tokensBefore: plan.tokensBefore }) === false) return undefined;
    await options.lifecycle?.after?.({ reason, summary, keptMessages: plan.keptMessages, tokensBefore: plan.tokensBefore });
    return { messages: condensed.messages };
  };
  return step;
}

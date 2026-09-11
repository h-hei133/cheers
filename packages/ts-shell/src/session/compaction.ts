import type { NextStepSnapshot, NextStepUpdate } from "../core/agent/loop.js";
import type { AgentMessage } from "../core/agent/state.js";
import { DEFAULT_RESERVE_TOKENS, estimateTokens } from "./context.js";

export const KEEP_RECENT_MESSAGES = 4;

export interface CompactionPolicy {
  readonly contextWindow: number;
  readonly reserveTokens?: number;
  readonly keepRecentMessages?: number;
  readonly enabled?: boolean;
}

export interface CompactionPlan {
  readonly cut: number;
  readonly keptMessages: number;
  readonly tokensBefore: number;
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

export function findCompactionCut(
  messages: readonly AgentMessage[],
  keepRecent: number,
): number | undefined {
  for (let index = messages.length - keepRecent; index >= 2; index -= 1) {
    if (messages[index]?.role !== "user") {
      continue;
    }
    if (hasDanglingCalls(messages, index)) {
      continue;
    }
    return index;
  }
  return undefined;
}

function hasDanglingCalls(messages: readonly AgentMessage[], cut: number): boolean {
  const headCalls = new Set<string>();
  for (const message of messages.slice(0, cut)) {
    for (const call of message.tool_calls ?? []) {
      headCalls.add(call.id);
    }
  }
  if (headCalls.size === 0) {
    return false;
  }
  const tailResults = new Set<string>();
  for (const message of messages.slice(cut)) {
    if (message.tool_call_id) {
      tailResults.add(message.tool_call_id);
    }
  }
  for (const id of headCalls) {
    if (!tailResults.has(id)) {
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
  const keepRecent = policy.keepRecentMessages ?? KEEP_RECENT_MESSAGES;
  const tokensBefore = estimateTokens(messages);
  if (!shouldCompact(tokensBefore, policy.contextWindow, reserve, policy.enabled ?? true)) {
    return undefined;
  }
  const cut = findCompactionCut(messages, keepRecent);
  if (cut === undefined) {
    return undefined;
  }
  return { cut, keptMessages: messages.length - cut, tokensBefore };
}

export function applyCompaction(
  messages: readonly AgentMessage[],
  plan: CompactionPlan,
  summary: string,
): AgentMessage[] {
  const checkpoint: AgentMessage = {
    role: "user",
    content: `[Context checkpoint: ${summary}]`,
  };
  const head = messages[0]?.role === "system" ? [messages[0]] : [];
  return [...head, checkpoint, ...messages.slice(plan.cut)];
}
export function createCompactionStep(
  policy: CompactionPolicy,
  summarize: SummarizeHistory,
  onError?: (error: unknown) => void,
): (snapshot: NextStepSnapshot, signal?: AbortSignal) => Promise<NextStepUpdate | undefined> {
  return async (snapshot, signal) => {
    if (signal?.aborted) {
      return undefined;
    }
    const plan = planCompaction(snapshot.messages, policy);
    if (!plan) {
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
    return { messages: applyCompaction(snapshot.messages, plan, summary) };
  };
}

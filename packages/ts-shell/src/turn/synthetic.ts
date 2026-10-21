import { messageToText } from "../model-adapters/multimodal.js";
import type { AgentToolCall } from "../core/agent/tools.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { StepFunction } from "./step.js";
import { randomUUID } from "node:crypto";

/**
 * A model that answers without a provider.
 *
 * Test and demonstration runs need the whole turn machinery — persistence,
 * events, terminal state — with nothing on the wire. The reply repeats the
 * prompt so a transcript shows what was asked, and it streams like a real one
 * so the surface exercises the same path.
 *
 * Answering in prose is the default contract: runs that only want the turn
 * machinery must not acquire tool traffic by accident. A run that has to
 * observe the approval boundary or a tool failure needs the model to actually
 * call a tool, so that behaviour is opt-in through `toolIntent` — it names the
 * tools this run may request, and only a prompt that matches one of them turns
 * into a call. Nothing else changes.
 */
export function createSyntheticStep(options?: {
  /**
   * Tools this synthetic run may call, keyed by the phrase that requests them.
   * Absent means the run never calls a tool.
   */
  readonly toolIntent?: readonly SyntheticToolIntent[];
}): StepFunction {
  const toolIntent = options?.toolIntent ?? [];
  const identity = randomUUID();
  return async (messages, signal, listener) => {
    if (signal?.aborted) {
      return { text: "", toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
    }
    const prompt = lastUserText(messages);
    const call = nextToolCall(messages, prompt, toolIntent, identity);
    if (call) {
      const text = `Synthetic tool call: ${call.name}`;
      for (const piece of text.match(/\S+\s*/g) ?? [text]) listener.onText?.(piece);
      return { text, toolCalls: [call], stopReason: "stop" };
    }
    const text = `Synthetic reply: ${prompt}`;
    for (const piece of text.match(/\S+\s*/g) ?? [text]) listener.onText?.(piece);
    return { text, toolCalls: [], stopReason: "stop" };
  };
}

/**
 * The next planned call after the tool results already returned for this user
 * turn. A new user message starts a new plan; an outstanding call must receive
 * its result before another step can be emitted.
 */
function nextToolCall(
  messages: readonly AgentMessage[],
  prompt: string,
  intents: readonly SyntheticToolIntent[],
  identity: string,
): AgentToolCall | undefined {
  const intent = matchToolIntent(prompt, intents);
  if (!intent) return undefined;
  const steps = intent.sequence?.(prompt) ?? [{ name: intent.name, args: intent.args(prompt) }];
  const current = currentTurnMessages(messages);
  const calls = current.flatMap(message => message.role === "assistant" ? message.tool_calls ?? [] : []);
  const results = new Set(current.flatMap(message => message.role === "tool" && message.tool_call_id ? [message.tool_call_id] : []));
  if (calls.some(call => !results.has(call.id))) return undefined;
  let completed = 0;
  for (const call of calls) {
    if (call.function.name === steps[completed]?.name) completed++;
  }
  const step = steps[completed];
  if (!step) return undefined;
  const id = `synthetic-${identity}-${messages.length - current.length}-${step.name}-${completed + 1}`;
  return {
    id,
    name: step.name,
    args: step.args,
  };
}

/** Messages returned since the latest user message. */
function currentTurnMessages(messages: readonly AgentMessage[]): readonly AgentMessage[] {
  let lastUser = -1;
  for (let index = messages.length - 1; index >= 0; index--) {
    if (messages[index]!.role === "user") {
      lastUser = index;
      break;
    }
  }
  return messages.slice(lastUser + 1);
}

/** One opt-in mapping from a prompt phrase to the tool call it should produce. */
export interface SyntheticToolIntent {
  /** Lowercased substring that marks the prompt as requesting this tool. */
  readonly phrase: string;
  /** Tool name the call targets. */
  readonly name: string;
  /** Argument resolver, given the matched prompt. */
  readonly args: (prompt: string) => unknown;
  /**
   * Optional bounded plan. When omitted, the single name/args pair is the plan.
   * Each tool result advances exactly one step.
   */
  readonly sequence?: (prompt: string) => readonly SyntheticToolStep[];
}

/** One call in a synthetic multi-step plan. */
export interface SyntheticToolStep {
  readonly name: string;
  readonly args: unknown;
}

/** The first intent whose phrase appears in the prompt. */
function matchToolIntent(
  prompt: string,
  intents: readonly SyntheticToolIntent[],
): SyntheticToolIntent | undefined {
  const haystack = prompt.toLowerCase();
  for (const intent of intents) {
    if (haystack.includes(intent.phrase)) return intent;
  }
  return undefined;
}

function lastUserText(messages: readonly AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    // The opening message carries an environment line ahead of the prompt.
    return stripPromptContext(messageToText(message.content));
  }
  return "";
}

/** Remove the runtime-owned opening sections without treating them as user intent. */
function stripPromptContext(content: string): string {
  let text = content.trim();
  if (text.startsWith("[Environment Context:")) {
    const separator = text.indexOf("\n\n");
    if (separator >= 0) text = text.slice(separator + 2);
  }
  if (text.startsWith("Recorded session facts (historical context, not current authorization):")) {
    const instruction = "- instruction: use this continuity context to continue the same task; do not restart from scratch.";
    const instructionIndex = text.indexOf(instruction);
    if (instructionIndex >= 0) {
      const separator = text.indexOf("\n\n", instructionIndex + instruction.length);
      if (separator >= 0) text = text.slice(separator + 2);
    }
  }
  return text.trim();
}

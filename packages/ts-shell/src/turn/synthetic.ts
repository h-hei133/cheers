import type { AgentToolCall } from "../core/agent/tools.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { StepFunction } from "./step.js";

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
  return async (messages, signal, listener) => {
    if (signal?.aborted) {
      return { text: "", toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
    }
    const prompt = lastUserText(messages);
    // Ask once. A second pass means the call already ran, so the run finishes
    // with prose instead of asking again — otherwise the tool gate would see an
    // identical repeated call and stop it as a loop.
    const call = alreadyCalled(messages) ? undefined : matchToolIntent(prompt, toolIntent);
    if (call) {
      const text = `Synthetic tool call: ${call.name}`;
      for (const piece of text.match(/\S+\s*/g) ?? [text]) listener.onText?.(piece);
      return { text, toolCalls: [call], stopReason: "stop" };
    }
    const text = `Synthetic reply: ${prompt}`;
    for (const piece of text.match(/\S+\s*/g) ?? [text]) listener.onText?.(piece);
    return { text, toolCalls: [], stopReason: "stop" };
}

/** Whether any tool has already produced a result in this conversation. */
function alreadyCalled(messages: readonly AgentMessage[]): boolean {
  return messages.some((message) => message.role === "tool");
}
}

/** One opt-in mapping from a prompt phrase to the tool call it should produce. */
export interface SyntheticToolIntent {
  /** Lowercased substring that marks the prompt as requesting this tool. */
  readonly phrase: string;
  /** Tool name the call targets. */
  readonly name: string;
  /** Argument resolver, given the matched prompt. */
  readonly args: (prompt: string) => unknown;
}

/** The first intent whose phrase appears in the prompt, as a call. */
function matchToolIntent(
  prompt: string,
  intents: readonly SyntheticToolIntent[],
): AgentToolCall | undefined {
  const haystack = prompt.toLowerCase();
  for (const intent of intents) {
    if (!haystack.includes(intent.phrase)) continue;
    return {
      id: `synthetic-${intent.name}`,
      name: intent.name,
      args: intent.args(prompt),
    };
  }
  return undefined;
}

function lastUserText(messages: readonly AgentMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role !== "user") continue;
    // The opening message carries an environment line ahead of the prompt.
    const lines = message.content.split("\n");
    return (lines[0]?.startsWith("[Environment Context:") ? lines.slice(1).join("\n") : message.content).trim();
  }
  return "";
}

import type { AgentMessage } from "../core/agent/state.js";
import type { StepFunction } from "./step.js";

/**
 * A model that answers without a provider.
 *
 * Test and demonstration runs need the whole turn machinery — persistence,
 * events, terminal state — with nothing on the wire. The reply repeats the
 * prompt so a transcript shows what was asked, and it streams like a real one
 * so the surface exercises the same path.
 */
export function createSyntheticStep(): StepFunction {
  return async (messages, signal, listener) => {
    if (signal?.aborted) {
      return { text: "", toolCalls: [], stopReason: "aborted", errorMessage: "Operation aborted" };
    }
    const prompt = lastUserText(messages);
    const text = `Synthetic reply: ${prompt}`;
    for (const piece of text.match(/\S+\s*/g) ?? [text]) listener.onText?.(piece);
    return { text, toolCalls: [], stopReason: "stop" };
  };
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

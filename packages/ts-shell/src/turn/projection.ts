import type { AgentLifecycleEvent } from "../core/agent/events.js";
import type { AgentMessage } from "../core/agent/state.js";
import type { QueryEvent } from "../core/query/runtime/events.js";
import { isOverflowFailure } from "./step.js";

/**
 * Kernel events in the shape the shell already reads.
 *
 * The kernel reports its lifecycle; the shell renders tool cards, persists a
 * transcript, and decides terminal state from query events. Mapping one to the
 * other here means the consumers did not have to change when the engine did.
 */

/** How much of a tool's output travels to its card in the transcript. */
export const CARD_OUTPUT_LIMIT = 8_000;

export class TurnProjection {
  /** Calls that have started and not yet reported a result, by id. */
  private readonly openCalls = new Map<string, { name: string; isError: boolean }>();
  private steps = 0;

  /** Steps the model has taken in this run. */
  get stepCount(): number {
    return this.steps;
  }

  /** The query events one kernel event maps to, in order. */
  project(event: AgentLifecycleEvent): QueryEvent[] {
    switch (event.type) {
      case "turn_start":
        // Counted, not reported: a started-but-unfinished turn in the transcript
        // reads as a mid-turn interruption to session recovery, and the model
        // step is not what that recovery boundary means.
        this.steps += 1;
        return [];
      case "tool_execution_start":
        this.openCalls.set(event.toolCallId, { name: event.toolName, isError: false });
        return [
          {
            type: "tool.started",
            toolName: event.toolName,
            taskId: event.toolCallId,
            ...(isRecord(event.args) ? { args: event.args } : {}),
          },
        ];
      case "tool_execution_end": {
        const open = this.openCalls.get(event.toolCallId);
        if (open) open.isError = event.isError;
        return [];
      }
      case "message_end": {
        const message = event.message;
        if (message.role !== "tool" || !message.tool_call_id) return [];
        const open = this.openCalls.get(message.tool_call_id);
        this.openCalls.delete(message.tool_call_id);
        const isError = open?.isError ?? false;
        const output = message.content ?? "";
        return [
          {
            type: "tool.result",
            toolName: open?.name ?? "tool",
            taskId: message.tool_call_id,
            success: !isError,
            ...(isError ? { failureReason: output.slice(0, 120) } : {}),
            // The whole output, bounded: a card the user can open is only worth
            // opening if what the tool actually printed is behind it.
            output: output.slice(0, CARD_OUTPUT_LIMIT),
          },
        ];
      }
      default:
        return [];
    }
  }
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** How a finished run is reported to the shell. */
export type RunOutcome =
  | { readonly kind: "failed"; readonly error: string }
  | {
      readonly kind: "completed";
      readonly finalOutput: string;
      /** The answer was written here because the model said nothing. */
      readonly explained: boolean;
      readonly completed: Extract<QueryEvent, { type: "query.completed" }>;
    };

/**
 * The terminal event for a run, from what the conversation holds.
 *
 * A failed last step is a failed run. A run that ended without an answer is
 * reported honestly rather than summarized: the last tool's output if tools
 * ran, otherwise the step's own account of the silence.
 */
export function concludeRun(messages: readonly AgentMessage[], prompt: string, sessionId: string, steps: number): RunOutcome {
  const last = [...messages].reverse().find((message) => message.role === "assistant");
  if (last?.stopReason === "error") {
    return {
      kind: "failed",
      error: isOverflowFailure(last)
        ? "Context overflow error: could not compact context automatically."
        : (last.errorMessage ?? "The model call failed."),
    };
  }
  const explained = !last?.content;
  const finalOutput = last?.content || explainSilence(messages, last?.errorMessage);
  return {
    kind: "completed",
    finalOutput,
    explained,
    completed: {
      type: "query.completed",
      result: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
        transcript: [],
        sharedContext: { sessionId, initialPrompt: prompt, notes: [`steps: ${steps}`], handoffs: [] },
        finalOutput,
      },
    },
  };
}

function explainSilence(messages: readonly AgentMessage[], stepExplanation: string | undefined): string {
  const lastTool = [...messages].reverse().find((message) => message.role === "tool");
  if (lastTool?.content) {
    return `The tools ran but no answer followed. What the last one returned:\n\n${lastTool.content.slice(0, 1000)}`;
  }
  return stepExplanation ?? "The model returned nothing at all. Ask again, or check the provider with `/connect`.";
}

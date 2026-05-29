import { createEvidenceOnlySavePoint, type RuntimeEvidenceSavePoint } from "../../evidence/runtimeSavePoint.js";
import { createRuntimeTurnSnapshot, type RuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import { projectRuntimeEvents, type RuntimeProjectionEvent } from "../events/runtimeEventProjection.js";
import type { RuntimeExecutionReceiptProjection } from "../execution/executionReceipt.js";

export type ReferenceAgentLoopState =
  | "idle"
  | "starting"
  | "turn_running"
  | "awaiting_tool_results"
  | "saving_point"
  | "preparing_next_turn"
  | "waiting_for_follow_up"
  | "stopped"
  | "aborted"
  | "failed";

export type ReferenceLoopDeliveryMode = "steer" | "follow-up" | "next-turn";
export type ReferenceLoopStopReason =
  | "model-stop"
  | "tool-batch-terminated"
  | "turn-limit"
  | "follow-up-drained";

export interface ReferenceLoopQueuedMessage {
  readonly id: string;
  readonly mode: ReferenceLoopDeliveryMode;
  readonly text: string;
}

export interface ReferenceLoopToolCallRequest {
  readonly id: string;
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}

export interface ReferenceLoopPreparedToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentKeys: readonly string[];
}

export interface ReferenceLoopToolCallBatch {
  readonly id: string;
  readonly turn: number;
  readonly policy: "sequential" | "parallel" | "metadata-only";
  readonly calls: readonly ReferenceLoopPreparedToolCall[];
}

export interface ReferenceLoopToolResultBatch {
  readonly id: string;
  readonly callBatchId: string;
  readonly results: readonly ToolExecutionResult[];
  readonly executionReceipts: readonly RuntimeExecutionReceiptProjection[];
  readonly failedToolCallIds: readonly string[];
  readonly terminate: boolean;
}

export interface ReferenceLoopModelResponseBoundary {
  readonly responseId: string;
  readonly stopReason: "stop" | "tool-calls" | "aborted" | "failed";
  readonly toolCalls?: readonly ReferenceLoopToolCallRequest[];
  readonly safeSummary?: string;
  readonly notProvenClaims?: readonly string[];
}

export interface ReferenceLoopTurnInput {
  readonly sessionId: string;
  readonly turn: number;
  readonly prompt: string;
  readonly deliveredMessages: readonly ReferenceLoopQueuedMessage[];
  readonly pendingNextTurnFacts: readonly string[];
  readonly abortSignal?: AbortSignal;
}

export interface ReferenceAgentLoopInput {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly providerOptIn: boolean;
  readonly providerMode?: "synthetic" | "real" | "default";
  readonly modelLabel?: string;
  readonly maxTurns?: number;
  readonly queuedMessages?: readonly ReferenceLoopQueuedMessage[];
  readonly toolBatchPolicy?: "sequential" | "parallel" | "metadata-only";
  readonly modelBoundary: (
    input: ReferenceLoopTurnInput,
  ) => Promise<ReferenceLoopModelResponseBoundary>;
  readonly toolBatchBoundary?: (
    batch: ReferenceLoopToolCallBatch,
  ) => Promise<ReferenceLoopToolResultBatch>;
  readonly abortSignal?: AbortSignal;
}

export interface ReferenceAgentLoopProjection {
  readonly state: ReferenceAgentLoopState;
  readonly stopReason?: ReferenceLoopStopReason;
  readonly failureClass?: "model-boundary" | "tool-batch-boundary";
  readonly turns: readonly ReferenceLoopTurnProjection[];
  readonly pendingDelivery: {
    readonly steer: number;
    readonly followUp: number;
    readonly nextTurn: number;
  };
  readonly events: readonly RuntimeProjectionEvent[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface ReferenceLoopTurnProjection {
  readonly turn: number;
  readonly snapshot: RuntimeTurnSnapshot;
  readonly modelBoundary: {
    readonly responseId: string;
    readonly stopReason: ReferenceLoopModelResponseBoundary["stopReason"];
    readonly toolCallCount: number;
  };
  readonly toolCallBatch?: ReferenceLoopToolCallBatch;
  readonly toolResultBatch?: ReferenceLoopToolResultBatch;
  readonly savePoint: RuntimeEvidenceSavePoint;
  readonly nextTurn: {
    readonly prepared: boolean;
    readonly pendingFacts: readonly string[];
  };
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

const REDACTION_EXCLUSIONS = [
  "api-keys",
  "provider.env",
  "raw-provider-output",
  "oldText",
  "newText",
  "unredacted-command-output",
  "hidden-reasoning",
  "full-transcript",
  "unsafe-file-contents",
] as const;

export async function runReferenceAgentLoop(
  input: ReferenceAgentLoopInput,
): Promise<ReferenceAgentLoopProjection> {
  const events: RuntimeProjectionEvent[] = [];
  const turns: ReferenceLoopTurnProjection[] = [];
  const queued = [...(input.queuedMessages ?? [])];
  const pendingNextTurnFacts: string[] = [];
  const maxTurns = Math.max(1, input.maxTurns ?? 4);
  let state: ReferenceAgentLoopState = "idle";

  const transition = (to: ReferenceAgentLoopState, reason: string) => {
    const from = state;
    state = to;
    appendEvent(events, "agent-loop-state-transitioned", {
      from,
      to,
      reason,
      terminalSuccessClaim: false,
    });
  };

  appendEvent(events, "agent-loop-started", {
    sessionId: input.sessionId,
    maxTurns,
    providerMode: input.providerMode ?? "default",
    providerOptIn: input.providerOptIn,
    terminalSuccessClaim: false,
  });
  for (const message of queued) {
    appendEvent(events, "agent-loop-delivery-queued", {
      mode: message.mode,
      messageId: sanitizeText(message.id),
      textSummary: summarizeText(message.text),
      terminalSuccessClaim: false,
    });
  }
  transition("starting", "prompt-received");

  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      if (input.abortSignal?.aborted) {
        transition("aborted", "abort-before-turn");
        appendEvent(events, "agent-loop-aborted", {
          turn,
          reason: "abort-before-turn",
          terminalSuccessClaim: false,
        });
        return finalizeProjection("aborted", turns, events, queued);
      }

      const delivered = drainDeliveryForTurn(queued, turn);
      for (const message of delivered) {
        appendEvent(events, "agent-loop-delivery-delivered", {
          turn,
          mode: message.mode,
          messageId: sanitizeText(message.id),
          textSummary: summarizeText(message.text),
          terminalSuccessClaim: false,
        });
      }

      transition("turn_running", `turn-${turn}-started`);
      const snapshot = createRuntimeTurnSnapshot({
        sessionId: input.sessionId,
        turn,
        phase: "turn",
        workspaceRoot: input.workspaceRoot,
        providerOptIn: input.providerOptIn,
        providerMode: input.providerMode,
        modelLabel: input.modelLabel,
        evidenceCorrelationIds: pendingNextTurnFacts,
      });
      appendProjectedEvents(events, projectRuntimeEvents({ turnSnapshot: snapshot }));
      appendEvent(events, "agent-loop-turn-started", {
        turn,
        snapshotId: snapshot.id,
        deliveredMessageCount: delivered.length,
        pendingNextTurnFactCount: pendingNextTurnFacts.length,
        terminalSuccessClaim: false,
      });

      const modelBoundary = await input.modelBoundary({
        sessionId: input.sessionId,
        turn,
        prompt: turn === 1 ? input.prompt : "",
        deliveredMessages: delivered,
        pendingNextTurnFacts,
        abortSignal: input.abortSignal,
      });
      appendEvent(events, "agent-loop-model-boundary-observed", {
        turn,
        responseId: sanitizeText(modelBoundary.responseId),
        stopReason: modelBoundary.stopReason,
        safeSummary: modelBoundary.safeSummary
          ? summarizeText(modelBoundary.safeSummary)
          : undefined,
        toolCallCount: modelBoundary.toolCalls?.length ?? 0,
        terminalSuccessClaim: false,
      }, ["terminal-success", ...(modelBoundary.notProvenClaims ?? [])]);

      if (modelBoundary.stopReason === "aborted" || input.abortSignal?.aborted) {
        transition("aborted", "model-boundary-aborted");
        appendEvent(events, "agent-loop-aborted", {
          turn,
          responseId: sanitizeText(modelBoundary.responseId),
          terminalSuccessClaim: false,
        });
        return finalizeProjection("aborted", turns, events, queued);
      }
      if (modelBoundary.stopReason === "failed") {
        transition("failed", "model-boundary-failed");
        appendEvent(events, "agent-loop-failed", {
          turn,
          failureClass: "model-boundary",
          responseId: sanitizeText(modelBoundary.responseId),
          terminalSuccessClaim: false,
        });
        return finalizeProjection("failed", turns, events, queued, {
          failureClass: "model-boundary",
        });
      }

      const toolCalls = modelBoundary.toolCalls ?? [];
      let toolCallBatch: ReferenceLoopToolCallBatch | undefined;
      let toolResultBatch: ReferenceLoopToolResultBatch | undefined;
      if (toolCalls.length > 0) {
        transition("awaiting_tool_results", `turn-${turn}-tool-call-batch`);
        toolCallBatch = {
          id: `${snapshot.id}:tool-call-batch`,
          turn,
          policy: input.toolBatchPolicy ?? "metadata-only",
          calls: Object.freeze(toolCalls.map(prepareToolCall)),
        };
        appendEvent(events, "agent-loop-tool-call-batch-observed", {
          turn,
          batchId: toolCallBatch.id,
          policy: toolCallBatch.policy,
          toolCallCount: toolCallBatch.calls.length,
          toolNames: toolCallBatch.calls.map((call) => call.name),
          terminalSuccessClaim: false,
        });
        if (!input.toolBatchBoundary) {
          transition("failed", "tool-batch-boundary-missing");
          appendEvent(events, "agent-loop-failed", {
            turn,
            failureClass: "tool-batch-boundary",
            reason: "tool-batch-boundary-not-provided",
            terminalSuccessClaim: false,
          });
          return finalizeProjection("failed", turns, events, queued, {
            failureClass: "tool-batch-boundary",
          });
        }
        try {
          toolResultBatch = await input.toolBatchBoundary(toolCallBatch);
        } catch (error) {
          transition("failed", "tool-batch-boundary-failed");
          appendEvent(events, "agent-loop-failed", {
            turn,
            failureClass: "tool-batch-boundary",
            errorClass: error instanceof Error ? error.name : "unknown",
            terminalSuccessClaim: false,
          });
          return finalizeProjection("failed", turns, events, queued, {
            failureClass: "tool-batch-boundary",
          });
        }
        appendEvent(events, "agent-loop-tool-result-batch-observed", {
          turn,
          batchId: toolResultBatch.id,
          callBatchId: toolResultBatch.callBatchId,
          resultCount: toolResultBatch.results.length,
          failedToolCallIds: toolResultBatch.failedToolCallIds,
          executionReceiptCount: toolResultBatch.executionReceipts.length,
          terminate: toolResultBatch.terminate,
          terminalSuccessClaim: false,
        });
        appendProjectedEvents(
          events,
          projectRuntimeEvents({
            executionReceipts: toolResultBatch.executionReceipts,
            toolResults: toolResultBatch.results,
          }),
        );
      }

      transition("saving_point", `turn-${turn}-save-point`);
      const savePoint = createEvidenceOnlySavePoint({
        turnSnapshot: snapshot,
        phase: "save_point",
        executionReceipts: toolResultBatch?.executionReceipts,
        evidenceIds: [
          `model-boundary:${modelBoundary.responseId}`,
          ...(toolResultBatch ? [`tool-result-batch:${toolResultBatch.id}`] : []),
        ],
        pendingNextTurnFacts: [
          `turn:${turn}`,
          `model-response:${modelBoundary.stopReason}`,
          ...(toolResultBatch
            ? [`tool-result-count:${toolResultBatch.results.length}`]
            : []),
        ],
        notProvenClaims: [
          "terminal-success",
          "loop-reference-only",
          ...(modelBoundary.notProvenClaims ?? []),
        ],
      });
      appendEvent(events, "agent-loop-save-point-requested", {
        turn,
        savePointId: savePoint.id,
        terminalSuccessClaim: savePoint.terminalSuccessClaim,
        resultProjectionStatus: savePoint.resultProjectionStatus,
      }, savePoint.notProvenClaims);
      appendProjectedEvents(events, projectRuntimeEvents({ savePoint }));

      transition("preparing_next_turn", `turn-${turn}-next-turn`);
      pendingNextTurnFacts.splice(0, pendingNextTurnFacts.length, ...savePoint.pendingNextTurnFacts);
      appendEvent(events, "agent-loop-next-turn-prepared", {
        turn,
        pendingFactCount: pendingNextTurnFacts.length,
        terminalSuccessClaim: false,
      });

      turns.push(deepFreeze({
        turn,
        snapshot,
        modelBoundary: {
          responseId: sanitizeText(modelBoundary.responseId),
          stopReason: modelBoundary.stopReason,
          toolCallCount: toolCalls.length,
        },
        ...(toolCallBatch ? { toolCallBatch } : {}),
        ...(toolResultBatch ? { toolResultBatch } : {}),
        savePoint,
        nextTurn: {
          prepared: true,
          pendingFacts: Object.freeze([...pendingNextTurnFacts]),
        },
        terminalSuccessClaim: false,
        notProvenClaims: Object.freeze([
          "terminal-success",
          "loop-reference-only",
        ]),
      }));

      if (toolResultBatch?.terminate) {
        transition("stopped", "tool-batch-terminated");
        appendEvent(events, "agent-loop-stopped", {
          turn,
          stopReason: "tool-batch-terminated",
          terminalSuccessClaim: false,
        });
        return finalizeProjection("stopped", turns, events, queued, {
          stopReason: "tool-batch-terminated",
        });
      }

      if (toolCalls.length > 0 && turn < maxTurns) {
        continue;
      }

      transition("waiting_for_follow_up", `turn-${turn}-follow-up-check`);
      const hasFollowUp = queued.some((message) => message.mode === "follow-up");
      if (hasFollowUp && turn < maxTurns) {
        continue;
      }

      const stopReason: ReferenceLoopStopReason = turn >= maxTurns
        ? "turn-limit"
        : hasFollowUp
          ? "follow-up-drained"
          : "model-stop";
      transition("stopped", stopReason);
      appendEvent(events, "agent-loop-stopped", {
        turn,
        stopReason,
        terminalSuccessClaim: false,
      });
      return finalizeProjection("stopped", turns, events, queued, { stopReason });
    }
  } catch (error) {
    transition("failed", "boundary-error");
    appendEvent(events, "agent-loop-failed", {
      failureClass: "model-boundary",
      errorClass: error instanceof Error ? error.name : "unknown",
      terminalSuccessClaim: false,
    });
    return finalizeProjection("failed", turns, events, queued, {
      failureClass: "model-boundary",
    });
  }

  transition("stopped", "turn-limit");
  return finalizeProjection("stopped", turns, events, queued, {
    stopReason: "turn-limit",
  });
}

function drainDeliveryForTurn(
  queued: ReferenceLoopQueuedMessage[],
  turn: number,
): ReferenceLoopQueuedMessage[] {
  const deliverableMode: ReferenceLoopDeliveryMode =
    turn === 1 ? "next-turn" : "follow-up";
  const delivered: ReferenceLoopQueuedMessage[] = [];
  for (let index = 0; index < queued.length;) {
    const message = queued[index];
    if (!message) {
      index += 1;
      continue;
    }
    if (message.mode === "steer" || message.mode === deliverableMode) {
      delivered.push(message);
      queued.splice(index, 1);
      continue;
    }
    index += 1;
  }
  return delivered;
}

function prepareToolCall(
  call: ReferenceLoopToolCallRequest,
): ReferenceLoopPreparedToolCall {
  return deepFreeze({
    id: sanitizeText(call.id),
    name: sanitizeText(call.name),
    argumentKeys: Object.freeze(Object.keys(call.arguments ?? {}).sort()),
  });
}

function appendProjectedEvents(
  target: RuntimeProjectionEvent[],
  projected: readonly RuntimeProjectionEvent[],
): void {
  for (const event of projected) {
    appendEvent(target, event.type, event.facts, event.notProvenClaims);
  }
}

function appendEvent(
  events: RuntimeProjectionEvent[],
  type: RuntimeProjectionEvent["type"],
  facts: Record<string, unknown>,
  notProvenClaims: readonly string[] = ["terminal-success"],
): void {
  const sequence = events.length + 1;
  const sanitizedFacts = sanitizeValue(facts) as Record<string, unknown>;
  events.push(deepFreeze({
    id: `agent-loop-event-${sequence}`,
    sequence,
    type,
    facts: {
      ...sanitizedFacts,
      terminalSuccessClaim: false,
    },
    notProvenClaims: Object.freeze([
      ...new Set(["terminal-success", ...notProvenClaims]),
    ]),
    redaction: {
      status: JSON.stringify(facts) === JSON.stringify(sanitizedFacts)
        ? "report-safe"
        : "redacted",
      excluded: REDACTION_EXCLUSIONS,
    },
  }));
}

function finalizeProjection(
  state: ReferenceAgentLoopState,
  turns: readonly ReferenceLoopTurnProjection[],
  events: readonly RuntimeProjectionEvent[],
  queued: readonly ReferenceLoopQueuedMessage[],
  options: {
    readonly stopReason?: ReferenceLoopStopReason;
    readonly failureClass?: "model-boundary" | "tool-batch-boundary";
  } = {},
): ReferenceAgentLoopProjection {
  return deepFreeze({
    state,
    ...(options.stopReason ? { stopReason: options.stopReason } : {}),
    ...(options.failureClass ? { failureClass: options.failureClass } : {}),
    turns: Object.freeze([...turns]),
    pendingDelivery: {
      steer: queued.filter((message) => message.mode === "steer").length,
      followUp: queued.filter((message) => message.mode === "follow-up").length,
      nextTurn: queued.filter((message) => message.mode === "next-turn").length,
    },
    events: Object.freeze([...events]),
    terminalSuccessClaim: false,
    notProvenClaims: Object.freeze([
      "terminal-success",
      "provider-success",
      "tool-success",
      "save-point-success",
      "result-success",
      "loop-reference-only",
    ]),
  });
}

function summarizeText(value: string): string {
  const sanitized = sanitizeText(value).trim();
  return sanitized.length > 120 ? `${sanitized.slice(0, 120)}...` : sanitized;
}

function sanitizeText(value: string): string {
  return value
    .replace(/\/home\/wang\/\.private-agents-real[^\s"'`]*/g, "[redacted-real-provider-home]")
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [redacted]")
    .replace(/\b(api[_-]?key|token|secret|cookie|authorization|password)\b\s*[:=]\s*\S+/gi, "$1=[redacted]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[secret-redacted]")
    .replace(/\boldText[:=][\s\S]*?(?=\snewText[:=]|$)/gi, "oldText=[raw-content-excluded]")
    .replace(/\bnewText[:=][^\n\r]*/gi, "newText=[raw-content-excluded]")
    .replace(/\braw provider output[:=][^\n\r]*/gi, "raw-provider-output=[raw-content-excluded]")
    .replace(/\bhidden reasoning[:=]?[^\n\r]*/gi, "hidden-reasoning=[raw-content-excluded]")
    .replace(/<html[\s\S]*?<\/html>/gi, "[raw-content-excluded]");
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return sanitizeText(value);
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      if (nested !== undefined && typeof nested !== "function") {
        output[key] = sanitizeValue(nested);
      }
    }
    return output;
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    return null;
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

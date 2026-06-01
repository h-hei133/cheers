import {
  createEvidenceOnlySavePoint,
  prepareToolOutcomeSavePointInput,
  type RuntimeEvidenceSavePoint,
} from "../../evidence/savepoint/model.js";
import {
  createModelRequestBoundary,
  prepareNextTurnModelRequest,
  type NextTurnModelRequestPreparation,
} from "../../provider/request/boundary.js";
import {
  createModelInvocationAttemptEnvelope,
  createModelInvocationGate,
  type ModelInvocationAttemptEnvelope,
  type ModelInvocationGateFacts,
} from "../../provider/request/invocation.js";
import {
  runControlledModelInvocationAdapter,
  type ControlledModelInvocationAdapterProjection,
  type ControlledModelInvocationExecutor,
} from "../../provider/request/attempt.js";
import type { ProviderRegistryProjection } from "../../provider/registry/provider.js";
import { createModelResponseBoundary, type ModelResponseBoundary } from "../../provider/response/boundary.js";
import {
  type RepairApplyRequestObservation,
  type RepairApplyObservation,
  type RepairAuthorityObservation,
  type RepairProposalObservation,
  type RepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";
import { accumulateAssistantResponse, type AssistantResponseState } from "../../turn/assistantResponse.js";
import { evaluateNextTurnDeliveryPolicy, type NextTurnDeliveryPolicyProjection } from "../../turn/deliveryPolicy.js";
import { projectFollowUpQueue, type FollowUpQueueProjection } from "../../turn/followUpQueue.js";
import { prepareNextTurnBundle, type NextTurnBundleProjection } from "../../turn/nextTurnBundle.js";
import { projectSteeringQueue, type SteeringQueueProjection } from "../../turn/steeringQueue.js";
import { prepareToolResultMessages, type ToolResultMessageBatch } from "../../turn/toolResultMessage.js";
import {
  dispatchToolBatch,
  planToolBatchDispatch,
  type ToolBatchDispatchPlan,
  type ToolBatchDispatchSeam,
  type ToolResultDetail,
} from "../../tools/toolBatchDispatch.js";
import {
  createToolOutcomeBundle,
  type ToolOutcomeBundleProjection,
} from "../../tools/toolOutcomeBundle.js";
import type { ToolAfterObservationAnnotation } from "../../tools/policy/interception.js";
import { extractToolCallBatch, type NormalizedToolCallBatch } from "../../tools/toolCallBatch.js";
import { createRuntimeTurnSnapshot, type RuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import {
  observeVerificationResult,
  projectVerificationObservationFromReceipt,
  projectVerificationIntent,
  type VerificationLoopIntent,
  type VerificationResultObservation,
} from "../../verification/result/boundary.js";
import type { ProductVerificationReceipt } from "../../verification/verificationFacade.js";
import { projectRuntimeEvents, type RuntimeProjectionEvent } from "../events/projection.js";
import type { RuntimeExecutionReceiptProjection } from "../execution/receipt.js";
import {
  projectModelResponseReentryCycle,
  type ModelResponseReentryCycleProjection,
} from "./reentry.js";

export type AgentLoopContractState =
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

export type AgentLoopContractDeliveryMode = "steer" | "follow-up" | "next-turn";
export type AgentLoopContractStopReason =
  | "model-stop"
  | "tool-batch-terminated"
  | "turn-limit"
  | "follow-up-drained"
  | "next-turn-waiting";

export interface AgentLoopContractQueuedMessage {
  readonly id: string;
  readonly mode: AgentLoopContractDeliveryMode;
  readonly text: string;
}

export interface AgentLoopContractToolCallRequest {
  readonly id: string;
  readonly name: string;
  readonly arguments?: Record<string, unknown>;
}

export interface AgentLoopContractPreparedToolCall {
  readonly id: string;
  readonly name: string;
  readonly argumentKeys: readonly string[];
  readonly status?: "prepared" | "malformed" | "unsupported" | "unknown";
  readonly dispatchStatus?: "planned" | "blocked" | "authority_required" | "dispatched" | "dispatch_failed" | "unsupported" | "not_dispatched";
}

export interface AgentLoopContractToolCallBatch {
  readonly id: string;
  readonly turn: number;
  readonly policy: "sequential" | "parallel" | "metadata-only";
  readonly calls: readonly AgentLoopContractPreparedToolCall[];
}

export interface AgentLoopContractToolResultBatch {
  readonly id: string;
  readonly callBatchId: string;
  readonly dispatchPlan?: ToolBatchDispatchPlan;
  readonly results: readonly ToolExecutionResult[];
  readonly resultDetails?: readonly ToolResultDetail[];
  readonly resultMessages?: ToolResultMessageBatch;
  readonly outcomeBundle?: ToolOutcomeBundleProjection;
  readonly afterAnnotations?: readonly ToolAfterObservationAnnotation[];
  readonly executionReceipts: readonly RuntimeExecutionReceiptProjection[];
  readonly failedToolCallIds: readonly string[];
  readonly notDispatchedToolCallIds?: readonly string[];
  readonly terminate: boolean;
}

export interface AgentLoopContractModelResponseBoundary {
  readonly responseId: string;
  readonly stopReason: "stop" | "tool-calls" | "aborted" | "failed";
  readonly toolCalls?: readonly AgentLoopContractToolCallRequest[];
  readonly safeSummary?: string;
  readonly responseBoundary?: ModelResponseBoundary;
  readonly assistantResponse?: AssistantResponseState;
  readonly toolCallBatch?: NormalizedToolCallBatch;
  readonly notProvenClaims?: readonly string[];
}

export interface AgentLoopContractTurnInput {
  readonly sessionId: string;
  readonly turn: number;
  readonly prompt: string;
  readonly deliveredMessages: readonly AgentLoopContractQueuedMessage[];
  readonly pendingNextTurnFacts: readonly string[];
  readonly abortSignal?: AbortSignal;
}

export interface AgentLoopContractInput {
  readonly sessionId: string;
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly providerOptIn: boolean;
  readonly providerMode?: "synthetic" | "real" | "default";
  readonly modelLabel?: string;
  readonly providerRegistry?: ProviderRegistryProjection;
  readonly providerId?: string;
  readonly maxTurns?: number;
  readonly queuedMessages?: readonly AgentLoopContractQueuedMessage[];
  readonly toolBatchPolicy?: "sequential" | "parallel" | "metadata-only";
  readonly modelBoundary: (
    input: AgentLoopContractTurnInput,
  ) => Promise<AgentLoopContractModelResponseBoundary>;
  readonly toolBatchBoundary?: (
    batch: AgentLoopContractToolCallBatch,
  ) => Promise<AgentLoopContractToolResultBatch>;
  readonly toolBatchDispatch?: ToolBatchDispatchSeam;
  readonly controlledModelInvocationExecutor?: ControlledModelInvocationExecutor;
  readonly executePreparedNextTurn?: boolean;
  readonly verificationReceipt?: ProductVerificationReceipt;
  readonly verificationRuntimeReceiptIds?: readonly string[];
  readonly verificationBoundary?: (
    input: AgentLoopContractVerificationBoundaryInput,
  ) => Promise<AgentLoopContractVerificationProjection>;
  readonly abortSignal?: AbortSignal;
}

export interface AgentLoopContractVerificationBoundaryInput {
  readonly sessionId: string;
  readonly turn: number;
  readonly turnId: string;
  readonly savePoint: RuntimeEvidenceSavePoint;
  readonly nextTurnBundle?: NextTurnBundleProjection;
  readonly toolResultBatch?: AgentLoopContractToolResultBatch;
}

export interface AgentLoopContractVerificationProjection {
  readonly intent: VerificationLoopIntent;
  readonly result: VerificationResultObservation;
  readonly repairRequired?: RepairRequiredHandoff;
  readonly repairProposal?: RepairProposalObservation;
  readonly repairAuthority?: RepairAuthorityObservation;
  readonly repairApplyRequest?: RepairApplyRequestObservation;
  readonly repairApply?: RepairApplyObservation;
}

export interface AgentLoopContractProjection {
  readonly state: AgentLoopContractState;
  readonly stopReason?: AgentLoopContractStopReason;
  readonly failureClass?: "model-boundary" | "tool-batch-boundary";
  readonly turns: readonly AgentLoopContractTurnProjection[];
  readonly pendingDelivery: {
    readonly steer: number;
    readonly followUp: number;
    readonly nextTurn: number;
  };
  readonly events: readonly RuntimeProjectionEvent[];
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export interface AgentLoopContractTurnProjection {
  readonly turn: number;
  readonly snapshot: RuntimeTurnSnapshot;
  readonly modelBoundary: {
    readonly responseId: string;
    readonly stopReason: AgentLoopContractModelResponseBoundary["stopReason"];
    readonly toolCallCount: number;
    readonly responseStatus?: ModelResponseBoundary["status"];
    readonly responseSource?: ModelResponseBoundary["source"];
    readonly assistantAccumulationStatus?: AssistantResponseState["accumulationStatus"];
  };
  readonly toolCallBatch?: AgentLoopContractToolCallBatch;
  readonly normalizedToolCallBatch?: NormalizedToolCallBatch;
  readonly toolResultBatch?: AgentLoopContractToolResultBatch;
  readonly savePoint: RuntimeEvidenceSavePoint;
  readonly nextTurn: {
    readonly prepared: boolean;
    readonly pendingFacts: readonly string[];
    readonly bundle?: NextTurnBundleProjection;
    readonly requestPreparation?: NextTurnModelRequestPreparation;
    readonly invocationGate?: ModelInvocationGateFacts;
    readonly invocationAttempt?: ModelInvocationAttemptEnvelope;
    readonly controlledInvocation?: ControlledModelInvocationAdapterProjection;
    readonly responseReentryCycle?: ModelResponseReentryCycleProjection;
    readonly steeringQueue: SteeringQueueProjection;
    readonly followUpQueue: FollowUpQueueProjection;
    readonly deliveryPolicy: NextTurnDeliveryPolicyProjection;
    readonly executed: false;
  };
  readonly verification: AgentLoopContractVerificationProjection;
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

export async function runAgentLoopContract(
  input: AgentLoopContractInput,
): Promise<AgentLoopContractProjection> {
  const events: RuntimeProjectionEvent[] = [];
  const turns: AgentLoopContractTurnProjection[] = [];
  const queued = [...(input.queuedMessages ?? [])];
  const pendingNextTurnFacts: string[] = [];
  const maxTurns = Math.max(1, input.maxTurns ?? 4);
  let state: AgentLoopContractState = "idle";

  const transition = (to: AgentLoopContractState, reason: string) => {
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
      const responseBoundary = modelBoundary.responseBoundary ??
        createModelResponseBoundary({
          responseId: modelBoundary.responseId,
          turnId: `${input.sessionId}:turn:${turn}`,
          providerMode: input.providerMode,
          modelSafeLabel: input.modelLabel,
          source: "fake_default_safe",
          status: modelBoundary.stopReason === "failed"
            ? "failed"
            : modelBoundary.stopReason === "aborted"
              ? "aborted"
              : "observed",
          assistantContent: modelBoundary.safeSummary,
          toolCallCount: modelBoundary.toolCalls?.length ?? 0,
          notProvenClaims: modelBoundary.notProvenClaims,
        });
      const assistantResponse = modelBoundary.assistantResponse ??
        accumulateAssistantResponse({
          responseBoundary,
          turnId: `${input.sessionId}:turn:${turn}`,
          chunks: [{
            textDelta: modelBoundary.safeSummary,
            toolCalls: modelBoundary.toolCalls ?? [],
          }],
          notProvenClaims: modelBoundary.notProvenClaims,
        });
      const normalizedToolCallBatch = modelBoundary.toolCallBatch ??
        extractToolCallBatch({
          responseBoundary,
          assistantResponse,
          turnId: `${input.sessionId}:turn:${turn}`,
          batchId: `${snapshot.id}:tool-call-batch`,
          notProvenClaims: modelBoundary.notProvenClaims,
        });
      appendProjectedEvents(events, projectRuntimeEvents({
        modelResponseBoundaries: [responseBoundary],
        assistantResponses: [assistantResponse],
        toolCallBatches: [normalizedToolCallBatch],
      }));
      appendEvent(events, "agent-loop-model-boundary-observed", {
        turn,
        responseId: responseBoundary.responseId,
        stopReason: modelBoundary.stopReason,
        responseSource: responseBoundary.source,
        responseStatus: responseBoundary.status,
        safeSummary: responseBoundary.assistantContentSummary
          ? summarizeText(responseBoundary.assistantContentSummary)
          : undefined,
        toolCallCount: normalizedToolCallBatch.calls.length,
        terminalSuccessClaim: false,
      }, ["terminal-success", ...responseBoundary.notProvenClaims]);

      if (modelBoundary.stopReason === "aborted" || input.abortSignal?.aborted) {
        transition("aborted", "model-boundary-aborted");
        appendEvent(events, "agent-loop-aborted", {
          turn,
          responseId: responseBoundary.responseId,
          terminalSuccessClaim: false,
        });
        return finalizeProjection("aborted", turns, events, queued);
      }
      if (modelBoundary.stopReason === "failed") {
        transition("failed", "model-boundary-failed");
        appendEvent(events, "agent-loop-failed", {
          turn,
          failureClass: "model-boundary",
          responseId: responseBoundary.responseId,
          terminalSuccessClaim: false,
        });
        return finalizeProjection("failed", turns, events, queued, {
          failureClass: "model-boundary",
        });
      }

      const toolCalls = (modelBoundary.toolCalls ?? []).filter((call) =>
        normalizedToolCallBatch.calls.some((normalized) =>
          normalized.id === call.id && normalized.status === "prepared"
        )
      );
      let toolCallBatch: AgentLoopContractToolCallBatch | undefined;
      let toolResultBatch: AgentLoopContractToolResultBatch | undefined;
      if (normalizedToolCallBatch.calls.length > 0) {
        transition("awaiting_tool_results", `turn-${turn}-tool-call-batch`);
        const dispatchPlan = planToolBatchDispatch({
          batch: normalizedToolCallBatch,
          dispatchPolicy: input.toolBatchPolicy,
          caller: "agent-loop-contract",
        });
        toolCallBatch = {
          id: `${snapshot.id}:tool-call-batch`,
          turn,
          policy: input.toolBatchPolicy ?? "metadata-only",
          calls: Object.freeze(
            normalizedToolCallBatch.calls.map((call) => ({
              id: call.id,
              name: call.name,
              argumentKeys: call.argumentKeys,
              status: call.status,
              dispatchStatus:
                dispatchPlan.calls.find((planned) => planned.toolCallId === call.id)
                  ?.dispatchStatus ?? call.dispatchStatus,
            })),
          ),
        };
        appendEvent(events, "agent-loop-tool-call-batch-observed", {
          turn,
          batchId: toolCallBatch.id,
          policy: toolCallBatch.policy,
          toolCallCount: toolCallBatch.calls.length,
          toolNames: toolCallBatch.calls.map((call) => call.name),
          extractionStatus: normalizedToolCallBatch.extractionStatus,
          dispatchStatus: normalizedToolCallBatch.dispatchStatus,
          terminalSuccessClaim: false,
        });
        appendProjectedEvents(events, projectRuntimeEvents({
          toolDispatchPlans: [dispatchPlan],
          toolPolicyDecisions: dispatchPlan.calls.map((call) => call.beforePolicyDecision),
        }));
        if (!input.toolBatchBoundary) {
          const dispatchResult = await dispatchToolBatch({
            batch: normalizedToolCallBatch,
            context: {
              taskId: input.sessionId,
              workspaceRoot: input.workspaceRoot,
              sessionId: input.sessionId,
              correlationId: snapshot.id,
              abortSignal: input.abortSignal,
            },
            dispatchPolicy: input.toolBatchPolicy,
            dispatch: input.toolBatchDispatch,
            caller: "agent-loop-contract",
          });
          const resultMessages = prepareToolResultMessages({
            dispatchPlan: dispatchResult.dispatchPlan,
            resultDetails: dispatchResult.resultDetails,
          });
          const outcomeBundle = createToolOutcomeBundle({
            dispatchResult,
            resultMessages,
            sourceModelBoundaryId: responseBoundary.responseId,
          });
          toolResultBatch = {
            id: dispatchResult.resultBatchId,
            callBatchId: toolCallBatch.id,
            dispatchPlan: dispatchResult.dispatchPlan,
            results: dispatchResult.results,
            resultDetails: dispatchResult.resultDetails,
            resultMessages,
            outcomeBundle,
            afterAnnotations: dispatchResult.afterAnnotations,
            executionReceipts: dispatchResult.executionReceipts,
            failedToolCallIds: dispatchResult.failedToolCallIds,
            notDispatchedToolCallIds: dispatchResult.notDispatchedToolCallIds,
            terminate: false,
          };
        } else if (toolCalls.length > 0) {
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
        } else {
          const resultMessages = prepareToolResultMessages({
            dispatchPlan,
            resultDetails: [],
          });
          const outcomeBundle = createToolOutcomeBundle({
            dispatchResult: {
              resultBatchId: `${dispatchPlan.planId}:result-batch`,
              dispatchPlan,
              results: [],
              resultDetails: [],
              executionReceipts: [],
              afterAnnotations: [],
              failedToolCallIds: [],
              notDispatchedToolCallIds: normalizedToolCallBatch.calls.map((call) => call.id),
              terminalSuccessClaim: false,
              notProvenClaims: dispatchPlan.notProvenClaims,
            },
            resultMessages,
            sourceModelBoundaryId: responseBoundary.responseId,
          });
          toolResultBatch = {
            id: `${dispatchPlan.planId}:result-batch`,
            callBatchId: toolCallBatch.id,
            dispatchPlan,
            results: [],
            resultDetails: [],
            resultMessages,
            outcomeBundle,
            afterAnnotations: [],
            executionReceipts: [],
            failedToolCallIds: [],
            notDispatchedToolCallIds: normalizedToolCallBatch.calls.map((call) => call.id),
            terminate: false,
          };
        }
        if (toolResultBatch) {
          appendEvent(events, "agent-loop-tool-result-batch-observed", {
            turn,
            batchId: toolResultBatch.id,
            callBatchId: toolResultBatch.callBatchId,
            resultCount: toolResultBatch.results.length,
            resultDetailCount: toolResultBatch.resultDetails?.length ?? 0,
            resultMessageCount: toolResultBatch.resultMessages?.messages.length ?? 0,
            outcomeBundleId: toolResultBatch.outcomeBundle?.bundleId,
            failedToolCallIds: toolResultBatch.failedToolCallIds,
            notDispatchedToolCallIds: toolResultBatch.notDispatchedToolCallIds ?? [],
            executionReceiptCount: toolResultBatch.executionReceipts.length,
            terminate: toolResultBatch.terminate,
            terminalSuccessClaim: false,
          });
          appendProjectedEvents(
            events,
            projectRuntimeEvents({
              toolDispatchPlans: toolResultBatch.dispatchPlan
                ? [toolResultBatch.dispatchPlan]
                : [],
              executionReceipts: toolResultBatch.executionReceipts,
              toolResults: toolResultBatch.results,
              toolResultDetails: toolResultBatch.resultDetails ?? [],
              toolResultMessages: toolResultBatch.resultMessages
                ? [toolResultBatch.resultMessages]
                : [],
              toolOutcomeBundles: toolResultBatch.outcomeBundle
                ? [toolResultBatch.outcomeBundle]
                : [],
              toolResultAnnotations: toolResultBatch.afterAnnotations ?? [],
            }),
          );
        }
      }

      transition("saving_point", `turn-${turn}-save-point`);
      const nextTurnBundleId = `${snapshot.id}:next-turn-bundle`;
      const savePointInput = {
        turnSnapshot: snapshot,
        phase: "save_point",
        executionReceipts: toolResultBatch?.executionReceipts,
        toolResultMessageIds:
          toolResultBatch?.resultMessages?.messages.map((message) => message.messageId),
        toolResultDetailIds:
          toolResultBatch?.resultDetails?.map((detail) => detail.resultDetailsId),
        beforeToolDecisionIds:
          toolResultBatch?.dispatchPlan?.calls.map((call) =>
            call.beforePolicyDecision.decisionId
          ),
        afterToolAnnotationIds:
          toolResultBatch?.afterAnnotations?.map((annotation) => annotation.annotationId),
        nextTurnBundleId,
        evidenceIds: [
          `model-boundary:${modelBoundary.responseId}`,
          ...(toolResultBatch ? [`tool-result-batch:${toolResultBatch.id}`] : []),
        ],
        pendingNextTurnFacts: [
          `turn:${turn}`,
          `model-response:${modelBoundary.stopReason}`,
          ...(toolResultBatch?.outcomeBundle
            ? [
                `tool-outcome-bundle:${toolResultBatch.outcomeBundle.bundleId}`,
                `tool-outcome-status:${toolResultBatch.outcomeBundle.mixedOutcomeStatus}`,
              ]
            : []),
          ...(toolResultBatch
            ? [
                `tool-result-count:${toolResultBatch.results.length}`,
                `tool-result-message-count:${toolResultBatch.resultMessages?.messages.length ?? 0}`,
              ]
            : []),
        ],
        ...(toolResultBatch?.outcomeBundle
          ? {
              toolOutcomeInput: prepareToolOutcomeSavePointInput({
                sourceBundleId: toolResultBatch.outcomeBundle.bundleId,
                receiptIds: toolResultBatch.outcomeBundle.receiptIds,
                resultMessageIds: toolResultBatch.outcomeBundle.resultMessageIds,
                partialOutcomeFacts: [
                  `mixed-outcome:${toolResultBatch.outcomeBundle.mixedOutcomeStatus}`,
                  `executed-count:${toolResultBatch.outcomeBundle.executedCount}`,
                  `not-dispatched-count:${toolResultBatch.outcomeBundle.notDispatchedCount}`,
                ],
                blockedFacts: toolResultBatch.outcomeBundle.blockingFacts,
                failedFacts: toolResultBatch.failedToolCallIds,
                redactionStatus: toolResultBatch.outcomeBundle.redactionStatus,
                notProvenClaims: toolResultBatch.outcomeBundle.notProvenClaims,
              }),
            }
          : {}),
        notProvenClaims: [
          "terminal-success",
          "loop-contract-only",
          ...(modelBoundary.notProvenClaims ?? []),
        ],
      } as const;
      const savePoint = createEvidenceOnlySavePoint(savePointInput);
      appendEvent(events, "agent-loop-save-point-requested", {
        turn,
        savePointId: savePoint.id,
        terminalSuccessClaim: savePoint.terminalSuccessClaim,
        resultProjectionStatus: savePoint.resultProjectionStatus,
      }, savePoint.notProvenClaims);
      appendProjectedEvents(events, projectRuntimeEvents({ savePoint }));

      transition("preparing_next_turn", `turn-${turn}-next-turn`);
      pendingNextTurnFacts.splice(0, pendingNextTurnFacts.length, ...savePoint.pendingNextTurnFacts);
      const queuedForProjection = [...delivered, ...queued];
      const deliveredMessageIds = delivered.map((message) => message.id);
      const steeringQueue = projectSteeringQueue({
        turnId: `${input.sessionId}:turn:${turn}`,
        messages: queuedForProjection,
        deliveredMessageIds,
      });
      const followUpQueue = projectFollowUpQueue({
        turnId: `${input.sessionId}:turn:${turn}`,
        pendingBundleId: nextTurnBundleId,
        messages: queuedForProjection,
        deliveredMessageIds,
      });
      const deliveryPolicy = evaluateNextTurnDeliveryPolicy({
        bundleId: nextTurnBundleId,
        steeringQueue,
        followUpQueue,
        toolResultMessageIds:
          toolResultBatch?.resultMessages?.messages.map((message) => message.messageId),
        modelResponseIds: [responseBoundary.responseId],
        deliveryStatus: input.executePreparedNextTurn ? "delivered" : "waiting",
      });
      const nextTurnBundle = prepareNextTurnBundle({
        bundleId: nextTurnBundleId,
        turnId: `${input.sessionId}:turn:${turn}`,
        toolResultMessages: toolResultBatch?.resultMessages,
        toolOutcomeBundle: toolResultBatch?.outcomeBundle,
        assistantResponse,
        steeringQueue,
        followUpQueue,
        savePointId: savePoint.id,
        deliveryPolicy,
        deliveryStatus: input.executePreparedNextTurn ? "delivered" : "waiting",
      });
      const modelRequestBoundary = createModelRequestBoundary({
        requestId: `${nextTurnBundleId}:model-request`,
        turnId: `${input.sessionId}:turn:${turn}:next`,
        loopId: input.sessionId,
        providerId: input.providerId,
        providerMode: input.providerMode,
        providerSafeLabel: input.providerId,
        modelSafeLabel: input.modelLabel,
        providerReadinessStatus: input.providerOptIn ? "ready" : "missing",
        providerRegistry: input.providerRegistry,
        planningConstraints: nextTurnBundle.blockingFacts,
        missingRequiredFacts: nextTurnBundle.readinessStatus === "not_ready"
          ? ["next-turn-bundle:not-ready"]
          : [],
        notProvenClaims: nextTurnBundle.notProvenClaims,
      });
      const requestPreparation = prepareNextTurnModelRequest({
        nextTurnBundle,
        modelRequestBoundary,
        providerRegistry: input.providerRegistry,
        providerId: input.providerId,
        instructionSummary: "prepare explicit model invocation from safe next-turn facts",
        taskSummary: input.prompt,
        planningConstraintIds: nextTurnBundle.blockingFacts,
      });
      const invocationGate = createModelInvocationGate({
        requestPreparation,
        explicitOptIn: {
          state: input.providerOptIn ? "present" : "missing",
          sourceSafeLabel: input.providerOptIn
            ? "agent-loop-provider-opt-in"
            : "explicit-opt-in-not-present",
        },
        abortSignal: input.abortSignal,
      });
      const invocationAttempt = createModelInvocationAttemptEnvelope({
        gate: invocationGate,
      });
      const controlledInvocation = await runControlledModelInvocationAdapter({
        requestPreparation,
        gate: invocationGate,
        invocationMode: input.controlledModelInvocationExecutor
          ? "controlled_provider_fetch"
          : "metadata_only",
        executor: input.controlledModelInvocationExecutor,
        turnId: `${input.sessionId}:turn:${turn}:next`,
        signal: input.abortSignal,
      });
      const responseReentryCycle = controlledInvocation.responseHandoff ||
          controlledInvocation.attemptDecision === "execute_via_provider_fetch"
        ? projectModelResponseReentryCycle({
            cycleId: `${input.sessionId}:turn:${turn}:response-cycle`,
            controlledInvocation,
          })
        : undefined;
      appendProjectedEvents(events, projectRuntimeEvents({
        steeringQueues: [steeringQueue],
        followUpQueues: [followUpQueue],
        nextTurnDeliveryPolicies: [deliveryPolicy],
        nextTurnBundles: [nextTurnBundle],
        modelRequestBoundaries: [modelRequestBoundary],
        nextTurnRequestPreparations: [requestPreparation],
        modelInvocationGates: [invocationGate],
        modelInvocationAttempts: [invocationAttempt],
        controlledModelInvocations: [controlledInvocation],
        responseReentryCycles: responseReentryCycle ? [responseReentryCycle] : [],
      }));
      const verification = input.verificationBoundary
        ? await input.verificationBoundary({
          sessionId: input.sessionId,
          turn,
          turnId: `${input.sessionId}:turn:${turn}`,
          savePoint,
          nextTurnBundle,
          ...(toolResultBatch ? { toolResultBatch } : {}),
        })
        : createDefaultVerificationProjection({
          turnId: `${input.sessionId}:turn:${turn}`,
          savePoint,
          nextTurnBundle,
          receipt: input.verificationReceipt,
          runtimeReceiptIds: input.verificationRuntimeReceiptIds,
        });
      const repairCarryForwardFacts = [
        ...(verification.repairRequired
          ? [
              `repair-required:${verification.repairRequired.handoffId}`,
              `repair-blocker:${verification.repairRequired.repairBlocker}`,
              `repair-eligible:${verification.repairRequired.repairEligible ? "yes" : "no"}`,
              `original-verification-failure:${verification.repairRequired.sourceVerificationId}`,
            ]
          : []),
        ...(verification.repairProposal
          ? [
              `repair-proposal:${verification.repairProposal.proposalId}`,
              `repair-proposal-readiness:${verification.repairProposal.readinessStatus}`,
              `repair-apply:${verification.repairProposal.applyStatus}`,
              `post-repair-verification:${verification.repairProposal.postRepairVerificationStatus}`,
            ]
          : []),
        ...(verification.repairAuthority
          ? [
              `repair-authority:${verification.repairAuthority.authorityId}`,
              `repair-authority-state:${verification.repairAuthority.authorityDecision}`,
              `repair-authority-source:${verification.repairAuthority.authoritySource}`,
            ]
          : []),
        ...(verification.repairApplyRequest
          ? [
              `repair-apply-request:${verification.repairApplyRequest.requestId}`,
              `repair-apply-readiness:${verification.repairApplyRequest.applyReadiness}`,
              `repair-apply-blocker:${verification.repairApplyRequest.applyBlocker}`,
            ]
          : []),
        ...(verification.repairApply
          ? [
              `repair-apply-observation:${verification.repairApply.repairApplyId}`,
              `repair-apply-status:${verification.repairApply.repairApplyStatus}`,
              `repair-apply-attempted:${verification.repairApply.applyAttempted ? "yes" : "no"}`,
              `post-repair-verification:${verification.repairApply.postRepairVerificationStatus}`,
            ]
          : []),
      ];
      const verificationSavePoint = createEvidenceOnlySavePoint({
        ...savePointInput,
        pendingNextTurnFacts: [
          ...savePoint.pendingNextTurnFacts,
          ...repairCarryForwardFacts,
        ],
        verificationIntentIds: [verification.intent.intentId],
        verificationResultIds: [verification.result.verificationId],
        repairHandoffIds: verification.repairRequired
          ? [verification.repairRequired.handoffId]
          : [],
        repairProposalIds: verification.repairProposal
          ? [verification.repairProposal.proposalId]
          : [],
        repairApplyIds: verification.repairApply
          ? [verification.repairApply.repairApplyId]
          : [],
        notProvenClaims: [
          ...savePoint.notProvenClaims,
          ...verification.intent.notProvenClaims,
          ...verification.result.notProvenClaims,
          ...(verification.repairRequired?.notProvenClaims ?? []),
          ...(verification.repairProposal?.notProvenClaims ?? []),
          ...(verification.repairAuthority?.notProvenClaims ?? []),
          ...(verification.repairApplyRequest?.notProvenClaims ?? []),
          ...(verification.repairApply?.notProvenClaims ?? []),
        ],
      });
      appendProjectedEvents(events, projectRuntimeEvents({
        verificationIntents: [verification.intent],
        verificationResults: [verification.result],
        repairRequiredHandoffs: verification.repairRequired
          ? [verification.repairRequired]
          : [],
        repairProposals: verification.repairProposal
          ? [verification.repairProposal]
          : [],
        repairAuthorities: verification.repairAuthority
          ? [verification.repairAuthority]
          : [],
        repairApplyRequests: verification.repairApplyRequest
          ? [verification.repairApplyRequest]
          : [],
        repairApplyObservations: verification.repairApply
          ? [verification.repairApply]
          : [],
      }));
      appendEvent(events, "agent-loop-next-turn-prepared", {
        turn,
        bundleId: nextTurnBundle.bundleId,
        requestPreparationId: requestPreparation.requestPreparationId,
        requestReadinessStatus: requestPreparation.readinessStatus,
        pendingFactCount: pendingNextTurnFacts.length,
        deliveryStatus: nextTurnBundle.deliveryStatus,
        nextTurnExecuted: false,
        terminalSuccessClaim: false,
      }, nextTurnBundle.notProvenClaims);

      turns.push(deepFreeze({
        turn,
        snapshot,
        modelBoundary: {
          responseId: sanitizeText(modelBoundary.responseId),
          stopReason: modelBoundary.stopReason,
          toolCallCount: normalizedToolCallBatch.calls.length,
          responseStatus: responseBoundary.status,
          responseSource: responseBoundary.source,
          assistantAccumulationStatus: assistantResponse.accumulationStatus,
        },
        ...(toolCallBatch ? { toolCallBatch } : {}),
        normalizedToolCallBatch,
        ...(toolResultBatch ? { toolResultBatch } : {}),
        savePoint: verificationSavePoint,
        nextTurn: {
          prepared: true,
          pendingFacts: Object.freeze([
            ...pendingNextTurnFacts,
            ...repairCarryForwardFacts,
          ]),
          bundle: nextTurnBundle,
          requestPreparation,
          invocationGate,
          invocationAttempt,
          controlledInvocation,
          ...(responseReentryCycle ? { responseReentryCycle } : {}),
          steeringQueue,
          followUpQueue,
          deliveryPolicy,
          executed: false,
        },
        verification,
        terminalSuccessClaim: false,
        notProvenClaims: Object.freeze([
          "terminal-success",
          "loop-contract-only",
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

      if (
        input.executePreparedNextTurn &&
        toolResultBatch &&
        toolCalls.length > 0 &&
        turn < maxTurns
      ) {
        continue;
      }

      transition("waiting_for_follow_up", `turn-${turn}-follow-up-check`);
      const hasFollowUp = queued.some((message) => message.mode === "follow-up");
      if (input.executePreparedNextTurn && hasFollowUp && turn < maxTurns) {
        continue;
      }

      const stopReason: AgentLoopContractStopReason = turn >= maxTurns
        ? "turn-limit"
        : toolResultBatch && toolCalls.length > 0
          ? "next-turn-waiting"
        : hasFollowUp
          ? "next-turn-waiting"
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

function createDefaultVerificationProjection(input: {
  readonly turnId: string;
  readonly savePoint: RuntimeEvidenceSavePoint;
  readonly nextTurnBundle?: NextTurnBundleProjection;
  readonly receipt?: ProductVerificationReceipt;
  readonly runtimeReceiptIds?: readonly string[];
}): AgentLoopContractVerificationProjection {
  if (input.receipt) {
    return projectVerificationObservationFromReceipt({
      sourceTurnId: input.turnId,
      targetSummary: input.nextTurnBundle
        ? `nextTurnBundle=${input.nextTurnBundle.bundleId}`
        : `savePoint=${input.savePoint.id}`,
      receipt: input.receipt,
      runtimeReceiptIds: input.runtimeReceiptIds,
      notProvenClaims: ["verification-boundary-observation-only"],
    });
  }
  const intent = projectVerificationIntent({
    sourceTurnId: input.turnId,
    targetSummary: input.nextTurnBundle
      ? `nextTurnBundle=${input.nextTurnBundle.bundleId}`
      : `savePoint=${input.savePoint.id}`,
    verificationKind: "owner_projection",
    dispatchStatus: "planned",
    relevanceStatus: "not_proven",
    authorityRequirement: "unknown",
    notProvenClaims: ["verification-handoff-observation-only"],
  });
  const result = observeVerificationResult({
    intent,
    status: "not_run",
    safeSummary: "verification handoff observed; command not run by loop",
    notProvenClaims: ["verification-not-run"],
  });
  return deepFreeze({ intent, result });
}

function drainDeliveryForTurn(
  queued: AgentLoopContractQueuedMessage[],
  turn: number,
): AgentLoopContractQueuedMessage[] {
  const deliverableMode: AgentLoopContractDeliveryMode =
    turn === 1 ? "next-turn" : "follow-up";
  const delivered: AgentLoopContractQueuedMessage[] = [];
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
  call: AgentLoopContractToolCallRequest,
): AgentLoopContractPreparedToolCall {
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
  state: AgentLoopContractState,
  turns: readonly AgentLoopContractTurnProjection[],
  events: readonly RuntimeProjectionEvent[],
  queued: readonly AgentLoopContractQueuedMessage[],
  options: {
    readonly stopReason?: AgentLoopContractStopReason;
    readonly failureClass?: "model-boundary" | "tool-batch-boundary";
  } = {},
): AgentLoopContractProjection {
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
      "loop-contract-only",
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

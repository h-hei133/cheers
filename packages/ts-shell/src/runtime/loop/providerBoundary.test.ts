import { describe, expect, it } from "vitest";

import {
  createModelRequestBoundary,
  prepareNextTurnModelRequest,
  type NextTurnModelRequestPreparation,
} from "../../provider/request/boundary.js";
import { projectProviderRegistry, unknownProviderCompatibilityFlags } from "../../provider/registry/provider.js";
import { projectProductSurfaceViewModel } from "../../presentation/surface/model.js";
import { projectSessionStatusEnvelope } from "../../session/presentation/envelope.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import { summarizeReplaySafeLoopState } from "../../session/replay/state.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { prepareNextTurnBundle } from "../../turn/nextTurnBundle.js";
import type { NormalizedToolCall } from "../../tools/toolCallBatch.js";
import type { ToolExecutionResult } from "../../tools/types.js";
import { projectRuntimeEvents } from "../events/projection.js";
import { runAgentLoopContract } from "./contract.js";
import { createSyntheticModelBoundary } from "./providerBoundary.js";

describe("provider model boundary", () => {
  it("turns synthetic text-only responses into stop boundaries", async () => {
    const boundary = createSyntheticModelBoundary({
      program: {
        steps: [{
          kind: "completed",
          response: {
            content: "safe final-looking text",
            finishReason: "stop",
          },
        }],
      },
    });

    const response = await boundary(turnInput());

    expect(response).toMatchObject({
      stopReason: "stop",
      responseBoundary: {
        providerMode: "synthetic",
        status: "observed",
        terminalSuccessClaim: false,
      },
      toolCallBatch: {
        extractionStatus: "empty",
        terminalSuccessClaim: false,
      },
    });
    expect(response.modelBoundaryPhase?.stream.status).toBe("completed");
  });

  it("extracts synthetic tool calls for the shared runtime tool lane", async () => {
    const boundary = createSyntheticModelBoundary({
      program: {
        steps: [{
          kind: "completed",
          response: {
            content: "read first",
            toolCalls: [
              { id: "call-read", name: "read", arguments: { path: "src/a.ts" } },
            ],
            finishReason: "tool_calls",
          },
        }],
      },
    });

    const response = await boundary(turnInput());

    expect(response.stopReason).toBe("tool-calls");
    expect(response.toolCalls).toEqual([
      { id: "call-read", name: "read", arguments: { path: "src/a.ts" } },
    ]);
    expect(response.toolCallBatch).toMatchObject({
      extractionStatus: "extracted",
      dispatchStatus: "not_dispatched",
      terminalSuccessClaim: false,
    });
    expect(response.modelBoundaryPhase?.toolBatchHandoffPrepared).toBe(true);
  });

  it("keeps malformed provider tool calls visible without dispatch authority", async () => {
    const boundary = createSyntheticModelBoundary({
      program: {
        steps: [{
          kind: "completed",
          response: {
            toolCalls: [
              { name: "missing-id", arguments: { path: "src/a.ts" } },
            ],
            finishReason: "tool_calls",
          },
        }],
      },
    });

    const response = await boundary(turnInput());

    expect(response.stopReason).toBe("tool-calls");
    expect(response.toolCalls).toEqual([]);
    expect(response.modelBoundaryPhase?.stream.malformedToolCallCount).toBe(1);
    expect(response.toolCallBatch).toMatchObject({
      extractionStatus: "partial",
      malformedCallCount: 0,
      unknownCallCount: 1,
      terminalSuccessClaim: false,
    });
  });

  it("turns provider failures into failed model boundaries", async () => {
    const boundary = createSyntheticModelBoundary({
      program: {
        steps: [{
          kind: "failed",
          failureClass: "provider_network",
        }],
      },
    });

    const response = await boundary(turnInput());

    expect(response.stopReason).toBe("failed");
    expect(response.responseBoundary).toMatchObject({
      status: "failed",
      terminalSuccessClaim: false,
    });
    expect(response.modelBoundaryPhase?.stream.failure).toMatchObject({
      class: "provider_network",
      fallbackExecuted: false,
    });
  });

  it("preserves request blockers from the prepared next-turn request", async () => {
    const boundary = createSyntheticModelBoundary({
      program: {
        steps: [{
          kind: "completed",
          response: { content: "blocked request context", finishReason: "stop" },
        }],
      },
    });
    const pendingPreparedRequest = blockedPreparedRequest();

    const response = await boundary({
      ...turnInput(),
      pendingPreparedRequest,
      pendingNextTurnFacts: ["previous-tool-result"],
    });

    expect(response.requestBoundary).toMatchObject({
      readinessStatus: "blocked_missing_required_facts",
      missingRequiredFacts: expect.arrayContaining(pendingPreparedRequest.blockedReasons),
      terminalSuccessClaim: false,
    });
    expect(response.requestBoundary?.notProvenClaims).toEqual(
      expect.arrayContaining(["synthetic-provider-response-is-not-task-success"]),
    );
  });

  it("runs a synthetic provider tool result into the next turn without terminal success", async () => {
    const preparedRequests: NextTurnModelRequestPreparation[] = [];
    const syntheticBoundary = createSyntheticModelBoundary({
      program: {
        steps: [
          {
            kind: "completed",
            response: {
              content: "read a file",
              toolCalls: [
                { id: "call-read", name: "read", arguments: { path: "src/a.ts" } },
              ],
              finishReason: "tool_calls",
            },
          },
          {
            kind: "completed",
            response: {
              content: "tool result considered for next turn",
              finishReason: "stop",
            },
          },
        ],
      },
    });
    const loop = await runAgentLoopContract({
      sessionId: "sess-synthetic-happy",
      workspaceRoot: "/workspace",
      prompt: "read a file and continue",
      providerOptIn: false,
      providerMode: "synthetic",
      maxTurns: 2,
      executePreparedNextTurn: true,
      toolBatchPolicy: "sequential",
      modelBoundary: async (input) => {
        if (input.pendingPreparedRequest) {
          preparedRequests.push(input.pendingPreparedRequest);
        }
        return syntheticBoundary(input);
      },
      toolBatchDispatch: async () => ({
        success: true,
        content: "safe file summary",
      }),
    });
    const first = loop.turns[0]!;
    const second = loop.turns[1]!;
    const status = projectStatus(loop, first);

    expect(loop.turns).toHaveLength(2);
    expect(first.toolResultBatch?.resultMessages?.messages).toEqual([
      expect.objectContaining({
        role: "tool",
        toolCallId: "call-read",
        deliveryStatus: "prepared",
        terminalSuccessClaim: false,
      }),
    ]);
    expect(first.toolResultBatch?.outcomeBundle?.nextAction).toBe("prepare_next_turn");
    expect(first.nextTurn.requestPreparation?.safeRequestMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "tool-result",
          terminalSuccessClaim: false,
        }),
      ]),
    );
    expect(preparedRequests[0]?.safeRequestMessages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "tool-result",
          safeSummary: "safe file summary",
        }),
      ]),
    );
    expect(second.modelBoundary.stopReason).toBe("stop");
    expect(loop.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "model-request-prepared",
        "provider-stream-started",
        "provider-stream-delta-observed",
        "model-boundary-completed",
        "tool-call-batch-extracted",
        "tool-call-dispatched",
        "tool-result-message-prepared",
        "next-turn-request-preparation-observed",
        "agent-loop-next-turn-prepared",
      ]),
    );
    expect(status.envelope.state).not.toBe("complete_proof");
    expect(status.envelope.terminalSuccessClaim).toBe(false);
    expect(status.surface?.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify({ loop, status })).not.toContain('"terminalSuccessClaim":true');
  });

  it("runs independent read-only tool calls in parallel while preserving deterministic result order", async () => {
    const finished: string[] = [];
    const loop = await runParallelToolLane({
      sessionId: "sess-parallel-happy",
      toolCalls: [
        { id: "call-read-a", name: "read", arguments: { path: "src/a.ts" } },
        { id: "call-read-b", name: "read", arguments: { path: "src/b.ts" } },
        { id: "call-glob", name: "glob", arguments: { pattern: "src/*.ts" } },
      ],
      dispatch: async (call) => {
        if (call.id === "call-read-a") {
          await new Promise((resolve) => setTimeout(resolve, 15));
        }
        finished.push(call.id);
        return { success: true, content: `safe result ${call.id}` };
      },
      maxTurns: 2,
      executePreparedNextTurn: true,
    });
    const first = loop.turns[0]!;
    const status = projectStatus(loop, first);

    expect(first.toolResultBatch?.dispatchPlan?.schedulingPlan.executionMode).toBe("parallel_read_only");
    expect(first.toolResultBatch?.dispatchPlan?.schedulingPlan.parallelGroupIds.length).toBe(1);
    expect(finished[0]).not.toBe("call-read-a");
    expect(first.toolResultBatch?.resultMessages?.messages.map((message) => message.toolCallId)).toEqual([
      "call-read-a",
      "call-read-b",
      "call-glob",
    ]);
    expect(first.nextTurn.requestPreparation?.safeRequestMessages.map((message) => message.source)).toContain("tool-result");
    expect(loop.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "tool-scheduling-plan-observed",
      "tool-scheduling-group-observed",
      "tool-call-dispatched",
      "tool-result-message-prepared",
      "agent-loop-next-turn-prepared",
    ]));
    expect(status.replay.toolSchedulingStatus).toBe("parallel_read_only");
    expect(status.envelope.toolOutcome.summary).toContain("schedule=parallel_read_only");
    expect(status.envelope.completeProof).toBe(false);
    expect(JSON.stringify({ loop, status })).not.toContain('"terminalSuccessClaim":true');
  });

  it("forces ordered read-only dependencies into deterministic sequential groups", async () => {
    const dispatched: string[] = [];
    const loop = await runParallelToolLane({
      sessionId: "sess-parallel-dependency",
      toolCalls: [
        { id: "call-read-a", name: "read", arguments: { path: "src/a.ts" } },
        {
          id: "call-read-b",
          name: "read",
          arguments: { path: "src/b.ts", afterCallIds: ["call-read-a"] },
        },
      ],
      dispatch: async (call) => {
        dispatched.push(call.id);
        return { success: true, content: `safe result ${call.id}` };
      },
    });
    const first = loop.turns[0]!;
    const plan = first.toolResultBatch!.dispatchPlan!;
    const status = projectStatus(loop, first);

    expect(plan.schedulingPlan.calls.map((call) => call.dependency.kind)).toEqual([
      "independent",
      "ordered_after",
    ]);
    expect(plan.schedulingPlan.calls.map((call) => call.decision)).toEqual([
      "parallel_allowed",
      "forced_sequential",
    ]);
    expect(dispatched).toEqual(["call-read-a", "call-read-b"]);
    expect(first.toolResultBatch?.resultMessages?.messages.map((message) => message.toolCallId)).toEqual(dispatched);
    expect(status.replay.toolSchedulingDeterministicOrder).toEqual(["call-read-a", "call-read-b"]);
    expect(status.envelope.state).not.toBe("complete_proof");
  });

  it("keeps mutation, unknown, unsupported, and conflicting tools out of parallel execution", async () => {
    const dispatched: string[] = [];
    const loop = await runParallelToolLane({
      sessionId: "sess-parallel-blocked",
      toolCalls: [
        { id: "call-read-a", name: "read", arguments: { path: "src/a.ts", conflictsWithCallIds: ["call-read-b"] } },
        { id: "call-read-b", name: "read", arguments: { path: "src/b.ts", conflictsWithCallIds: ["call-read-a"] } },
        { id: "call-edit", name: "edit", arguments: { path: "src/a.ts", oldText: "old", newText: "new" } },
        { id: "call-unknown", name: "unknown-tool", arguments: { dependency: "unknown" } },
      ],
      dispatch: async (call) => {
        dispatched.push(call.id);
        return { success: true, content: `safe result ${call.id}` };
      },
    });
    const first = loop.turns[0]!;
    const plan = first.toolResultBatch!.dispatchPlan!;
    const status = projectStatus(loop, first);

    expect(dispatched).toEqual([]);
    expect(plan.schedulingPlan.calls.map((call) => call.decision)).toEqual([
      "blocked",
      "blocked",
      "blocked",
      "unsupported",
    ]);
    expect(plan.calls.find((call) => call.toolCallId === "call-edit")?.effect).toBe("mutation");
    expect(plan.dispatchedCallIds).toEqual([]);
    expect(first.toolResultBatch?.notDispatchedToolCallIds).toEqual([
      "call-read-a",
      "call-read-b",
      "call-edit",
      "call-unknown",
    ]);
    expect(loop.events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "tool-call-blocked",
      "tool-scheduling-plan-observed",
    ]));
    expect(status.envelope.toolOutcome.status).toBe("observed");
    expect(status.envelope.completeProof).toBe(false);
  });

  it("preserves partial read-only failures without upgrading tool completion to success", async () => {
    const loop = await runParallelToolLane({
      sessionId: "sess-parallel-partial",
      toolCalls: [
        { id: "call-read-a", name: "read", arguments: { path: "src/a.ts" } },
        { id: "call-read-b", name: "read", arguments: { path: "src/b.ts" } },
        { id: "call-read-c", name: "read", arguments: { path: "src/c.ts" } },
      ],
      dispatch: async (call) => ({
        success: call.id !== "call-read-b",
        content: call.id === "call-read-b" ? "safe failure summary" : `safe result ${call.id}`,
        ...(call.id === "call-read-b" ? { error: "read-only tool failed" } : {}),
        reportSafe: {
          redactionStatus: "report-safe",
          notProvenClaims: ["tool-result-is-not-task-success"],
        },
      }),
    });
    const first = loop.turns[0]!;
    const status = projectStatus(loop, first);

    expect(first.toolResultBatch?.failedToolCallIds).toEqual(["call-read-b"]);
    expect(first.toolResultBatch?.resultDetails?.map((detail) => detail.resultStatus)).toEqual([
      "executed_success",
      "executed_failed",
      "executed_success",
    ]);
    expect(first.toolResultBatch?.outcomeBundle?.mixedOutcomeStatus).toBe("mixed_success_and_non_success");
    expect(first.toolResultBatch?.outcomeBundle?.nextAction).toBe("review_failed_result");
    expect(first.nextTurn.bundle?.blockingFacts).toEqual(expect.arrayContaining([
      "call-read-b:executed_failed",
    ]));
    expect(status.envelope.state).not.toBe("complete_proof");
    expect(status.envelope.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify({ loop, status })).not.toMatch(
      /RAW_OLD_TEXT_SHOULD_NOT_LEAK|RAW_NEW_TEXT_SHOULD_NOT_LEAK|token=secret|hidden reasoning/i,
    );
  });

  it("integrates synthetic streaming, registry resolution, replay, surface, and status without success", async () => {
    const registry = providerRuntimeRegistry();
    const syntheticBoundary = createSyntheticModelBoundary({
      providerId: "provider-a",
      providerSafeLabel: "Primary Provider",
      modelSafeLabel: "Primary Model",
      providerRegistry: registry,
      program: {
        steps: [{
          kind: "completed",
          response: {
            content: "inspect the workspace",
            toolCalls: [{ id: "call-read", name: "read", arguments: { path: "src/a.ts" } }],
            finishReason: "tool_calls",
          },
        }],
      },
    });
    const loop = await runAgentLoopContract({
      sessionId: "sess-provider-runtime-happy",
      workspaceRoot: "/workspace",
      prompt: "inspect",
      providerOptIn: true,
      providerFallbackOptIn: false,
      providerMode: "synthetic",
      providerId: "provider-a",
      modelLabel: "Primary Model",
      providerRegistry: registry,
      maxTurns: 1,
      modelBoundary: syntheticBoundary,
      toolBatchDispatch: async () => ({ success: true, content: "safe file summary" }),
    });
    const first = loop.turns[0]!;
    const status = projectStatus(loop, first);

    expect(first.modelBoundary.responseStatus).toBe("observed");
    expect(first.nextTurn.requestPreparation).toMatchObject({
      readinessStatus: "ready_for_explicit_model_invocation",
      providerMetadataId: "provider-a",
      modelMetadataId: "model-a",
      terminalSuccessClaim: false,
    });
    expect(loop.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "provider-stream-started",
        "provider-stream-delta-observed",
        "tool-call-batch-extracted",
        "next-turn-request-preparation-observed",
        "model-invocation-gate-observed",
        "controlled-invocation-adapter-observed",
      ]),
    );
    expect(status.replay.providerInvocationStatus?.attemptStatus).toBe("not_attempted");
    expect(status.envelope.providerModel.summary).toContain("fallbackStatus");
    expect(status.envelope.terminalSuccessClaim).toBe(false);
    expect(status.surface?.terminalSuccessClaim).toBe(false);
  });

  it("blocks provider invocation before a provider call and carries blockers through surfaces", async () => {
    let calls = 0;
    const registry = providerRuntimeRegistry({ authReadiness: "missing" });
    const syntheticBoundary = createSyntheticModelBoundary({
      providerId: "provider-a",
      providerSafeLabel: "Primary Provider",
      modelSafeLabel: "Primary Model",
      providerRegistry: registry,
      program: {
        steps: [{
          kind: "completed",
          response: {
            content: "prepare blocked request",
            toolCalls: [{ id: "call-read", name: "read", arguments: { path: "src/a.ts" } }],
            finishReason: "tool_calls",
          },
        }],
      },
    });
    const loop = await runAgentLoopContract({
      sessionId: "sess-provider-runtime-blocked",
      workspaceRoot: "/workspace",
      prompt: "blocked provider",
      providerOptIn: false,
      providerMode: "synthetic",
      providerId: "provider-a",
      modelLabel: "Primary Model",
      providerRegistry: registry,
      maxTurns: 1,
      modelBoundary: syntheticBoundary,
      toolBatchDispatch: async () => ({ success: true, content: "safe file summary" }),
      controlledModelInvocationExecutor: () => {
        calls += 1;
        return { kind: "completed", response: { content: "not reached" } };
      },
    });
    const status = projectStatus(loop, loop.turns[0]!);

    expect(calls).toBe(0);
    expect(loop.turns[0]!.nextTurn.invocationGate?.eligibilityStatus).toBe("blocked_by_missing_opt_in");
    expect(loop.turns[0]!.nextTurn.controlledInvocation?.outcome).toMatchObject({
      status: "blocked",
      failureClass: "provider_config",
      terminalSuccessClaim: false,
    });
    expect(loop.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "model-invocation-explicit-opt-in-required",
        "model-invocation-blocked",
        "controlled-invocation-attempt-blocked",
      ]),
    );
    expect(status.envelope.providerModel.status).toBe("blocked");
    expect(status.replay.providerInvocationStatus?.fallbackAttempted).toBe(false);
    expect(JSON.stringify({ loop, status })).not.toContain('"success":true');
  });

  it("selects and attempts fallback after primary provider failure without claiming success", async () => {
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const registry = providerRuntimeRegistry({ fallbackExecutes: true });
    const syntheticBoundary = createSyntheticModelBoundary({
      providerId: "provider-a",
      providerSafeLabel: "Primary Provider",
      modelSafeLabel: "Primary Model",
      providerRegistry: registry,
      program: {
        steps: [{
          kind: "completed",
          response: {
            content: "prepare fallback request",
            toolCalls: [{ id: "call-read", name: "read", arguments: { path: "src/a.ts" } }],
            finishReason: "tool_calls",
          },
        }],
      },
    });
    const loop = await runAgentLoopContract({
      sessionId: "sess-provider-runtime-fallback",
      workspaceRoot: "/workspace",
      prompt: "fallback provider",
      providerOptIn: true,
      providerFallbackOptIn: true,
      providerMode: "synthetic",
      providerId: "provider-a",
      modelLabel: "Primary Model",
      providerRegistry: registry,
      maxTurns: 1,
      modelBoundary: syntheticBoundary,
      toolBatchDispatch: async () => ({ success: true, content: "safe file summary" }),
      controlledModelInvocationExecutor: () => {
        primaryCalls += 1;
        throw new Error("network unreachable");
      },
      controlledModelFallbackExecutor: () => {
        fallbackCalls += 1;
        return {
          kind: "completed",
          response: {
            content: "fallback normalized text",
            toolCalls: [{ id: "fallback-call", name: "read", arguments: { path: "b.ts" } }],
            finishReason: "tool_calls",
          },
        };
      },
    });
    const first = loop.turns[0]!;
    const status = projectStatus(loop, first);

    expect(primaryCalls).toBe(1);
    expect(fallbackCalls).toBe(1);
    expect(first.nextTurn.controlledInvocation?.fallbackDecision).toMatchObject({
      status: "fallback_completed",
      nextAction: "continue",
      selectedProviderSafeLabel: "Fallback Provider",
      terminalSuccessClaim: false,
    });
    expect(first.nextTurn.controlledInvocation?.fallbackResponseHandoff).toMatchObject({
      responseClassification: "completed",
      toolCallExtractionReadiness: "ready",
      rawOutputExcluded: true,
    });
    expect(loop.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "controlled-invocation-attempt-started",
        "provider-fallback-completed-as-provider-fact",
        "provider-response-handoff-prepared",
      ]),
    );
    expect(status.replay.providerInvocationStatus).toMatchObject({
      attemptStatus: "completed",
      fallbackStatus: "fallback_completed",
      fallbackAttempted: true,
      terminalSuccessClaim: false,
    });
    expect(status.envelope.providerModel.summary).toContain("fallbackStatus=fallback_completed");
    expect(status.envelope.state).not.toBe("complete_proof");
    expect(JSON.stringify({ loop, status })).not.toContain('"terminalSuccessClaim":true');
  });

  it("keeps a request-blocked synthetic lane non-success", async () => {
    const requestBoundary = createModelRequestBoundary({
      requestId: "request-integration-blocked",
      providerMode: "synthetic",
      providerReadinessStatus: "blocked",
      missingRequiredFacts: ["request-policy:blocker"],
    });
    const loop = await runAgentLoopContract({
      sessionId: "sess-synthetic-blocked",
      workspaceRoot: "/workspace",
      prompt: "blocked request",
      providerOptIn: false,
      providerMode: "synthetic",
      maxTurns: 1,
      modelBoundary: async () => ({
        responseId: "response-request-blocked",
        stopReason: "failed",
        requestBoundary,
        notProvenClaims: ["request-blocked-is-not-success"],
      }),
    });

    expect(loop.state).toBe("failed");
    expect(loop.failureClass).toBe("model-boundary");
    expect(loop.turns).toHaveLength(0);
    expect(loop.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "model-request-prepared",
        "request-blocked",
        "agent-loop-failed",
      ]),
    );
    expect(loop.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(loop)).not.toContain('"success":true');
  });
});

function turnInput() {
  return {
    sessionId: "sess-synthetic",
    turn: 1,
    prompt: "run synthetic lane",
    deliveredMessages: [],
    pendingNextTurnFacts: [],
  };
}

async function runParallelToolLane(input: {
  readonly sessionId: string;
  readonly toolCalls: readonly { readonly id: string; readonly name: string; readonly arguments?: Record<string, unknown> }[];
  readonly dispatch: (call: NormalizedToolCall) => Promise<ToolExecutionResult>;
  readonly maxTurns?: number;
  readonly executePreparedNextTurn?: boolean;
}) {
  const syntheticBoundary = createSyntheticModelBoundary({
    program: {
      steps: [
        {
          kind: "completed",
          response: {
            content: "parallel safe context",
            toolCalls: input.toolCalls,
            finishReason: "tool_calls",
          },
        },
        {
          kind: "completed",
          response: {
            content: "safe final response",
            finishReason: "stop",
          },
        },
      ],
    },
  });
  return runAgentLoopContract({
    sessionId: input.sessionId,
    workspaceRoot: "/workspace",
    prompt: "parallel read-only tool lane",
    providerOptIn: false,
    providerMode: "synthetic",
    maxTurns: input.maxTurns ?? 1,
    executePreparedNextTurn: input.executePreparedNextTurn,
    toolBatchPolicy: "parallel",
    modelBoundary: syntheticBoundary,
    toolBatchDispatch: async (call) => input.dispatch(call),
  });
}

function blockedPreparedRequest() {
  const nextTurnBundle = prepareNextTurnBundle({
    bundleId: "bundle-blocked",
    turnId: "turn-blocked",
  });
  const boundary = createModelRequestBoundary({
    requestId: "request-blocked",
    providerMode: "synthetic",
    providerReadinessStatus: "blocked",
    missingRequiredFacts: ["policy:blocker"],
  });
  return prepareNextTurnModelRequest({
    nextTurnBundle,
    modelRequestBoundary: boundary,
    planningConstraintIds: ["policy:blocker"],
  });
}

function providerRuntimeRegistry(input: {
  readonly authReadiness?: "resolved" | "missing" | "expired" | "unsupported" | "unknown";
  readonly fallbackExecutes?: boolean;
} = {}) {
  const compatibility = unknownProviderCompatibilityFlags();
  return projectProviderRegistry({
    providers: [
      {
        providerId: "provider-a",
        safeLabel: "Primary Provider",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "supported",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        fallbackPolicy: {
          fallbackProviderId: "provider-b",
          eligibleFailureClasses: ["provider_network", "provider_timeout"],
          ineligibleFailureClasses: ["provider_auth"],
          maxAttempts: 1,
          retryRelation: "new-request",
          requiresExplicitOptIn: true,
          executesFallback: input.fallbackExecutes === true,
          redaction: { status: "report-safe", excluded: [] },
          notProvenClaims: [],
        },
        riskLevel: "low",
      },
      {
        providerId: "provider-b",
        safeLabel: "Fallback Provider",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        riskLevel: "low",
      },
    ],
    models: [
      {
        modelId: "model-a",
        safeLabel: "Primary Model",
        providerId: "provider-a",
        family: "fixture",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        knownLimitations: [],
      },
      {
        modelId: "model-b",
        safeLabel: "Fallback Model",
        providerId: "provider-b",
        family: "fixture",
        compatibility: {
          ...compatibility,
          streaming: "supported",
          toolCalls: "supported",
        },
        knownLimitations: [],
      },
    ],
    auth: [{
      providerId: "provider-a",
      authSourceKind: "none",
      authMode: "none",
      resolutionStatus: input.authReadiness ?? "resolved",
    }],
  });
}

function projectStatus(
  loop: Awaited<ReturnType<typeof runAgentLoopContract>>,
  turn: NonNullable<Awaited<ReturnType<typeof runAgentLoopContract>>["turns"][number]>,
) {
  const sessionProjection = projectSessionTree({
    session: {
      id: "sess-synthetic-happy",
      projectRoot: "/workspace",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:01.000Z",
      status: "active",
      turns: [{ role: "user", content: "read a file and continue" }],
    },
  });
  const contextRebuildProjection = projectSessionContextRebuild({ sessionProjection });
  const rebuildInput = buildLoopContextRebuildInput({
    sessionProjection,
    contextRebuildProjection,
  });
  const continuationReadiness = evaluateContinuationReadiness({
    sessionProjection,
    contextRebuildProjection,
    rebuildInput,
  });
  const replay = summarizeReplaySafeLoopState({
    sessionProjection,
    contextRebuildProjection,
    continuationReadiness,
    rebuildInput,
    savePoint: turn.savePoint,
    nextTurnBundle: turn.nextTurn.bundle,
    requestPreparation: turn.nextTurn.requestPreparation,
    controlledModelInvocations: turn.nextTurn.controlledInvocation
      ? [turn.nextTurn.controlledInvocation]
      : [],
    toolDispatchPlan: turn.toolResultBatch?.dispatchPlan,
    toolOutcomeBundle: turn.toolResultBatch?.outcomeBundle,
    toolResultMessages: turn.toolResultBatch?.resultMessages,
    terminalResultFacts: {
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
    },
  });
  const runtimeEvents = [
    ...loop.events,
    ...projectRuntimeEvents({
      replaySafeLoopStateSummaries: [replay],
      resultFacts: {
        status: "stopped",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
        verdictSource: "result",
      },
    }),
  ];
  const surface = projectProductSurfaceViewModel({
    status: "stopped_error",
    terminalClassification: "stopped",
    terminalReason: "stopped_error",
    runtimeEvents,
  });

  return {
    replay,
    surface,
    envelope: projectSessionStatusEnvelope(surface!),
  };
}

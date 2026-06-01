import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { buildContextPlanningBlockSummary } from "../../context/acquisition/summary.js";
import { runPlanningRuntime } from "../../planning/runtime/engine.js";
import type { CodingResultSummary } from "../../orchestration/types.js";
import {
  projectProviderRegistry,
  unknownProviderCompatibilityFlags,
} from "../../provider/registry/provider.js";
import {
  createModelRequestBoundary,
  prepareNextTurnModelRequest,
} from "../../provider/request/boundary.js";
import {
  createModelInvocationAttemptEnvelope,
  createModelInvocationGate,
} from "../../provider/request/invocation.js";
import { runControlledModelInvocationAdapter } from "../../provider/request/attempt.js";
import { prepareNextTurnBundle } from "../../turn/nextTurnBundle.js";
import { projectRuntimeEvents } from "../../runtime/events/projection.js";
import { runAgentLoopContract } from "../../runtime/loop/contract.js";
import { projectVerificationReceipt } from "../../verification/verificationFacade.js";
import { projectModelBoundaryPhase } from "../../runtime/loop/modelBoundary.js";
import { runProviderStreamAdapter } from "../../runtime/loop/providerStreamAdapter.js";
import { projectProductLoopAdapter } from "../../runtime/loop/adapter.js";
import { projectLoopTrajectory } from "../../runtime/loop/trajectory.js";
import {
  projectPackageResourceInventory,
  type PackageManifestContract,
} from "../../runtime/resources/inventory.js";
import { projectStaticResourceRegistry } from "../../runtime/resources/projection.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import { summarizeReplaySafeLoopState } from "../../session/replay/state.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { projectProductSurfaceViewModel } from "./model.js";
import { renderTerminalMessage } from "../terminal/renderer.js";

describe("product surface view model", () => {
  it("builds semantic sections from result, session, event, provider, package, and resource facts", () => {
    const resources = projectStaticResourceRegistry({
      descriptors: [
        {
          id: "prompt.safe",
          kind: "prompt-template",
          name: "Safe Prompt",
          description: "Prompt template metadata only.",
          sourceType: "fixture",
          ownerDomain: "runtime/resources",
          visibility: "cli",
          enabledByDefault: false,
          requiresOptIn: false,
          capabilitiesSummary: ["prompt routing"],
          riskLevel: "low",
          notProvenClaims: [],
        },
      ],
    });
    const packages = projectPackageResourceInventory({
      manifests: [
        manifest({
          packageId: "pkg.safe",
          safeName: "Safe Package",
          resourceIds: ["prompt.safe"],
          declaredCapabilities: ["prompt routing"],
        }),
      ],
    });
    const providerRegistry = projectProviderRegistry({
      providers: [
        {
          providerId: "openai",
          safeLabel: "OpenAI",
          providerKind: "openai",
          endpointClass: "default",
          authMode: "api-key",
          defaultEnabled: false,
          requiresExplicitOptIn: true,
          supportsFallback: "unknown",
          compatibility: unknownProviderCompatibilityFlags(),
          riskLevel: "medium",
        },
      ],
    });
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess_surface",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
        status: "completed",
        turns: [{ role: "user", content: "please inspect" }],
      },
      stateSnapshot: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
      },
    });
    const runtimeEvents = projectRuntimeEvents({
      sessionProjection,
      resourceProjection: resources,
      packageInventory: packages,
      resultFacts: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
        verdictSource: "result",
      },
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      codingResult: codingResult(),
      resourceProjection: resources,
      packageInventory: packages,
      providerRegistry,
      runtimeEvents,
      sessionProjection,
    });

    expect(viewModel?.sections.map((section) => section.kind)).toEqual([
      "task",
      "context",
      "plan",
      "proposal",
      "authority",
      "apply",
      "verification",
      "repair",
      "tools",
      "resources",
      "provider",
      "packages",
      "session",
      "events",
      "verdict",
      "not_proven",
      "next_action",
    ]);
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(viewModel?.sections.find((section) => section.kind === "provider")).toMatchObject({
      status: "not_proven",
      severity: "not_proven",
    });
    expect(viewModel?.sections.find((section) => section.kind === "packages")?.summary)
      .toContain("installation=disabled");
  });

  it("renders stable compact and detailed output without inventing success", () => {
    const viewModel = projectProductSurfaceViewModel({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      codingResult: codingResult({
        verification: {
          status: "skipped",
          reason: "selected but not run",
        },
        taskSatisfaction: {
          verdict: "completed-with-caveats",
          reasons: ["selected verification did not run"],
          requiredEvidence: ["task-relevant verification"],
          observedEvidence: ["patch applied"],
        },
      }),
    });

    const compact = renderTerminalMessage(viewModel!).lines.join("\n");
    const detailed = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(compact).toContain("[partial] Verification: status=skipped");
    expect(compact).toContain("[partial] Verdict: Partial");
    expect(compact).not.toContain("Outcome: success");
    expect(detailed).toContain("not_proven: relevant verification did not pass");
    expect(detailed).toContain("status: not_run");
  });

  it("renders loop trajectory summaries without turning observations into success", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess_surface_loop",
      workspaceRoot: "/workspace",
      prompt: "summarize trajectory",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-surface-loop",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "surface-loop",
      prompt: "summarize trajectory",
      loop,
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "waiting_for_input",
      loopTrajectory: trajectory,
    });
    const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(viewModel?.sections.map((section) => section.kind)).toEqual([
      "task",
      "turn",
      "provider",
      "tools",
      "execution",
      "verification",
      "repair",
      "save_point",
      "session",
      "context",
      "events",
      "verdict",
      "not_proven",
      "next_action",
    ]);
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(rendered).toContain("[not_proven] Provider:");
    expect(rendered).toContain("modelResponses=1");
    expect(rendered).toContain("dispatch=observed");
    expect(rendered).toContain("toolResults=not_proven");
    expect(rendered).toContain("resultMessages=0");
    expect(rendered).toContain("verificationSuccess=not-proven");
    expect(rendered).toContain("repairSuccess=not-proven");
    expect(rendered).toContain("nextTurnExecuted=false");
    expect(rendered).toContain("[not_proven] Verdict:");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(rendered).not.toContain("Outcome: success");
  });

  it("renders task-relevant verification boundary facts without success inflation", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess_surface_verification",
      workspaceRoot: "/workspace",
      prompt: "summarize verification",
      providerOptIn: false,
      verificationReceipt: projectVerificationReceipt({
        selectedCommand:
          "npm test -w packages/ts-shell -- src/verification/taskRelevantVerificationRoute.test.ts",
        authority: "explicitly-approved",
        dispatchStatus: "dispatched",
        runtimeStatus: "failed",
        runtimeReceiptIds: ["receipt-surface-verification"],
        relevanceStatus: "relevant",
        coverageStatus: "covered",
        coveredFiles: ["packages/ts-shell/src/verification/taskRelevantVerificationRoute.ts"],
        uncoveredFiles: [],
        failureClass: "test-failed",
        repairEligible: true,
        notProvenClaims: ["task success"],
        verdictStatus: "verification-failed",
      }),
      modelBoundary: async () => ({
        responseId: "response-surface-verification",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "surface-verification",
      prompt: "summarize verification",
      loop,
    });
    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "waiting_for_input",
      loopTrajectory: trajectory,
    });
    const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(rendered).toContain("taskRelevant=task_relevant");
    expect(rendered).toContain("coverage=covered");
    expect(rendered).toContain("authority=granted");
    expect(rendered).toContain("runtimeReceipts=1");
    expect(rendered).toContain("repairEligible=yes");
    expect(rendered).toContain("verificationSuccess=not-proven");
    expect(rendered).not.toContain("Outcome: success");
  });

  it("renders response cycle observations without success inflation", () => {
    const runtimeEvents = projectRuntimeEvents({
      responseReentryCycles: [{
        cycleId: "cycle-surface",
        responseReentry: {
          reentryId: "reentry-surface",
          sourceAttemptId: "attempt-surface",
          sourceResponseHandoffId: "handoff-surface",
          responseClassification: "completed",
          assistantContentAvailability: "available",
          toolExtractionReadiness: "no_tool_calls",
          redactionState: "report-safe",
          rawOutputExcluded: true,
          reentryStatus: "processed",
          terminalSuccessClaim: false,
          notProvenClaims: ["reentry-processed-is-not-task-success"],
        },
        responseBoundary: {
          responseId: "response-surface",
          providerMode: "real",
          source: "existing_safe_projection",
          status: "observed",
          assistantContentSummary: "safe summary",
          toolCallCount: 0,
          redaction: {
            status: "report-safe",
            excluded: [],
          },
          notProvenClaims: ["model-response-complete-is-not-task-success"],
          terminalSuccessClaim: false,
        },
        assistantAccumulation: {
          accumulationId: "accumulation-surface",
          sourceReentryId: "reentry-surface",
          contentAvailability: "available",
          contentSummarySafeLabel: "report-safe-summary-present",
          contentRedactionState: "report-safe",
          hiddenChannelExcluded: true,
          completionStatus: "accumulated",
          terminalSuccessClaim: false,
          notProvenClaims: ["assistant-accumulated-is-not-task-success"],
        },
        toolExtraction: {
          extractionId: "extraction-surface",
          sourceAssistantAccumulationId: "accumulation-surface",
          extractedCallIds: [],
          malformedCallIds: [],
          unsupportedCallIds: [],
          unknownToolIds: [],
          noToolStatus: "observed",
          extractionConfidence: "none",
          handoffReadiness: "no_tool_calls",
          terminalSuccessClaim: false,
          notProvenClaims: ["no-tool-response-is-not-task-completion"],
        },
        cycleBoundary: {
          cycleId: "cycle-surface",
          sourceInvocationAttemptId: "attempt-surface",
          responseReentryId: "reentry-surface",
          assistantAccumulationId: "accumulation-surface",
          toolExtractionId: "extraction-surface",
          nextHandoffKind: "none",
          cycleStatus: "no_tool_response_observed",
          stopReason: "no-tool-response-observed",
          continuationRequirement: "no_automatic_continuation",
          terminalSuccessClaim: false,
          notProvenClaims: ["cycle-boundary-is-not-terminal-success"],
        },
        terminalSuccessClaim: false,
        notProvenClaims: [
          "reentry-processed-is-not-task-success",
          "no-tool-response-is-not-task-completion",
          "cycle-boundary-is-not-terminal-success",
        ],
      }],
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "waiting_for_input",
      runtimeEvents,
    });
    const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(viewModel?.sections.find((section) => section.title === "Response cycle"))
      .toMatchObject({
        status: "observed",
        severity: "not_proven",
      });
    expect(rendered).toContain("cycle=no_tool_response_observed");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(rendered).not.toContain("Outcome: success");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
  });

  it("renders invocation gate facts without claiming provider or task success", () => {
    const request = createModelRequestBoundary({
      requestId: "request-surface-invocation",
      providerSafeLabel: "Provider A",
      modelSafeLabel: "Model A",
      providerReadinessStatus: "ready",
    });
    const preparation = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({
        bundleId: "bundle-surface-invocation",
        turnId: "turn-surface-invocation",
        toolResultMessages: {
          batchId: "messages-surface-invocation",
          dispatchPlanId: "plan-surface-invocation",
          messages: [],
          preparedCount: 0,
          blockedCount: 0,
          terminalSuccessClaim: false,
          notProvenClaims: [],
        },
      }),
      modelRequestBoundary: request,
    });
    const gate = createModelInvocationGate({ requestPreparation: preparation });
    const attempt = createModelInvocationAttemptEnvelope({ gate });
    const runtimeEvents = projectRuntimeEvents({
      modelInvocationGates: [gate],
      modelInvocationAttempts: [attempt],
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "waiting_for_input",
      runtimeEvents,
    });

    const section = viewModel?.sections.find((candidate) =>
      candidate.title === "Invocation gate"
    );
    expect(section).toMatchObject({
      kind: "model_boundary",
      status: "blocked",
      severity: "blocked",
    });
    expect(section?.summary).toContain("attempt=blocked");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(viewModel)).not.toContain('"success":true');
  });

  it("renders controlled invocation facts without claiming provider or task success", async () => {
    const registry = projectProviderRegistry({
      providers: [{
        providerId: "provider-a",
        safeLabel: "Provider A",
        providerKind: "custom",
        endpointClass: "unknown",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility: unknownProviderCompatibilityFlags(),
        riskLevel: "low",
      }],
      models: [{
        modelId: "model-a",
        safeLabel: "Model A",
        providerId: "provider-a",
        family: "fixture",
        compatibility: unknownProviderCompatibilityFlags(),
        knownLimitations: [],
      }],
      auth: [{
        providerId: "provider-a",
        authSourceKind: "none",
        authMode: "none",
        resolutionStatus: "resolved",
      }],
    });
    const request = createModelRequestBoundary({
      requestId: "request-surface-controlled",
      providerId: "provider-a",
      providerSafeLabel: "Provider A",
      modelSafeLabel: "Model A",
      providerReadinessStatus: "ready",
      providerRegistry: registry,
    });
    const preparation = prepareNextTurnModelRequest({
      nextTurnBundle: prepareNextTurnBundle({
        bundleId: "bundle-surface-controlled",
        turnId: "turn-surface-controlled",
        toolResultMessages: {
          batchId: "messages-surface-controlled",
          dispatchPlanId: "plan-surface-controlled",
          messages: [{
            messageId: "message-surface-controlled",
            role: "tool",
            toolCallId: "call-surface-controlled",
            toolName: "read",
            safeContentSummary: "safe summary",
            category: "executed_tool_fact",
            deliveryStatus: "prepared",
            redactionStatus: "report-safe",
            notProvenClaims: [],
            terminalSuccessClaim: false,
          }],
          preparedCount: 1,
          blockedCount: 0,
          terminalSuccessClaim: false,
          notProvenClaims: [],
        },
      }),
      modelRequestBoundary: request,
      providerRegistry: registry,
      providerId: "provider-a",
      modelId: "model-a",
    });
    const gate = createModelInvocationGate({
      requestPreparation: preparation,
      explicitOptIn: { state: "present", sourceSafeLabel: "approved-safe-label" },
    });
    const adapter = await runControlledModelInvocationAdapter({
      gate,
      requestPreparation: preparation,
      invocationMode: "controlled_provider_fetch",
      executor: () => ({
        kind: "completed",
        response: { content: "safe content", finishReason: "stop" },
      }),
    });
    const runtimeEvents = projectRuntimeEvents({
      controlledModelInvocations: [adapter],
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "waiting_for_input",
      runtimeEvents,
    });

    const section = viewModel?.sections.find((candidate) =>
      candidate.title === "Controlled invocation"
    );
    expect(section).toMatchObject({
      kind: "provider",
      status: "observed",
      severity: "not_proven",
    });
    expect(section?.summary).toContain("fallbackAttempted=false");
    expect(section?.summary).toContain("handoff=completed");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(viewModel)).not.toContain('"success":true');
  });

  it("renders coding result and loop observation sections together without changing verdict truth", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess_surface_combined",
      workspaceRoot: "/workspace",
      prompt: "run command",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-surface-combined",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "surface-combined",
      prompt: "run command",
      loop,
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "completed",
      terminalClassification: "success",
      terminalReason: "completed",
      codingResult: codingResult({
        taskSatisfaction: {
          verdict: "insufficient-evidence",
          reasons: ["tool result is observation only"],
          requiredEvidence: ["verification"],
          observedEvidence: ["tool-result"],
        },
      }),
      loopTrajectory: trajectory,
    });
    const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(viewModel?.sections.map((section) => section.kind)).toEqual(
      expect.arrayContaining(["apply", "verification", "turn", "provider", "events"]),
    );
    expect(viewModel?.verdict).toContain("did not gather enough evidence");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(rendered).toContain("providerCalled=not-proven");
    expect(rendered).not.toContain("Outcome: success");
  });

  it("renders PL008 session and context continuation facts as not-proven", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess_surface_pl008",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "continue safely" }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({
      sessionProjection,
      optionalFacts: ["branch-summary-record"],
    });
    const contextRebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const continuationReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput: contextRebuildInput,
      optionalFacts: ["branch-summary-record"],
    });
    const replaySafeLoopStateSummary = summarizeReplaySafeLoopState({
      sessionProjection,
      contextRebuildProjection,
      continuationReadiness,
      rebuildInput: contextRebuildInput,
      terminalResultFacts: {
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
      },
    });
    const trajectory = projectLoopTrajectory({
      loopId: "surface-pl008",
      prompt: "continue safely",
      sessionProjection,
      contextRebuildProjection,
      contextRebuildInput,
      continuationReadiness,
      replaySafeLoopStateSummary,
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      codingResult: codingResult(),
      loopTrajectory: trajectory,
    });
    const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(rendered).toContain("readiness=1");
    expect(rendered).toContain("replaySummaries=1");
    expect(rendered).toContain("branch=observed");
    expect(rendered).toContain("compaction=observed");
    expect(rendered).toContain("rebuildInputs=1");
    expect(rendered).toContain("contextSuccess=not-proven");
    expect(rendered).not.toContain("Outcome: success");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
  });

  it("renders the consolidated product loop adapter status without changing terminal truth", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess_surface_adapter",
      workspaceRoot: "/workspace",
      prompt: "adapter surface",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-surface-adapter",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "surface-adapter",
      prompt: "adapter surface",
      loop,
    });
    const adapter = projectProductLoopAdapter({
      adapterId: "surface-adapter",
      loopTrajectory: trajectory,
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      productLoopAdapter: adapter,
    });
    const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

    expect(viewModel?.sections.map((section) => section.title)).toEqual(
      expect.arrayContaining([
        "Product loop adapter",
        "Feature integration contract",
      ]),
    );
    expect(rendered).toContain("product_integrated=");
    expect(rendered).toContain("observation_only=");
    expect(rendered).toContain("feature-contract-valid-is-not-success");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(rendered).not.toContain("Outcome: success");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
  });

  it("renders Context and Planning block sections from machine facts without success inflation", async () => {
    await withPlanningFixture(async (workspaceRoot) => {
      const planning = await runPlanningRuntime({
        workspaceRoot,
        userTask: "Implement better context engine target ranking and cover it with a test",
        maxRepoFiles: 80,
        maxCandidates: 5,
      });
      const summary = buildContextPlanningBlockSummary({
        context: planning.context,
        planning,
        mutationHandoff: planning.mutationHandoff,
      });
      const viewModel = projectProductSurfaceViewModel({
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
        contextPlanningSummary: summary,
      });
      const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

      expect(viewModel?.sections.map((section) => section.kind)).toEqual([
        "context_discovery",
        "context_acquisition",
        "planning",
        "handoff",
        "continuation_context",
        "verdict",
        "not_proven",
        "next_action",
      ]);
      expect(rendered).toContain("[warning] Planning:");
      expect(rendered).toContain("quality=");
      expect(rendered).toContain("[not_proven] Handoff:");
      expect(rendered).toContain("noWrite=no-write-authority-granted");
      expect(rendered).toContain("verificationRun=selected-not-run");
      expect(rendered).toContain("memoryReuse=");
      expect(rendered).toContain("product-surface-rendered-is-not-success");
      expect(rendered).not.toContain("Outcome: success");
      expect(viewModel?.terminalSuccessClaim).toBe(false);
    });
  });

  it("keeps human section status consistent with blocked and stale machine facts", async () => {
    await withPlanningFixture(async (workspaceRoot) => {
      const planning = await runPlanningRuntime({
        workspaceRoot,
        userTask: "Implement better context engine target ranking and cover it with a test",
        maxRepoFiles: 80,
        maxCandidates: 5,
      });
      const summary = buildContextPlanningBlockSummary({
        context: {
          ...planning.context,
          memory: {
            ...planning.context.memory,
            invalidation: {
              ...planning.context.memory.invalidation,
              staleFiles: ["src/contextEngine.ts"],
              invalidationSignals: ["file-stat-mismatch:src/contextEngine.ts"],
            },
          },
        },
        planning,
      });
      const viewModel = projectProductSurfaceViewModel({
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
        contextPlanningSummary: summary,
      });
      const rendered = renderTerminalMessage(viewModel!, { mode: "detailed" }).lines.join("\n");

      for (const kind of ["context_discovery", "context_acquisition", "planning", "continuation_context"] as const) {
        expect(viewModel?.sections.find((section) => section.kind === kind)).toMatchObject({
          severity: "blocked",
          status: "blocked",
        });
      }
      expect(rendered).toContain("stale=2");
      expect(rendered).toContain("status: blocked");
      expect(rendered).toContain("refresh");
      expect(viewModel?.nextAction).toContain("refresh");
      expect(viewModel?.terminalSuccessClaim).toBe(false);
    });
  });

  it("redacts unsafe raw output, provider config, patch payloads, and hidden reasoning", () => {
    const viewModel = projectProductSurfaceViewModel({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      stopReason: "not verified",
      codingResult: codingResult({
        evidence: [
          "proposal-source:rawProviderOutput=secret-payload",
          "proposal-state:oldText=before newText=after hidden reasoning",
          "not-proven:provider.env=/home/wang/.private-agents-real/provider.env token=abc123 <html>unsafe</html>",
        ],
        verification: {
          status: "failed",
          command: "npm test",
          reason: "stdout raw command output stderr hidden reasoning",
        },
      }),
    });
    const rendered = renderTerminalMessage(viewModel!).lines.join("\n");

    expect(rendered).not.toMatch(
      /secret-payload|oldText=before|newText=after|abc123|<html>|\/home\/wang\/\.private-agents-real|stdout raw command output|hidden reasoning/i,
    );
    expect(rendered).toContain("provider-config=[redacted]");
    expect(rendered).toContain("[raw-content-excluded]");
  });

  it("renders model boundary status without raw output or success inflation", () => {
    const phase = projectModelBoundaryPhase({
      phaseId: "phase-surface",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-surface",
        providerSafeLabel: "Synthetic provider",
        modelSafeLabel: "Fixture model",
        providerReadinessStatus: "ready",
      }),
      responseId: "response-surface",
      streamEvents: [
        { eventId: "start", kind: "stream_started", retry: "not_allowed" },
        {
          eventId: "delta",
          kind: "content_delta",
          contentDelta: "raw provider output: hidden reasoning token=secret",
          retry: "not_allowed",
        },
        {
          eventId: "cancel",
          kind: "stream_cancelled",
          cancellationKind: "user_cancelled",
          retry: "not_allowed",
        },
      ],
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped_error",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      modelBoundaryPhase: phase,
    });
    const rendered = viewModel ? renderTerminalMessage(viewModel).lines.join("\n") : "";

    expect(viewModel?.sections.some((section) => section.kind === "model_boundary")).toBe(true);
    expect(rendered).toContain("Model boundary");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(rendered).not.toMatch(/token=secret|raw provider output|hidden reasoning/i);
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(viewModel?.notProvenClaims).toContain("model-response-complete-is-not-task-success");
  });

  it("renders provider stream adapter status without treating provider observations as success", async () => {
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-surface",
      requestBoundary: createModelRequestBoundary({
        requestId: "request-adapter-surface",
        providerMode: "real",
        providerSafeLabel: "OpenAI",
        modelSafeLabel: "safe-model",
        providerReadinessStatus: "ready",
      }),
      responseId: "response-adapter-surface",
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request: {
        schemaVersion: "1.0.0",
        model: "safe-model",
        messages: [{ role: "user", content: "safe" }],
      },
      fetchProviderResponse: () => ({
        kind: "completed",
        response: {
          content: "raw provider output: hidden reasoning token=secret",
          finishReason: "stop",
        },
      }),
    });

    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "waiting_for_input",
      providerStreamAdapter: adapter,
      modelBoundaryPhase: adapter.modelBoundaryPhase,
    });
    const rendered = viewModel ? renderTerminalMessage(viewModel).lines.join("\n") : "";
    const providerSection = viewModel?.sections.find((section) => section.kind === "provider");

    expect(rendered).toContain("Provider stream adapter");
    expect(rendered).toContain("fetchAttempted=true");
    expect(rendered).toContain("classification=live_completed");
    expect(providerSection?.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "recoveryFacts",
          value: expect.stringContaining("fallback_not_attempted"),
        }),
      ]),
    );
    expect(rendered).toContain("streamProjected=true");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(rendered).not.toMatch(/token=secret|raw provider output|hidden reasoning/i);
    expect(viewModel?.terminalSuccessClaim).toBe(false);
    expect(viewModel?.notProvenClaims).toContain("provider-stream-projected-is-not-task-success");
  });

  it("renders tool outcome and next-turn facts without terminal success", () => {
    const runtimeEvents = projectRuntimeEvents({
      toolOutcomeBundles: [{
        bundleId: "tool-outcome-bundle:batch-a",
        sourceBatchId: "tool-result-batch:batch-a",
        resultMessageIds: ["tool-result-message:call-a"],
        receiptIds: ["receipt-a"],
        executedCount: 1,
        failedCount: 0,
        blockedCount: 1,
        authorityRequiredCount: 0,
        unsupportedCount: 0,
        malformedCount: 0,
        unknownCount: 0,
        notDispatchedCount: 0,
        mixedOutcomeStatus: "mixed_success_and_non_success",
        redactionStatus: "report-safe",
        detailStatuses: [],
        blockingFacts: ["call-b:blocked_by_policy"],
        notProvenClaims: ["tool-outcome-bundle-is-not-task-success"],
        terminalSuccessClaim: false,
      }],
      nextTurnBundles: [{
        bundleId: "bundle-a",
        turnId: "turn-a",
        sourceToolOutcomeBundleId: "tool-outcome-bundle:batch-a",
        sourceToolResultMessageIds: ["tool-result-message:call-a"],
        safeToolResultMessages: [],
        includedToolResultMessageIds: ["tool-result-message:call-a"],
        excludedToolResultMessageIds: [],
        messageExclusionReasons: [],
        readinessStatus: "ready_with_partial_tool_results",
        blockingFacts: ["call-b:blocked_by_policy"],
        deliveryFacts: [],
        steeringMessageIds: [],
        followUpMessageIds: [],
        providerMetadataIds: [],
        deliveryStatus: "waiting",
        redaction: { status: "report-safe", excluded: [] },
        notProvenClaims: ["next-turn-ready-is-not-provider-execution"],
        terminalSuccessClaim: false,
      }],
    });
    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      runtimeEvents,
    });
    const rendered = viewModel ? renderTerminalMessage(viewModel).lines.join("\n") : "";

    expect(rendered).toContain("Tool outcome");
    expect(rendered).toContain("outcome=mixed_success_and_non_success");
    expect(rendered).toContain("nextTurn=ready_with_partial_tool_results");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
  });

  it("renders request preparation facts without provider success inflation", () => {
    const nextTurnBundle = prepareNextTurnBundle({
      bundleId: "bundle-request-surface",
      turnId: "turn-request-surface",
      toolResultMessages: {
        batchId: "tool-result-message-batch:batch-a",
        dispatchPlanId: "plan-a",
        messages: [{
          messageId: "tool-result-message:call-a",
          role: "tool",
          toolCallId: "call-a",
          toolName: "read",
          safeContentSummary: "safe tool result",
          category: "executed_tool_fact",
          deliveryStatus: "prepared",
          redactionStatus: "report-safe",
          notProvenClaims: ["task-success"],
          terminalSuccessClaim: false,
        }],
        preparedCount: 1,
        blockedCount: 0,
        terminalSuccessClaim: false,
        notProvenClaims: ["next-turn-success"],
      },
    });
    const preparation = prepareNextTurnModelRequest({
      nextTurnBundle,
      modelRequestBoundary: createModelRequestBoundary({
        requestId: "request-surface",
        providerSafeLabel: "Provider",
        modelSafeLabel: "Model",
        providerReadinessStatus: "ready",
      }),
      instructionSummary: "safe instruction",
      taskSummary: "safe task",
    });
    const runtimeEvents = projectRuntimeEvents({
      nextTurnRequestPreparations: [preparation],
    });
    const viewModel = projectProductSurfaceViewModel({
      status: "stopped",
      terminalClassification: "stopped",
      terminalReason: "stopped_error",
      runtimeEvents,
    });
    const rendered = viewModel ? renderTerminalMessage(viewModel).lines.join("\n") : "";

    expect(rendered).toContain("Request preparation");
    expect(rendered).toContain("readiness=ready_for_explicit_model_invocation");
    expect(rendered).toContain("provider=Provider");
    expect(rendered).toContain("terminalSuccessClaim=false");
    expect(viewModel?.terminalSuccessClaim).toBe(false);
  });
});

async function withPlanningFixture<T>(
  fn: (workspaceRoot: string) => Promise<T>,
): Promise<T> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "product-surface-context-planning-"));
  try {
    await fs.mkdir(path.join(workspaceRoot, "src"), { recursive: true });
    await fs.writeFile(
      path.join(workspaceRoot, "package.json"),
      JSON.stringify({ name: "product-surface-fixture", scripts: { test: "vitest run" } }, null, 2),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "contextEngine.ts"),
      [
        "import { rankTarget } from '../targetRanker.js';",
        "export function runContextEngine(task: string) {",
        "  return rankTarget(task);",
        "}",
        "",
      ].join("\n"),
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "targetRanker.ts"),
      "export function rankTarget(task: string) { return task.length; }\n",
    );
    await fs.writeFile(
      path.join(workspaceRoot, "src", "contextEngine.test.ts"),
      "import { runContextEngine } from './contextEngine.js';\nexpect(runContextEngine('task')).toBe(4);\n",
    );
    return await fn(workspaceRoot);
  } finally {
    await fs.rm(workspaceRoot, { recursive: true, force: true });
  }
}

function codingResult(overrides: Partial<CodingResultSummary> = {}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: ["not enough evidence yet"],
      requiredEvidence: ["task-relevant verification"],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "not-requested",
    },
    evidence: [],
    ...overrides,
  };
}

function manifest(input: Partial<PackageManifestContract>): PackageManifestContract {
  return {
    packageId: "pkg.default",
    safeName: "Default Package",
    version: {
      exactVersion: "0.0.0",
      pinnedState: "pinned",
      integrity: "sha256-default",
    },
    sourceKind: "test_fixture",
    sourceLabel: "test fixture",
    scope: "test_fixture",
    trustLevel: "trusted",
    enabledState: "disabled",
    resourceIds: [],
    declaredCapabilities: [],
    requiredPermissions: [],
    executable: false,
    supported: false,
    notProvenClaims: [],
    ...input,
  };
}

import { describe, expect, it } from "vitest";

import { createEvidenceOnlySavePoint } from "../../evidence/runtimeSavePoint.js";
import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import {
  observeRepairApply,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "../../repair/loopBoundary.js";
import { applyExtensionHookPolicy } from "../extensions/lifecycle.js";
import { projectPackageResourceInventory } from "../resources/inventory.js";
import { projectStaticResourceRegistry } from "../resources/projection.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { evaluateContinuationReadiness } from "../../session/continuationReadiness.js";
import { summarizeReplaySafeLoopState } from "../../session/replaySafeLoopState.js";
import { createCommandExecutionReceipt } from "../execution/receipt.js";
import { runAgentLoopContract } from "../loop/contract.js";
import { projectProductLoopAdapter } from "../loop/adapter.js";
import { projectLoopTrajectory } from "../loop/trajectory.js";
import { projectModelBoundaryPhase } from "../loop/modelBoundary.js";
import { runProviderStreamAdapter } from "../loop/providerStreamAdapter.js";
import { createRuntimeTurnSnapshot } from "../../turn/turnSnapshot.js";
import { createModelResponseBoundary } from "../../provider/response/boundary.js";
import { createModelRequestBoundary } from "../../provider/request/boundary.js";
import { accumulateAssistantResponse } from "../../turn/assistantResponse.js";
import { evaluateNextTurnDeliveryPolicy } from "../../turn/deliveryPolicy.js";
import { projectFollowUpQueue } from "../../turn/followUpQueue.js";
import { prepareNextTurnBundle } from "../../turn/nextTurnBundle.js";
import { projectSteeringQueue } from "../../turn/steeringQueue.js";
import { prepareToolResultMessages } from "../../turn/toolResultMessage.js";
import {
  observeVerificationResult,
  projectVerificationIntent,
} from "../../verification/loopBoundary.js";
import { extractToolCallBatch } from "../../tools/toolCallBatch.js";
import { dispatchToolBatch, planToolBatchDispatch } from "../../tools/toolBatchDispatch.js";
import {
  createToolAfterObservationAnnotation,
  createToolBeforePolicyDecision,
  createToolInterceptionIntent,
} from "../../tools/policy/interception.js";
import { projectRuntimeEvents } from "./projection.js";

describe("runtime event projection", () => {
  it("projects runtime snapshot and receipt facts in stable observation order", () => {
    const snapshot = createRuntimeTurnSnapshot({
      sessionId: "sess-events",
      turn: 1,
      phase: "turn",
      workspaceRoot: "/tmp/workspace",
      providerOptIn: false,
    });
    const receipt = createCommandExecutionReceipt({
      request: {
        operationKind: "command.run",
        command: "sh",
        args: ["-c", "printf ok"],
        cwd: "/tmp/workspace",
        workspaceRoot: "/tmp/workspace",
        authority: {
          mode: "command-allowlisted",
          source: "tool-runtime-approval",
          reason: "test authority",
        },
        caller: "core-tool:bash",
        reason: "test events receipt",
        reportSafeCommand: "printf ok",
      },
      result: {
        status: "completed",
        exitCode: 0,
        stdout: "ok",
        stderr: "",
      },
    });
    const savePoint = createEvidenceOnlySavePoint({
      turnSnapshot: snapshot,
      phase: "save_point",
      evidenceIds: ["verification:not-run"],
      executionReceipts: [receipt],
    });

    const events = projectRuntimeEvents({
      turnSnapshot: snapshot,
      executionReceipts: [receipt],
      savePoint,
      resultFacts: {
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
        verdictSource: "result",
      },
    });

    expect(events.map((event) => event.type)).toEqual([
      "turn-snapshot-observed",
      "phase-observed",
      "execution-receipt-observed",
      "save-point-observed",
      "result-facts-observed",
      "terminal-verdict-observed",
    ]);
    expect(events.map((event) => event.sequence)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(events[2]?.facts).toMatchObject({
      receiptId: receipt.receiptId,
      executionStatus: "success",
      errorClass: "success",
    });
    expect(events[4]?.facts).toMatchObject({
      terminalSuccessClaim: false,
      terminalClassification: "stopped",
    });
  });

  it("projects model response, assistant accumulation, and tool-call batch events as observation-only", () => {
    const boundary = createModelResponseBoundary({
      responseId: "response-events-boundary",
      turnId: "turn-1",
      source: "fake_default_safe",
      assistantContent: "safe assistant text",
      toolCallCount: 2,
    });
    const assistant = accumulateAssistantResponse({
      responseBoundary: boundary,
      chunks: [{
        textDelta: "safe assistant text",
        toolCalls: [
          { id: "call-read", name: "read", arguments: { path: "a.ts" } },
          { id: "call-unsupported", name: "mcp__missing__tool" },
        ],
      }],
    });
    const batch = extractToolCallBatch({
      responseBoundary: boundary,
      assistantResponse: assistant,
    });

    const events = projectRuntimeEvents({
      modelResponseBoundaries: [boundary],
      assistantResponses: [assistant],
      toolCallBatches: [batch],
    });
    const serialized = JSON.stringify(events);

    expect(events.map((event) => event.type)).toEqual([
      "model-response-boundary-observed",
      "assistant-response-accumulated",
      "tool-call-batch-extracted",
      "tool-dispatch-not-run",
    ]);
    expect(
      events.every((event) => event.facts.terminalSuccessClaim === false),
    ).toBe(true);
    expect(serialized).not.toContain('"success":true');
    expect(events.flatMap((event) => event.notProvenClaims)).toEqual(
      expect.arrayContaining([
        "provider-success",
        "tool-dispatch-not-run",
        "tool-success",
        "terminal-success",
      ]),
    );
  });

  it("projects model request and provider stream events as observation-only", async () => {
    const request = createModelRequestBoundary({
      requestId: "request-events",
      providerMode: "real",
      providerSafeLabel: "OpenAI",
      modelSafeLabel: "Fixture model",
      providerReadinessStatus: "ready",
    });
    const adapter = await runProviderStreamAdapter({
      adapterId: "provider-adapter-events",
      requestBoundary: request,
      responseId: "response-events",
      explicitProviderOptIn: true,
      readiness: { status: "ready" },
      request: {
        schemaVersion: "1.0.0",
        model: "safe-model",
        messages: [{ role: "user", content: "safe" }],
      },
      fetchProviderResponse: () => ({
        kind: "completed",
        response: { content: "safe", finishReason: "stop" },
      }),
    });
    const phase = adapter.modelBoundaryPhase!;

    const events = projectRuntimeEvents({
      modelRequestBoundaries: [request],
      providerStreamAdapters: [adapter],
      providerResponseStreams: [phase.stream],
      modelBoundaryPhases: [phase],
    });

    expect(events.map((event) => event.type)).toEqual([
      "model-request-prepared",
      "provider-readiness-observed",
      "provider-fetch-attempted",
      "provider-stream-projected",
      "provider-stream-started",
      "provider-stream-delta-observed",
      "model-boundary-completed",
      "model-boundary-completed",
    ]);
    expect(events.every((event) => event.facts.terminalSuccessClaim === false)).toBe(true);
    expect(JSON.stringify(events)).toContain('"liveClassification":"live_completed"');
    expect(JSON.stringify(events)).toContain('"fallbackStatus":"fallback_not_attempted"');
    expect(JSON.stringify(events)).not.toMatch(/provider\.env|raw provider output|hidden reasoning/i);
  });

  it("projects PL005 tool dispatch phases and result messages as observation-only", async () => {
    const boundary = createModelResponseBoundary({
      responseId: "response-dispatch-events",
      turnId: "turn-1",
      source: "fake_default_safe",
      toolCallCount: 1,
    });
    const assistant = accumulateAssistantResponse({
      responseBoundary: boundary,
      chunks: [{ toolCalls: [{ id: "call-read", name: "read", arguments: { path: "a.ts" } }] }],
    });
    const batch = extractToolCallBatch({
      responseBoundary: boundary,
      assistantResponse: assistant,
    });
    const dispatch = await dispatchToolBatch({
      batch,
      context: { taskId: "task", workspaceRoot: "/workspace" },
      dispatchPolicy: "sequential",
      dispatch: async () => ({ success: true, content: "safe tool summary" }),
    });
    const messages = prepareToolResultMessages({
      dispatchPlan: dispatch.dispatchPlan,
      resultDetails: dispatch.resultDetails,
    });
    const events = projectRuntimeEvents({
      toolDispatchPlans: [planToolBatchDispatch({ batch, dispatchPolicy: "sequential" })],
      toolResultDetails: dispatch.resultDetails,
      toolResultMessages: [messages],
      toolResultAnnotations: dispatch.afterAnnotations,
    });

    expect(events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "tool-batch-dispatch-planned",
        "before-tool-policy-decided",
        "tool-call-dispatched",
        "tool-result-observed",
        "tool-result-message-prepared",
        "tool-result-annotated",
      ]),
    );
    expect(events.every((event) => event.facts.terminalSuccessClaim === false)).toBe(true);
    expect(JSON.stringify(events)).not.toContain('"success":true');
  });

  it("observes product loop adapters without upgrading result truth", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-adapter-events",
      workspaceRoot: "/workspace",
      prompt: "observe adapter",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-adapter-events",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "adapter-events",
      prompt: "observe adapter",
      loop,
    });
    const adapter = projectProductLoopAdapter({
      adapterId: "adapter-events",
      loopTrajectory: trajectory,
    });

    const events = projectRuntimeEvents({
      productLoopAdapters: [adapter],
    });

    expect(events.map((event) => event.type)).toEqual([
      "product-loop-adapter-observed",
    ]);
    expect(events[0]?.facts).toMatchObject({
      adapterId: "adapter-events",
      observationMode: "host-adapter",
      featureContractAvailable: true,
      nextTurnExecuted: false,
      terminalSuccessClaim: false,
    });
    expect(events[0]?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "adapter-observed-is-not-success",
        "feature-contract-valid-is-not-success",
        "terminal-success",
      ]),
    );
  });

  it("projects next-turn bundle, queues, delivery policy, and waiting events safely", () => {
    const steeringQueue = projectSteeringQueue({
      turnId: "sess:turn:1",
      messages: [{ id: "steer-a", mode: "steer", text: "steer safely" }],
    });
    const followUpQueue = projectFollowUpQueue({
      turnId: "sess:turn:1",
      pendingBundleId: "bundle-a",
      messages: [{ id: "follow-a", mode: "follow-up", text: "follow safely" }],
    });
    const policy = evaluateNextTurnDeliveryPolicy({
      bundleId: "bundle-a",
      steeringQueue,
      followUpQueue,
      deliveryStatus: "waiting",
    });
    const bundle = prepareNextTurnBundle({
      bundleId: "bundle-a",
      turnId: "sess:turn:1",
      steeringQueue,
      followUpQueue,
      deliveryPolicy: policy,
    });
    const events = projectRuntimeEvents({
      steeringQueues: [steeringQueue],
      followUpQueues: [followUpQueue],
      nextTurnDeliveryPolicies: [policy],
      nextTurnBundles: [bundle],
    });

    expect(events.map((event) => event.type)).toEqual([
      "steering-queued",
      "follow-up-queued",
      "next-turn-delivery-policy-evaluated",
      "next-turn-waiting",
      "next-turn-bundle-prepared",
    ]);
    expect(events.every((event) => event.facts.terminalSuccessClaim === false)).toBe(true);
    expect(events.flatMap((event) => event.notProvenClaims)).toEqual(
      expect.arrayContaining(["next-turn-success", "terminal-success"]),
    );
  });

  it("projects verification and repair handoff events as observation-only", () => {
    const intent = projectVerificationIntent({
      sourceTurnId: "turn-events",
      targetSummary: "verify target",
      dispatchStatus: "failed",
      relevanceStatus: "task_relevant",
    });
    const result = observeVerificationResult({
      intent,
      status: "failed",
      failureClass: "test-failure",
    });
    const handoff = projectRepairRequiredHandoff({ verification: result });
    const proposal = observeRepairProposal({ handoff, proposalSource: "fake_default_safe" });
    const apply = observeRepairApply({
      proposal,
      repairApplyStatus: "applied",
      postRepairVerificationStatus: "not_run",
    });
    const events = projectRuntimeEvents({
      verificationIntents: [intent],
      verificationResults: [result],
      repairRequiredHandoffs: [handoff],
      repairProposals: [proposal],
      repairApplyObservations: [apply],
    });

    expect(events.map((event) => event.type)).toEqual([
      "verification-dispatched",
      "verification-result-observed",
      "repair-required",
      "original-failure-preserved",
      "repair-proposal-observed",
      "repair-authority-required",
      "repair-apply-observed",
      "post-repair-verification-observed",
    ]);
    expect(events.every((event) => event.facts.terminalSuccessClaim === false)).toBe(true);
    expect(events.flatMap((event) => event.notProvenClaims)).toEqual(
      expect.arrayContaining([
        "verification-success",
        "repair-success",
        "repair-apply-without-post-repair-verification-is-not-success",
      ]),
    );
  });

  it("redacts unsafe event fields and avoids raw tool content", () => {
    const events = projectRuntimeEvents({
      toolResults: [
        {
          success: false,
          output: "raw provider output: hidden reasoning sk-1234567890",
          error: "oldText=raw-before newText=raw-after",
          content: "token=secret-value /home/wang/.private-agents-real/provider.env",
          details: {
            raw: "<html>full file contents</html>",
          },
          reportSafe: {
            redactionStatus: "redacted",
            notProvenClaims: ["tool-result-success"],
          },
        },
      ],
      resultFacts: {
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason:
          "Authorization: Bearer abc /home/wang/.private-agents-real/provider.env",
      },
    });
    const serialized = JSON.stringify(events);

    expect(serialized).not.toMatch(
      /hidden reasoning|sk-1234567890|raw-before|raw-after|secret-value|private-agents-real|full file contents/i,
    );
    expect(serialized).toContain("[redacted-real-provider-home]");
    expect(serialized).toContain("[secret-redacted]");
    expect(events.some((event) => event.redaction.status === "redacted")).toBe(true);
  });

  it("keeps session projection and terminal observations evidence-only", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-tree-event",
        projectRoot: "/workspace",
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        status: "completed",
        turns: [],
      },
      stateSnapshot: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
      },
    });

    const events = projectRuntimeEvents({
      sessionProjection,
      resultFacts: {
        status: "completed",
        terminalClassification: "success",
        terminalReason: "completed",
        verdictSource: "result",
      },
    });

    expect(JSON.stringify(events)).not.toContain('"success":true');
    expect(
      events.every((event) => event.facts.terminalSuccessClaim !== true),
    ).toBe(true);
    expect(events.flatMap((event) => event.notProvenClaims)).toContain(
      "terminal-success",
    );
  });

  it("projects session branch, compaction, and context rebuild observations without verdict claims", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-branch-events",
        projectRoot: "/workspace",
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        status: "active",
        turns: [
          {
            role: "user",
            content: "token=secret oldText=raw-before",
            timestamp: "2026-05-19T00:00:01.000Z",
          },
        ],
      },
      compactions: [
        {
          id: "compact_events",
          summary: "raw provider output: hidden reasoning",
          evidence: "observed",
        },
      ],
      branchSummaries: [
        {
          id: "branch_events",
          summary: "do not leak this summary",
        },
      ],
    });
    const contextRebuildProjection = projectSessionContextRebuild({
      sessionProjection,
    });

    const events = projectRuntimeEvents({
      sessionProjection,
      contextRebuildProjection,
    });
    const serialized = JSON.stringify(events);

    expect(events.map((event) => event.type)).toEqual([
      "session-projection-observed",
      "session-active-path-projected",
      "session-branch-summary-observed",
      "session-compaction-observed",
      "session-context-rebuild-projected",
    ]);
    expect(
      events.every((event) => event.facts.terminalSuccessClaim !== true),
    ).toBe(true);
    expect(serialized).not.toMatch(
      /token=secret|raw-before|hidden reasoning|do not leak this summary/i,
    );
    expect(
      events.find((event) => event.type === "session-compaction-observed")
        ?.notProvenClaims,
    ).toContain("compaction-summary-truth");
    expect(
      events.find((event) => event.type === "session-context-rebuild-projected")
        ?.notProvenClaims,
    ).toContain("context-rebuild-execution");
  });

  it("projects branch and compaction unsupported observations for linear sessions", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-unsupported-events",
        projectRoot: "/workspace",
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z",
        status: "active",
        turns: [],
      },
    });

    const events = projectRuntimeEvents({ sessionProjection });

    expect(events.map((event) => event.type)).toEqual([
      "session-projection-observed",
      "session-active-path-projected",
      "branch-unsupported",
      "compaction-unsupported",
    ]);
    expect(
      events.find((event) => event.type === "branch-unsupported")
        ?.notProvenClaims,
    ).toContain("branch-navigation");
    expect(
      events.find((event) => event.type === "compaction-unsupported")
        ?.notProvenClaims,
    ).toContain("storage-backed-compaction");
  });

  it("projects context rebuild input, readiness, and replay-safe state observations", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-pl008-events",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "safe prompt" }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({
      sessionProjection,
      requiredFacts: ["latest-save-point"],
      optionalFacts: ["branch-summary-record"],
    });
    const rebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const missingRequiredReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput,
      requiredFacts: ["latest-save-point"],
      optionalFacts: ["branch-summary-record"],
    });
    const unsafeSessionProjection = projectSessionTree({
      session: {
        id: "sess-pl008-unsafe",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "safe prompt" }],
      },
      branchSummaries: [{
        id: "unsafe-branch",
        targetLocation: "/home/wang/.private-agents-real/provider.env",
        summary: "secret branch summary",
      }],
    });
    const unsafeProjection = projectSessionContextRebuild({
      sessionProjection: unsafeSessionProjection,
    });
    const unsafeReadiness = evaluateContinuationReadiness({
      sessionProjection: unsafeSessionProjection,
      contextRebuildProjection: unsafeProjection,
    });
    const replaySummary = summarizeReplaySafeLoopState({
      sessionProjection,
      contextRebuildProjection,
      continuationReadiness: missingRequiredReadiness,
      rebuildInput,
      terminalResultFacts: {
        status: "stopped_error",
        terminalClassification: "stopped",
        terminalReason: "stopped_error",
      },
    });

    const events = projectRuntimeEvents({
      contextRebuildInputs: [rebuildInput],
      continuationReadiness: [missingRequiredReadiness, unsafeReadiness],
      replaySafeLoopStateSummaries: [replaySummary],
    });
    const serialized = JSON.stringify(events);

    expect(events.map((event) => event.type)).toEqual([
      "context-rebuild-input-prepared",
      "continuation-readiness-evaluated",
      "missing-required-facts-blocked",
      "missing-optional-facts-observed",
      "continuation-readiness-evaluated",
      "unsafe-context-blocked",
      "replay-safe-loop-state-summarized",
    ]);
    expect(events.every((event) => event.facts.terminalSuccessClaim === false)).toBe(true);
    expect(events.flatMap((event) => event.notProvenClaims)).toEqual(
      expect.arrayContaining([
        "context-rebuild-input-is-not-success",
        "continuation-ready-is-not-success",
        "replay-safe-summary-is-not-success",
      ]),
    );
    expect(serialized).not.toMatch(/private-agents-real|secret branch summary/i);
  });

  it("projects static resource metadata without discovery, execution, or success claims", () => {
    const resourceProjection = projectStaticResourceRegistry({
      descriptors: [
        {
          id: "provider.safe",
          kind: "provider-metadata",
          name: "Safe Provider Metadata",
          description: "Metadata only.",
          sourceType: "fixture",
          ownerDomain: "runtime/resources",
          visibility: "runtime",
          enabledByDefault: false,
          requiresOptIn: true,
          capabilitiesSummary: ["text"],
          riskLevel: "high",
          providerMetadata: {
            providerLabel: "openai-compatible",
            endpointClass: "openai-compatible",
            capabilityFlags: ["text"],
            defaultEnabled: false,
            requiresOptIn: true,
          },
          notProvenClaims: [],
        },
      ],
    });

    const events = projectRuntimeEvents({ resourceProjection });
    const event = events.find(
      (candidate) => candidate.type === "resource-projection-observed",
    );

    expect(event?.facts).toMatchObject({
      registryMode: "explicit-static",
      dynamicDiscovery: "disabled",
      packageLoading: "disabled",
      pluginExecution: "disabled",
      providerDefaultEnablement: "disabled",
      resourceCount: 1,
      providerResourceCount: 1,
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify(events)).not.toContain('"success":true');
    expect(event?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "resource-execution",
        "provider-success",
        "tool-success",
        "verification-success",
        "terminal-success",
      ]),
    );
  });

  it("projects package inventory and conflicts as metadata-only observations", () => {
    const packageInventory = projectPackageResourceInventory({
      manifests: [
        {
          packageId: "pkg.safe",
          safeName: "Safe Package",
          version: {
            versionRange: "^1.0.0",
            pinnedState: "unpinned",
          },
          sourceKind: "project",
          sourceLabel:
            "provider.env=/home/wang/.private-agents-real/provider.env Authorization: Bearer abc",
          scope: "project",
          trustLevel: "project_declared",
          enabledState: "disabled",
          resourceIds: ["skill.same"],
          declaredCapabilities: ["review"],
          requiredPermissions: ["read"],
          executable: false,
          supported: false,
          notProvenClaims: [],
        },
        {
          packageId: "pkg.other",
          safeName: "Other Package",
          version: {
            exactVersion: "1.0.0",
            pinnedState: "pinned",
            integrity: "sha256-ok",
          },
          sourceKind: "user",
          sourceLabel: "user settings",
          scope: "user",
          trustLevel: "user_approved",
          enabledState: "disabled",
          resourceIds: ["skill.same"],
          declaredCapabilities: ["review"],
          requiredPermissions: ["read"],
          executable: false,
          supported: false,
          notProvenClaims: [],
        },
      ],
    });

    const events = projectRuntimeEvents({ packageInventory });
    const serialized = JSON.stringify(events);

    expect(events.map((event) => event.type)).toEqual([
      "package-inventory-observed",
      "package-conflict-observed",
      "package-conflict-observed",
    ]);
    expect(events[0]?.facts).toMatchObject({
      inventoryMode: "explicit-static",
      packageInstallation: "disabled",
      packageLoading: "disabled",
      dynamicDiscovery: "disabled",
      pluginExecution: "disabled",
      scriptExecution: "disabled",
      networkLookup: "disabled",
      packageCount: 2,
      conflictCount: 2,
      terminalSuccessClaim: false,
    });
    expect(
      events.every((event) => event.facts.terminalSuccessClaim !== true),
    ).toBe(true);
    expect(serialized).not.toMatch(/private-agents-real|provider\.env|Bearer abc/i);
    expect(serialized).not.toContain('"success":true');
    expect(events[0]?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "package-install",
        "package-loading",
        "provider-success",
        "tool-success",
        "verification-success",
        "terminal-success",
      ]),
    );
  });

  it("projects extension hook policy outcomes as observations only", () => {
    const hookOutcome = applyExtensionHookPolicy({
      descriptor: {
        hookId: "extension.safe.tool.observe",
        extensionId: "extension.safe",
        eventKind: "tool-call-prepared",
        ownerDomain: "runtime/extensions",
        allowedEffect: "block-action",
        riskLevel: "medium",
        requiresOptIn: true,
        supported: false,
        executable: false,
        registrationMode: "static-internal",
        notProvenClaims: [],
      },
      requestedEffect: "block-action",
      summary:
        "Blocked unsafe projection with provider.env=/home/wang/.private-agents-real/provider.env",
      evidenceAnnotations: ["extension-hook:block-action"],
    });

    const events = projectRuntimeEvents({
      hookPolicyOutcomes: [hookOutcome],
    });
    const event = events.find(
      (candidate) => candidate.type === "extension-hook-policy-observed",
    );
    const serialized = JSON.stringify(events);

    expect(event?.facts).toMatchObject({
      hookId: "extension.safe.tool.observe",
      extensionId: "extension.safe",
      eventKind: "tool-call-prepared",
      requestedEffect: "block-action",
      acceptedEffect: "block-action",
      policyStatus: "accepted",
      terminalSuccessClaim: false,
    });
    expect(serialized).not.toContain("/home/wang/.private-agents-real");
    expect(serialized).not.toContain('"success":true');
    expect(event?.notProvenClaims).toEqual(
      expect.arrayContaining([
        "extension-execution",
        "plugin-execution",
        "tool-success",
        "terminal-success",
      ]),
    );
  });

  it("projects tool policy decisions and annotations as observation-only events", () => {
    const allowDecision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "bash",
        caller: "test",
        operationKind: "command.run",
        requestedActionSummary: "printf ok",
        authorityMode: "command-allowlisted",
      }),
      status: "allow",
      reason: "allowed",
      policySource: "test-policy",
    });
    const authorityDecision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "write",
        caller: "test",
        operationKind: "file.write",
        requestedActionSummary: "write file",
        authorityMode: "permission-pending",
      }),
      status: "request_authority",
      reason: "approval required",
      policySource: "test-policy",
      authorityRequirement: "permission-pending",
    });
    const blockDecision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "bash",
        caller: "test",
        operationKind: "command.run",
        requestedActionSummary: "raw provider output: hidden reasoning sk-1234567890",
        authorityMode: "denied",
      }),
      status: "block",
      reason: "blocked provider.env=/home/wang/.private-agents-real/provider.env",
      policySource: "test-policy",
      authorityRequirement: "denied",
    });
    const unsupportedDecision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "mcp__missing__tool",
        toolKind: "mcp",
        caller: "test",
        operationKind: "tool.dispatch",
        requestedActionSummary: "unsupported tool",
      }),
      status: "unsupported",
      reason: "unsupported interception seam",
      policySource: "test-policy",
    });
    const annotation = createToolAfterObservationAnnotation({
      decision: allowDecision,
      toolId: "bash",
      resultStatus: "tool-success-observed",
      annotations: ["annotation observed"],
      nextActionSuggestions: ["keep terminal success evidence separate"],
      reportSafeSummary: "printf ok",
    });

    const events = projectRuntimeEvents({
      toolPolicyDecisions: [
        allowDecision,
        authorityDecision,
        blockDecision,
        unsupportedDecision,
      ],
      toolResultAnnotations: [annotation],
    });
    const serialized = JSON.stringify(events);

    expect(events.map((event) => event.type)).toEqual([
      "tool-policy-decision-observed",
      "tool-policy-decision-observed",
      "tool-authority-requested",
      "tool-policy-decision-observed",
      "tool-call-blocked",
      "tool-policy-decision-observed",
      "tool-interception-unsupported",
      "tool-result-annotated",
    ]);
    expect(
      events.every((event) => event.facts.terminalSuccessClaim !== true),
    ).toBe(true);
    expect(serialized).not.toMatch(
      /hidden reasoning|sk-1234567890|private-agents-real|provider\.env/i,
    );
    expect(serialized).not.toContain('"success":true');
    expect(
      events.find((event) => event.type === "tool-authority-requested")
        ?.notProvenClaims,
    ).toContain("terminal-success");
  });
});

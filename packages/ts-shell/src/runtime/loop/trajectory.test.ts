import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import {
  projectProviderRegistry,
  unknownProviderCompatibilityFlags,
} from "../../provider/registry/provider.js";
import {
  observeRepairApply,
  observeRepairProposal,
  projectRepairRequiredHandoff,
} from "../../repair/handoff/boundary.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import { summarizeReplaySafeLoopState } from "../../session/replay/state.js";
import {
  createToolAfterObservationAnnotation,
  createToolBeforePolicyDecision,
  createToolInterceptionIntent,
} from "../../tools/policy/interception.js";
import { createCommandToolResultSplit } from "../../tools/result/split.js";
import {
  observeVerificationResult,
  projectVerificationIntent,
} from "../../verification/result/boundary.js";
import { projectVerificationReceipt } from "../../verification/verificationFacade.js";
import { createCommandExecutionReceipt } from "../execution/receipt.js";
import {
  projectPackageResourceInventory,
  type PackageManifestContract,
} from "../resources/inventory.js";
import { projectStaticResourceRegistry } from "../resources/projection.js";
import {
  runAgentLoopContract,
  type AgentLoopContractToolResultBatch,
} from "./contract.js";
import {
  createLoopInfrastructureMap,
  LOOP_INFRASTRUCTURE_CATEGORIES,
} from "./infrastructure.js";
import { projectLoopTrajectory } from "./trajectory.js";

describe("loop trajectory projection", () => {
  it("maps every loop infrastructure category or marks it not-proven", () => {
    const map = createLoopInfrastructureMap();

    expect(map.entries.map((entry) => entry.category)).toEqual(
      LOOP_INFRASTRUCTURE_CATEGORIES,
    );
    expect(
      map.entries.every((entry) =>
        ["connected", "partial", "unsupported", "not_proven"].includes(
          entry.connectionStatus,
        )
      ),
    ).toBe(true);
    expect(map.entries.find((entry) => entry.category === "product-loop-replacement"))
      .toMatchObject({ connectionStatus: "not_proven" });
    expect(map.terminalSuccessClaim).toBe(false);
  });

  it("connects a synthetic loop trajectory without claiming success", async () => {
    const receipt = makeReceipt("trajectory");
    const split = createCommandToolResultSplit({
      receipt,
      content: "safe output",
      runtimeFacts: { summary: "observed" },
    });
    const loop = await runAgentLoopContract({
      sessionId: "sess-trajectory",
      workspaceRoot: "/workspace",
      prompt: "inspect loop",
      providerOptIn: false,
      maxTurns: 1,
      toolBatchPolicy: "sequential",
      modelBoundary: async () => ({
        responseId: "response-trajectory",
        stopReason: "tool-calls",
        toolCalls: [{ id: "call-1", name: "read", arguments: { path: "a.ts" } }],
      }),
      toolBatchBoundary: async (batch): Promise<AgentLoopContractToolResultBatch> => ({
        id: "tool-results",
        callBatchId: batch.id,
        results: [{ success: true, ...split }],
        executionReceipts: [receipt],
        failedToolCallIds: [],
        terminate: true,
      }),
    });
    const providerRegistry = projectProviderRegistry({
      providers: [{
        providerId: "synthetic",
        safeLabel: "Synthetic",
        providerKind: "stub",
        endpointClass: "none",
        authMode: "none",
        defaultEnabled: false,
        requiresExplicitOptIn: true,
        supportsFallback: "unknown",
        compatibility: unknownProviderCompatibilityFlags(),
        riskLevel: "low",
      }],
    });
    const intent = createToolInterceptionIntent({
      toolId: "read",
      caller: "loop-test",
      operationKind: "file.read",
      requestedActionSummary: "read a report-safe file path",
    });
    const decision = createToolBeforePolicyDecision({
      intent,
      status: "allow",
      reason: "metadata only",
      policySource: "test policy",
    });
    const annotation = createToolAfterObservationAnnotation({
      decision,
      toolId: "read",
      resultStatus: "tool-success-observed",
      executionReceipt: receipt,
      resultDetailsId: "result-details-1",
      reportSafeSummary: "tool result observed",
    });
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-trajectory",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:00.000Z",
        status: "running",
        turns: [{ role: "user", content: "inspect loop" }],
      },
      stateSnapshot: {
        status: "running",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({ sessionProjection });
    const resourceProjection = projectStaticResourceRegistry({
      descriptors: [{
        id: "provider.synthetic",
        kind: "provider-metadata",
        name: "Synthetic Provider",
        description: "metadata only",
        sourceType: "fixture",
        ownerDomain: "provider",
        visibility: "runtime",
        enabledByDefault: false,
        requiresOptIn: true,
        capabilitiesSummary: ["metadata"],
        riskLevel: "low",
        notProvenClaims: ["provider-called"],
      }],
    });
    const packageInventory = projectPackageResourceInventory({
      manifests: [manifest({ packageId: "pkg.synthetic", safeName: "Synthetic Package" })],
    });

    const trajectory = projectLoopTrajectory({
      loopId: "loop-trajectory",
      prompt: "inspect loop",
      loop,
      providerRegistry,
      toolPolicyDecisions: [decision],
      toolResultAnnotations: [annotation],
      sessionProjection,
      contextRebuildProjection,
      resourceProjection,
      packageInventory,
      resultFacts: {
        status: "stopped",
        terminalClassification: "stopped",
        terminalReason: "tool-batch-terminated",
        verdictSource: "result",
      },
    });

    expect(trajectory.turnIds).toEqual(["turn:1"]);
    expect(trajectory.stages.find((stage) => stage.category === "model-boundary"))
      .toMatchObject({ observationStatus: "partial" });
    expect(trajectory.stages.find((stage) => stage.category === "tool-call-batch"))
      .toMatchObject({ observationStatus: "partial" });
    expect(trajectory.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "tool-call-batch-extracted",
        "tool-dispatch-not-run",
      ]),
    );
    expect(trajectory.receiptIds).toEqual([receipt.receiptId]);
    expect(trajectory.toolPolicyIds).toEqual([decision.decisionId]);
    expect(trajectory.savePointIds).toHaveLength(1);
    expect(trajectory.sessionProjectionIds).toContain("sess-trajectory");
    expect(trajectory.contextRebuildProjectionIds).toContain(
      sessionProjection.activeLeafId,
    );
    expect(trajectory.providerMetadataIds).toContain("synthetic");
    expect(trajectory.productSurfaceSectionIds).toEqual(
      expect.arrayContaining(["task", "turn", "execution", "verification", "repair", "save_point"]),
    );
    expect(trajectory.terminalSuccessClaim).toBe(false);
    expect(trajectory.finalObservedFacts.terminalSuccessClaim).toBe(false);
    expect(
      trajectory.events.every((event) => event.facts.terminalSuccessClaim === false),
    ).toBe(true);
  });

  it("emits stable host-neutral JSON-safe event ordering", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-ordering",
      workspaceRoot: "/workspace",
      prompt: "order events",
      providerOptIn: false,
      modelBoundary: async () => ({
        responseId: "response-ordering",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "loop-ordering",
      prompt: "order events",
      loop,
    });

    expect(trajectory.events.map((event) => event.sequence)).toEqual(
      Array.from({ length: trajectory.events.length }, (_, index) => index + 1),
    );
    expect(trajectory.events[0]?.type).toBe("loop-input-observed");
    expect(trajectory.events.map((event) => event.type)).toContain(
      "loop-turn-snapshot-observed",
    );
    expect(trajectory.jsonEventStream.map((entry) => entry.order)).toEqual(
      Array.from({ length: trajectory.jsonEventStream.length }, (_, index) => index + 1),
    );
    expect(JSON.parse(JSON.stringify(trajectory.jsonEventStream))).toEqual(
      trajectory.jsonEventStream,
    );
  });

  it("projects PL005 dispatch result messages and save point facts without success claims", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-pl005-trajectory",
      workspaceRoot: "/workspace",
      prompt: "use a safe tool",
      providerOptIn: false,
      maxTurns: 1,
      toolBatchPolicy: "sequential",
      modelBoundary: async () => ({
        responseId: "response-pl005-trajectory",
        stopReason: "tool-calls",
        toolCalls: [{ id: "call-read", name: "read", arguments: { path: "a.ts" } }],
      }),
      toolBatchDispatch: async () => ({
        success: true,
        content: "safe tool summary",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "loop-pl005",
      prompt: "use a safe tool",
      loop,
    });

    expect(trajectory.toolResultMessageIds).toHaveLength(1);
    expect(trajectory.nextTurnBundleIds).toHaveLength(1);
    expect(trajectory.deliveryPolicyIds).toHaveLength(1);
    expect(trajectory.verificationIntentIds).toHaveLength(1);
    expect(trajectory.verificationResultIds).toHaveLength(1);
    expect(trajectory.stages.find((stage) => stage.category === "tool-result-messages"))
      .toMatchObject({ observationStatus: "observed" });
    expect(trajectory.stages.find((stage) => stage.category === "next-turn-delivery-policy"))
      .toMatchObject({ observationStatus: "observed" });
    expect(trajectory.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "tool-batch-dispatch-planned",
        "before-tool-policy-decided",
        "tool-result-message-prepared",
        "loop-save-point-observed",
        "loop-next-turn-delivery-policy-observed",
        "loop-verification-intent-observed",
        "loop-verification-result-observed",
      ]),
    );
    expect(trajectory.notProvenClaims).toEqual(
      expect.arrayContaining(["terminal-success", "next-turn-success"]),
    );
    expect(trajectory.terminalSuccessClaim).toBe(false);
  });

  it("projects verification and repair handoff facts without deriving success", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-pl007-trajectory",
      workspaceRoot: "/workspace",
      prompt: "verify and repair",
      providerOptIn: false,
      maxTurns: 1,
      modelBoundary: async () => ({
        responseId: "response-pl007-trajectory",
        stopReason: "stop",
      }),
      verificationBoundary: async ({ turnId }) => {
        const intent = projectVerificationIntent({
          sourceTurnId: turnId,
          targetSummary: "verify changed file",
          dispatchStatus: "failed",
          relevanceStatus: "task_relevant",
          coverageStatus: "covered",
          authorityRequirement: "granted",
        });
        const result = observeVerificationResult({
          intent,
          status: "failed",
          failureClass: "test-failed",
          repairEligible: true,
          runtimeReceiptIds: ["receipt-trajectory-repair"],
        });
        const repairRequired = projectRepairRequiredHandoff({ verification: result });
        const repairProposal = observeRepairProposal({ handoff: repairRequired });
        const repairApply = observeRepairApply({
          proposal: repairProposal,
          repairApplyStatus: "applied",
          postRepairVerificationStatus: "not_run",
        });
        return { intent, result, repairRequired, repairProposal, repairApply };
      },
    });
    const trajectory = projectLoopTrajectory({
      loopId: "loop-pl007",
      prompt: "verify and repair",
      loop,
    });

    expect(trajectory.verificationIntentIds).toHaveLength(1);
    expect(trajectory.verificationResultIds).toHaveLength(1);
    expect(trajectory.repairHandoffIds).toHaveLength(1);
    expect(trajectory.repairProposalIds).toHaveLength(1);
    expect(trajectory.repairApplyIds).toHaveLength(1);
    expect(trajectory.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "loop-repair-handoff-observed",
          facts: expect.objectContaining({
            failureClass: "test-failed",
            taskRelevanceStatus: "task_relevant",
            coverageStatus: "covered",
            repairBlocker: "none",
            repairRisk: "low",
            runtimeReceiptIds: ["receipt-trajectory-repair"],
            originalFailurePreserved: true,
            terminalSuccessClaim: false,
          }),
        }),
        expect.objectContaining({
          type: "loop-repair-handoff-observed",
          facts: expect.objectContaining({
            proposalSource: "unavailable",
            applyStatus: "not_applied",
            postRepairVerificationStatus: "not_run",
            originalFailureClass: "test-failed",
            runtimeReceiptIds: ["receipt-trajectory-repair"],
            terminalSuccessClaim: false,
          }),
        }),
      ]),
    );
    expect(trajectory.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "loop-verification-intent-observed",
        "loop-verification-result-observed",
        "loop-repair-handoff-observed",
      ]),
    );
    expect(trajectory.notProvenClaims).toEqual(
      expect.arrayContaining(["repair-success", "verification-success"]),
    );
    expect(trajectory.terminalSuccessClaim).toBe(false);
  });

  it("projects task-relevant verification receipt facts on the loop trajectory", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-verification-trajectory",
      workspaceRoot: "/workspace",
      prompt: "verify",
      providerOptIn: false,
      maxTurns: 1,
      verificationReceipt: projectVerificationReceipt({
        selectedCommand:
          "npm test -w packages/ts-shell -- src/verification/taskRelevantVerificationRoute.test.ts",
        authority: "explicitly-approved",
        dispatchStatus: "dispatched",
        runtimeStatus: "failed",
        runtimeReceiptIds: ["receipt-verification-trajectory"],
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
        responseId: "response-verification-trajectory",
        stopReason: "stop",
      }),
    });
    const trajectory = projectLoopTrajectory({
      loopId: "loop-verification-trajectory",
      prompt: "verify",
      loop,
    });
    const resultEvent = trajectory.events.find((event) =>
      event.type === "loop-verification-result-observed"
    );

    expect(resultEvent?.facts).toEqual(
      expect.objectContaining({
        status: "failed",
        relevanceStatus: "task_relevant",
        coverageStatus: "covered",
        authorityRequirement: "granted",
        runtimeReceiptIds: ["receipt-verification-trajectory"],
        failureClass: "test-failed",
        repairEligible: true,
        verdictStatus: "verification-failed",
        terminalSuccessClaim: false,
      }),
    );
    expect(trajectory.terminalSuccessClaim).toBe(false);
    expect(trajectory.notProvenClaims).toContain("task success");
  });

  it("connects PL008 context rebuild, readiness, replay-safe state, and gap stages", () => {
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-pl008-trajectory",
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
      loopId: "loop-pl008",
      prompt: "continue safely",
      sessionProjection,
      contextRebuildProjection,
      contextRebuildInput,
      continuationReadiness,
      replaySafeLoopStateSummary,
    });

    expect(trajectory.contextRebuildInputIds).toEqual([
      contextRebuildInput.rebuildInputId,
    ]);
    expect(trajectory.continuationReadinessIds).toEqual([
      continuationReadiness.readinessId,
    ]);
    expect(trajectory.replaySafeLoopStateSummaryIds).toEqual([
      replaySafeLoopStateSummary.summaryId,
    ]);
    expect(trajectory.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "context-rebuild-input-prepared",
        "continuation-readiness-evaluated",
        "branch-unsupported",
        "compaction-unsupported",
        "replay-safe-loop-state-summarized",
      ]),
    );
    expect(trajectory.stages.find((stage) => stage.category === "branch-gap"))
      .toMatchObject({ observationStatus: "observed" });
    expect(trajectory.stages.find((stage) => stage.category === "compaction-gap"))
      .toMatchObject({ observationStatus: "observed" });
    expect(trajectory.terminalSuccessClaim).toBe(false);
    expect(trajectory.notProvenClaims).toEqual(
      expect.arrayContaining([
        "continuation-ready-is-not-success",
        "replay-safe-summary-is-not-success",
      ]),
    );
  });

  it("keeps disconnected pieces visible as not-proven", () => {
    const trajectory = projectLoopTrajectory({
      loopId: "loop-disconnected",
      prompt: "metadata only",
    });

    expect(trajectory.stages.find((stage) => stage.category === "turn-snapshot"))
      .toMatchObject({ observationStatus: "not_proven" });
    expect(trajectory.stages.find((stage) => stage.category === "provider-metadata"))
      .toMatchObject({ observationStatus: "not_proven" });
    expect(trajectory.stages.find((stage) => stage.category === "product-loop-replacement"))
      .toMatchObject({
        connectionStatus: "not_proven",
        observationStatus: "not_proven",
      });
    expect(trajectory.notProvenClaims).toEqual(
      expect.arrayContaining([
        "turn-snapshot-not-observed",
        "provider-metadata-not-observed",
        "full-product-loop-replacement",
      ]),
    );
  });

  it("redacts unsafe trajectory facts and stream entries", () => {
    const trajectory = projectLoopTrajectory({
      loopId: "loop-redaction",
      prompt:
        "Bearer abcdef token=secret oldText=before newText=after raw provider output: nope hidden reasoning /home/wang/.private-agents-real/provider.env",
      productSurfaceSectionIds: ["provider.env=/home/wang/.private-agents-real/provider.env"],
    });
    const serialized = JSON.stringify(trajectory);

    expect(serialized).not.toMatch(
      /abcdef|token=secret|oldText=before|newText=after|raw provider output|hidden reasoning|private-agents-real/i,
    );
    expect(serialized).toMatch(/redacted|raw-content-excluded/);
    expect(trajectory.redaction.status).toBe("redacted");
  });
});

function makeReceipt(id: string) {
  return createCommandExecutionReceipt({
    request: {
      operationKind: "command.run",
      command: "sh",
      args: ["-c", "printf ok"],
      cwd: "/workspace",
      workspaceRoot: "/workspace",
      authority: {
        mode: "command-allowlisted",
        source: "tool-runtime-approval",
        reason: "test authority",
      },
      caller: "core-tool:bash",
      reason: `receipt ${id}`,
      reportSafeCommand: "printf ok",
    },
    result: {
      status: "completed",
      exitCode: 0,
      stdout: "ok",
      stderr: "",
    },
  });
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

import { describe, expect, it } from "vitest";

import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import {
  projectProviderRegistry,
  unknownProviderCompatibilityFlags,
} from "../../provider/providerRegistry.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import {
  createToolAfterObservationAnnotation,
  createToolBeforePolicyDecision,
  createToolInterceptionIntent,
} from "../../tools/interception.js";
import { createCommandToolResultSplit } from "../../tools/resultSplit.js";
import { createCommandExecutionReceipt } from "../execution/executionReceipt.js";
import {
  projectPackageResourceInventory,
  type PackageManifestContract,
} from "../resources/packageInventory.js";
import { projectStaticResourceRegistry } from "../resources/staticResourceProjection.js";
import {
  runAgentLoopContract,
  type AgentLoopContractToolResultBatch,
} from "./agentLoopContract.js";
import {
  createLoopInfrastructureMap,
  LOOP_INFRASTRUCTURE_CATEGORIES,
} from "./infrastructureMap.js";
import { projectLoopTrajectory } from "./trajectoryProjection.js";

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
      expect.arrayContaining(["task", "turn", "execution", "save_point"]),
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

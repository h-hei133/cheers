import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { evaluateContinuationReadiness } from "../../session/continuationReadiness.js";
import { summarizeReplaySafeLoopState } from "../../session/replaySafeLoopState.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { runAgentLoopContract } from "./agentLoopContract.js";
import {
  buildContextDiscoveryTargetSelectionFeatureContract,
  validateFutureFeatureIntegration,
} from "./featureContract.js";
import {
  getProductLoopPhaseStatusMap,
  PRODUCT_LOOP_PHASE_STATUS_MAP,
} from "./phaseStatus.js";
import {
  projectProductLoopAdapter,
  projectProductLoopAdapterObservationEvent,
} from "./productLoopAdapter.js";
import { projectLoopTrajectory } from "./trajectoryProjection.js";

describe("product loop adapter", () => {
  it("consolidates PL002 through PL008 safe references without terminal success", async () => {
    const loop = await runAgentLoopContract({
      sessionId: "sess-adapter",
      workspaceRoot: "/workspace",
      prompt: "observe adapter",
      providerOptIn: false,
      maxTurns: 1,
      toolBatchPolicy: "sequential",
      modelBoundary: async () => ({
        responseId: "response-adapter",
        stopReason: "tool-calls",
        toolCalls: [{ id: "call-read", name: "read", arguments: { path: "a.ts" } }],
      }),
      toolBatchDispatch: async () => ({
        success: true,
        content: "safe tool summary",
      }),
    });
    const sessionProjection = projectSessionTree({
      session: {
        id: "sess-adapter",
        projectRoot: "/workspace",
        createdAt: "2026-05-29T00:00:00.000Z",
        updatedAt: "2026-05-29T00:00:01.000Z",
        status: "active",
        turns: [{ role: "user", content: "observe adapter" }],
      },
    });
    const contextRebuildProjection = projectSessionContextRebuild({ sessionProjection });
    const contextRebuildInput = buildLoopContextRebuildInput({
      sessionProjection,
      contextRebuildProjection,
    });
    const continuationReadiness = evaluateContinuationReadiness({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput: contextRebuildInput,
    });
    const replaySafeLoopStateSummary = summarizeReplaySafeLoopState({
      sessionProjection,
      contextRebuildProjection,
      rebuildInput: contextRebuildInput,
      continuationReadiness,
    });
    const loopTrajectory = projectLoopTrajectory({
      loopId: "adapter-loop",
      prompt: "observe adapter",
      loop,
      sessionProjection,
      contextRebuildProjection,
      contextRebuildInput,
      continuationReadiness,
      replaySafeLoopStateSummary,
      resultFacts: {
        status: "stopped",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
        verdictSource: "result",
      },
    });

    const adapter = projectProductLoopAdapter({
      adapterId: "adapter-safe",
      promptSummary: "observe adapter",
      loopTrajectory,
      loop,
      sessionProjection,
      contextRebuildInput,
      contextRebuildProjection,
      continuationReadiness,
      replaySafeLoopStateSummary,
    });

    expect(adapter.safeReferences.turnSnapshotIds).toHaveLength(1);
    expect(adapter.safeReferences.modelResponseBoundaryIds).toEqual(["response-adapter"]);
    expect(adapter.safeReferences.toolCallBatchIds).toHaveLength(1);
    expect(adapter.safeReferences.toolDispatchPlanIds).toHaveLength(1);
    expect(adapter.safeReferences.toolResultMessageIds).toHaveLength(1);
    expect(adapter.safeReferences.savePointIds).toHaveLength(1);
    expect(adapter.safeReferences.nextTurnBundleIds).toHaveLength(1);
    expect(adapter.safeReferences.steeringMessageIds).toEqual([]);
    expect(adapter.safeReferences.followUpMessageIds).toEqual([]);
    expect(adapter.safeReferences.deliveryPolicyIds).toHaveLength(1);
    expect(adapter.safeReferences.verificationHandoffIds).toHaveLength(1);
    expect(adapter.safeReferences.contextRebuildInputIds).toEqual([
      contextRebuildInput.rebuildInputId,
    ]);
    expect(adapter.safeReferences.continuationReadinessIds).toEqual([
      continuationReadiness.readinessId,
    ]);
    expect(adapter.safeReferences.replaySafeLoopStateSummaryIds).toEqual([
      replaySafeLoopStateSummary.summaryId,
    ]);
    expect(adapter.continuationBoundary).toMatchObject({
      readinessReferenced: true,
      replaySafeStateReferenced: true,
      nextTurnExecuted: false,
      continuationSuccessClaim: false,
    });
    expect(adapter.terminalSuccessClaim).toBe(false);
    expect(adapter.resultTruthfulnessBoundary).toMatchObject({
      adapterObservedIsSuccess: false,
      productIntegratedIsSuccess: false,
      productSurfaceRenderedIsSuccess: false,
      terminalSuccessClaim: false,
    });
    expect(adapter.notProvenClaims).toEqual(
      expect.arrayContaining([
        "adapter-observed-is-not-success",
        "phase-product-integrated-is-not-success",
        "continuation-ready-is-not-success",
        "replay-safe-summary-is-not-success",
        "terminal-success",
      ]),
    );
  });

  it("classifies every required product loop phase and keeps all status values visible", () => {
    const phases = getProductLoopPhaseStatusMap();

    expect(phases).toBe(PRODUCT_LOOP_PHASE_STATUS_MAP);
    expect(phases.map((phase) => phase.phaseId)).toEqual(
      expect.arrayContaining([
        "cli-prompt-input",
        "turn-snapshot",
        "provider-model-boundary",
        "assistant-accumulation",
        "tool-call-extraction",
        "before-tool-policy",
        "tool-dispatch",
        "execution-receipt",
        "tool-result-details",
        "tool-result-messages",
        "save-point",
        "next-turn-bundle",
        "steering",
        "follow-up",
        "delivery-policy",
        "verification-handoff",
        "repair-handoff",
        "session-active-path",
        "context-rebuild",
        "continuation-readiness",
        "replay-safe-state",
        "runtime-events",
        "json-event-stream",
        "product-surface",
        "result-truthfulness",
      ]),
    );
    expect(new Set(phases.map((phase) => phase.status))).toEqual(
      new Set([
        "product_integrated",
        "observation_only",
        "contract_only",
        "projection_only",
        "unsupported",
        "not_proven",
        "deferred",
      ]),
    );
    expect(
      phases.every((phase) => phase.terminalSuccessClaim === false),
    ).toBe(true);
  });

  it("validates future feature integration declarations as a required contract", () => {
    const valid = validateFutureFeatureIntegration({
      featureId: "context-planning-quality",
      ownerDomain: "context",
      loopPhase: "future-capability-blocks",
      inputFacts: ["repository-map"],
      outputHandoffFacts: ["planning-context"],
      runtimeEvents: ["planning-context-observed"],
      evidenceFacts: ["planning-evidence"],
      productSurfaceSection: "context",
      resultTruthfulnessBoundary: "planning output is not terminal success",
      notProvenClaims: ["planning-quality-success"],
      forbiddenShortcuts: ["bypass-product-loop-adapter"],
      validationGates: ["focused-context-planning-tests"],
    });
    const invalid = validateFutureFeatureIntegration({
      featureId: "missing",
      ownerDomain: "",
      loopPhase: "",
      inputFacts: [],
      outputHandoffFacts: [],
      runtimeEvents: [],
      evidenceFacts: [],
      productSurfaceSection: "",
      resultTruthfulnessBoundary: "",
      notProvenClaims: [],
      forbiddenShortcuts: [],
      validationGates: [],
    });

    expect(valid.valid).toBe(true);
    expect(valid.terminalSuccessClaim).toBe(false);
    expect(valid.notProvenClaims).toContain("feature-contract-valid-is-not-success");
    expect(invalid.valid).toBe(false);
    expect(invalid.missingFields).toEqual(
      expect.arrayContaining([
        "ownerDomain",
        "loopPhase",
        "evidenceFacts",
        "productSurfaceSection",
        "resultTruthfulnessBoundary",
      ]),
    );
  });

  it("declares context discovery and target selection as an observation-only feature contract", () => {
    const contract = buildContextDiscoveryTargetSelectionFeatureContract();

    expect(contract.valid).toBe(true);
    expect(contract.terminalSuccessClaim).toBe(false);
    expect(contract.declaration).toMatchObject({
      featureId: "context-discovery-target-selection",
      ownerDomain: "orchestration/repo-intelligence",
      loopPhase: "context-discovery-target-selection",
      productSurfaceSection: "context-discovery",
      terminalSuccessClaim: false,
    });
    expect(contract.declaration.outputHandoffFacts).toEqual(
      expect.arrayContaining([
        "scan-profile-id",
        "selected-candidate-ids",
        "competing-candidate-ids",
        "omitted-candidate-facts",
        "ambiguity-state",
        "missing-discovery-facts",
        "target-ranking-evidence-id",
      ]),
    );
    expect(contract.notProvenClaims).toEqual(
      expect.arrayContaining([
        "feature-contract-valid-is-not-success",
        "high-ranked-file-is-not-correct-target",
        "selected-candidate-is-not-edit-authority",
      ]),
    );
    expect(contract.declaration.forbiddenShortcuts).toEqual(
      expect.arrayContaining([
        "treat-high-rank-as-correct-target",
        "treat-selected-candidate-as-edit-authority",
      ]),
    );
  });

  it("lets the runtime loop observe the context discovery contract without moving owner truth", () => {
    const trajectory = projectLoopTrajectory({
      loopId: "context-discovery-contract-loop",
      prompt: "observe context discovery contract",
      resultFacts: {
        status: "stopped",
        terminalClassification: "stopped",
        terminalReason: "waiting_for_input",
        verdictSource: "result",
      },
    });
    const contract = buildContextDiscoveryTargetSelectionFeatureContract();
    const adapter = projectProductLoopAdapter({
      adapterId: "context-discovery-contract-adapter",
      promptSummary: "observe context discovery contract",
      loopTrajectory: trajectory,
      featureContracts: [contract],
    });

    expect(adapter.ownerDomain).toBe("runtime/loop");
    expect(adapter.featureContracts).toEqual([contract]);
    expect(adapter.notProvenClaims).toEqual(
      expect.arrayContaining([
        "feature-contract-valid-is-not-success",
        "candidate-found-is-not-context-success",
        "terminal-success",
      ]),
    );
    expect(adapter.resultTruthfulnessBoundary.terminalSuccessClaim).toBe(false);
    expect(adapter.terminalSuccessClaim).toBe(false);
  });

  it("emits report-safe observation events and redacts unsafe adapter inputs", () => {
    const trajectory = projectLoopTrajectory({
      loopId: "adapter-redaction",
      prompt: "Bearer abc token=secret oldText=before newText=after raw provider output: nope hidden reasoning /home/wang/.private-agents-real/provider.env",
    });
    const adapter = projectProductLoopAdapter({
      adapterId: "provider.env=/home/wang/.private-agents-real/provider.env",
      promptSummary: "token=secret oldText=before newText=after hidden reasoning",
      loopTrajectory: trajectory,
    });
    const event = projectProductLoopAdapterObservationEvent(adapter, 99);
    const serialized = JSON.stringify({ adapter, event });

    expect(event.type).toBe("product-loop-adapter-observed");
    expect(event.sequence).toBe(99);
    expect(event.facts.terminalSuccessClaim).toBe(false);
    expect(serialized).not.toMatch(
      /token=secret|oldText=before|newText=after|hidden reasoning|\/home\/wang\/\.private-agents-real/i,
    );
    expect(serialized).toMatch(/redacted|raw-content-excluded/);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  runControlledMutationRecovery,
  type ControlledMutationRecoveryInput,
  type ControlledMutationRecoveryProjection,
} from "../../edit/recovery/model.js";
import { createDefaultExecutionService, type ExecutionService } from "../execution/service.js";
import { projectProductSurfaceViewModel } from "../../presentation/surface/model.js";
import { projectSessionStatusEnvelope } from "../../session/presentation/envelope.js";
import { summarizeReplaySafeLoopState } from "../../session/replay/state.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import { projectRuntimeEvents } from "../events/projection.js";
import { runAgentLoopContract, type AgentLoopContractProjection } from "./contract.js";
import { createSyntheticModelBoundary } from "./providerBoundary.js";

describe("mutation recovery loop lane", () => {
  it("completes a synthetic provider mutation only after repair and post-repair verification prove the result", async () => {
    const run = await runMutationLane({
      label: "happy-repair",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: {
        status: "failed",
        failureClass: "owner-verification-failed",
        repairEligible: true,
      },
      recovery: {
        decision: "repair_required",
        repairAuthority: "granted",
        postRepairVerificationStatus: "passed",
      },
    });

    const recovery = run.recovery;
    const status = projectStatus(run.loop, recovery);

    expect(recovery).toMatchObject({
      authority: { status: "granted" },
      staleRead: { status: "passed" },
      snapshot: { status: "planned", restorePlanAvailable: true },
      apply: { status: "applied", attempted: true },
      verificationResult: { status: "failed" },
      recoveryDecision: "repair_required",
      repairProposal: { readinessStatus: "exact_ready" },
      repairApply: { repairApplyStatus: "applied" },
      postRepairVerificationResult: { status: "passed" },
      repairVerdictTerminalProjection: { status: "verified_with_repair" },
      verdictStatus: "complete",
      terminalSuccessClaim: false,
    });
    expect(run.loop.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "provider-stream-started",
        "tool-call-dispatched",
        "mutation-recovery-lane-observed",
        "mutation-authority-observed",
        "mutation-stale-read-observed",
        "mutation-snapshot-observed",
        "mutation-apply-observed",
        "verification-result-observed",
        "repair-proposal-observed",
        "repair-apply-observed",
        "post-repair-verification-result-observed",
        "repair-verdict-terminal-projected",
        "product-completion-packet-observed",
      ]),
    );
    expect(status.envelope.completeProof).toBe(true);
    expect(status.envelope.state).toBe("complete_proof");
    expect(status.envelope.mutationRecovery.status).toBe("passed");
    expect(status.replay.mutationRecoveryStatus).toMatchObject({
      authority: "granted",
      staleRead: "passed",
      snapshot: "planned",
      apply: "applied",
      recoveryDecision: "repair_required",
      verdict: "complete",
      terminalSuccessClaim: false,
    });
    expect(JSON.stringify({ recovery, status })).not.toContain("RAW_OLD_TEXT_SHOULD_NOT_LEAK");
    expect(JSON.stringify({ recovery, status })).not.toContain("RAW_NEW_TEXT_SHOULD_NOT_LEAK");
    expect(JSON.stringify({ recovery, status })).not.toContain('"terminalSuccessClaim":true');
  });

  it("blocks mutation authority, stale-read, and snapshot failures without terminal success", async () => {
    const permissionPending = await runMutationLane({
      label: "permission-pending",
      authority: {
        status: "permission_pending",
        source: "tool_policy",
        reason: "explicit approval required",
      },
      snapshot: { available: true },
      verification: { status: "not_run" },
    });
    const denied = await runMutationLane({
      label: "denied",
      authority: { status: "denied", source: "tool_policy", reason: "user denied" },
      snapshot: { available: true },
      verification: { status: "not_run" },
    });
    const stale = await runMutationLane({
      label: "stale",
      initialContent: "changed elsewhere\n",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: { status: "not_run" },
    });
    const snapshotUnavailable = await runMutationLane({
      label: "snapshot-unavailable",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: false, reason: "no durable restore plan" },
      verification: { status: "not_run" },
    });

    const cases = [permissionPending, denied, stale, snapshotUnavailable];
    expect(permissionPending.recovery.authority.status).toBe("permission_pending");
    expect(denied.recovery.authority.status).toBe("denied");
    expect(stale.recovery.staleRead.status).toBe("stale");
    expect(snapshotUnavailable.recovery.snapshot.status).toBe("unavailable");
    for (const item of cases) {
      const status = projectStatus(item.loop, item.recovery);
      expect(item.recovery.apply.status).toBe("blocked");
      expect(item.recovery.verdictStatus).toBe("blocked");
      expect(status.envelope.completeProof).toBe(false);
      expect(status.envelope.state).toBe("blocked");
      expect(status.envelope.terminalSuccessClaim).toBe(false);
    }
    expect(permissionPending.loop.events.map((event) => event.type)).toContain(
      "mutation-permission-pending",
    );
    expect(denied.loop.events.map((event) => event.type)).toContain("mutation-denied");
    expect(stale.loop.events.map((event) => event.type)).toContain(
      "mutation-stale-read-blocked",
    );
    expect(snapshotUnavailable.loop.events.map((event) => event.type)).toContain(
      "mutation-snapshot-unavailable",
    );
  });

  it("keeps apply-only and incomplete recovery lanes non-success", async () => {
    const applyOnly = await runMutationLane({
      label: "apply-only",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: { status: "not_run" },
    });
    const verificationFailedRollback = await runMutationLane({
      label: "rollback-after-failure",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: {
        status: "failed",
        failureClass: "owner-verification-failed",
        repairEligible: true,
      },
      recovery: {
        decision: "rollback_required",
        rollbackAfterVerificationFailure: true,
      },
    });
    const repairProposedOnly = await runMutationLane({
      label: "repair-proposed-only",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: {
        status: "failed",
        failureClass: "owner-verification-failed",
        repairEligible: true,
      },
      recovery: {
        decision: "repair_required",
        repairAuthority: "missing",
        postRepairVerificationStatus: "not_run",
      },
    });
    const repairAppliedNoPostVerification = await runMutationLane({
      label: "repair-applied-no-post",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: {
        status: "failed",
        failureClass: "owner-verification-failed",
        repairEligible: true,
      },
      recovery: {
        decision: "repair_required",
        repairAuthority: "granted",
        postRepairVerificationStatus: "not_run",
      },
    });
    const postRepairFailed = await runMutationLane({
      label: "post-repair-failed",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: {
        status: "failed",
        failureClass: "owner-verification-failed",
        repairEligible: true,
      },
      recovery: {
        decision: "repair_required",
        repairAuthority: "granted",
        postRepairVerificationStatus: "failed",
      },
    });
    const applyFailed = await runMutationLane({
      label: "apply-failed",
      authority: { status: "granted", source: "explicit_mutation_authority" },
      snapshot: { available: true },
      verification: { status: "not_run" },
      executionService: failingWriteExecutionService(),
    });

    expect(applyOnly.recovery.apply.status).toBe("applied");
    expect(applyOnly.recovery.verificationResult.status).toBe("not_run");
    expect(verificationFailedRollback.recovery.recoveryDecision).toBe("rollback_required");
    expect(verificationFailedRollback.recovery.rollback.status).toBe("succeeded");
    expect(verificationFailedRollback.recovery.verdictStatus).toBe("failed");
    expect(repairProposedOnly.recovery.repairProposal?.readinessStatus).toBe("exact_ready");
    expect(repairProposedOnly.recovery.repairApply?.repairApplyStatus).toBe(
      "authority_required",
    );
    expect(repairAppliedNoPostVerification.recovery.repairApply?.repairApplyStatus).toBe(
      "applied",
    );
    expect(
      repairAppliedNoPostVerification.recovery.postRepairVerificationResult?.status,
    ).toBe("not_run");
    expect(postRepairFailed.recovery.postRepairVerificationResult?.status).toBe("failed");
    expect(applyFailed.recovery.apply.status).toBe("failed");
    for (const item of [
      applyOnly,
      verificationFailedRollback,
      repairProposedOnly,
      repairAppliedNoPostVerification,
      postRepairFailed,
      applyFailed,
    ]) {
      const status = projectStatus(item.loop, item.recovery);
      expect(status.envelope.completeProof).toBe(false);
      expect(status.envelope.state).not.toBe("complete_proof");
      expect(JSON.stringify({ loop: item.loop, status })).not.toContain(
        '"terminalSuccessClaim":true',
      );
    }
    expect(applyFailed.loop.events.map((event) => event.type)).toContain(
      "mutation-apply-failed",
    );
  });
});

async function runMutationLane(input: {
  readonly label: string;
  readonly initialContent?: string;
  readonly authority: ControlledMutationRecoveryInput["authority"];
  readonly snapshot: ControlledMutationRecoveryInput["snapshot"];
  readonly verification: ControlledMutationRecoveryInput["verification"];
  readonly recovery?: ControlledMutationRecoveryInput["recovery"];
  readonly executionService?: Pick<ExecutionService, "readTextFile" | "writeTextFile">;
}): Promise<{
  readonly loop: AgentLoopContractProjection;
  readonly recovery: ControlledMutationRecoveryProjection;
  readonly workspaceRoot: string;
}> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mutation-recovery-${input.label}-`));
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(
    path.join(workspaceRoot, "src", "target.ts"),
    input.initialContent ?? "before\n",
    "utf8",
  );
  let recovery: ControlledMutationRecoveryProjection | undefined;
  const modelBoundary = createSyntheticModelBoundary({
    program: {
      steps: [{
        kind: "completed",
        response: {
          content: "request controlled edit",
          toolCalls: [{
            id: `call-${input.label}`,
            name: "edit",
            arguments: {
              path: "src/target.ts",
              oldText: "RAW_OLD_TEXT_SHOULD_NOT_LEAK",
              newText: "RAW_NEW_TEXT_SHOULD_NOT_LEAK",
            },
          }],
          finishReason: "tool_calls",
        },
      }],
    },
  });
  const loop = await runAgentLoopContract({
    sessionId: `sess-${input.label}`,
    workspaceRoot,
    prompt: "apply controlled mutation and recover if needed",
    providerOptIn: false,
    providerMode: "synthetic",
    maxTurns: 1,
    toolBatchPolicy: "sequential",
    modelBoundary,
    toolBatchDispatch: async () => ({
      success: true,
      content: "controlled mutation request observed",
    }),
    mutationRecoveryBoundary: async ({ turnId, toolResultBatch }) => {
      const policyDecision = toolResultBatch?.dispatchPlan?.calls[0]?.beforePolicyDecision;
      recovery = await runControlledMutationRecovery({
        laneId: `mutation:${input.label}`,
        turnId,
        workspaceRoot,
        toolCallId: `call-${input.label}`,
        ...(policyDecision ? { toolPolicyDecision: policyDecision } : {}),
        target: {
          relativePath: "src/target.ts",
          expectedContent: "before\n",
          proposedContent: "after\n",
          repairContent: "after repaired\n",
          reportSafeTargetSummary: "src/target.ts",
        },
        executionService: input.executionService ?? createDefaultExecutionService(),
        authority: input.authority,
        snapshot: input.snapshot,
        verification: input.verification,
        ...(input.recovery ? { recovery: input.recovery } : {}),
      });
      return recovery;
    },
  });
  if (!recovery) {
    throw new Error("mutation recovery boundary did not run");
  }
  return { loop, recovery, workspaceRoot };
}

function failingWriteExecutionService(): Pick<ExecutionService, "readTextFile" | "writeTextFile"> {
  const base = createDefaultExecutionService();
  return {
    readTextFile: base.readTextFile,
    writeTextFile: async () => {
      throw new Error("sanctioned write failed");
    },
  };
}

function projectStatus(
  loop: AgentLoopContractProjection,
  recovery: ControlledMutationRecoveryProjection,
) {
  const turn = loop.turns[0]!;
  const sessionProjection = projectSessionTree({
    session: {
      id: loop.turns[0]?.snapshot.sessionId ?? "sess-mutation-recovery",
      projectRoot: loop.turns[0]?.snapshot.workspaceRoot ?? "/workspace",
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:01.000Z",
      status: "active",
      turns: [{ role: "user", content: "apply controlled mutation and recover if needed" }],
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
    toolOutcomeBundle: turn.toolResultBatch?.outcomeBundle,
    toolResultMessages: turn.toolResultBatch?.resultMessages,
    verificationIntents: [recovery.verificationIntent],
    verificationResults: [recovery.verificationResult],
    repairRequiredHandoffs: recovery.repairRequired ? [recovery.repairRequired] : [],
    repairProposals: recovery.repairProposal ? [recovery.repairProposal] : [],
    repairApplyObservations: recovery.repairApply ? [recovery.repairApply] : [],
    mutationRecoveries: [recovery],
    terminalResultFacts: {
      status: recovery.repairVerdictTerminalProjection?.status ?? recovery.verdictStatus,
      terminalClassification:
        recovery.repairVerdictTerminalProjection?.terminalClassification ?? "stopped",
      terminalReason: "completed",
    },
  });
  const runtimeEvents = [
    ...loop.events,
    ...projectRuntimeEvents({
      replaySafeLoopStateSummaries: [replay],
      resultFacts: {
        status: recovery.repairVerdictTerminalProjection?.status ?? recovery.verdictStatus,
        terminalClassification:
          recovery.repairVerdictTerminalProjection?.terminalClassification ?? "stopped",
        terminalReason: "completed",
        verdictSource: "result",
      },
    }),
  ];
  const surface = projectProductSurfaceViewModel({
    status: "completed",
    terminalClassification:
      recovery.repairVerdictTerminalProjection?.terminalClassification ?? "stopped",
    terminalReason: "completed",
    runtimeEvents,
  });
  if (!surface) {
    throw new Error("surface projection missing");
  }
  return {
    replay,
    surface,
    envelope: projectSessionStatusEnvelope(surface),
  };
}

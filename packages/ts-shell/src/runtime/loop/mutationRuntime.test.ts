import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { buildLoopContextRebuildInput } from "../../context/rebuildInput.js";
import { projectSessionContextRebuild } from "../../context/sessionContextRebuildProjection.js";
import {
  runControlledMultiTargetMutation,
  type MultiTargetMutationInput,
  type MultiTargetMutationProjection,
} from "../../edit/multifile/model.js";
import { projectProductSurfaceViewModel } from "../../presentation/surface/model.js";
import { createDefaultExecutionService, type ExecutionService } from "../execution/service.js";
import { projectRuntimeEvents } from "../events/projection.js";
import { evaluateContinuationReadiness } from "../../session/continuation/readiness.js";
import { projectSessionStatusEnvelope } from "../../session/presentation/envelope.js";
import { summarizeReplaySafeLoopState } from "../../session/replay/state.js";
import { projectSessionTree } from "../../session/sessionTreeProjection.js";
import { createSyntheticModelBoundary } from "./providerBoundary.js";
import { runAgentLoopContract, type AgentLoopContractProjection } from "./contract.js";

describe("multi-target mutation runtime loop lane", () => {
  it("projects a multi-target happy lane through events, replay, surface, and status", async () => {
    const run = await runMutationRuntimeLane({
      label: "happy",
      files: [["src/a.ts", "before a\n"]],
      targets: [
        updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        {
          targetId: "target-b",
          relativePath: "src/b.ts",
          operation: "create",
          proposedContent: "created b\n",
          reportSafeTargetSummary: "src/b.ts",
          verification: { status: "passed" },
        },
      ],
      parallel: { enabled: true, maxGroupSize: 2 },
      verification: { wholeTaskStatus: "passed" },
    });
    const status = projectStatus(run.loop, run.mutation);

    expect(run.mutation.resultVerdict.status).toBe("complete");
    expect(run.mutation.plan.parallelMutation).toBe("bounded");
    expect(run.mutation.executionGroups).toEqual([
      expect.objectContaining({
        mode: "parallel",
        targetIds: ["target-a", "target-b"],
        maxGroupSize: 2,
        terminalSuccessClaim: false,
      }),
    ]);
    expect(run.mutation.settlements.map((item) => item.targetId)).toEqual([
      "target-a",
      "target-b",
    ]);
    expect(run.loop.events.map((event) => event.type)).toEqual(
      expect.arrayContaining([
        "multi-target-mutation-lane-observed",
        "multi-target-mutation-plan-observed",
        "multi-target-mutation-graph-observed",
        "multi-target-mutation-eligibility-observed",
        "multi-target-mutation-group-observed",
        "multi-target-mutation-target-classified",
        "multi-target-mutation-queue-observed",
        "multi-target-mutation-settlement-observed",
        "multi-target-mutation-verification-observed",
        "multi-target-mutation-proof-input-observed",
        "multi-target-mutation-verdict-projected",
      ]),
    );
    expect(status.replay.mutationRuntimeStatus).toMatchObject({
      targetCount: 2,
      conflictCount: 0,
      eligibleCount: 2,
      groupCount: 1,
      parallelGroupCount: 1,
      appliedCount: 2,
      settlementCount: 2,
      wholeTaskVerification: "passed",
      verdict: "complete",
      terminalSuccessClaim: false,
    });
    expect(status.envelope.mutationRuntime.status).toBe("passed");
    expect(status.envelope.mutationRuntime.summary).toContain("parallel=bounded");
    expect(status.envelope.mutationRuntime.summary).toContain("parallelGroups=1");
    expect(status.envelope.completeProof).toBe(true);
    expect(status.envelope.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify({ mutation: run.mutation, status })).not.toContain(
      "RAW_OLD_TEXT_SHOULD_NOT_LEAK",
    );
    expect(JSON.stringify({ mutation: run.mutation, status })).not.toContain(
      "RAW_NEW_TEXT_SHOULD_NOT_LEAK",
    );
  });

  it("blocks conflicting and unsafe targets before apply without terminal success", async () => {
    const run = await runMutationRuntimeLane({
      label: "blocked",
      files: [["src/a.ts", "before a\n"]],
      authority: { status: "partial" },
      targets: [
        {
          ...updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
          hunk: { startLine: 1, endLine: 2 },
        },
        {
          ...updateTarget("target-b", "src/a.ts", "before a\n", "after b\n"),
          hunk: { startLine: 1, endLine: 1 },
        },
        {
          targetId: "target-c",
          relativePath: "../outside.ts",
          operation: "create",
          proposedContent: "outside\n",
          authority: { status: "missing" },
          verification: { status: "not_run" },
        },
        {
          targetId: "target-d",
          relativePath: "src/delete.ts",
          operation: "delete",
          expectedContent: "delete\n",
          verification: { status: "not_run" },
        },
        {
          targetId: "target-e",
          relativePath: "src/missing.ts",
          operation: "update",
          expectedContent: "missing\n",
          proposedContent: "new\n",
          dependsOnTargetIds: ["target-z"],
          verification: { status: "not_run" },
        },
        {
          targetId: "target-f",
          relativePath: "src/f.ts",
          operation: "create",
          proposedContent: "created f\n",
          authority: { status: "missing" },
          verification: { status: "not_run" },
        },
      ],
      parallel: { enabled: true, maxGroupSize: 2 },
      verification: { wholeTaskStatus: "not_run" },
    });
    const status = projectStatus(run.loop, run.mutation);

    expect(run.mutation.conflicts.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "same_file_overlap",
        "overlapping_hunk",
        "path_escape",
        "unsupported_operation",
        "dependency_ordering",
      ]),
    );
    expect(run.mutation.queue.some((item) => item.state === "applying")).toBe(false);
    expect(run.mutation.parallelEligibility.map((item) => item.status)).toEqual(
      expect.arrayContaining([
        "conflict",
        "authority_required",
        "unsupported",
        "dependency_blocked",
      ]),
    );
    expect(run.mutation.executionGroups.some((item) => item.mode === "parallel")).toBe(false);
    expect(status.envelope.completeProof).toBe(false);
    expect(status.envelope.state).toBe("blocked");
    expect(status.envelope.mutationRuntime.blockers.join(",")).toContain(
      "same_file_overlap",
    );
  });

  it("carries partial failure and rollback facts without success", async () => {
    const run = await runMutationRuntimeLane({
      label: "partial",
      files: [
        ["src/a.ts", "before a\n"],
        ["src/b.ts", "before b\n"],
      ],
      executionService: failSecondWrite(createDefaultExecutionService()),
      targets: [
        updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        updateTarget("target-b", "src/b.ts", "before b\n", "after b\n"),
      ],
      parallel: { enabled: true, maxGroupSize: 2 },
      verification: { wholeTaskStatus: "not_run" },
      recovery: { rollbackOnPartialFailure: true },
    });
    const status = projectStatus(run.loop, run.mutation);

    expect(run.mutation.queue.map((item) => item.state)).toEqual(
      expect.arrayContaining(["applied", "failed", "reverted"]),
    );
    expect(run.mutation.executionGroups[0]).toMatchObject({
      mode: "parallel",
      targetIds: ["target-a", "target-b"],
    });
    expect(run.mutation.settlements.map((item) => item.status)).toEqual(
      expect.arrayContaining(["applied", "failed", "reverted"]),
    );
    expect(run.mutation.rollback.status).toBe("succeeded");
    expect(run.mutation.rollback.preservesOriginalFailure).toBe(true);
    expect(run.mutation.resultVerdict.status).toBe("failed");
    expect(status.envelope.completeProof).toBe(false);
    expect(status.replay.mutationRuntimeStatus).toMatchObject({
      appliedCount: 1,
      failedCount: 1,
      revertedCount: 1,
      verdict: "failed",
    });
  });

  it("preserves original failure when group rollback fails without terminal success", async () => {
    const run = await runMutationRuntimeLane({
      label: "rollback-failed",
      files: [
        ["src/a.ts", "before a\n"],
        ["src/b.ts", "before b\n"],
      ],
      executionService: failSecondAndRollbackWrite(createDefaultExecutionService()),
      targets: [
        updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        updateTarget("target-b", "src/b.ts", "before b\n", "after b\n"),
      ],
      parallel: { enabled: true, maxGroupSize: 2 },
      verification: { wholeTaskStatus: "not_run" },
      recovery: { rollbackOnPartialFailure: true },
    });
    const status = projectStatus(run.loop, run.mutation);

    expect(run.mutation.rollback).toMatchObject({
      status: "failed",
      targetIds: ["target-a"],
      failedTargetIds: ["target-a"],
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
    });
    expect(run.mutation.settlements.map((item) => item.status)).toEqual(
      expect.arrayContaining(["applied", "failed", "revert_failed"]),
    );
    expect(run.mutation.resultVerdict.status).toBe("failed");
    expect(status.envelope.completeProof).toBe(false);
  });

  it("lets post-repair verification control the result-owned verdict", async () => {
    const run = await runMutationRuntimeLane({
      label: "repair",
      files: [["src/a.ts", "before a\n"]],
      targets: [updateTarget("target-a", "src/a.ts", "before a\n", "after a\n", "failed")],
      parallel: { enabled: true, maxGroupSize: 2 },
      verification: { wholeTaskStatus: "failed", failureClass: "owner-verification-failed" },
      recovery: {
        repairTargetIds: ["target-a"],
        postRepairWholeTaskStatus: "passed",
      },
    });
    const status = projectStatus(run.loop, run.mutation);

    expect(run.mutation.repairEligibility).toMatchObject({
      status: "eligible",
      targetIds: ["target-a"],
      terminalSuccessClaim: false,
    });
    expect(run.mutation.proofInput.proofStatus).toBe("complete");
    expect(run.mutation.resultVerdict.status).toBe("complete");
    expect(status.envelope.completeProof).toBe(true);
    expect(JSON.stringify({ loop: run.loop, status })).not.toContain(
      '"terminalSuccessClaim":true',
    );
  });
});

async function runMutationRuntimeLane(input: {
  readonly label: string;
  readonly files: readonly (readonly [string, string])[];
  readonly targets: MultiTargetMutationInput["targets"];
  readonly authority?: MultiTargetMutationInput["authority"];
  readonly parallel?: MultiTargetMutationInput["parallel"];
  readonly verification: MultiTargetMutationInput["verification"];
  readonly recovery?: MultiTargetMutationInput["recovery"];
  readonly executionService?: Pick<ExecutionService, "readTextFile" | "writeTextFile">;
}): Promise<{
  readonly loop: AgentLoopContractProjection;
  readonly mutation: MultiTargetMutationProjection;
}> {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), `mutation-runtime-${input.label}-`));
  for (const [relativePath, content] of input.files) {
    write(workspaceRoot, relativePath, content);
  }
  let mutation: MultiTargetMutationProjection | undefined;
  const modelBoundary = createSyntheticModelBoundary({
    program: {
      steps: [{
        kind: "completed",
        response: {
          content: "request controlled multi-target edit",
          toolCalls: [{
            id: `call-${input.label}`,
            name: "edit",
            arguments: {
              targets: input.targets.map((target) => target.relativePath),
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
    prompt: "apply controlled multi-target mutation and verify result",
    providerOptIn: false,
    providerMode: "synthetic",
    maxTurns: 1,
    toolBatchPolicy: "sequential",
    modelBoundary,
    toolBatchDispatch: async () => ({
      success: true,
      content: "controlled multi-target mutation request observed",
    }),
    mutationRuntimeBoundary: async ({ turnId }) => {
      mutation = await runControlledMultiTargetMutation({
        laneId: `mutation-runtime:${input.label}`,
        turnId,
        workspaceRoot,
        executionService: input.executionService ?? createDefaultExecutionService(),
        authority: input.authority ?? { status: "granted" },
        ...(input.parallel ? { parallel: input.parallel } : {}),
        targets: input.targets,
        verification: input.verification,
        ...(input.recovery ? { recovery: input.recovery } : {}),
      });
      return mutation;
    },
  });
  if (!mutation) {
    throw new Error("mutation runtime boundary did not run");
  }
  return { loop, mutation };
}

function projectStatus(
  loop: AgentLoopContractProjection,
  mutation: MultiTargetMutationProjection,
) {
  const turn = loop.turns[0]!;
  const sessionProjection = projectSessionTree({
    session: {
      id: turn.snapshot.sessionId,
      projectRoot: turn.snapshot.workspaceRoot,
      createdAt: "2026-06-02T00:00:00.000Z",
      updatedAt: "2026-06-02T00:00:01.000Z",
      status: "active",
      turns: [{ role: "user", content: "apply controlled multi-target mutation" }],
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
    toolDispatchPlan: turn.toolResultBatch?.dispatchPlan,
    toolResultMessages: turn.toolResultBatch?.resultMessages,
    verificationIntents: [
      ...mutation.verificationIntents,
      ...mutation.groupVerificationIntents,
      mutation.wholeTaskVerificationIntent,
    ],
    verificationResults: [
      ...mutation.verificationResults,
      ...mutation.groupVerificationResults,
      mutation.wholeTaskVerificationResult,
    ],
    multiTargetMutations: [mutation],
    terminalResultFacts: {
      status: mutation.resultVerdict.status,
      terminalClassification: mutation.resultVerdict.terminalClassification,
      terminalReason: mutation.resultVerdict.reason,
    },
  });
  const runtimeEvents = [
    ...loop.events,
    ...projectRuntimeEvents({
      replaySafeLoopStateSummaries: [replay],
      resultFacts: {
        status: mutation.resultVerdict.status,
        terminalClassification: mutation.resultVerdict.terminalClassification,
        terminalReason: mutation.resultVerdict.reason,
        verdictSource: "result",
      },
    }),
  ];
  const surface = projectProductSurfaceViewModel({
    status: "completed",
    terminalClassification: mutation.resultVerdict.terminalClassification,
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

function updateTarget(
  targetId: string,
  relativePath: string,
  expectedContent: string,
  proposedContent: string,
  verificationStatus: MultiTargetMutationInput["targets"][number]["verification"]["status"] = "passed",
): MultiTargetMutationInput["targets"][number] {
  return {
    targetId,
    relativePath,
    operation: "update",
    expectedContent,
    proposedContent,
    reportSafeTargetSummary: relativePath,
    verification: { status: verificationStatus },
  };
}

function write(root: string, relativePath: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function failSecondWrite(
  base: ExecutionService,
): Pick<ExecutionService, "readTextFile" | "writeTextFile"> {
  let writes = 0;
  return {
    readTextFile: base.readTextFile,
    writeTextFile: async (request) => {
      writes += 1;
      if (writes === 2) {
        throw new Error("SanctionedWriteFailed");
      }
      await base.writeTextFile(request);
    },
  };
}

function failSecondAndRollbackWrite(
  base: ExecutionService,
): Pick<ExecutionService, "readTextFile" | "writeTextFile"> {
  let writes = 0;
  return {
    readTextFile: base.readTextFile,
    writeTextFile: async (request) => {
      writes += 1;
      if (writes >= 2) {
        throw new Error("SanctionedWriteFailed");
      }
      await base.writeTextFile(request);
    },
  };
}

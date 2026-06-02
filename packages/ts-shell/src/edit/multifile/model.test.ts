import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createDefaultExecutionService, type ExecutionService } from "../../runtime/execution/service.js";
import {
  runControlledMultiTargetMutation,
  type MultiTargetMutationInput,
} from "./model.js";

describe("controlled multi-target mutation model", () => {
  it("runs a multi-target happy lane only when per-target and whole-task verification prove the result", async () => {
    const workspaceRoot = workspace("multi-target-happy");
    write(workspaceRoot, "src/a.ts", "before a\n");

    const projection = await runControlledMultiTargetMutation({
      laneId: "multi-target-happy",
      turnId: "turn-1",
      workspaceRoot,
      executionService: createDefaultExecutionService(),
      authority: { status: "granted" },
      targets: [
        updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        {
          targetId: "target-b",
          relativePath: "src/b.ts",
          operation: "create",
          proposedContent: "created b\n",
          reportSafeTargetSummary: "src/b.ts oldText:RAW_OLD_TEXT_SHOULD_NOT_LEAK newText:RAW_NEW_TEXT_SHOULD_NOT_LEAK",
          verification: { status: "passed" },
        },
      ],
      verification: { wholeTaskStatus: "passed" },
    });

    expect(projection.plan).toMatchObject({
      targetCount: 2,
      parallelMutation: "unsupported",
      ordering: "sequential",
      terminalSuccessClaim: false,
    });
    expect(projection.classifications.map((item) => item.status)).toEqual([
      "update",
      "create",
    ]);
    expect(projection.conflicts).toEqual([]);
    expect(projection.authority.status).toBe("granted");
    expect(projection.staleReads.map((item) => item.status)).toEqual(["passed", "passed"]);
    expect(projection.snapshots.map((item) => item.status)).toEqual(["planned", "planned"]);
    expect(projection.queue.map((item) => item.state)).toEqual([
      "ready",
      "ready",
      "applying",
      "applied",
      "applying",
      "applied",
    ]);
    expect(projection.verificationResults.map((item) => item.status)).toEqual([
      "passed",
      "passed",
    ]);
    expect(projection.wholeTaskVerificationResult.status).toBe("passed");
    expect(projection.resultVerdict.status).toBe("complete");
    expect(projection.verdictStatus).toBe("complete");
    expect(projection.terminalSuccessClaim).toBe(false);
    expect(read(workspaceRoot, "src/a.ts")).toBe("after a\n");
    expect(read(workspaceRoot, "src/b.ts")).toBe("created b\n");
    const rendered = JSON.stringify(projection);
    expect(rendered).not.toContain("RAW_OLD_TEXT_SHOULD_NOT_LEAK");
    expect(rendered).not.toContain("RAW_NEW_TEXT_SHOULD_NOT_LEAK");
    expect(rendered).not.toContain('"terminalSuccessClaim":true');
  });

  it("runs independent targets in bounded groups and settles in deterministic target order", async () => {
    const workspaceRoot = workspace("multi-target-bounded");
    write(workspaceRoot, "src/a.ts", "before a\n");
    write(workspaceRoot, "src/b.ts", "before b\n");
    write(workspaceRoot, "src/c.ts", "before c\n");

    const projection = await runControlledMultiTargetMutation({
      laneId: "multi-target-bounded",
      turnId: "turn-1",
      workspaceRoot,
      executionService: slowFirstWrite(createDefaultExecutionService()),
      authority: { status: "granted" },
      parallel: { enabled: true, maxGroupSize: 2 },
      targets: [
        updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        updateTarget("target-b", "src/b.ts", "before b\n", "after b\n"),
        updateTarget("target-c", "src/c.ts", "before c\n", "after c\n"),
      ],
      verification: { wholeTaskStatus: "passed" },
    });

    expect(projection.plan).toMatchObject({
      parallelMutation: "bounded",
      ordering: "bounded_parallel",
      maxGroupSize: 2,
      terminalSuccessClaim: false,
    });
    expect(projection.graph.map((item) => item.relation)).toEqual([
      "independent",
      "independent",
      "independent",
    ]);
    expect(projection.parallelEligibility.map((item) => item.status)).toEqual([
      "eligible",
      "eligible",
      "eligible",
    ]);
    expect(projection.executionGroups.map((item) => item.targetIds)).toEqual([
      ["target-a", "target-b"],
      ["target-c"],
    ]);
    expect(projection.executionGroups[0]?.mode).toBe("parallel");
    expect(projection.settlements.map((item) => item.targetId)).toEqual([
      "target-a",
      "target-b",
      "target-c",
    ]);
    expect(projection.resultVerdict.status).toBe("complete");
  });

  it("forces dependency targets through deterministic sequential groups", async () => {
    const workspaceRoot = workspace("multi-target-dependency");
    write(workspaceRoot, "src/a.ts", "before a\n");
    write(workspaceRoot, "src/b.ts", "before b\n");

    const projection = await runControlledMultiTargetMutation({
      laneId: "multi-target-dependency",
      turnId: "turn-1",
      workspaceRoot,
      executionService: createDefaultExecutionService(),
      authority: { status: "granted" },
      parallel: { enabled: true, maxGroupSize: 2 },
      targets: [
        updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        {
          ...updateTarget("target-b", "src/b.ts", "before b\n", "after b\n"),
          dependsOnTargetIds: ["target-a"],
        },
      ],
      verification: { wholeTaskStatus: "passed" },
    });

    expect(projection.graph.map((item) => item.relation)).toEqual([
      "independent",
      "dependency",
    ]);
    expect(projection.parallelEligibility.map((item) => item.status)).toEqual([
      "eligible",
      "forced_sequential",
    ]);
    expect(projection.executionGroups.map((item) => item.mode)).toEqual([
      "parallel",
      "sequential",
    ]);
    expect(projection.resultVerdict.status).toBe("complete");
  });

  it("blocks conflicts and unsafe targets before apply without success", async () => {
    const workspaceRoot = workspace("multi-target-conflict");
    write(workspaceRoot, "src/a.ts", "before a\n");

    const projection = await runControlledMultiTargetMutation({
      laneId: "multi-target-conflict",
      turnId: "turn-1",
      workspaceRoot,
      executionService: createDefaultExecutionService(),
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
      ],
      verification: { wholeTaskStatus: "not_run" },
    });

    expect(projection.conflicts.map((item) => item.kind)).toEqual(
      expect.arrayContaining([
        "same_file_overlap",
        "overlapping_hunk",
        "path_escape",
        "unsupported_operation",
        "dependency_ordering",
      ]),
    );
    expect(projection.authority.status).toBe("blocked");
    expect(projection.queue.map((item) => item.state)).toEqual(
      expect.arrayContaining(["blocked", "skipped"]),
    );
    expect(projection.queue.some((item) => item.state === "applying")).toBe(false);
    expect(projection.wholeTaskVerificationResult.status).toBe("blocked");
    expect(projection.resultVerdict.status).toBe("blocked");
    expect(read(workspaceRoot, "src/a.ts")).toBe("before a\n");
    expect(projection.notProvenClaims).toEqual(
      expect.arrayContaining(["uncontrolled-parallel-mutation-unsupported"]),
    );
  });

  it("preserves partial failure facts and reverts successful targets without claiming success", async () => {
    const workspaceRoot = workspace("multi-target-partial");
    write(workspaceRoot, "src/a.ts", "before a\n");
    write(workspaceRoot, "src/b.ts", "before b\n");
    const executionService = failSecondWrite(createDefaultExecutionService());

    const projection = await runControlledMultiTargetMutation({
      laneId: "multi-target-partial",
      turnId: "turn-1",
      workspaceRoot,
      executionService,
      authority: { status: "granted" },
      targets: [
        updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        updateTarget("target-b", "src/b.ts", "before b\n", "after b\n"),
      ],
      verification: { wholeTaskStatus: "not_run" },
      recovery: { rollbackOnPartialFailure: true },
    });

    expect(projection.queue.map((item) => item.state)).toEqual([
      "ready",
      "ready",
      "applying",
      "applied",
      "applying",
      "failed",
      "reverted",
    ]);
    expect(projection.rollback).toMatchObject({
      status: "succeeded",
      targetIds: ["target-a"],
      revertedTargetIds: ["target-a"],
      failedTargetIds: [],
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
    });
    expect(projection.proofInput.proofStatus).toBe("failed");
    expect(projection.resultVerdict.status).toBe("failed");
    expect(projection.wholeTaskVerificationResult.status).toBe("blocked");
    expect(read(workspaceRoot, "src/a.ts")).toBe("before a\n");
    expect(read(workspaceRoot, "src/b.ts")).toBe("before b\n");
  });

  it("blocks a target when its restore plan is unavailable", async () => {
    const workspaceRoot = workspace("multi-target-snapshot-unavailable");
    write(workspaceRoot, "src/a.ts", "before a\n");

    const projection = await runControlledMultiTargetMutation({
      laneId: "multi-target-snapshot-unavailable",
      turnId: "turn-1",
      workspaceRoot,
      executionService: createDefaultExecutionService(),
      authority: { status: "granted" },
      targets: [{
        ...updateTarget("target-a", "src/a.ts", "before a\n", "after a\n"),
        snapshot: { available: false, reason: "restore plan unavailable" },
      }],
      verification: { wholeTaskStatus: "not_run" },
    });

    expect(projection.staleReads[0]?.status).toBe("passed");
    expect(projection.snapshots[0]).toMatchObject({
      status: "unavailable",
      restorePlanAvailable: false,
      terminalSuccessClaim: false,
    });
    expect(projection.queue.map((item) => item.state)).toEqual(["blocked"]);
    expect(projection.resultVerdict.status).toBe("blocked");
  });

  it("keeps stale, unknown, missing rollback, and unsafe targets out of bounded groups", async () => {
    const workspaceRoot = workspace("multi-target-eligibility-blocked");
    write(workspaceRoot, "src/a.ts", "current a\n");
    write(workspaceRoot, "src/b.ts", "before b\n");

    const projection = await runControlledMultiTargetMutation({
      laneId: "multi-target-eligibility-blocked",
      turnId: "turn-1",
      workspaceRoot,
      executionService: createDefaultExecutionService(),
      authority: { status: "granted" },
      parallel: { enabled: true, maxGroupSize: 2 },
      targets: [
        updateTarget("target-stale", "src/a.ts", "before a\n", "after a\n"),
        {
          targetId: "target-unknown",
          relativePath: "src/unknown.ts",
          operation: "unknown",
          proposedContent: "unknown\n",
          verification: { status: "not_run" },
        },
        {
          ...updateTarget("target-no-rollback", "src/b.ts", "before b\n", "after b\n"),
          snapshot: { available: false, reason: "restore plan missing" },
        },
        {
          targetId: "target-escape",
          relativePath: "../escape.ts",
          operation: "create",
          proposedContent: "escape\n",
          verification: { status: "not_run" },
        },
      ],
      verification: { wholeTaskStatus: "not_run" },
    });

    expect(projection.parallelEligibility.map((item) => item.status)).toEqual([
      "stale",
      "unknown",
      "snapshot_missing",
      "unsafe",
    ]);
    expect(projection.executionGroups.every((item) => item.mode === "blocked")).toBe(true);
    expect(projection.settlements).toEqual([]);
    expect(projection.resultVerdict.status).toBe("blocked");
  });

  it("keeps verification and repair lanes non-success until post-repair proof is present", async () => {
    const workspaceRoot = workspace("multi-target-repair");
    write(workspaceRoot, "src/a.ts", "before a\n");
    const withoutRepairProof = await runControlledMultiTargetMutation({
      laneId: "multi-target-repair-missing",
      turnId: "turn-1",
      workspaceRoot,
      executionService: createDefaultExecutionService(),
      authority: { status: "granted" },
      targets: [updateTarget("target-a", "src/a.ts", "before a\n", "after a\n", "failed")],
      verification: { wholeTaskStatus: "failed", failureClass: "owner-verification-failed" },
      recovery: { repairTargetIds: ["target-a"] },
    });

    expect(withoutRepairProof.repairEligibility).toMatchObject({
      status: "eligible",
      targetIds: ["target-a"],
      terminalSuccessClaim: false,
    });
    expect(withoutRepairProof.resultVerdict.status).toBe("partial");

    const withRepairProof = await runControlledMultiTargetMutation({
      laneId: "multi-target-repair-complete",
      turnId: "turn-1",
      workspaceRoot,
      executionService: createDefaultExecutionService(),
      authority: { status: "granted" },
      targets: [updateTarget("target-a", "src/a.ts", "after a\n", "after repaired\n", "failed")],
      verification: { wholeTaskStatus: "failed", failureClass: "owner-verification-failed" },
      recovery: {
        repairTargetIds: ["target-a"],
        postRepairWholeTaskStatus: "passed",
      },
    });

    expect(withRepairProof.repairEligibility.status).toBe("eligible");
    expect(withRepairProof.proofInput.wholeTaskVerificationPassed).toBe(true);
    expect(withRepairProof.resultVerdict.status).toBe("complete");
    expect(withRepairProof.resultVerdict.missingProofItems).toEqual([]);
    expect(JSON.stringify({ withoutRepairProof, withRepairProof })).not.toContain(
      '"terminalSuccessClaim":true',
    );
  });
});

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

function workspace(label: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `${label}-`));
}

function write(root: string, relativePath: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, relativePath)), { recursive: true });
  fs.writeFileSync(path.join(root, relativePath), content, "utf8");
}

function read(root: string, relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
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

function slowFirstWrite(
  base: ExecutionService,
): Pick<ExecutionService, "readTextFile" | "writeTextFile"> {
  let writes = 0;
  return {
    readTextFile: base.readTextFile,
    writeTextFile: async (request) => {
      writes += 1;
      if (writes === 1) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      await base.writeTextFile(request);
    },
  };
}

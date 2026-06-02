import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createDefaultExecutionService, type ExecutionService } from "../../runtime/execution/service.js";
import { runControlledMutationRecovery, type ControlledMutationRecoveryInput } from "./model.js";

describe("controlled mutation recovery model", () => {
  it("blocks before apply when authority is not granted", async () => {
    const projection = await runRecovery({
      authority: {
        status: "permission_pending",
        source: "tool_policy",
        reason: "approval required",
      },
      snapshot: { available: true },
      verification: { status: "not_run" },
    });

    expect(projection.authority.status).toBe("permission_pending");
    expect(projection.staleRead.status).toBe("not_run");
    expect(projection.apply).toMatchObject({
      status: "blocked",
      attempted: false,
      blocker: "authority:permission_pending",
    });
    expect(projection.verdictStatus).toBe("blocked");
    expect(projection.terminalSuccessClaim).toBe(false);
  });

  it("restores from the snapshot without hiding the failed verification", async () => {
    const projection = await runRecovery({
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

    expect(projection.apply.status).toBe("applied");
    expect(projection.verificationResult.status).toBe("failed");
    expect(projection.rollback).toMatchObject({
      status: "succeeded",
      preservesOriginalFailure: true,
      terminalSuccessClaim: false,
    });
    expect(projection.verdictStatus).toBe("failed");
    expect(projection.notProvenClaims).toEqual(
      expect.arrayContaining(["rollback-succeeded-is-not-task-success"]),
    );
  });

  it("redacts raw edit text while allowing result-owned complete verdict", async () => {
    const projection = await runRecovery({
      targetSummary: "oldText=RAW_OLD_TEXT_SHOULD_NOT_LEAK newText=RAW_NEW_TEXT_SHOULD_NOT_LEAK",
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

    expect(projection.repairVerdictTerminalProjection?.status).toBe("verified_with_repair");
    expect(projection.verdictStatus).toBe("complete");
    expect(JSON.stringify(projection)).not.toContain("RAW_OLD_TEXT_SHOULD_NOT_LEAK");
    expect(JSON.stringify(projection)).not.toContain("RAW_NEW_TEXT_SHOULD_NOT_LEAK");
    expect(JSON.stringify(projection)).not.toContain('"terminalSuccessClaim":true');
  });
});

async function runRecovery(input: {
  readonly targetSummary?: string;
  readonly authority: ControlledMutationRecoveryInput["authority"];
  readonly snapshot: ControlledMutationRecoveryInput["snapshot"];
  readonly verification: ControlledMutationRecoveryInput["verification"];
  readonly recovery?: ControlledMutationRecoveryInput["recovery"];
  readonly executionService?: Pick<ExecutionService, "readTextFile" | "writeTextFile">;
}) {
  const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "edit-recovery-model-"));
  fs.mkdirSync(path.join(workspaceRoot, "src"), { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, "src", "target.ts"), "before\n", "utf8");
  return runControlledMutationRecovery({
    laneId: "mutation:model-test",
    turnId: "turn:model-test",
    workspaceRoot,
    target: {
      relativePath: "src/target.ts",
      expectedContent: "before\n",
      proposedContent: "after\n",
      repairContent: "after repaired\n",
      reportSafeTargetSummary: input.targetSummary ?? "src/target.ts",
    },
    executionService: input.executionService ?? createDefaultExecutionService(),
    authority: input.authority,
    snapshot: input.snapshot,
    verification: input.verification,
    ...(input.recovery ? { recovery: input.recovery } : {}),
  });
}

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  runVerificationRepairIterationFlow,
  type RepairIterationVerification,
} from "./verificationRepairIterationFlow.js";

describe("verificationRepairIterationFlow", () => {
  it("preserves original failure, applies confirmed repair, and reruns the same command to success", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route227f-success-"));
    try {
      const targetPath = "src/repair.ts";
      const expectedContent = "export const repairStatus = 'fixed';\n";
      await writeFixture(workspaceRoot, targetPath, "export const repairStatus = 'broken';\n");

      const result = await runVerificationRepairIterationFlow({
        workspaceRoot,
        targetPath,
        expectedContent,
        taskId: "frozen-upper-bound-challenge-verification-failure-repair-case",
        sessionId: "sess_route227f_success",
        prompt: "Repair after failed task-relevant verification.",
        verificationCommand: "npm test -w packages/ts-shell -- src/orchestration/taskRelevantVerificationRoute.test.ts",
        verify: contentVerifier(),
      });

      expect(result.finalRepairVerdict).toBe("verified-success-with-repair");
      expect(result.originalFailurePreserved).toBe(true);
      expect(result.originalVerificationFailure.status).toBe("failed");
      expect(result.repairProposalSource).toBe("deterministic-from-failure-evidence");
      expect(result.missingConfirmationState).toBe("selection-required");
      expect(result.confirmationState).toBe("confirmed-exact-single-target");
      expect(result.applyStatus).toBe("single-target-applied");
      expect(result.sameVerificationCommandRerun).toBe(true);
      expect(result.postRepairVerification.status).toBe("passed");
      expect(result.productRepair.verdict.status).toBe("COMPLETE");
      expect(result.productRepair.repairProposalIsSuccess).toBe(false);
      expect(result.productRepair.repairApplyWithoutReverifyIsSuccess).toBe(false);
      expect(result.unconfirmedResult.status).toBe("stopped_error");
      expect(result.unverifiedResult.status).toBe("stopped_error");
      expect(result.finalResult.status).toBe("completed");
      expect(result.evidence).toEqual(
        expect.arrayContaining([
          "verification-repair-iteration:final:verified-success-with-repair",
          "verification-repair-iteration:original-failure-preserved",
          "verification-repair-iteration:rerun:same-relevant-command",
          "verification-repair-iteration:max-attempts:1",
        ]),
      );
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });

  it("keeps repair failed when post-repair verification rerun fails", async () => {
    const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "route227f-failed-"));
    try {
      const targetPath = "src/repair.ts";
      await writeFixture(workspaceRoot, targetPath, "export const repairStatus = 'broken';\n");

      const result = await runVerificationRepairIterationFlow({
        workspaceRoot,
        targetPath,
        expectedContent: "export const repairStatus = 'fixed';\n",
        taskId: "route227f-repair-failed-case",
        sessionId: "sess_route227f_failed",
        prompt: "Repair applies but re-verification still fails.",
        verificationCommand: "npm test -w packages/ts-shell -- src/orchestration/taskRelevantVerificationRoute.test.ts",
        verify: async (input) => {
          const base = await contentVerifier()(input);
          if (input.phase === "post-repair") {
            return {
              ...base,
              status: "failed" as const,
              reason: "same relevant verification rerun failed after repair",
              evidence: [
                ...base.evidence,
                "task-relevant-verification:post-repair:failed",
              ],
            };
          }
          return base;
        },
      });

      expect(result.finalRepairVerdict).toBe("repair-failed");
      expect(result.postRepairVerification.status).toBe("failed");
      expect(result.productRepair.verdict.status).toBe("PARTIAL");
      expect(result.productRepair.repairApplyWithoutReverifyIsSuccess).toBe(false);
      expect(result.finalResult.status).toBe("stopped_error");
      expect(result.notProvenClaims).toContain("repair success");
      expect(result.retryCount).toBe(1);
      expect(result.maxRepairAttempts).toBe(1);
    } finally {
      await fs.rm(workspaceRoot, { recursive: true, force: true });
    }
  });
});

async function writeFixture(
  workspaceRoot: string,
  targetPath: string,
  content: string,
): Promise<void> {
  const absolutePath = path.join(workspaceRoot, targetPath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, content, "utf8");
}

function contentVerifier(): (input: {
  readonly workspaceRoot: string;
  readonly targetPath: string;
  readonly expectedContent: string;
  readonly command: string;
  readonly phase: "original" | "post-repair";
}) => Promise<RepairIterationVerification> {
  return async (input) => {
    const actual = await fs.readFile(path.join(input.workspaceRoot, input.targetPath), "utf8");
    const passed = actual === input.expectedContent;
    return {
      status: passed ? "passed" : "failed",
      command: input.command,
      reason: passed
        ? `${input.phase} same relevant verification command passed`
        : `${input.phase} same relevant verification command failed`,
      runtimeDerived: true,
      evidence: [
        `task-relevant-verification:${input.phase}:${passed ? "passed" : "failed"}`,
        `task-relevant-verification:command:${input.command}`,
        `task-relevant-verification:target:${input.targetPath}`,
        "task-relevant-verification:raw-content-excluded",
      ],
    };
  };
}

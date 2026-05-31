import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../command/compactCommandRunner.js";
import { formatCompactSessionSurface } from "./compactSessionSurface.js";

describe("compact session surface", () => {
  it("formats a session-facing handoff summary without raw content or secrets", () => {
    const result = runCompactCommand({
      mode: "render",
      source: "session",
      generatedAt: "2026-05-15T00:00:00.000Z",
      taskGoal: {
        objective: "Continue Route 76.",
        nextAction: "Validate compact command registration.",
      },
      routeInfo: {
        routeId: "76",
        name: "Compact v2 session integration",
        nextAction: "Validate compact command registration.",
      },
      mutationEvidence: {
        plannedFiles: ["a.ts"],
        changedFiles: ["b.ts"],
        rawOriginalContent: "RAW_FILE_CONTENT",
      },
      recoverySummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["b.ts"],
        blockedFiles: [],
        recoveryAuthorityId: "authority-surface",
        recoveryAction: "preview-restore",
        userFacingMessage: "preview",
      },
      validationEvidence: {
        testsRun: ["compactSessionSurface.test.ts"],
        verifierResults: [{ command: "rtk npm run test", status: "passed" }],
        buildStatus: "passed",
        resultContractStatus: "passed",
        fullCommandOutput: "Bearer secret-token",
      },
    });
    const output = formatCompactSessionSurface(result);

    expect(output).toContain("Compact v2 handoff generated");
    expect(output).toContain("- Preview only: yes");
    expect(output).toContain("- Persistence: none");
    expect(output).toContain("- Provider/model call: none");
    expect(output).toContain("- Recovery execution: none");
    expect(output).toContain("- Edit capability status: closeout-candidate");
    expect(output).toContain("- Mutation evidence:");
    expect(output).toContain("- Recovery / restore state:");
    expect(output).toContain("- Validation status:");
    expect(output).toContain("- Redactions:");
    expect(output).toContain("- Next action: Validate compact command registration.");
    expect(output).toContain("Markdown handoff");
    expect(output).toContain("# Compact v2 Handoff");
    expect(output).toContain("authority-surface");
    expect(output).not.toContain("RAW_FILE_CONTENT");
    expect(output).not.toContain("secret-token");
  });
});

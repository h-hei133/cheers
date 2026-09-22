import { describe, expect, it } from "vitest";
import { runCompactCommand } from "./compactCommandRunner.js";

describe("compact command runner", () => {
  it("builds packet and markdown with edit, mutation, recovery, validation, constraints, and redactions", () => {
    const result = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "76",
        name: "Compact v2 session integration",
        objective: "Expose Compact v2 through a command.",
        currentPhase: "implementation",
        nextAction: "Run focused compact command tests.",
        stopConditions: ["no SessionManager schema changes"],
        forbiddenScope: ["provider/MCP", "memory storage", "atomic rollback"],
      },
      taskGoal: {
        objective: "Generate a compact-safe handoff.",
        constraints: ["do not expose secrets"],
        nextAction: "Run focused compact command tests.",
      },
      projectInfo: {
        projectRoot: "/home/wang/projects/cheers",
        safeToPersistProjectRoot: true,
        branch: "main",
        baseCommit: "abc123",
        repositoryHints: ["TypeScript control plane"],
      },
      mutationEvidence: {
        plannedFiles: ["docs/design/compact-v2-session-integration.md"],
        changedFiles: ["packages/ts-shell/src/core/context/compactCommandRunner.ts"],
        failedFiles: [{ path: "src/failed.ts", reason: "verification-failed" }],
        postWriteVerification: "passed",
        writerStarted: true,
        writeEffect: "changed",
        writerFlags: ["writer-started"],
        rawOriginalContent: "RAW_MUTATION_CONTENT",
      },
      recoverySummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: true,
        atomicRollbackAvailable: true,
        recoveryExecuted: true,
        restorableFiles: ["src/a.ts"],
        blockedFiles: [{ path: "src/b.ts", reason: "current-content-guard" }],
        recoveryAuthorityId: "authority-76",
        recoveryAction: "preview-restore",
        userFacingMessage: "restore preview available",
        evidence: ["recovery-surface"],
        currentContentGuardSummary: "guard preserved",
        rawOriginalContent: "RAW_RECOVERY_CONTENT",
      },
      validationEvidence: {
        testsRun: ["src/core/context/compactCommandRunner.test.ts"],
        verifierResults: [
          { command: "rtk npm run verify:result-contract", status: "pending" },
        ],
        buildStatus: "pending",
        resultContractStatus: "pending",
        fullCommandOutput: "SECRET_OUTPUT",
      },
      secretValues: ["SECRET_OUTPUT"],
      unsafeInputs: {
        providerCredentials: "sk-unsafe-secret",
      },
    });
    const serialized = JSON.stringify(result.packet);

    expect(result.packet.editCapability.closeoutStatus).toBe("closeout-candidate");
    expect(result.packet.editCapability.boundedCap).toBe(32);
    expect(result.packet.editCapability.automaticRecovery).toBe(false);
    expect(result.packet.editCapability.atomicRollback).toBe(false);
    expect(result.packet.mutationEvidence.changedFiles).toContain(
      "packages/ts-shell/src/core/context/compactCommandRunner.ts",
    );
    expect(result.packet.recovery).toEqual(
      expect.objectContaining({
        restoreAvailable: true,
        restorePreviewAvailable: true,
        restoreExecuteExplicitOnly: true,
        recoveryAuthorityReferences: ["authority-76"],
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
      }),
    );
    expect(result.packet.validation.testsRun).toContain(
      "src/core/context/compactCommandRunner.test.ts",
    );
    expect(result.packet.route.forbiddenScope).toContain("memory storage");
    expect(result.packet.route.nextAction).toBe("Run focused compact command tests.");
    expect(result.packet.redactions.map((entry) => entry.inputField)).toEqual(
      expect.arrayContaining([
        "mutationEvidence.rawOriginalContent",
        "recoverySummary.rawOriginalContent",
        "validationEvidence.fullCommandOutput",
        "secretValues",
        "unsafeInputs.providerCredentials",
      ]),
    );
    expect(result.markdown).toContain("# Compact v2 Handoff");
    expect(result.markdown).toContain("## Mutation evidence");
    expect(result.markdown).toContain("authority-76");
    expect(serialized).not.toContain("RAW_MUTATION_CONTENT");
    expect(serialized).not.toContain("RAW_RECOVERY_CONTENT");
    expect(serialized).not.toContain("SECRET_OUTPUT");
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        "compact-command-runner:no-persistence",
        "compact-command-runner:no-provider-call",
        "compact-command-runner:no-automatic-recovery",
        "compact-command-runner:no-atomic-rollback",
      ]),
    );
  });

  it("can return structured packet JSON without markdown", () => {
    const result = runCompactCommand({
      mode: "json",
      source: "manual",
      generatedAt: "2026-05-15T00:00:00.000Z",
    });

    expect(result.markdown).toBeUndefined();
    expect(result.json).toContain('"packetVersion": "compact-v2"');
    expect(result.packet.source).toBe("manual-export");
  });
});

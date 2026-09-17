import { describe, expect, it } from "vitest";
import { EDIT_CAPABILITY_CLOSEOUT_MANIFEST } from "../../../../orchestration/patchResult/editCapabilityCloseoutManifest.js";
import { listEditCapabilityReadiness } from "../../../../orchestration/patchResult/editCapabilityReadiness.js";
import { buildRouteContinuityHandoffPacket } from "./routeContinuityHandoff.js";

describe("route continuity handoff", () => {
  it("preserves edit closeout, mutation evidence, recovery references, validation status, constraints, and next action", () => {
    const packet = buildRouteContinuityHandoffPacket({
      generatedAt: "2026-05-15T00:00:00.000Z",
      source: "route-handoff",
      route: {
        routeId: "75",
        name: "Compact v2 route continuity",
        objective: "Implement compact route continuity.",
        currentPhase: "implementation",
        nextAction: "Run focused core/context tests.",
        stopConditions: ["do not change SessionManager schema"],
        forbiddenScope: ["provider/MCP", "memory system", "startup cache"],
      },
      project: {
        projectRoot: "/home/wang/projects/coding-agents",
        safeToPersistProjectRoot: true,
        branch: "main",
        baseCommit: "abc123",
        repositoryHints: ["TypeScript control plane"],
      },
      taskGoal: {
        objective: "Route 75",
        constraints: ["no package scripts"],
        nextAction: "Run focused core/context tests.",
      },
      editCapabilityCloseoutManifest: EDIT_CAPABILITY_CLOSEOUT_MANIFEST,
      editCapabilityReadiness: listEditCapabilityReadiness(),
      contextProjectionInput: {
        mutationEvidence: {
          plannedFiles: ["src/planned.ts"],
          changedFiles: ["src/changed.ts"],
          failedFiles: [{ path: "src/failed.ts", reason: "post-write-verification" }],
          postWriteVerification: "passed",
          writerStarted: true,
          writeEffect: "changed",
          writerFlags: ["writer-started", "current-content-guard"],
          rawOriginalContent: "raw original secret",
        },
      },
      recoverySurfaceSummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/changed.ts"],
        blockedFiles: [{ path: "src/failed.ts", reason: "current-content-guard" }],
        recoveryAuthorityId: "authority-75",
        recoveryAction: "preview-restore",
        userFacingMessage: "Explicit guarded restore may be available.",
        evidence: ["recovery-surface:explicit-restore-only"],
        currentContentGuardSummary: "current-content guard preserved",
        rawOriginalContent: "raw recovery content",
      },
      validation: {
        testsRun: ["src/core/context"],
        verifierResults: [
          { command: "rtk npm run verify:result-contract", status: "passed" },
        ],
        buildStatus: "passed",
        resultContractStatus: "passed",
        fullCommandOutput: "SECRET_TOKEN=abc\nline2\n",
      },
      secretValues: ["abc"],
    });
    const serialized = JSON.stringify(packet);

    expect(packet.editCapability.closeoutStatus).toBe("closeout-candidate");
    expect(packet.editCapability.boundedCap).toBe(32);
    expect(packet.editCapability.supportedDefault).toEqual(
      expect.arrayContaining([
        "bounded-broad-patch-safe-subset",
        "fenced-bounded-broad-patch-safe-subset",
        "bounded-mixed-2-32",
      ]),
    );
    expect(packet.editCapability.supportedNonDefault).toContain("restore-preview");
    expect(packet.editCapability.explicitOptInOnly).toEqual(
      expect.arrayContaining(["recovery-authority-capture", "restore-execute"]),
    );
    expect(packet.editCapability.blockedByDesign.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "arbitrary-broad-apply-patch",
        "fuzzy-patch",
        "automatic-recovery",
        "atomic-rollback",
      ]),
    );
    expect(packet.editCapability.automaticRecovery).toBe(false);
    expect(packet.editCapability.atomicRollback).toBe(false);

    expect(packet.mutationEvidence).toEqual(
      expect.objectContaining({
        plannedFiles: ["src/planned.ts"],
        changedFiles: ["src/changed.ts"],
        failedFiles: [{ path: "src/failed.ts", reason: "post-write-verification" }],
        postWriteVerification: "passed",
        writerStarted: true,
        writeEffect: "changed",
        writerFlags: ["writer-started", "current-content-guard"],
      }),
    );
    expect(packet.recovery).toEqual(
      expect.objectContaining({
        restoreAvailable: true,
        restorePreviewAvailable: true,
        restoreExecuteExplicitOnly: true,
        recoveryAuthorityReferences: ["authority-75"],
        currentContentGuardSummary: "current-content guard preserved",
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
      }),
    );
    expect(packet.validation).toEqual(
      expect.objectContaining({
        testsRun: ["src/core/context"],
        buildStatus: "passed",
        resultContractStatus: "passed",
      }),
    );
    expect(packet.validation.verifierStatus).toEqual([
      { command: "rtk npm run verify:result-contract", status: "passed" },
    ]);
    expect(packet.validation.commandOutputSummary).toContain("omitted full command output");
    expect(packet.route.forbiddenScope).toEqual([
      "provider/MCP",
      "memory system",
      "startup cache",
    ]);
    expect(packet.route.stopConditions).toEqual(["do not change SessionManager schema"]);
    expect(packet.route.nextAction).toBe("Run focused core/context tests.");
    expect(packet.context.compactSurvivorFacts).toEqual(
      expect.arrayContaining([
        "task-goal",
        "route-info",
        "edit-closeout-status",
        "mutation-evidence",
        "recovery-restore-summary",
        "validation-evidence",
      ]),
    );
    expect(packet.context.memoryCandidates).toContain(
      "blocked-edit-capability-memory-candidate",
    );
    expect(packet.context.sidebarFacts).toEqual(
      expect.arrayContaining(["mutation-sidebar", "recovery-sidebar"]),
    );
    expect(packet.context.startupWarmCandidates).toContain("startup-edit-closeout");
    expect(serialized).not.toContain("raw original secret");
    expect(serialized).not.toContain("raw recovery content");
    expect(serialized).not.toContain("SECRET_TOKEN");
    expect(serialized).not.toContain("abc");
  });
});


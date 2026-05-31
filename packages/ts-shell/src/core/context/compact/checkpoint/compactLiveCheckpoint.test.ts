import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../command/compactCommandRunner.js";
import {
  clearLatestCompactCheckpoint,
  createCompactLiveCheckpointStore,
  getLatestCompactCheckpoint,
  markCompactCheckpointSuperseded,
  updateLatestCompactCheckpoint,
} from "./compactLiveCheckpoint.js";

describe("compact live checkpoint", () => {
  it("creates latest session-scoped checkpoint and preserves compact-safe facts", () => {
    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-1",
    });
    const result = runCompactCommand({
      mode: "render",
      source: "session",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "77",
        name: "Compact live checkpoint",
        nextAction: "Build future-turn adapter.",
      },
      taskGoal: {
        objective: "Create live checkpoint.",
        constraints: ["no persistence"],
      },
      mutationEvidence: {
        changedFiles: ["src/changed.ts"],
        failedFiles: [{ path: "src/failed.ts", reason: "verification-failed" }],
        rawOriginalContent: "RAW_MUTATION_CONTENT",
      },
      recoverySummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: true,
        atomicRollbackAvailable: true,
        recoveryExecuted: true,
        restorableFiles: ["src/changed.ts"],
        blockedFiles: [{ path: "src/failed.ts", reason: "current-content-guard" }],
        recoveryAuthorityId: "authority-77",
        recoveryAction: "preview-restore",
        userFacingMessage: "preview",
        rawOriginalContent: "RAW_RECOVERY_CONTENT",
      },
      validationEvidence: {
        testsRun: ["compactLiveCheckpoint.test.ts"],
        fullCommandOutput: "Bearer secret-token",
      },
      unsafeInputs: {
        providerCredentials: "sk-unsafe-secret",
      },
    });

    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-77",
      sourceCommand: "/compact",
      result,
    });
    const serialized = JSON.stringify(checkpoint);

    expect(checkpoint).toEqual(
      expect.objectContaining({
        checkpointId: "checkpoint-1",
        sessionScopeId: "session:sess-77",
        status: "created",
        packetVersion: "compact-v2",
        persistence: "none",
        providerCall: "none",
        futureTurnInjection: "not-injected",
        automaticRecovery: false,
        atomicRollback: false,
      }),
    );
    expect(checkpoint.packet.editCapability.closeoutStatus).toBe(
      "closeout-candidate",
    );
    expect(checkpoint.packet.mutationEvidence.changedFiles).toContain(
      "src/changed.ts",
    );
    expect(checkpoint.packet.recovery.recoveryAuthorityReferences).toEqual([
      "authority-77",
    ]);
    expect(checkpoint.packet.recovery.restoreExecuteExplicitOnly).toBe(true);
    expect(checkpoint.renderedMarkdown).toContain("# Compact v2 Handoff");
    expect(checkpoint.redactions.map((entry) => entry.inputField)).toEqual(
      expect.arrayContaining([
        "mutationEvidence.rawOriginalContent",
        "recoverySummary.rawOriginalContent",
        "validationEvidence.fullCommandOutput",
        "unsafeInputs.providerCredentials",
      ]),
    );
    expect(getLatestCompactCheckpoint(store, "session:sess-77")).toBe(
      checkpoint,
    );
    expect(serialized).not.toContain("RAW_MUTATION_CONTENT");
    expect(serialized).not.toContain("RAW_RECOVERY_CONTENT");
    expect(serialized).not.toContain("secret-token");
    expect(serialized).not.toContain("sk-unsafe-secret");
  });

  it("supersedes previous latest checkpoints and can clear or mark status", () => {
    let id = 0;
    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => {
        id += 1;
        return `checkpoint-${id}`;
      },
    });
    const result = runCompactCommand({
      mode: "render",
      source: "session",
      generatedAt: "2026-05-15T00:00:00.000Z",
    });

    const first = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-77",
      sourceCommand: "/compact",
      result,
    });
    const second = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-77",
      sourceCommand: "/handoff",
      result,
    });

    expect(store.getById(first.checkpointId)?.status).toBe("superseded");
    expect(second.status).toBe("created");
    expect(second.sourceCommand).toBe("/handoff");
    expect(getLatestCompactCheckpoint(store, "session:sess-77")?.checkpointId).toBe(
      "checkpoint-2",
    );

    const marked = markCompactCheckpointSuperseded(store, second.checkpointId);
    expect(marked?.status).toBe("superseded");
    expect(getLatestCompactCheckpoint(store, "session:sess-77")).toBeUndefined();

    const third = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-77",
      sourceCommand: "/compact",
      result,
    });
    const cleared = clearLatestCompactCheckpoint(store, "session:sess-77");
    expect(cleared?.checkpointId).toBe(third.checkpointId);
    expect(cleared?.status).toBe("cleared");
    expect(getLatestCompactCheckpoint(store, "session:sess-77")).toBeUndefined();
  });
});

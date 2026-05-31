import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../command/compactCommandRunner.js";
import { adaptCompactCheckpointForFutureTurn } from "./compactFutureTurnAdapter.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "../checkpoint/compactLiveCheckpoint.js";

describe("compact future-turn adapter", () => {
  it("creates candidate-only model-facing context without injection or raw content", () => {
    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-adapter",
    });
    const result = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "77",
        name: "Compact live checkpoint",
        currentPhase: "implementation",
        nextAction: "Route 78 wires injection.",
        forbiddenScope: ["provider/MCP", "SessionManager schema"],
      },
      taskGoal: {
        objective: "Prepare future-turn context.",
        constraints: ["no actual injection"],
      },
      mutationEvidence: {
        changedFiles: ["src/changed.ts"],
        rawOriginalContent: "RAW_MUTATION_CONTENT",
      },
      recoverySummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
        restorableFiles: ["src/changed.ts"],
        blockedFiles: [],
        recoveryAuthorityId: "authority-adapter",
        recoveryAction: "preview-restore",
        userFacingMessage: "preview",
        rawOriginalContent: "RAW_RECOVERY_CONTENT",
      },
      validationEvidence: {
        testsRun: ["compactFutureTurnAdapter.test.ts"],
        resultContractStatus: "passed",
        fullCommandOutput: "sk-secret-output",
      },
      secretValues: ["sk-secret-output"],
    });
    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-adapter",
      sourceCommand: "/compact",
      result,
    });
    const adapter = adaptCompactCheckpointForFutureTurn(checkpoint);
    const serialized = JSON.stringify(adapter);

    expect(adapter.adapterVersion).toBe("compact-future-turn-adapter-v1");
    expect(adapter.checkpointId).toBe("checkpoint-adapter");
    expect(adapter.injectionStatus).toBe("candidate-only");
    expect(adapter.providerInjectionStatus).toBe("not-injected");
    expect(adapter.persistence).toBe("none");
    expect(adapter.providerCall).toBe("none");
    expect(adapter.structuredFacts.editCapability.blockedByDesign.map((entry) => entry.id)).toEqual(
      expect.arrayContaining([
        "arbitrary-broad-apply-patch",
        "fuzzy-patch",
        "automatic-recovery",
        "atomic-rollback",
      ]),
    );
    expect(adapter.structuredFacts.recoveryRestoreReferences).toEqual(
      expect.objectContaining({
        restoreAvailable: true,
        restorePreviewAvailable: true,
        restoreExecuteExplicitOnly: true,
        recoveryAuthorityReferences: ["authority-adapter"],
        automaticRecoveryAvailable: false,
        atomicRollbackAvailable: false,
        recoveryExecuted: false,
      }),
    );
    expect(adapter.excludedFacts).toEqual(
      expect.arrayContaining([
        "raw-original-content",
        "raw-recovery-content",
        "future-turn-query-loop-injection",
        "provider-model-call",
        "automatic-recovery",
        "atomic-rollback",
      ]),
    );
    expect(adapter.evidence).toEqual(
      expect.arrayContaining([
        "compact-future-turn-adapter:candidate-only",
        "compact-future-turn-adapter:not-injected",
      ]),
    );
    expect(serialized).not.toContain("RAW_MUTATION_CONTENT");
    expect(serialized).not.toContain("RAW_RECOVERY_CONTENT");
    expect(serialized).not.toContain("sk-secret-output");
  });
});

import { describe, expect, it } from "vitest";
import { runCompactCommand } from "./compactCommandRunner.js";
import { adaptCompactCheckpointForFutureTurn } from "./compactFutureTurnAdapter.js";
import { formatCompactInjectedContext } from "./compactInjectedContextFormatter.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "./compactLiveCheckpoint.js";

describe("compact injected context formatter", () => {
  it("renders compact-safe model-facing continuity without raw content or secrets", () => {
    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-format",
    });
    const result = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "78",
        name: "Compact v2 future-turn injection",
        currentPhase: "implementation",
        nextAction: "Run focused injection tests.",
        forbiddenScope: ["provider/MCP", "SessionManager schema"],
      },
      taskGoal: {
        objective: "Inject compact context once.",
        constraints: ["no persistence", "no raw content"],
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
        recoveryAuthorityId: "authority-format",
        rawOriginalContent: "RAW_RECOVERY_CONTENT",
      },
      validationEvidence: {
        testsRun: ["compactInjectedContextFormatter.test.ts"],
        resultContractStatus: "passed",
        fullCommandOutput: "sk-secret-output",
      },
      secretValues: ["sk-secret-output"],
    });
    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-format",
      sourceCommand: "/compact",
      result,
    });

    const formatted = formatCompactInjectedContext(
      adaptCompactCheckpointForFutureTurn(checkpoint),
    );

    expect(formatted).toContain("<compact_v2_injected_context>");
    expect(formatted).toContain("Route: 78 Compact v2 future-turn injection");
    expect(formatted).toContain("Inject compact context once.");
    expect(formatted).toContain("authority-format");
    expect(formatted).toContain("Result contract: passed");
    expect(formatted).toContain("Restore execute: explicit-only");
    expect(formatted).toContain("Automatic recovery: not enabled");
    expect(formatted).toContain("Atomic rollback: not available");
    expect(formatted).toContain("arbitrary-broad-apply-patch");
    expect(formatted).not.toContain("RAW_MUTATION_CONTENT");
    expect(formatted).not.toContain("RAW_RECOVERY_CONTENT");
    expect(formatted).not.toContain("sk-secret-output");
  });
});

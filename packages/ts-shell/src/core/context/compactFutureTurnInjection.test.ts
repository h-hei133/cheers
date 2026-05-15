import { describe, expect, it } from "vitest";
import { runCompactCommand } from "./compactCommandRunner.js";
import { planCompactFutureTurnInjection } from "./compactFutureTurnInjection.js";
import { createCompactInjectionStateStore } from "./compactInjectionState.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "./compactLiveCheckpoint.js";

describe("compact future-turn injection planner", () => {
  it("injects a pending checkpoint once and consumes its state", () => {
    const checkpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-inject",
    });
    const injectionStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const result = runCompactCommand({
      mode: "render",
      source: "route",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "78",
        name: "Compact v2 future-turn injection",
        nextAction: "Continue with runtime hook.",
      },
      mutationEvidence: {
        changedFiles: ["src/changed.ts"],
        rawOriginalContent: "RAW_MUTATION_CONTENT",
      },
      recoverySummary: {
        recoveryAvailable: true,
        explicitRestoreAvailable: true,
        recoveryAuthorityId: "authority-inject",
        rawOriginalContent: "RAW_RECOVERY_CONTENT",
      },
      unsafeInputs: {
        providerCredentials: "sk-secret-output",
      },
    });
    const checkpoint = updateLatestCompactCheckpoint(checkpointStore, {
      sessionScopeId: "session:sess-inject",
      sourceCommand: "/compact",
      result,
    });
    injectionStore.markPending({
      sessionScopeId: "session:sess-inject",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });

    const first = planCompactFutureTurnInjection({
      checkpoint,
      injectionState: injectionStore.get("session:sess-inject"),
      markInjected: (input) => injectionStore.markInjected(input),
      markConsumed: (input) => injectionStore.markConsumed(input),
      markInvalid: (input) => injectionStore.markInvalid(input),
    });
    const second = planCompactFutureTurnInjection({
      checkpoint,
      injectionState: injectionStore.get("session:sess-inject"),
      markInjected: (input) => injectionStore.markInjected(input),
      markConsumed: (input) => injectionStore.markConsumed(input),
      markInvalid: (input) => injectionStore.markInvalid(input),
    });

    expect(first.shouldInject).toBe(true);
    expect(first.injectedContext).toContain("authority-inject");
    expect(first.injectedContext).toContain("arbitrary-broad-apply-patch");
    expect(first.injectedContext).not.toContain("RAW_MUTATION_CONTENT");
    expect(first.injectedContext).not.toContain("RAW_RECOVERY_CONTENT");
    expect(first.injectedContext).not.toContain("sk-secret-output");
    expect(first.updatedInjectionState.injectionStatus).toBe("consumed");
    expect(first.updatedInjectionState.injectionCount).toBe(1);
    expect(second.shouldInject).toBe(false);
    expect(second.warnings.map((warning) => warning.id)).toContain(
      "checkpoint-not-pending",
    );
  });

  it("skips missing, non-pending, or unsafe checkpoint payloads", () => {
    const injectionStore = createCompactInjectionStateStore();
    const missing = planCompactFutureTurnInjection({
      injectionState: injectionStore.get("session:sess-missing"),
      markConsumed: (input) => injectionStore.markConsumed(input),
    });

    expect(missing.shouldInject).toBe(false);
    expect(missing.warnings.map((warning) => warning.id)).toContain(
      "no-checkpoint",
    );
  });
});

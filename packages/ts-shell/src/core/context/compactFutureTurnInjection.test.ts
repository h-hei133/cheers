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

  it("applies budget and dedupe while preserving critical injected facts", () => {
    const checkpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => "checkpoint-budget",
    });
    const injectionStore = createCompactInjectionStateStore();
    const checkpoint = updateLatestCompactCheckpoint(checkpointStore, {
      sessionScopeId: "session:sess-budget",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-16T00:00:00.000Z",
        routeInfo: {
          routeId: "79",
          name: "Compact v2 quality",
          nextAction: "Preserve critical facts.",
          forbiddenScope: Array.from({ length: 50 }, (_, index) => `forbidden-${index}`),
        },
        taskGoal: {
          objective: "Budget injected context.",
          constraints: Array.from({ length: 50 }, (_, index) => `constraint-${index}`),
        },
        validationEvidence: {
          resultContractStatus: "passed",
        },
      }),
    });
    injectionStore.markPending({
      sessionScopeId: "session:sess-budget",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });

    const plan = planCompactFutureTurnInjection({
      checkpoint,
      injectionState: injectionStore.get("session:sess-budget"),
      maxInjectedContextChars: 1200,
      markInjected: (input) => injectionStore.markInjected(input),
      markConsumed: (input) => injectionStore.markConsumed(input),
      markInvalid: (input) => injectionStore.markInvalid(input),
    });

    expect(plan.shouldInject).toBe(true);
    expect(plan.injectedContext).toContain("Budget injected context.");
    expect(plan.injectedContext).toContain("arbitrary-broad-apply-patch");
    expect(plan.injectedContext).toContain("Restore execute: explicit-only");
    expect(plan.injectedContext).toContain("Result contract: passed");
    expect(plan.injectedContext).toContain("Automatic recovery: not enabled");
    expect(plan.injectedContext).toContain("Atomic rollback: not available");
    expect(plan.warnings.map((warning) => warning.id)).toContain(
      "compact-injected-context-over-budget",
    );
  });

  it("blocks quality failures without consuming pending injection", () => {
    const checkpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => "checkpoint-quality-fail",
    });
    const injectionStore = createCompactInjectionStateStore();
    const checkpoint = updateLatestCompactCheckpoint(checkpointStore, {
      sessionScopeId: "session:sess-quality-fail",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-16T00:00:00.000Z",
      }),
    });
    injectionStore.markPending({
      sessionScopeId: "session:sess-quality-fail",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });
    const badCheckpoint = {
      ...checkpoint,
      packet: {
        ...checkpoint.packet,
        taskGoal: {
          ...checkpoint.packet.taskGoal,
          objective: undefined,
          nextAction: undefined,
        },
        route: {
          ...checkpoint.packet.route,
          objective: undefined,
          nextAction: undefined,
        },
        editCapability: {
          ...checkpoint.packet.editCapability,
          closeoutStatus: undefined,
          blockedByDesign: [],
        },
      },
    };

    const plan = planCompactFutureTurnInjection({
      checkpoint: badCheckpoint,
      injectionState: injectionStore.get("session:sess-quality-fail"),
      markInjected: (input) => injectionStore.markInjected(input),
      markConsumed: (input) => injectionStore.markConsumed(input),
      markInvalid: (input) => injectionStore.markInvalid(input),
    });

    expect(plan.shouldInject).toBe(false);
    expect(plan.warnings.map((warning) => warning.id)).toContain(
      "compact-continuity-quality-failed",
    );
    expect(plan.updatedInjectionState.injectionStatus).toBe("invalid");
    expect(plan.updatedInjectionState.injectionCount).toBe(0);
  });

  it("rejects stale checkpoints instead of overriding newer compact facts", () => {
    const checkpointStore = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-stale-current",
    });
    const injectionStore = createCompactInjectionStateStore();
    const checkpoint = updateLatestCompactCheckpoint(checkpointStore, {
      sessionScopeId: "session:sess-stale-planner",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-15T00:00:00.000Z",
        routeInfo: { routeId: "78", nextAction: "old" },
      }),
      createdAt: "2026-05-15T00:00:00.000Z",
    });
    injectionStore.markPending({
      sessionScopeId: "session:sess-stale-planner",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });
    const previousCheckpoint = {
      ...checkpoint,
      checkpointId: "checkpoint-newer-previous",
      createdAt: "2026-05-16T00:00:00.000Z",
    };

    const plan = planCompactFutureTurnInjection({
      checkpoint,
      previousCheckpoint,
      injectionState: injectionStore.get("session:sess-stale-planner"),
      markConsumed: (input) => injectionStore.markConsumed(input),
      markInvalid: (input) => injectionStore.markInvalid(input),
    });

    expect(plan.shouldInject).toBe(false);
    expect(plan.warnings.map((warning) => warning.id)).toContain(
      "compact-merge-quality-failed",
    );
    expect(plan.updatedInjectionState.injectionStatus).toBe("invalid");
  });
});

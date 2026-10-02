import { describe, expect, it } from "vitest";
import { runCompactCommand } from "../command/compactCommandRunner.js";
import { formatCompactCheckpointStatus } from "./compactCheckpointSurface.js";
import { createCompactInjectionStateStore } from "../injection/compactInjectionState.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "./compactLiveCheckpoint.js";

describe("compact checkpoint surface", () => {
  it("reports retained-history loss even when the latest checkpoint was evicted", () => {
    expect(formatCompactCheckpointStatus(undefined, undefined, { capacity: 1, size: 1, dropped: 2, incomplete: true }))
      .toContain("Checkpoint history: incomplete (2 checkpoints dropped)");
  });
  it("renders missing and existing checkpoint status without exposing packet content", () => {
    expect(formatCompactCheckpointStatus(undefined)).toContain(
      "- Latest: none",
    );

    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-surface",
    });
    const result = runCompactCommand({
      mode: "render",
      source: "session",
      generatedAt: "2026-05-15T00:00:00.000Z",
      routeInfo: {
        routeId: "77",
        name: "Compact live checkpoint",
        nextAction: "Route 78 will wire injection.",
      },
      mutationEvidence: {
        changedFiles: ["src/changed.ts"],
        rawOriginalContent: "RAW_CONTENT",
      },
    });
    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:surface",
      sourceCommand: "/compact",
      result,
    });
    const injectionStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    const pending = injectionStore.markPending({
      sessionScopeId: "session:surface",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });
    const output = formatCompactCheckpointStatus(checkpoint, pending);

    expect(output).toContain("Compact checkpoint");
    expect(output).toContain("- Latest: exists");
    expect(output).toContain("- Checkpoint id: checkpoint-surface");
    expect(output).toContain("- Future-turn adapter: ready-for-adapter");
    expect(output).toContain("- Injection status: checkpoint pending injection");
    expect(output).toContain("- Next action: Route 78 will wire injection.");
    expect(output).not.toContain("RAW_CONTENT");
    expect(output).not.toContain('"packetVersion"');
  });

  it("renders injected, consumed, superseded, and invalid checkpoint statuses", () => {
    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-15T00:00:00.000Z",
      nextId: () => "checkpoint-status",
    });
    const result = runCompactCommand({
      mode: "render",
      source: "session",
      generatedAt: "2026-05-15T00:00:00.000Z",
    });
    const checkpoint = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:surface-status",
      sourceCommand: "/compact",
      result,
    });
    const injectionStore = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });
    injectionStore.markPending({
      sessionScopeId: "session:surface-status",
      checkpointId: checkpoint.checkpointId,
      sourceCommand: "/compact",
    });
    const injected = injectionStore.markInjected({
      sessionScopeId: "session:surface-status",
      checkpointId: checkpoint.checkpointId,
    });
    const consumed = injectionStore.markConsumed({
      sessionScopeId: "session:surface-status",
      checkpointId: checkpoint.checkpointId,
    });
    const invalid = injectionStore.markInvalid({
      sessionScopeId: "session:surface-status",
      checkpointId: checkpoint.checkpointId,
      reason: "unsafe",
    });
    const superseded = store.markSuperseded(checkpoint.checkpointId);

    expect(formatCompactCheckpointStatus(checkpoint, injected)).toContain(
      "- Injection status: checkpoint injected",
    );
    expect(formatCompactCheckpointStatus(checkpoint, consumed)).toContain(
      "- Injection status: checkpoint consumed",
    );
    expect(formatCompactCheckpointStatus(checkpoint, invalid)).toContain(
      "- Injection status: checkpoint invalid",
    );
    expect(formatCompactCheckpointStatus(superseded, consumed)).toContain(
      "- Injection status: checkpoint superseded",
    );
  });
});

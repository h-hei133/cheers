import { describe, expect, it } from "vitest";
import { runCompactCommand } from "./compactCommandRunner.js";
import { createCompactInjectionStateStore } from "./compactInjectionState.js";
import { planCompactInjectionMerge } from "./compactInjectionMergePolicy.js";
import {
  createCompactLiveCheckpointStore,
  updateLatestCompactCheckpoint,
} from "./compactLiveCheckpoint.js";

describe("compact injection merge policy", () => {
  it("lets latest checkpoint win while carrying stable survivor facts safely", () => {
    let id = 0;
    const store = createCompactLiveCheckpointStore({
      now: () => "2026-05-16T00:00:00.000Z",
      nextId: () => {
        id += 1;
        return `checkpoint-${id}`;
      },
    });
    const previous = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-merge",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-15T00:00:00.000Z",
        routeInfo: { routeId: "78", nextAction: "old action" },
      }),
      createdAt: "2026-05-15T00:00:00.000Z",
    });
    const current = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-merge",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-16T00:00:00.000Z",
        routeInfo: { routeId: "79", nextAction: "new action" },
      }),
      createdAt: "2026-05-16T00:00:00.000Z",
    });
    const injectionStore = createCompactInjectionStateStore();
    injectionStore.markPending({
      sessionScopeId: "session:sess-merge",
      checkpointId: previous.checkpointId,
      sourceCommand: "/compact",
    });
    const state = injectionStore.markPending({
      sessionScopeId: "session:sess-merge",
      checkpointId: current.checkpointId,
      sourceCommand: "/compact",
    });

    const merge = planCompactInjectionMerge({
      checkpoint: current,
      previousCheckpoint: previous,
      injectionState: state,
    });

    expect(merge.mergeStatus).toBe("warn");
    expect(merge.warnings.map((warning) => warning.id)).toContain(
      "superseded-checkpoints-present",
    );
    expect(merge.blockers).toEqual([]);
    expect(merge.checkpoint.packet.route.nextAction).toBe("new action");
    expect(JSON.stringify(merge.mergedCompactSurvivorFacts)).not.toContain(
      "# Compact v2 Handoff",
    );
    expect(JSON.stringify(merge.mergedCompactSurvivorFacts)).not.toContain("RAW_");
    expect(JSON.stringify(merge.mergedCompactSurvivorFacts)).not.toContain("sk-");
  });

  it("blocks stale current checkpoints from overriding newer facts", () => {
    const store = createCompactLiveCheckpointStore({
      nextId: () => "checkpoint-current",
    });
    const current = updateLatestCompactCheckpoint(store, {
      sessionScopeId: "session:sess-stale",
      sourceCommand: "/compact",
      result: runCompactCommand({
        mode: "render",
        source: "route",
        generatedAt: "2026-05-15T00:00:00.000Z",
        routeInfo: { routeId: "78", nextAction: "old action" },
      }),
      createdAt: "2026-05-15T00:00:00.000Z",
    });
    const previous = {
      ...current,
      checkpointId: "checkpoint-newer",
      createdAt: "2026-05-16T00:00:00.000Z",
    };
    const injectionStore = createCompactInjectionStateStore();
    const state = injectionStore.markPending({
      sessionScopeId: "session:sess-stale",
      checkpointId: current.checkpointId,
      sourceCommand: "/compact",
    });

    const merge = planCompactInjectionMerge({
      checkpoint: current,
      previousCheckpoint: previous,
      injectionState: state,
    });

    expect(merge.mergeStatus).toBe("fail");
    expect(merge.blockers.map((blocker) => blocker.id)).toContain(
      "stale-checkpoint",
    );
  });
});

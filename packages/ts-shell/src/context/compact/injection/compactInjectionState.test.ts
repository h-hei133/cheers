import { describe, expect, it } from "vitest";
import { createCompactInjectionStateStore } from "./compactInjectionState.js";

describe("compact injection state", () => {
  it("bounds superseded history and session retention without replaying evicted work", () => {
    const store = createCompactInjectionStateStore({ sessionCapacity: 2, historyCapacity: 2 });
    for (let i = 0; i < 5; i++) store.markPending({ sessionScopeId: "one", checkpointId: `cp-${i}`, sourceCommand: "/compact" });
    expect(store.get("one")).toMatchObject({ supersededCheckpointIds: ["cp-3", "cp-2"], dropped: 2, incomplete: true });
    store.markConsumed({ sessionScopeId: "one", checkpointId: "cp-4" });
    expect(store.get("one").injectionCount).toBe(1);
    for (const sessionScopeId of ["two", "three"]) store.markPending({ sessionScopeId, checkpointId: "other", sourceCommand: "/compact" });
    expect(store.retention()).toMatchObject({ size: 2, dropped: 1, incomplete: true });
    expect(store.markInjected({ sessionScopeId: "one", checkpointId: "cp-4" })).toMatchObject({ injectionStatus: "none", incomplete: true });
    expect(store.markInvalid({ sessionScopeId: "one", checkpointId: "cp-4", reason: "late failure" }).injectionStatus).toBe("none");
    store.clear("three");
    expect(store.retention().size).toBe(1);
  });

  it("tracks a session-scoped pending checkpoint without persistence or provider calls", () => {
    const store = createCompactInjectionStateStore({
      now: () => "2026-05-15T00:00:00.000Z",
    });

    const pending = store.markPending({
      sessionScopeId: "session:sess-78",
      checkpointId: "checkpoint-1",
      sourceCommand: "/compact",
    });

    expect(pending).toEqual(
      expect.objectContaining({
        sessionScopeId: "session:sess-78",
        injectionStatus: "pending",
        checkpointId: "checkpoint-1",
        injectionCount: 0,
        sourceCommand: "/compact",
        persistence: "none",
        providerCall: "none",
      }),
    );
    expect(store.get("session:sess-78")).toBe(pending);
  });

  it("prevents duplicate injection and records superseded pending checkpoints", () => {
    let tick = 0;
    const store = createCompactInjectionStateStore({
      now: () => {
        tick += 1;
        return `2026-05-15T00:00:0${tick}.000Z`;
      },
    });

    store.markPending({
      sessionScopeId: "session:sess-78",
      checkpointId: "checkpoint-1",
      sourceCommand: "/compact",
    });
    const superseding = store.markPending({
      sessionScopeId: "session:sess-78",
      checkpointId: "checkpoint-2",
      sourceCommand: "/handoff",
    });
    const injected = store.markInjected({
      sessionScopeId: "session:sess-78",
      checkpointId: "checkpoint-2",
    });
    const consumed = store.markConsumed({
      sessionScopeId: "session:sess-78",
      checkpointId: "checkpoint-2",
    });
    const duplicate = store.markInjected({
      sessionScopeId: "session:sess-78",
      checkpointId: "checkpoint-2",
    });

    expect(superseding.warnings.map((warning) => warning.id)).toContain(
      "pending-checkpoint-superseded",
    );
    expect(injected.injectionStatus).toBe("injected");
    expect(consumed.injectionStatus).toBe("consumed");
    expect(consumed.injectionCount).toBe(1);
    expect(duplicate).toBe(consumed);
  });
});

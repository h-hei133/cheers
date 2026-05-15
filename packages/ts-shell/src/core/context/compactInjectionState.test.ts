import { describe, expect, it } from "vitest";
import { createCompactInjectionStateStore } from "./compactInjectionState.js";

describe("compact injection state", () => {
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

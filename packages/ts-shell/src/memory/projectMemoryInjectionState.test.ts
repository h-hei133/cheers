import { describe, expect, it } from "vitest";
import { createProjectMemoryInjectionStateStore } from "./projectMemoryInjectionState.js";
import { renderProjectMemoryInjectionSurface } from "./projectMemoryInjectionSurface.js";

describe("memory injection retention", () => {
  it("keeps recent superseded ids with loss markers and bounds session state", () => {
    let id = 0;
    const store = createProjectMemoryInjectionStateStore({ sessionCapacity: 2, historyCapacity: 2, nextId: () => `id-${id++}` });
    const stage = (sessionScopeId: string) => store.markPending({ sessionScopeId, sourceCommand: "/memory use", mode: "recall", recordIds: ["record"] });
    stage("one");
    expect(stage("one").incomplete).toBe(false);
    for (let i = 0; i < 3; i++) stage("one");
    const state = store.get("one");
    expect(state).toMatchObject({ supersededInjectionIds: ["id-3", "id-2"], dropped: 2, incomplete: true });
    expect(renderProjectMemoryInjectionSurface({ state, outcome: "status" })).toContain("history: incomplete");
    const consumed = store.markConsumed({ sessionScopeId: "one", memoryInjectionId: "id-4" });
    expect(store.markInjected({ sessionScopeId: "one", memoryInjectionId: "id-4" })).toBe(consumed);
    stage("two");
    stage("three");
    expect(store.retention()).toMatchObject({ size: 2, dropped: 1, incomplete: true });
    expect(store.markInjected({ sessionScopeId: "one", memoryInjectionId: "id-4" })).toMatchObject({ injectionStatus: "none", incomplete: true });
    expect(store.markInvalid({ sessionScopeId: "one", memoryInjectionId: "id-4", reason: "late failure" }).injectionStatus).toBe("none");
    expect(store.get("two").injectionStatus).toBe("pending");
    store.clear("three");
    expect(store.retention().size).toBe(1);
  });

  it("bounds repeated invalidation diagnostics", () => {
    const store = createProjectMemoryInjectionStateStore();
    for (let i = 0; i < 300; i++) store.markInvalid({ sessionScopeId: "one", reason: `failure-${i}` });
    const state = store.get("one");
    expect(state.incomplete).toBe(true);
    expect(state.warnings.length).toBeLessThanOrEqual(256);
    expect(state.evidence.length).toBeLessThanOrEqual(256);
    expect(state.warnings.at(-1)?.message).toBe("failure-299");
  });
});

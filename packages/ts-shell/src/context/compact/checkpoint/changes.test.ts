import { expect, it, vi } from "vitest";
import { runCompactCommand } from "../command/compactCommandRunner.js";
import { createCompactLiveCheckpointStore } from "./compactLiveCheckpoint.js";

it("notifies both affected scopes on ID reuse and eviction, then clear and supersession", async () => {
  const store = createCompactLiveCheckpointStore({ capacity: 1 });
  const first = vi.fn(); const second = vi.fn();
  store.subscribe!("first", first); store.subscribe!("second", second);
  const result = runCompactCommand({ mode: "render", source: "session" });
  store.updateLatest({ sessionScopeId: "first", checkpointId: "same", sourceCommand: "/compact", result });
  await Promise.resolve(); expect(first).toHaveBeenCalledOnce(); first.mockClear();
  store.updateLatest({ sessionScopeId: "second", checkpointId: "same", sourceCommand: "/compact", result });
  await Promise.resolve(); expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
  expect(store.getLatest("first")).toBeUndefined(); first.mockClear(); second.mockClear();
  store.updateLatest({ sessionScopeId: "first", checkpointId: "new", sourceCommand: "/compact", result });
  await Promise.resolve(); expect(first).toHaveBeenCalledOnce(); expect(second).toHaveBeenCalledOnce();
  first.mockClear(); store.markSuperseded("new");
  await Promise.resolve(); expect(first).toHaveBeenCalledOnce(); expect(store.getLatest("first")).toBeUndefined();
  store.updateLatest({ sessionScopeId: "first", sourceCommand: "/compact", result });
  await Promise.resolve(); first.mockClear(); store.clearLatest("first");
  await Promise.resolve(); expect(first).toHaveBeenCalledOnce(); expect(store.getLatest("first")).toBeUndefined();
});

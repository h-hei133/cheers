import { expect, it, vi } from "vitest";
import { createStateChanges } from "./changes.js";

it("coalesces scoped changes and isolates observer failures", async () => {
  const changes = createStateChanges(); const one = vi.fn(); const other = vi.fn();
  changes.subscribe("one", () => { throw new Error("observer failed"); });
  changes.subscribe("one", one); changes.subscribe("other", other);
  changes.notify("one"); changes.notify("one", "unobserved");
  expect(one).not.toHaveBeenCalled();
  await Promise.resolve();
  expect(one).toHaveBeenCalledOnce(); expect(other).not.toHaveBeenCalled();
});

it("drops pending delivery on release and makes repeated release harmless to new subscribers", async () => {
  const changes = createStateChanges(); const old = vi.fn(); const current = vi.fn();
  const stop = changes.subscribe("one", old);
  changes.notify("one"); stop();
  changes.subscribe("one", current); stop(); changes.notify("one");
  await Promise.resolve();
  expect(old).not.toHaveBeenCalled(); expect(current).toHaveBeenCalledOnce();
});

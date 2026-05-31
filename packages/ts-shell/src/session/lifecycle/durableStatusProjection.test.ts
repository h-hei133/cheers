import { describe, expect, it } from "vitest";
import { projectDurableStatus } from "./durableStatusProjection.js";

describe("projectDurableStatus", () => {
  it("keeps terminal success and completed session status durable-success", () => {
    expect(projectDurableStatus("success", "active")).toBe("success");
    expect(projectDurableStatus(undefined, "completed")).toBe("success");
  });

  it("keeps stopped terminal classification distinct from errors", () => {
    expect(projectDurableStatus("stopped", "active")).toBe("stopped");
    expect(projectDurableStatus("stopped", "error")).toBe("stopped");
  });

  it("projects terminal or session errors to durable-error", () => {
    expect(projectDurableStatus("error", "active")).toBe("error");
    expect(projectDurableStatus(undefined, "error")).toBe("error");
  });

  it("does not invent durability for non-terminal active states", () => {
    expect(projectDurableStatus(undefined, "active")).toBeUndefined();
    expect(projectDurableStatus(undefined, "interrupted")).toBeUndefined();
    expect(projectDurableStatus(undefined, "terminated")).toBeUndefined();
  });
});

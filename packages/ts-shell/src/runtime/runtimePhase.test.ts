import { describe, expect, it } from "vitest";

import { transitionRuntimePhase } from "./runtimePhase.js";

describe("runtime phase vocabulary", () => {
  it("accepts structural turn to save-point transitions through a tool result batch", () => {
    expect(transitionRuntimePhase("turn", "tool_result_batch")).toMatchObject({
      status: "accepted",
      from: "turn",
      to: "tool_result_batch",
    });
    expect(transitionRuntimePhase("tool_result_batch", "save_point")).toMatchObject({
      status: "accepted",
      from: "tool_result_batch",
      to: "save_point",
    });
  });

  it("classifies invalid structural transitions without creating a phase", () => {
    expect(transitionRuntimePhase("idle", "save_point")).toMatchObject({
      status: "rejected",
      from: "idle",
      to: "save_point",
    });
  });
});


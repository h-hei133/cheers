import { describe, expect, it } from "vitest";
import type { ContinuityTerminalFacts } from "./truth.js";
import { selectContinuityTerminalSource } from "./truth.js";

describe("selectContinuityTerminalSource", () => {
  it("does not let query-level success upgrade a coding-level stopped result", () => {
    const codingStopped: ContinuityTerminalFacts = { terminalClassification: "stopped", terminalReason: "stopped_error" };
    const querySuccess: ContinuityTerminalFacts = { terminalClassification: "success", terminalReason: "completed" };

    expect(
      selectContinuityTerminalSource({
        query: querySuccess,
        coding: codingStopped,
      }),
    ).toBe(codingStopped);
  });

  it("does not upgrade an unknown retained result to query success", () => {
    const coding = {};
    expect(selectContinuityTerminalSource({ query: { terminalClassification: "success" }, coding })).toBe(coding);
  });

  it("keeps a newer query error visible", () => {
    const query: ContinuityTerminalFacts = { terminalClassification: "error", terminalReason: "stopped_error" };
    expect(selectContinuityTerminalSource({ query, coding: {} })).toBe(query);
  });

  it("uses retained facts when the query has no terminal classification", () => {
    const coding: ContinuityTerminalFacts = { terminalClassification: "stopped" };
    expect(selectContinuityTerminalSource({ coding })).toBe(coding);
    expect(selectContinuityTerminalSource({ query: {}, coding })).toBe(coding);
    expect(selectContinuityTerminalSource({})).toBeUndefined();
  });
});

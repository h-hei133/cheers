import { describe, expect, it } from "vitest";
import { describeCompaction, parseCompactCommand } from "./compact.js";

describe("compact command parsing", () => {
  it("recognises the bare command and its alias", () => {
    expect(parseCompactCommand("/compact")).toEqual({});
    expect(parseCompactCommand("  /handoff  ")).toEqual({});
    expect(parseCompactCommand("/Compact")).toEqual({});
  });

  it("carries focus instructions", () => {
    expect(parseCompactCommand("/compact keep the migration plan")).toEqual({ instructions: "keep the migration plan" });
    expect(parseCompactCommand("/compact -- --verbose keep it")).toEqual({ instructions: "--verbose keep it" });
    expect(parseCompactCommand('/compact "keep the plan"')).toEqual({ instructions: "keep the plan" });
  });

  it.each(["--preview=false", "--json=false", "--render=false", "--verbose keep it", "--goal preview", "--source manual", "--preview --json", "--constraint", "-x"])("never compacts option input %s", args => {
    expect(parseCompactCommand(`/compact ${args}`)).toBeUndefined();
    expect(parseCompactCommand(`/handoff ${args}`)).toBeUndefined();
  });

  it("leaves the handoff artifact forms and other commands alone", () => {
    expect(parseCompactCommand("/compact preview")).toBeUndefined();
    expect(parseCompactCommand("/compact json extra")).toBeUndefined();
    expect(parseCompactCommand("/compactor")).toBeUndefined();
    expect(parseCompactCommand("compact")).toBeUndefined();
  });
});

describe("compaction description", () => {
  it("states what was condensed and that the gauge follows the next response", () => {
    const lines = describeCompaction({ status: "compacted", summarized: 8, kept: 4, tokensBefore: 12_000, tokensAfter: 3_000 });
    expect(lines[0]).toContain("8 earlier messages");
    expect(lines[0]).toContain("latest 4");
    expect(lines[1]).toContain("12,000");
    expect(lines[1]).toContain("3,000");
    expect(lines[1]).toContain("after the next response");
  });

  it("explains the other outcomes plainly", () => {
    expect(describeCompaction({ status: "nothing", reason: "too short" })).toEqual(["too short"]);
    expect(describeCompaction({ status: "busy" })[0]).toContain("still running");
    expect(describeCompaction({ status: "failed", reason: "no key" })[0]).toContain("no key");
  });
});

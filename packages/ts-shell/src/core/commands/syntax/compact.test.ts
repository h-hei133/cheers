import { describe, expect, it } from "vitest";
import { compactCompletions } from "../../../context/compact/command/completion.js";
import { parseCompactSyntax } from "../../../context/compact/command/syntax.js";
import { runCompactLocalCommand } from "../compactCommandRuntime.js";

describe("compact syntax projections", () => {
  it("offers only valid artifact flags and preserves repeatable constraints", () => {
    expect(compactCompletions("")?.map(item => item.value)).toEqual(["preview", "render", "json"]);
    const values = compactCompletions("preview --constraint first ")?.map(item => item.value);
    expect(values).toContain("--constraint");
    expect(values).not.toContain("--preview");
    expect(values).not.toContain("--json");
    expect(compactCompletions("preview --source ")?.map(item => item.value)).toEqual(["session", "route", "manual"]);
    expect(compactCompletions("preview -- ")).toBeNull();
  });

  it("canonicalizes aliases and retains every repeated value in order", () => {
    const parsed = parseCompactSyntax(["preview", "--objective", "goal", "--constraint", "one", "--constraint=two"]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.flags.get("goal")).toBe("goal");
    expect(parsed.values.get("constraint")).toEqual(["one", "two"]);
    expect(parsed.args).toEqual([]);
  });

  it("prints only actual instructions, excluding metadata values", async () => {
    const result = await runCompactLocalCommand(["preview", "focus here", "--goal", "metadata objective", "--constraint", "metadata constraint"], { cwd: "/tmp/compact-syntax" });
    expect(result.output).toContain('Custom instructions noted: "focus here"');
    expect(result.output).not.toContain('Custom instructions noted: "focus here metadata');
  });
});

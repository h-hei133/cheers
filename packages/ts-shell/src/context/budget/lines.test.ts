import { describe, expect, it } from "vitest";
import { applyProjectMemoryInjectedContextBudget } from "../../memory/projectMemoryInjectedContextBudget.js";
import { applyCompactInjectedContextBudget } from "../compact/injection/compactInjectedContextBudget.js";

describe.each([
  ["memory", applyProjectMemoryInjectedContextBudget, "project_memory_context"],
  ["compact", applyCompactInjectedContextBudget, "compact_v2_injected_context"],
] as const)("%s context budget", (_name, apply, tag) => {
  it("keeps complete lines in order inside the closing boundary", () => {
    const lines = [`<${tag}>`, "Safety", "- Automatic recovery: not enabled", "- Automatic memory injection: no.",
      ...Array.from({ length: 30 }, (_, index) => `fact ${index}: ${"detail ".repeat(10)}`), `</${tag}>`];
    const result = apply(lines.join("\n"), { maxChars: 500 });
    expect(result.fits).toBe(true);
    expect(result.context.length).toBeLessThanOrEqual(500);
    expect(result.context.endsWith(`</${tag}>`)).toBe(true);
    expect(result.context).toContain("- Budget:");
    const retained = result.context.split("\n").filter(line => !line.startsWith("- Budget:"));
    expect(retained).toEqual(lines.filter(line => retained.includes(line)));
    expect(result.omittedLineCount).toBeGreaterThan(0);
  });

  it.each([0, -1, NaN, Infinity, 40])("refuses an insufficient or invalid limit %s", maxChars => {
    const result = apply(`<${tag}>\nSafety\n</${tag}>`, { maxChars });
    expect(result).toMatchObject({ fits: false, context: "", estimatedSize: 0 });
    expect(result.omittedLineCount).toBeGreaterThanOrEqual(0);
  });

  it("does not let an oversized mandatory line bypass the limit", () => {
    const result = apply(`<${tag}>\nSafety ${"x".repeat(2000)}\n</${tag}>`, { maxChars: 500 });
    expect(result.fits).toBe(false);
    expect(result.context).toBe("");
  });
});

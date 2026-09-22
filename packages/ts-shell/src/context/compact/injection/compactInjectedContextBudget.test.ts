import { describe, expect, it } from "vitest";
import { applyCompactInjectedContextBudget } from "./compactInjectedContextBudget.js";

describe("compact injected context budget", () => {
  it("dedupes repeated facts and caps long lists", () => {
    const context = [
      "<compact_v2_injected_context>",
      "Task / route",
      "- Objective: Test budget",
      "- Objective: Test budget",
      "- Changed files:",
      ...Array.from({ length: 20 }, (_, index) => `  - src/file-${index}.ts`),
      "Safety",
      "- Automatic recovery: not enabled",
      "- Atomic rollback: not available",
      "</compact_v2_injected_context>",
    ].join("\n");

    const budgeted = applyCompactInjectedContextBudget(context, {
      maxListItems: 4,
    });

    expect(budgeted.context.match(/Objective: Test budget/g)?.length).toBe(1);
    expect(budgeted.context).toContain("additional entries omitted");
    expect(budgeted.context).toContain("- Automatic recovery: not enabled");
    expect(budgeted.context).toContain("- Atomic rollback: not available");
  });

  it("trims over-budget context while preserving critical safety facts", () => {
    const context = [
      "<compact_v2_injected_context>",
      "Task / route",
      "- Objective: Preserve this",
      "- Route: 79 Compact v2 quality",
      "- Next action: Continue safely",
      "Edit capability",
      "- Blocked by design:",
      "  - arbitrary-broad-apply-patch: blocked",
      "Recovery / restore",
      "- Restore execute: explicit-only",
      "Validation",
      "- Result contract: passed",
      "Constraints",
      "- Constraints / forbidden scope:",
      "  - no provider/MCP",
      "Safety",
      "- Automatic recovery: not enabled",
      "- Atomic rollback: not available",
      "- Raw original content, raw recovery content, secrets, provider credentials, and hidden reasoning are excluded.",
      ...Array.from({ length: 80 }, (_, index) => `noise ${index} ${"x".repeat(80)}`),
      "</compact_v2_injected_context>",
    ].join("\n");

    const budgeted = applyCompactInjectedContextBudget(context, {
      maxChars: 900,
      maxListItems: 5,
    });

    expect(budgeted.overBudget).toBe(true);
    expect(budgeted.context).toContain("- Objective: Preserve this");
    expect(budgeted.context).toContain("arbitrary-broad-apply-patch");
    expect(budgeted.context).toContain("- Restore execute: explicit-only");
    expect(budgeted.context).toContain("- Result contract: passed");
    expect(budgeted.context).toContain("- Automatic recovery: not enabled");
    expect(budgeted.context).toContain("- Atomic rollback: not available");
    expect(budgeted.context).toContain("</compact_v2_injected_context>");
  });
});

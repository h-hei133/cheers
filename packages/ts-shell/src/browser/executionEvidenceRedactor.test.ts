import { describe, expect, it } from "vitest";
import { redactBrowserExecutionEvidence } from "./executionEvidenceRedactor.js";

describe("browser execution evidence redactor", () => {
  it("keeps bounded evidence while redacting raw html, secrets, and hidden reasoning", () => {
    const evidence = redactBrowserExecutionEvidence({
      actionId: "browser-exec:test",
      executionMode: "local-fixture",
      runtimeName: "playwright-cli local fixture executor",
      rawContent: "<html>sk-secret12345 hidden reasoning page body</html>",
      actionTrace: ["opened local fixture", "captured <div>snapshot</div>"],
      executed: true,
    });

    expect(evidence.executed).toBe("yes");
    expect(evidence.safeSummary).not.toContain("<html>");
    expect(evidence.safeSummary).not.toContain("sk-secret12345");
    expect(evidence.safeSummary).not.toMatch(/hidden reasoning/i);
    expect(evidence.actionTraceSummary).not.toContain("<div>");
    expect(evidence.redactions).toEqual(
      expect.arrayContaining(["raw-html", "secret-looking-content", "hidden-reasoning"]),
    );
  });
});

import { describe, expect, it } from "vitest";
import { validateBrowserTxnEvalGate, type BrowserTxnEvalCaseResult } from "./browserTxnEval.js";

describe("Route 130 browser transaction regression gate", () => {
  it("passes compact eval results with trace, cleanup, reason, report, and redaction evidence", () => {
    const result = validateBrowserTxnEvalGate({
      cases: [validCase()],
    });

    expect(result.status).toBe("pass");
    expect(result.failures).toEqual([]);
    expect(result.evidence).toContain("browser-txn-gate:status:pass");
  });

  it("fails on missing trace, cleanup, redaction, reason, or eval outcome drift", () => {
    const result = validateBrowserTxnEvalGate({
      cases: [{
        ...validCase(),
        traceId: "",
        cleanupStatus: "",
        reasonCode: "",
        outcome: "fail",
        report: "Browser task completed\n- Transaction: success\n- Plan: observe -> click -> extract",
        evidence: ["<main><input value=\"sk-route126SECRET\" /></main>"],
      }],
    });

    expect(result.status).toBe("fail");
    expect(result.failures.join("\n")).toContain("missing trace id");
    expect(result.failures.join("\n")).toContain("missing cleanup evidence");
    expect(result.failures.join("\n")).toContain("raw DOM or typed/secret value leaked");
    expect(result.failures.join("\n")).toContain("action missing policy decision evidence");
    expect(result.failures.join("\n")).toContain("missing reason code");
    expect(result.failures.join("\n")).toContain("success report missing final extraction summary");
  });

  it("fails when repair status has no repair evidence", () => {
    const result = validateBrowserTxnEvalGate({
      cases: [{
        ...validCase(),
        report: [
          "Browser task completed",
          "- Transaction: success",
          "- Plan: observe -> click -> extract",
          "- Repair: succeeded",
          "- Result: Clicked Save draft after repair",
          "- Raw DOM: excluded",
        ].join("\n"),
        evidence: ["browser-transaction-policy:allowed"],
      }],
    });

    expect(result.status).toBe("fail");
    expect(result.failures.join("\n")).toContain("repair missing evidence");
  });
});

function validCase(): BrowserTxnEvalCaseResult {
  return {
    caseId: "valid",
    mode: "injected",
    outcome: "pass",
    scoreDetails: [{ name: "planner-confidence", outcome: "pass", reason: "matched" }],
    traceId: "browser-txn-trace-11111111",
    reasonCode: "ready",
    cleanupStatus: "closed",
    redactionStatus: "clean",
    report: [
      "Browser task completed",
      "- Transaction: success",
      "- Plan: observe -> click -> extract",
      "- Result: Clicked Save draft",
      "- Raw DOM: excluded",
    ].join("\n"),
    evidence: [
      "browser-agent-transaction-trace:browser-txn-trace-11111111:browser-txn:success:ready:not-needed:closed:clean:Clicked Save draft",
      "browser-transaction-policy:allowed",
    ],
  };
}

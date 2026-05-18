import { describe, expect, it } from "vitest";
import { renderBrowserTxnReport } from "../context/browserTxnReport.js";
import { createBrowserTxnResult } from "../context/browserTxnEvidence.js";
import { planBrowserTransaction } from "../context/browserPlan.js";

describe("Route 130 browser transaction report", () => {
  it("renders useful terminal result fields for transaction success", () => {
    const report = renderBrowserTxnReport(createResult({
      status: "success",
      reasonCode: "ready",
      finalSummary: "Clicked Save draft",
      cleanupStatus: "closed",
      repairStatus: "not-needed",
    }));

    expect(report).toContain("Browser task completed");
    expect(report).toContain("Outcome: transaction success");
    expect(report).toContain("TraceId: browser-txn-trace-");
    expect(report).toContain("Planner: high");
    expect(report).toContain("Result: Clicked Save draft");
    expect(report).toContain("Raw DOM: excluded");
  });

  it("distinguishes planner stop, policy block, repair failure, timeout, cleanup, and runtime cases", () => {
    expect(reportFor("stopped", "planner-low-confidence")).toContain("Outcome: planner stopped");
    expect(reportFor("stopped", "policy-blocked")).toContain("Outcome: policy blocked");
    expect(reportFor("stopped", "runtime-disabled")).toContain("Outcome: runtime unavailable");
    expect(reportFor("stopped", "repair-failed")).toContain("Outcome: repair failed");
    expect(reportFor("failed", "navigation-timeout")).toContain("Outcome: timeout with cleanup");
    expect(reportFor("failed", "cleanup-failed", "close-failed")).toContain("Outcome: cleanup failed");
  });
});

function reportFor(
  status: "success" | "stopped" | "failed",
  reasonCode: string,
  cleanupStatus = "not-started",
): string {
  return renderBrowserTxnReport(createResult({
    status,
    reasonCode,
    finalSummary: reasonCode,
    cleanupStatus,
    repairStatus: reasonCode === "repair-failed" ? "failed" : "not-needed",
  }));
}

function createResult(input: {
  readonly status: "success" | "stopped" | "failed";
  readonly reasonCode: string;
  readonly finalSummary: string;
  readonly cleanupStatus: string;
  readonly repairStatus: "not-needed" | "attempted" | "succeeded" | "failed";
}) {
  const plan = planBrowserTransaction({
    prompt: "Use the local browser fixture, click the status button, and report the new state",
  });
  expect(plan).toBeDefined();
  return createBrowserTxnResult({
    status: input.status,
    transactionId: `browser-txn-report-${input.reasonCode}`,
    controlledTarget: "local-fixture://pw/static",
    planner: plan!.planner,
    plannedSteps: plan!.steps.map((step) => step.kind),
    stepSummaries: input.status === "success"
      ? [{
          kind: "extract",
          status: "success",
          target: "visible-text",
          summary: input.finalSummary,
          reasonCode: input.reasonCode,
        }]
      : [],
    finalSummary: input.finalSummary,
    reasonCode: input.reasonCode,
    cleanupStatus: input.cleanupStatus,
    redactionStatus: "clean",
    repairStatus: input.repairStatus,
    durationMs: 5,
    evidence: [
      `browser-transaction:cleanup:${input.cleanupStatus}`,
      "browser-transaction:no-provider-or-model-call",
      "browser-transaction:no-mcp-live-backend",
    ],
  });
}

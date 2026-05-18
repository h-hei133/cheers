import { describe, expect, it } from "vitest";
import {
  browserTxnTraceEvidenceLine,
  summarizeBrowserTxnTrace,
} from "../context/browserTrace.js";
import { createBrowserTxnResult } from "../context/browserTxnEvidence.js";
import { planBrowserTransaction } from "../context/browserPlan.js";

describe("Route 130 browser transaction trace", () => {
  it("captures compact plan, step, repair, cleanup, and redaction state", () => {
    const result = createBrowserTxnResult({
      status: "success",
      transactionId: "browser-txn-test",
      controlledTarget: "local-fixture://pw/static",
      planner: requiredPlan().planner,
      stepSummaries: [
        {
          kind: "observe",
          status: "success",
          target: "visible-text",
          summary: "Static fixture ready",
          reasonCode: "ready",
        },
        {
          kind: "click",
          status: "success",
          target: "Save draft",
          summary: "Clicked Save draft",
          reasonCode: "ready",
          repairStatus: "succeeded",
        },
        {
          kind: "extract",
          status: "success",
          target: "visible-text",
          summary: "Clicked Save draft",
          reasonCode: "ready",
        },
      ],
      finalSummary: "Clicked Save draft",
      reasonCode: "ready",
      cleanupStatus: "closed",
      redactionStatus: "clean",
      repairStatus: "succeeded",
      durationMs: 12,
      evidence: [
        "browser-repair:succeeded",
        "browser-transaction:cleanup:closed",
        "browser-transaction:raw-dom-excluded",
        "browser-transaction:no-secrets",
      ],
    });

    expect(result.trace.traceId).toMatch(/^browser-txn-trace-/);
    expect(result.trace.plan.sequence).toEqual(["observe", "click", "extract"]);
    expect(result.trace.actions).toContain("click:success:ready:Save draft");
    expect(result.trace.repair.status).toBe("succeeded");
    expect(result.trace.cleanup.status).toBe("closed");
    expect(result.trace.redaction.evidence).toContain("browser-transaction:raw-dom-excluded");
    expect(browserTxnTraceEvidenceLine(result.trace)).toContain(result.trace.traceId);
    expect(summarizeBrowserTxnTrace(result.trace)).toContain("summary=Clicked Save draft");
  });

  it("does not retain raw DOM, hidden secrets, typed values, or image capture content", () => {
    const result = createBrowserTxnResult({
      status: "success",
      transactionId: "browser-txn-redaction",
      controlledTarget: "local-fixture://pw/redaction",
      planner: requiredPlan().planner,
      stepSummaries: [{
        kind: "extract",
        status: "success",
        target: "visible-text",
        summary: "api_key=[REDACTED_SECRET] hidden reasoning cookie=[REDACTED_SECRET]",
        reasonCode: "ready",
      }],
      finalSummary: "api_key=[REDACTED_SECRET] hidden reasoning cookie=[REDACTED_SECRET]",
      reasonCode: "ready",
      cleanupStatus: "closed",
      redactionStatus: "redacted",
      repairStatus: "not-needed",
      durationMs: 9,
      evidence: [
        "browser-transaction:raw-dom-excluded",
        "browser-transaction:no-secrets",
        "browser-transaction:no-image-capture-default",
      ],
    });
    const serialized = JSON.stringify(result.trace);

    expect(serialized).not.toContain("<input");
    expect(serialized).not.toContain("sk-route126SECRET");
    expect(serialized).not.toContain("safe local note");
    expect(serialized).toContain("no-image-capture-default");
  });
});

function requiredPlan() {
  const plan = planBrowserTransaction({
    prompt: "Use the local browser fixture, click the status button, and report the new state",
  });
  expect(plan).toBeDefined();
  return plan!;
}

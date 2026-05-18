import { describe, expect, it } from "vitest";
import { scoreBrowserTxnResult } from "../context/browserScore.js";
import { createBrowserTxnResult } from "../context/browserTxnEvidence.js";
import { planBrowserTransaction } from "../context/browserPlan.js";

describe("Route 130 browser transaction scoring", () => {
  it("passes deterministic planner, repair, extraction, cleanup, and redaction criteria", () => {
    const result = createResult({ repairStatus: "succeeded", finalSummary: "Clicked Save draft after repair" });
    const score = scoreBrowserTxnResult({
      result,
      expected: {
        plannerConfidence: "high",
        status: "success",
        reasonCode: "ready",
        repairStatus: "succeeded",
        cleanupStatus: "closed",
        finalSummaryIncludes: "Clicked Save draft",
        expectAction: true,
      },
    });

    expect(score.outcome).toBe("pass");
    expect(score.details.map((detail) => detail.name)).toContain("no-unsafe-action-attempted");
    expect(score.details.find((detail) => detail.name === "repair-necessity")?.outcome).toBe("pass");
  });

  it("fails when expected extraction or cleanup evidence drifts", () => {
    const score = scoreBrowserTxnResult({
      result: createResult({ cleanupStatus: "close-failed", finalSummary: "Unexpected" }),
      expected: {
        status: "success",
        reasonCode: "ready",
        cleanupStatus: "closed",
        finalSummaryIncludes: "Clicked Save draft",
        expectAction: true,
      },
    });

    expect(score.outcome).toBe("fail");
    expect(score.details.some((detail) => detail.outcome === "fail")).toBe(true);
  });
});

function createResult(input: {
  readonly repairStatus?: "not-needed" | "attempted" | "succeeded" | "failed";
  readonly cleanupStatus?: string;
  readonly finalSummary: string;
}) {
  const plan = planBrowserTransaction({
    prompt: "Use the local browser fixture with selector repair, click the missing target, and report the state",
  });
  expect(plan).toBeDefined();
  return createBrowserTxnResult({
    status: "success",
    transactionId: "browser-txn-score",
    controlledTarget: "local-fixture://txn/repair",
    planner: plan!.planner,
    stepSummaries: [
      {
        kind: "observe",
        status: "success",
        target: "visible-text",
        summary: "Selector repair fixture ready",
        reasonCode: "ready",
      },
      {
        kind: "click",
        status: "success",
        target: "Save draft",
        summary: input.finalSummary,
        reasonCode: "ready",
        repairStatus: input.repairStatus,
      },
      {
        kind: "extract",
        status: "success",
        target: "visible-text",
        summary: input.finalSummary,
        reasonCode: "ready",
      },
    ],
    finalSummary: input.finalSummary,
    reasonCode: "ready",
    cleanupStatus: input.cleanupStatus ?? "closed",
    redactionStatus: "clean",
    repairStatus: input.repairStatus ?? "not-needed",
    durationMs: 10,
    evidence: [
      "browser-transaction:cleanup:closed",
      "browser-transaction:no-provider-or-model-call",
      "browser-transaction:no-mcp-live-backend",
      ...(input.repairStatus === "succeeded" ? ["browser-repair:succeeded"] : []),
    ],
  });
}

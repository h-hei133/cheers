import { describe, expect, it } from "vitest";

import { createCommandToolResultSplit } from "./resultSplit.js";
import type { RuntimeExecutionReceiptProjection } from "../runtime/execution/executionReceipt.js";
import {
  createToolAfterObservationAnnotation,
  createToolBeforePolicyDecision,
  createToolInterceptionIntent,
} from "./interception.js";

describe("tool result content details split", () => {
  it("separates model-visible content from runtime details and report-safe projection", () => {
    const receipt: RuntimeExecutionReceiptProjection = {
      receiptId: "execution-receipt:command",
      caller: "core-tool:bash",
      operationKind: "command.run",
      authorityMode: "command-allowlisted",
      requestedActionSummary: "printf output",
      executionStatus: "failure",
      errorClass: "command_failed",
      exitCode: 7,
      timedOut: false,
      cancelled: false,
      outputSummaryRedactionStatus: "redacted",
      evidenceCorrelationId: "execution-receipt:command_failed:failed",
      notProvenClaims: ["terminal-task-success"],
      redaction: {
        status: "redacted",
        redactions: ["unsafe-content-redacted"],
      },
      outputSummary: "[secret-redacted]",
    };

    const split = createCommandToolResultSplit({
      content: "model-visible command output",
      receipt,
      runtimeFacts: { executionPath: "ts-local", status: "failed" },
    });

    expect(split.content).toBe("model-visible command output");
    expect(split.details?.runtimeFacts).toMatchObject({ executionPath: "ts-local" });
    expect(split.reportSafe?.executionReceipt?.outputSummary).toBe("[secret-redacted]");
    expect(JSON.stringify(split.reportSafe)).not.toContain("model-visible command output");
    expect(split.reportSafe?.notProvenClaims).toContain("terminal-task-success");
  });

  it("carries report-safe tool interception metadata without rewriting success", () => {
    const receipt: RuntimeExecutionReceiptProjection = {
      receiptId: "execution-receipt:command",
      caller: "core-tool:bash",
      operationKind: "command.run",
      authorityMode: "command-allowlisted",
      requestedActionSummary: "printf output",
      executionStatus: "success",
      errorClass: "success",
      exitCode: 0,
      timedOut: false,
      cancelled: false,
      outputSummaryRedactionStatus: "report-safe",
      evidenceCorrelationId: "execution-receipt:success:completed",
      notProvenClaims: ["terminal-task-success"],
      redaction: {
        status: "report-safe",
        redactions: [],
      },
      policy: {
        decisionId: "tool-policy-decision:test",
        decisionStatus: "allow",
        policySource: "test-policy",
        authorityRequirement: "command-allowlisted",
        redactionStatus: "report-safe",
        reportSafeSummary: "printf output",
        terminalSuccessClaim: false,
        notProvenClaims: ["terminal-success"],
      },
    };
    const beforeDecision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "bash",
        caller: "test",
        operationKind: "command.run",
        requestedActionSummary: "printf output",
        authorityMode: "command-allowlisted",
      }),
      status: "allow",
      reason: "allowed",
      policySource: "test-policy",
    });
    const afterAnnotation = createToolAfterObservationAnnotation({
      decision: beforeDecision,
      toolId: "bash",
      resultStatus: "tool-success-observed",
      executionReceipt: receipt,
      reportSafeSummary: "printf output",
    });

    const split = createCommandToolResultSplit({
      content: "model-visible command output",
      receipt,
      toolInterception: {
        beforeDecision,
        afterAnnotation,
      },
    });

    expect(split.details?.toolInterception?.beforeDecision.status).toBe("allow");
    expect(split.reportSafe?.toolInterception?.afterAnnotation.terminalSuccessClaim).toBe(false);
    expect(split.reportSafe?.notProvenClaims).toContain("terminal-success");
    expect(JSON.stringify(split.reportSafe)).not.toContain('"success":true');
  });
});

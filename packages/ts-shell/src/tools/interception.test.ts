import { describe, expect, it } from "vitest";

import {
  createBlockedToolInterceptionResult,
  createToolAfterObservationAnnotation,
  createToolBeforePolicyDecision,
  createToolInterceptionIntent,
  executionPolicyMetadataFromToolDecision,
  shouldPreventToolExecution,
  type ToolInterceptionDecisionStatus,
} from "./policy/interception.js";

describe("tool interception contract", () => {
  it("represents every before-tool policy decision without terminal success", () => {
    const statuses: readonly ToolInterceptionDecisionStatus[] = [
      "allow",
      "block",
      "request_authority",
      "redact_then_allow",
      "observe_only",
      "unsupported",
      "rejected",
    ];

    const decisions = statuses.map((status) =>
      createToolBeforePolicyDecision({
        intent: createToolInterceptionIntent({
          toolId: "bash",
          caller: "test",
          operationKind: "command.run",
          requestedActionSummary: `status ${status}`,
          authorityMode: "command-allowlisted",
        }),
        status,
        reason: `policy ${status}`,
        policySource: "test-policy",
      }),
    );

    expect(decisions.map((decision) => decision.status)).toEqual(statuses);
    expect(decisions.every((decision) => decision.terminalSuccessClaim === false)).toBe(true);
    expect(decisions.flatMap((decision) => decision.notProvenClaims)).toEqual(
      expect.arrayContaining(["terminal-success", "provider-success"]),
    );
  });

  it("rejects forbidden hook outcomes instead of executing or declaring success", () => {
    const intent = createToolInterceptionIntent({
      toolId: "write",
      caller: "test",
      operationKind: "file.write",
      requestedActionSummary: "oldText=raw-before newText=raw-after",
      authorityMode: "approved-for-write",
      input: {
        oldText: "raw-before",
        newText: "raw-after",
        providerEnv: "/home/wang/.private-agents-real/provider.env",
      },
    });
    const decision = createToolBeforePolicyDecision({
      intent,
      status: "allow",
      reason: "attempted unsafe effects",
      policySource: "test-policy",
      forbiddenOutcomes: [
        "bypass-authority",
        "call-provider",
        "declare-success",
        "execute-tool",
        "mutate-file",
        "run-shell",
        "alter-hidden-transcript",
      ],
    });

    expect(decision.status).toBe("rejected");
    expect(shouldPreventToolExecution(decision)).toBe(true);
    expect(decision.terminalSuccessClaim).toBe(false);
    expect(JSON.stringify(decision)).not.toMatch(
      /raw-before|raw-after|private-agents-real|provider\.env/i,
    );
  });

  it("projects authority metadata for ExecutionService without unsafe fields", () => {
    const decision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "bash",
        caller: "test",
        operationKind: "command.run",
        requestedActionSummary: "token=secret-value echo ok",
        authorityMode: "command-allowlisted",
        input: { command: "token=secret-value echo ok" },
      }),
      status: "redact_then_allow",
      reason: "redact command summary before execution",
      policySource: "test-policy",
      authorityRequirement: "command-allowlisted",
    });

    const metadata = executionPolicyMetadataFromToolDecision(decision);

    expect(metadata).toMatchObject({
      decisionStatus: "redact_then_allow",
      authorityRequirement: "command-allowlisted",
      terminalSuccessClaim: false,
      redactionStatus: "redacted",
    });
    expect(JSON.stringify(metadata)).not.toContain("secret-value");
  });

  it("creates after-tool annotations that do not rewrite tool success into task success", () => {
    const decision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "bash",
        caller: "test",
        operationKind: "command.run",
        requestedActionSummary: "printf ok",
        authorityMode: "command-allowlisted",
      }),
      status: "allow",
      reason: "allowed",
      policySource: "test-policy",
    });

    const annotation = createToolAfterObservationAnnotation({
      decision,
      toolId: "bash",
      resultStatus: "tool-success-observed",
      annotations: ["raw provider output: hidden reasoning sk-1234567890"],
      nextActionSuggestions: ["Record evidence; do not claim terminal success."],
      reportSafeSummary: "provider.env=/home/wang/.private-agents-real/provider.env",
    });

    expect(annotation.terminalSuccessClaim).toBe(false);
    expect(annotation.notProvenClaims).toEqual(
      expect.arrayContaining(["terminal-success", "verification-success"]),
    );
    expect(JSON.stringify(annotation)).not.toMatch(
      /hidden reasoning|sk-1234567890|private-agents-real|provider\.env/i,
    );
  });

  it("returns not-executed metadata for blocked decisions", () => {
    const decision = createToolBeforePolicyDecision({
      intent: createToolInterceptionIntent({
        toolId: "bash",
        caller: "test",
        operationKind: "command.run",
        requestedActionSummary: "rm -rf workspace",
        authorityMode: "denied",
      }),
      status: "block",
      reason: "blocked by test policy",
      policySource: "test-policy",
      authorityRequirement: "denied",
    });

    const result = createBlockedToolInterceptionResult(decision);

    expect(result.success).toBe(false);
    expect(result.metadata.executionStatus).toBe("not-executed");
    expect(result.reportSafe.toolInterception.afterAnnotation.resultStatus).toBe("not-executed");
    expect(JSON.stringify(result)).not.toContain('"success":true');
  });
});

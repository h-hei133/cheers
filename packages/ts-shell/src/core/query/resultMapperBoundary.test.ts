import { describe, expect, it } from "vitest";
import {
  classifyActionableKind,
  deriveActionableBlockerContract,
  findActionableKindFromEvidence,
} from "./actionableBlockerModule.js";
import {
  buildHardFailureStopReason,
  hasHardFailureSignal,
  hasSuccessfulMutationWithVerificationCaveat,
} from "./capabilityResultClassification.js";
import { mapTerminalToOrchestrationResult } from "./resultMapper.js";
import { classifyTerminalReason } from "./terminalClassificationProjection.js";

describe("resultMapper Result Surface facades", () => {
  it("keeps terminal classification labels stable", () => {
    expect(classifyTerminalReason("completed")).toBe("success");
    expect(classifyTerminalReason("stopped")).toBe("stopped");
    expect(classifyTerminalReason("stopped_error")).toBe("error");
    expect(classifyTerminalReason("stopped_error", "retryable-error")).toBe(
      "stopped",
    );
  });

  it("maps actionable approval and policy blockers without execution ownership", () => {
    expect(classifyActionableKind("Approval denied by user", false)).toBe(
      "approval-denied",
    );
    expect(
      classifyActionableKind(
        "policy-blocked: public web automation is blocked",
        false,
      ),
    ).toBe("browser-policy-blocked");
    expect(
      deriveActionableBlockerContract({
        stopReason: "Approval denied by user for bash",
        codingResult: buildCodingResult({
          verification: {
            status: "blocked",
            reason: "Approval denied by user for bash",
            blockerKind: "approval-denied",
            nextAction: "Re-run and approve escalation.",
          },
          reasons: ["Approval denied by user for bash"],
        }),
      }),
    ).toEqual({
      kind: "approval-denied",
      reason: "Re-run and approve escalation.",
    });
  });

  it("normalizes MCP, browser, and edit blocker markers", () => {
    expect(
      findActionableKindFromEvidence(["actionable-blocker-kind:mcp-unavailable"]),
    ).toBe("mcp-unavailable");
    expect(classifyActionableKind("MCP config is invalid", false)).toBe(
      "mcp-unavailable",
    );
    expect(classifyActionableKind("action-timeout while clicking", false)).toBe(
      "browser-timeout",
    );
    expect(classifyActionableKind("cleanup-failed after close", false)).toBe(
      "browser-cleanup-failed",
    );
    expect(
      findActionableKindFromEvidence(["mutation-summary-blocker:stale-read"]),
    ).toBe("stale-read");
    expect(
      classifyActionableKind("patch-target-missing: missing file", false),
    ).toBe("patch-target-missing");
    expect(
      classifyActionableKind(
        "edit-patch-content-or-transform-missing: exact mapping is missing",
        false,
      ),
    ).toBe("patch-content-missing");
    expect(
      findActionableKindFromEvidence(["provider-readiness:missing-key"]),
    ).toBe("provider-not-configured");
  });

  it("classifies command hard failures and successful mutation caveats", () => {
    const caveat = buildCodingResult({
      changedFiles: ["plan.txt"],
      verification: {
        status: "blocked",
        reason: "Verify strategy unavailable.",
      },
      verdict: "completed-with-caveats",
      reasons: ["Edit applied but verification was blocked."],
    });
    expect(hasSuccessfulMutationWithVerificationCaveat(caveat)).toBe(true);

    const failedCommand = buildCodingResult({
      failedFiles: [
        { path: "(command)", reason: "npm run build failed with exit code 1" },
      ],
      verification: {
        status: "failed",
        reason: "Verification failed: npm run build failed.",
      },
      verdict: "completed-with-caveats",
      reasons: ["bash execution failed after approval."],
      evidence: ["current-permission-request-tool:bash"],
    });
    expect(hasHardFailureSignal(failedCommand)).toBe(true);
    expect(
      buildHardFailureStopReason({
        codingResult: failedCommand,
        failedReason: "npm run build failed with exit code 1",
      }),
    ).toBe(
      "Bash execution failed after approval: npm run build failed with exit code 1",
    );
  });

  it.each([
    {
      name: "command blocked",
      reason: "Command rm is not allowed in the MVP allowlist",
      verification: { status: "blocked", reason: "Command blocked" },
      evidence: ["actionable-blocker-kind:command-not-allowlisted"],
      expectedStopReason: "Command blocked",
    },
    {
      name: "MCP unavailable",
      reason: "MCP server localSdk requires authentication",
      verification: {
        status: "blocked",
        reason: "MCP server localSdk requires authentication",
      },
      evidence: ["actionable-blocker-kind:mcp-unavailable"],
      expectedStopReason: "MCP server localSdk requires authentication",
    },
    {
      name: "browser timeout",
      reason: "action-timeout: target was not ready",
      verification: {
        status: "blocked",
        reason: "action-timeout: target was not ready",
      },
      evidence: [
        "actionable-blocker-kind:browser-timeout",
        "browser-dom:<html>token=secret</html>",
      ],
      expectedStopReason: "action-timeout: target was not ready",
    },
    {
      name: "edit stale-read",
      reason: "stale-read: target changed since it was read",
      verification: {
        status: "not-run",
        reason: "stale-read: target changed since it was read",
      },
      evidence: ["actionable-blocker-kind:stale-read"],
      expectedStopReason: "stale-read: target changed since it was read",
    },
    {
      name: "provider not configured",
      reason: "Provider not configured; opt in before retrying.",
      verification: {
        status: "blocked",
        reason: "Provider not configured; opt in before retrying.",
      },
      evidence: [],
      expectedStopReason: "Provider not configured; opt in before retrying.",
    },
  ])("maps $name to a truthful stopped result", (scenario) => {
    const result = mapTerminalToOrchestrationResult(
      stateWithCodingResult(
        buildCodingResult({
          failedFiles: [{ path: "(capability)", reason: scenario.reason }],
          verification: scenario.verification as never,
          verdict: "insufficient-evidence",
          reasons: [scenario.reason],
          evidence: scenario.evidence,
        }),
      ),
      {
        terminalReason: "completed",
        terminalClassification: "success",
        stopReason: undefined,
      } as never,
    );

    expect(result.status).toBe("stopped_error");
    expect(result.terminalClassification).toBe("stopped");
    expect(result.stopReason).toBe(scenario.expectedStopReason);
    expect(result.stopReason).not.toContain("<html>");
    expect(result.stopReason).not.toContain("secret");
  });

  it("keeps command success completed and unknown hard failures as errors", () => {
    const success = mapTerminalToOrchestrationResult(
      stateWithCodingResult(
        buildCodingResult({
          changedFiles: [],
          verification: { status: "passed", reason: "Command completed." },
          verdict: "satisfied",
          reasons: [],
        }),
      ),
      {
        terminalReason: "completed",
        terminalClassification: "success",
        stopReason: undefined,
      } as never,
    );
    expect(success.status).toBe("completed");
    expect(success.terminalClassification).toBe("success");

    const unknownFailure = mapTerminalToOrchestrationResult(
      stateWithCodingResult(
        buildCodingResult({
          failedFiles: [
            { path: "(tool)", reason: "tool execution failed with exit code 2" },
          ],
          verification: { status: "not-requested", reason: "No verification." },
          verdict: "completed-with-caveats",
          reasons: ["tool execution failed with exit code 2"],
        }),
      ),
      {
        terminalReason: "completed",
        terminalClassification: "success",
        stopReason: undefined,
      } as never,
    );
    expect(unknownFailure.status).toBe("stopped_error");
    expect(unknownFailure.terminalClassification).toBe("error");
    expect(unknownFailure.stopReason).toBe(
      "tool execution failed with exit code 2",
    );
  });
});

function stateWithCodingResult(
  codingResult: ReturnType<typeof buildCodingResult>,
) {
  return {
    transcript: [
      {
        role: "assistant",
        content: "Capability result.",
        codingResult,
      },
    ],
    sharedContext: {
      sessionId: "sess_result_mapper_boundary",
      initialPrompt: "prompt",
      notes: [],
      handoffs: [],
    },
    lastContinuationReason: undefined,
  } as never;
}

function buildCodingResult(input: {
  changedFiles?: string[];
  failedFiles?: { path: string; reason: string }[];
  verification: {
    status:
      | "passed"
      | "failed"
      | "blocked"
      | "skipped"
      | "not-requested"
      | "not-run";
    reason?: string;
    blockerKind?: "approval-denied" | "no-verify-strategy" | "unknown";
    nextAction?: string;
  };
  verdict?: "satisfied" | "completed-with-caveats" | "insufficient-evidence";
  reasons?: string[];
  evidence?: string[];
}) {
  const changedFiles = input.changedFiles ?? [];
  return {
    taskKind: "edit-file",
    changedFiles,
    failedFiles: input.failedFiles ?? [],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 1,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 1,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: changedFiles,
      attemptedFiles: [
        ...changedFiles,
        ...(input.failedFiles ?? []).map((file) => file.path),
      ],
      changedFiles,
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: input.verdict ?? "completed-with-caveats",
      reasons: input.reasons ?? [],
      requiredEvidence: ["result surface contract"],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: changedFiles.map((path) => ({
      path,
      reason: input.verification.reason ?? "",
    })),
    verification: input.verification,
    evidence: input.evidence ?? [],
  };
}

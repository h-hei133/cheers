import { describe, expect, it } from "vitest";
import type { CodingResultSummary } from "../../orchestration/types.js";
import {
  projectSessionPresentationFacts,
  type SessionPresentationFactsInput,
} from "./facts.js";

describe("sessionPresentationFacts", () => {
  it("keeps skipped verification partial and not-proven instead of success", () => {
    const facts = projectSessionPresentationFacts(
      input({
        terminalClassification: "success",
        codingResult: codingResult({
          changedFiles: ["cli-entry-tool-execution.txt"],
          verification: {
            status: "skipped",
            command: undefined,
            selectionScope: "none",
            selectionSource: "auto-from-changes",
            reason:
              "targeted verification skipped: changed files do not map to a supported allowlisted verification command",
            nextAction:
              "targeted verification skipped: changed files do not map to a supported allowlisted verification command",
          },
          taskSatisfaction: {
            verdict: "completed-with-caveats",
            reasons: ["verification skipped"],
            requiredEvidence: ["task-relevant verification"],
            observedEvidence: ["file write"],
          },
        }),
      }),
    );

    expect(facts?.truthStatus).toBe("partial");
    expect(facts?.verdict).toBe(
      "Partial: some work completed, but required evidence is incomplete.",
    );
    expect(facts?.notProvenClaims).toContain("relevant verification did not pass");
    expect(facts?.resultSessionCliSuccessUpgrade).toBe(false);
  });

  it("only reports verified success when relevant verification passed", () => {
    const facts = projectSessionPresentationFacts(
      input({
        terminalClassification: "success",
        codingResult: codingResult({
          verification: {
            status: "passed",
            command: "npm test -w packages/ts-shell -- focused.test.ts",
            selectionScope: "focused",
            selectionSource: "auto-from-changes",
            reason: "focused verification passed",
          },
          taskSatisfaction: {
            verdict: "satisfied",
            reasons: ["verified"],
            requiredEvidence: ["task-relevant verification"],
            observedEvidence: ["passed verification"],
          },
        }),
      }),
    );

    expect(facts?.truthStatus).toBe("verified-success");
    expect(facts?.notProvenClaims).toEqual([]);
    expect(facts?.verdict).toBe("Verified success: relevant verification passed.");
  });

  it("redacts provider homes, raw content, secrets, and raw edit text", () => {
    const facts = projectSessionPresentationFacts(
      input({
        terminalClassification: "stopped",
        stopReason: "not verified",
        codingResult: codingResult({
          evidence: [
            "not-proven:token=abc123 /home/wang/.private-agents-real/provider.env <html>secret</html>",
          ],
          verification: {
            status: "skipped",
            reason: "authorization=Bearer-secret oldText=before newText=after",
          },
          taskSatisfaction: {
            verdict: "insufficient-evidence",
            reasons: ["rawProviderOutput=secret-payload"],
            requiredEvidence: ["redacted evidence"],
            observedEvidence: [],
          },
        }),
      }),
    );

    const rendered = [
      facts?.verdict,
      facts?.nextAction,
      ...(facts?.notProvenClaims ?? []),
    ].join("\n");

    expect(rendered).not.toContain("abc123");
    expect(rendered).not.toContain("/home/wang/.private-agents-real");
    expect(rendered).not.toContain("<html>");
    expect(rendered).not.toContain("secret-payload");
    expect(rendered).toContain("[redacted]");
    expect(rendered).toContain("[redacted-real-provider-home]");
    expect(rendered).toContain("[raw-content-excluded]");
  });
});

function input(
  overrides: Partial<SessionPresentationFactsInput> = {},
): SessionPresentationFactsInput {
  return {
    status: "completed",
    terminalClassification: "success",
    terminalReason: "completed",
    ...overrides,
  };
}

function codingResult(overrides: Partial<CodingResultSummary> = {}): CodingResultSummary {
  return {
    taskKind: "edit-file",
    changedFiles: [],
    failedFiles: [],
    patches: [],
    repair: {
      status: "not-needed",
      attempts: 0,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: "first-pass-success",
      attempts: 0,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: [],
      attemptedFiles: [],
      changedFiles: [],
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: "insufficient-evidence",
      reasons: ["not enough evidence yet"],
      requiredEvidence: ["task-relevant verification"],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: [],
    verification: {
      status: "not-requested",
    },
    evidence: [],
    ...overrides,
  };
}

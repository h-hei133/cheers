import { describe, expect, it } from "vitest";
import {
  deriveApprovalDecisionProvenance,
  toLegacyApprovalOutcome,
} from "./approvalProvenance.js";

describe("approval decision provenance", () => {
  it("maps sandbox escalation denial to legacy denied without reading error text", () => {
    expect(
      deriveApprovalDecisionProvenance({
        metadata: { wasEscalated: true },
      }),
    ).toEqual({
      kind: "escalation-denied",
      source: "sandbox-enforcer",
      legacyOutcome: "denied",
      wasEscalated: true,
    });
  });

  it("keeps approved execution failures approved when denial metadata is absent", () => {
    expect(
      deriveApprovalDecisionProvenance({
        metadata: {
          executionPath: "ts-local",
          status: "failed",
          failureKind: "execution_failure",
        },
      }),
    ).toEqual({
      kind: "approved",
      source: "not-required",
      legacyOutcome: "approved",
      wasEscalated: undefined,
    });
  });

  it("honors explicit structured decision metadata ahead of legacy escalation metadata", () => {
    expect(
      deriveApprovalDecisionProvenance({
        metadata: {
          approvalDecisionKind: "denied",
          wasEscalated: false,
        },
      }),
    ).toEqual({
      kind: "denied",
      source: "tool-result-metadata",
      legacyOutcome: "denied",
      wasEscalated: false,
    });
  });

  it("keeps skipped and not-required decisions legacy-compatible with approved events", () => {
    expect(toLegacyApprovalOutcome("skipped")).toBe("approved");
    expect(toLegacyApprovalOutcome("not-required")).toBe("approved");
  });
});

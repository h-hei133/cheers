import { describe, expect, it } from "vitest";
import {
  classifyVerificationFailure,
  inferVerificationBlockerKind,
} from "./toolExecutionOutcomeProjection.js";

describe("tool execution outcome projection", () => {
  it("classifies missing command failures with a retry next action", () => {
    expect(
      classifyVerificationFailure({
        error: "command not found: vitest",
        projection: {},
      }),
    ).toEqual({
      status: "blocked",
      reason: "command not found: vitest",
      blockerKind: "missing-command",
      nextAction: "Install or expose the verify command in PATH, then rerun verify.",
    });
  });

  it("uses lifecycle projection blocker and next action when present", () => {
    expect(
      classifyVerificationFailure({
        error: "approval denied",
        projection: {
          reason: "approval denied",
          verificationBlockerKind: "approval-denied",
          nextAction: "Approve and retry.",
        },
      }),
    ).toEqual({
      status: "blocked",
      reason: "approval denied",
      blockerKind: "approval-denied",
      nextAction: "Approve and retry.",
    });
  });

  it("leaves unknown failures failed without inventing a blocker", () => {
    expect(
      classifyVerificationFailure({
        output: "tests failed",
        projection: {},
      }),
    ).toEqual({
      status: "failed",
      reason: "tests failed",
    });
  });

  it("infers environment blockers from metadata and network-like reasons", () => {
    expect(
      inferVerificationBlockerKind(
        { metadata: { failureKind: "sandbox_preflight" } },
        "denied by sandbox",
      ),
    ).toBe("environment-not-ready");
    expect(inferVerificationBlockerKind({}, "network timed out")).toBe(
      "environment-not-ready",
    );
  });
});

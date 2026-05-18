import type { BrowserTxnScoreExpectation } from "../context/browserScore.js";

export type BrowserTxnGoldenMode = "real" | "injected" | "skipped";

export interface BrowserTxnGoldenCase {
  readonly id: string;
  readonly prompt: string;
  readonly mode: BrowserTxnGoldenMode;
  readonly expectedEvalOutcome: "pass" | "fail" | "skip" | "warn";
  readonly expected: BrowserTxnScoreExpectation;
}

export const browserTxnGoldenCases: readonly BrowserTxnGoldenCase[] = [
  {
    id: "observe-extract-rendered-text",
    prompt: "Use the local browser rendered text fixture and tell me the rendered text",
    mode: "real",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "high",
      status: "success",
      reasonCode: "ready",
      repairStatus: "not-needed",
      cleanupStatus: "closed",
      finalSummaryIncludes: "JS rendered Playwright route ready",
      expectAction: false,
    },
  },
  {
    id: "click-extract-changed-status",
    prompt: "Use the local browser fixture, click the status button, and report the new state",
    mode: "real",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "high",
      status: "success",
      reasonCode: "ready",
      repairStatus: "not-needed",
      cleanupStatus: "closed",
      finalSummaryIncludes: "Clicked Save draft",
      expectAction: true,
    },
  },
  {
    id: "type-extract-changed-status",
    prompt: "Type this safe note into the local browser fixture and confirm it changed",
    mode: "real",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "high",
      status: "success",
      reasonCode: "ready",
      repairStatus: "not-needed",
      cleanupStatus: "closed",
      finalSummaryIncludes: "Updated Safe note",
      expectAction: true,
    },
  },
  {
    id: "target-missing-repair-succeeds",
    prompt: "Use the local browser fixture with selector repair, click the missing target, and report the state",
    mode: "real",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "high",
      status: "success",
      reasonCode: "ready",
      repairStatus: "succeeded",
      cleanupStatus: "closed",
      finalSummaryIncludes: "Clicked Save draft after repair",
      expectAction: true,
    },
  },
  {
    id: "target-missing-repair-fails",
    prompt: "Use the local browser fixture with repair failure, click the missing target, and report the state",
    mode: "real",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "high",
      status: "stopped",
      reasonCode: "repair-failed",
      repairStatus: "failed",
      cleanupStatus: "closed",
      expectAction: true,
    },
  },
  {
    id: "low-confidence-stopped-before-action",
    prompt: "Use the browser for this vague local fixture task",
    mode: "injected",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "low",
      status: "stopped",
      reasonCode: "planner-low-confidence",
      repairStatus: "not-needed",
      cleanupStatus: "not-started",
      expectAction: false,
    },
  },
  {
    id: "policy-blocked-before-adapter",
    prompt: "Use the browser to open https://example.com and report the text",
    mode: "injected",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "medium",
      status: "stopped",
      reasonCode: "policy-blocked",
      repairStatus: "not-needed",
      cleanupStatus: "not-started",
      expectAction: false,
    },
  },
  {
    id: "timeout-cleanup-confirmed",
    prompt: "Use the local browser timeout fixture and tell me the rendered text",
    mode: "real",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "high",
      status: "failed",
      reasonCode: "navigation-timeout",
      repairStatus: "not-needed",
      cleanupStatus: "closed",
      expectAction: false,
    },
  },
  {
    id: "secret-hidden-raw-redaction",
    prompt: "Use the local browser secret redaction fixture and report visible text",
    mode: "real",
    expectedEvalOutcome: "pass",
    expected: {
      plannerConfidence: "high",
      status: "success",
      reasonCode: "ready",
      repairStatus: "not-needed",
      cleanupStatus: "closed",
      redactionStatus: "redacted",
      expectAction: false,
    },
  },
  {
    id: "runtime-unavailable-skipped",
    prompt: "Use the local browser fixture and tell me the rendered text",
    mode: "skipped",
    expectedEvalOutcome: "skip",
    expected: {
      plannerConfidence: "high",
      status: "stopped",
      reasonCode: "runtime-disabled",
      repairStatus: "not-needed",
      cleanupStatus: "not-started",
      expectAction: false,
      runtimeUnavailable: true,
    },
  },
];

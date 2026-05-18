import type { BrowserTxnResult } from "./browserTxnEvidence.js";

export type BrowserTxnScoreOutcome = "pass" | "fail" | "skip" | "warn";

export interface BrowserTxnScoreDetail {
  readonly name: string;
  readonly outcome: BrowserTxnScoreOutcome;
  readonly reason: string;
}

export interface BrowserTxnScoreExpectation {
  readonly plannerConfidence?: BrowserTxnResult["planner"]["confidence"];
  readonly status?: BrowserTxnResult["status"];
  readonly reasonCode?: string;
  readonly repairStatus?: BrowserTxnResult["repairStatus"];
  readonly cleanupStatus?: string;
  readonly redactionStatus?: string;
  readonly finalSummaryIncludes?: string;
  readonly expectAction?: boolean;
  readonly runtimeUnavailable?: boolean;
}

export interface BrowserTxnScoreResult {
  readonly outcome: BrowserTxnScoreOutcome;
  readonly details: readonly BrowserTxnScoreDetail[];
}

export function scoreBrowserTxnResult(input: {
  readonly result: BrowserTxnResult;
  readonly expected?: BrowserTxnScoreExpectation;
}): BrowserTxnScoreResult {
  const expected = input.expected ?? {};
  const result = input.result;
  const details: BrowserTxnScoreDetail[] = [
    compare("planner-confidence", result.planner.confidence, expected.plannerConfidence),
    compare("transaction-status", result.status, expected.status),
    compare("reason-code", result.reasonCode, expected.reasonCode),
    compare("repair-status", result.repairStatus, expected.repairStatus),
    compare("cleanup-status", result.cleanupStatus, expected.cleanupStatus),
    compare("redaction-status", result.redactionStatus, expected.redactionStatus),
    actionTargetMatch(result, expected.expectAction),
    repairNecessity(result, expected.repairStatus),
    unsafeActionAttempt(result),
    finalExtractionCorrectness(result, expected.finalSummaryIncludes),
    cleanupCompleted(result),
    redactionPassed(result),
  ];

  if (expected.runtimeUnavailable) {
    details.push({
      name: "runtime-unavailable",
      outcome: result.reasonCode.startsWith("runtime-") ? "skip" : "fail",
      reason: result.reasonCode.startsWith("runtime-")
        ? "runtime unavailable case was classified as skipped"
        : "runtime unavailable case did not classify as runtime unavailable",
    });
  }

  return {
    outcome: overallOutcome(details),
    details,
  };
}

function compare(
  name: string,
  actual: string,
  expected: string | undefined,
): BrowserTxnScoreDetail {
  if (expected === undefined) {
    return { name, outcome: "skip", reason: "no expectation" };
  }
  return actual === expected
    ? { name, outcome: "pass", reason: `${actual} matched` }
    : { name, outcome: "fail", reason: `expected ${expected}, got ${actual}` };
}

function actionTargetMatch(
  result: BrowserTxnResult,
  expectAction: boolean | undefined,
): BrowserTxnScoreDetail {
  const actionSteps = result.trace.steps.filter((step) => step.phase === "action");
  if (expectAction === undefined && actionSteps.length === 0) {
    return { name: "action-target-match", outcome: "skip", reason: "no action step expected" };
  }
  if (expectAction === false) {
    return actionSteps.length === 0
      ? { name: "action-target-match", outcome: "pass", reason: "no action attempted" }
      : { name: "action-target-match", outcome: "fail", reason: "unexpected action step present" };
  }
  if (actionSteps.length === 0) {
    return { name: "action-target-match", outcome: "fail", reason: "expected action step was missing" };
  }
  const bad = actionSteps.find((step) => !step.target || step.target === "controlled-target");
  return bad
    ? { name: "action-target-match", outcome: "fail", reason: "action target was not explicit" }
    : { name: "action-target-match", outcome: "pass", reason: "action target was explicit" };
}

function repairNecessity(
  result: BrowserTxnResult,
  expected: BrowserTxnResult["repairStatus"] | undefined,
): BrowserTxnScoreDetail {
  if (expected === undefined) {
    return { name: "repair-necessity", outcome: "skip", reason: "no repair expectation" };
  }
  if (expected === "not-needed") {
    return result.repairStatus === "not-needed"
      ? { name: "repair-necessity", outcome: "pass", reason: "repair was not needed" }
      : { name: "repair-necessity", outcome: "fail", reason: `unexpected repair ${result.repairStatus}` };
  }
  return result.trace.repair.attempted
    ? { name: "repair-necessity", outcome: "pass", reason: `repair ${result.repairStatus}` }
    : { name: "repair-necessity", outcome: "fail", reason: "repair expectation had no repair evidence" };
}

function unsafeActionAttempt(result: BrowserTxnResult): BrowserTxnScoreDetail {
  const serialized = JSON.stringify(result);
  if (/"kind":"(?:download|upload|payment|destructive|auth)"|browser\.(?:download|upload|payment|auth)/i.test(serialized)) {
    return { name: "no-unsafe-action-attempted", outcome: "fail", reason: "unsafe boundary marker leaked into action result" };
  }
  if (result.evidence.includes("browser-transaction:no-provider-or-model-call") &&
    result.evidence.includes("browser-transaction:no-mcp-live-backend")) {
    return { name: "no-unsafe-action-attempted", outcome: "pass", reason: "provider and live backend boundaries held" };
  }
  return { name: "no-unsafe-action-attempted", outcome: "warn", reason: "boundary evidence was incomplete" };
}

function finalExtractionCorrectness(
  result: BrowserTxnResult,
  expected: string | undefined,
): BrowserTxnScoreDetail {
  if (expected === undefined) {
    return { name: "final-extraction-correctness", outcome: "skip", reason: "no extraction expectation" };
  }
  return result.finalSummary.includes(expected)
    ? { name: "final-extraction-correctness", outcome: "pass", reason: "final summary matched expectation" }
    : { name: "final-extraction-correctness", outcome: "fail", reason: `final summary did not include ${expected}` };
}

function cleanupCompleted(result: BrowserTxnResult): BrowserTxnScoreDetail {
  if (result.cleanupStatus === "closed" || result.cleanupStatus === "not-started") {
    return { name: "cleanup-completed", outcome: "pass", reason: `cleanup ${result.cleanupStatus}` };
  }
  return { name: "cleanup-completed", outcome: "fail", reason: `cleanup ${result.cleanupStatus}` };
}

function redactionPassed(result: BrowserTxnResult): BrowserTxnScoreDetail {
  const serialized = JSON.stringify(result);
  if (serialized.includes("<input") ||
    serialized.includes("sk-route126SECRET") ||
    serialized.includes("session-cookie") ||
    serialized.includes("safe local note")) {
    return { name: "redaction-passed", outcome: "fail", reason: "sensitive or raw browser content leaked" };
  }
  return { name: "redaction-passed", outcome: "pass", reason: `redaction ${result.redactionStatus}` };
}

function overallOutcome(details: readonly BrowserTxnScoreDetail[]): BrowserTxnScoreOutcome {
  if (details.some((detail) => detail.outcome === "fail")) {
    return "fail";
  }
  if (details.some((detail) => detail.outcome === "warn")) {
    return "warn";
  }
  if (details.every((detail) => detail.outcome === "skip")) {
    return "skip";
  }
  return "pass";
}

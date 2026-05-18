import { scoreBrowserTxnResult, type BrowserTxnScoreDetail, type BrowserTxnScoreOutcome } from "../context/browserScore.js";
import { browserTxnTraceEvidenceLine } from "../context/browserTrace.js";
import { executeBrowserTransaction } from "../context/browserTxn.js";
import { formatBrowserTxnResult, type BrowserTxnResult } from "../context/browserTxnEvidence.js";
import { planBrowserTransaction } from "../context/browserPlan.js";
import type { PwRuntimeStatus } from "../context/pwRuntime.js";
import { disabledBrowserRuntimeStatus, readyBrowserRuntimeStatus } from "./browserAgentFixtures.js";
import { browserTxnGoldenCases, type BrowserTxnGoldenCase, type BrowserTxnGoldenMode } from "./browserTxnGolden.js";

export interface BrowserTxnEvalCaseResult {
  readonly caseId: string;
  readonly mode: BrowserTxnGoldenMode;
  readonly outcome: BrowserTxnScoreOutcome;
  readonly scoreDetails: readonly BrowserTxnScoreDetail[];
  readonly traceId: string;
  readonly reasonCode: string;
  readonly cleanupStatus: string;
  readonly redactionStatus: string;
  readonly report: string;
  readonly evidence: readonly string[];
}

export interface BrowserTxnEvalRunResult {
  readonly status: BrowserTxnScoreOutcome;
  readonly cases: readonly BrowserTxnEvalCaseResult[];
  readonly evidence: readonly string[];
}

export async function runBrowserTxnGoldenEval(input: {
  readonly runtimeStatus: PwRuntimeStatus;
  readonly cases?: readonly BrowserTxnGoldenCase[];
}): Promise<BrowserTxnEvalRunResult> {
  const results: BrowserTxnEvalCaseResult[] = [];
  for (const goldenCase of input.cases ?? browserTxnGoldenCases) {
    results.push(await runGoldenCase(goldenCase, input.runtimeStatus));
  }
  return {
    status: overallOutcome(results.map((result) => result.outcome)),
    cases: results,
    evidence: [
      "browser-txn-eval:deterministic",
      "browser-txn-eval:no-provider-or-model-call",
      "browser-txn-eval:no-public-web-default",
      `browser-txn-eval:case-count:${results.length}`,
      `browser-txn-eval:status:${overallOutcome(results.map((result) => result.outcome))}`,
    ],
  };
}

export function validateBrowserTxnEvalGate(input: {
  readonly cases: readonly BrowserTxnEvalCaseResult[];
}): { readonly status: "pass" | "fail"; readonly failures: readonly string[]; readonly evidence: readonly string[] } {
  const failures: string[] = [];
  for (const result of input.cases) {
    const label = result.caseId;
    if (!result.traceId || !result.traceId.startsWith("browser-txn-trace-")) {
      failures.push(`${label}: missing trace id`);
    }
    if (!result.cleanupStatus) {
      failures.push(`${label}: missing cleanup evidence`);
    }
    const serialized = JSON.stringify(result);
    if (serialized.includes("<input") || serialized.includes("<main") || serialized.includes("sk-route126SECRET") || serialized.includes("safe local note")) {
      failures.push(`${label}: raw DOM or typed/secret value leaked`);
    }
    const hasAction = /Plan: .*?\b(?:click|type)\b/.test(result.report);
    if (hasAction && !result.evidence.some((entry) => entry.startsWith("browser-transaction-policy:"))) {
      failures.push(`${label}: action missing policy decision evidence`);
    }
    const repairMatch = result.report.match(/Repair: (attempted|succeeded|failed)/);
    if (repairMatch && !result.evidence.some((entry) => entry.startsWith("browser-repair:"))) {
      failures.push(`${label}: repair missing evidence`);
    }
    if (result.outcome !== "pass" && result.outcome !== "skip" && !result.reasonCode) {
      failures.push(`${label}: missing reason code on non-pass result`);
    }
    if (result.report.includes("Transaction: success") && !result.report.includes("Result:")) {
      failures.push(`${label}: success report missing final extraction summary`);
    }
    if (!["pass", "fail", "skip", "warn"].includes(result.outcome)) {
      failures.push(`${label}: eval outcome missing pass/fail/skip/warn`);
    }
  }
  return {
    status: failures.length === 0 ? "pass" : "fail",
    failures,
    evidence: [
      "browser-txn-gate:trace-required",
      "browser-txn-gate:cleanup-required",
      "browser-txn-gate:redaction-checked",
      `browser-txn-gate:status:${failures.length === 0 ? "pass" : "fail"}`,
    ],
  };
}

async function runGoldenCase(
  goldenCase: BrowserTxnGoldenCase,
  runtimeStatus: PwRuntimeStatus,
): Promise<BrowserTxnEvalCaseResult> {
  if (goldenCase.mode === "real" && runtimeStatus.status !== "ready") {
    return skippedCase(goldenCase, runtimeStatus.reasonCode ?? "runtime-unavailable");
  }
  const plan = planBrowserTransaction({ prompt: goldenCase.prompt });
  if (!plan) {
    return skippedCase(goldenCase, "planner-unavailable");
  }
  const status = goldenCase.mode === "skipped"
    ? disabledBrowserRuntimeStatus()
    : goldenCase.mode === "injected"
      ? readyBrowserRuntimeStatus()
      : runtimeStatus;
  const result = await executeBrowserTransaction(plan, { runtimeStatus: status });
  const score = scoreBrowserTxnResult({ result, expected: goldenCase.expected });
  return evalResultFromTxn({
    goldenCase,
    result,
    outcome: goldenCase.expectedEvalOutcome === "skip" ? "skip" : score.outcome,
    scoreDetails: score.details,
  });
}

function evalResultFromTxn(input: {
  readonly goldenCase: BrowserTxnGoldenCase;
  readonly result: BrowserTxnResult;
  readonly outcome: BrowserTxnScoreOutcome;
  readonly scoreDetails: readonly BrowserTxnScoreDetail[];
}): BrowserTxnEvalCaseResult {
  return {
    caseId: input.goldenCase.id,
    mode: input.goldenCase.mode,
    outcome: input.outcome,
    scoreDetails: input.scoreDetails,
    traceId: input.result.trace.traceId,
    reasonCode: input.result.reasonCode,
    cleanupStatus: input.result.cleanupStatus,
    redactionStatus: input.result.redactionStatus,
    report: formatBrowserTxnResult(input.result),
    evidence: [
      browserTxnTraceEvidenceLine(input.result.trace),
      ...input.result.evidence,
      `browser-txn-eval-case:${input.goldenCase.id}:${input.outcome}`,
    ],
  };
}

function skippedCase(
  goldenCase: BrowserTxnGoldenCase,
  reasonCode: string,
): BrowserTxnEvalCaseResult {
  const traceId = `browser-txn-trace-skip-${stableId(goldenCase.id)}`;
  return {
    caseId: goldenCase.id,
    mode: "skipped",
    outcome: "skip",
    scoreDetails: [{ name: "runtime-availability", outcome: "skip", reason: reasonCode }],
    traceId,
    reasonCode,
    cleanupStatus: "not-started",
    redactionStatus: "clean",
    report: [
      "Browser task stopped",
      "- Outcome: runtime unavailable",
      `- TraceId: ${traceId}`,
      `- ReasonCode: ${reasonCode}`,
      "- Cleanup: not-started",
      "- Redaction: clean",
      "- Raw DOM: excluded",
    ].join("\n"),
    evidence: [`browser-txn-eval-case:${goldenCase.id}:skip:${reasonCode}`],
  };
}

function overallOutcome(outcomes: readonly BrowserTxnScoreOutcome[]): BrowserTxnScoreOutcome {
  if (outcomes.some((outcome) => outcome === "fail")) {
    return "fail";
  }
  if (outcomes.some((outcome) => outcome === "warn")) {
    return "warn";
  }
  if (outcomes.every((outcome) => outcome === "skip")) {
    return "skip";
  }
  return "pass";
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

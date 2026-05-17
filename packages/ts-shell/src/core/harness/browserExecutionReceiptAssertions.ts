import type {
  AgentCliAssertion,
  AgentCliAssertionResult,
  AgentCliProcessResult,
} from "./agentCliScenarioModel.js";

export type BrowserExecutionReceiptAssertionKind =
  | "browser-receipt-exists"
  | "browser-receipt-status"
  | "browser-receipt-executed"
  | "browser-receipt-replay-readiness"
  | "browser-receipt-safe"
  | "browser-receipt-decisions"
  | "browser-receipt-local-test-scoped"
  | "browser-receipt-next-action";

export interface BrowserExecutionReceiptOutputSummary {
  readonly exists: boolean;
  readonly receiptId?: string;
  readonly status?: string;
  readonly mode?: string;
  readonly runner?: string;
  readonly evidenceSummary?: string;
  readonly replayReadiness?: string;
  readonly redactionsWarnings?: string;
  readonly executed?: string;
  readonly nextAction?: string;
  readonly rawOutputSafe: boolean;
}

export function evaluateBrowserExecutionReceiptAssertion(input: {
  readonly assertion: AgentCliAssertion;
  readonly process: AgentCliProcessResult;
}): AgentCliAssertionResult {
  const summary = extractBrowserExecutionReceiptSummary(input.process.output.combined);
  const assertion = input.assertion;
  switch (assertion.kind) {
    case "browser-receipt-exists":
      return receiptPassIf(assertion, summary.exists, "Browser execution receipt was not rendered.");
    case "browser-receipt-status":
      return receiptPassIf(assertion, summary.status === requiredText(assertion), `Receipt status was ${summary.status ?? "missing"}.`);
    case "browser-receipt-executed":
      return receiptPassIf(assertion, summary.executed === requiredText(assertion), `Receipt executed was ${summary.executed ?? "missing"}.`);
    case "browser-receipt-replay-readiness":
      return receiptPassIf(assertion, summary.replayReadiness === requiredText(assertion), `Receipt replay readiness was ${summary.replayReadiness ?? "missing"}.`);
    case "browser-receipt-safe":
      return receiptPassIf(assertion, summary.rawOutputSafe, "Receipt output exposed raw content or secrets.");
    case "browser-receipt-decisions":
      return receiptPassIf(
        assertion,
        /Sandbox authority:/i.test(input.process.output.combined) &&
          /Network allowlist:/i.test(input.process.output.combined) &&
          /Confirmation status:/i.test(input.process.output.combined),
        "Receipt output did not include sandbox, allowlist, and confirmation decision context.",
      );
    case "browser-receipt-local-test-scoped":
      return receiptPassIf(
        assertion,
        /Mode:\s*(test-local|local-fixture|fake-test|playwright-local|external-local)/i.test(input.process.output.combined) &&
          !/safe url=https?:\/\//i.test(input.process.output.combined),
        "Receipt output was not local/test scoped.",
      );
    case "browser-receipt-next-action":
      return receiptPassIf(assertion, !!summary.nextAction, "Receipt next action was missing.");
  }
}

export function extractBrowserExecutionReceiptSummary(output: string): BrowserExecutionReceiptOutputSummary {
  return {
    exists: /Browser execution receipt/i.test(output),
    receiptId: lineValue(output, "Receipt id"),
    status: lineValue(output, "Status"),
    mode: lineValue(output, "Mode"),
    runner: lineValue(output, "Runner"),
    evidenceSummary: lineValue(output, "Evidence summary"),
    replayReadiness: lineValue(output, "Replay readiness"),
    redactionsWarnings: lineValue(output, "Redactions/warnings"),
    executed: lineValue(output, "Executed"),
    nextAction: lineValue(output, "Next action"),
    rawOutputSafe: !hasRawContentOrSecrets(output),
  };
}

function lineValue(output: string, label: string): string | undefined {
  return output.match(new RegExp(`^- ${escapeRegExp(label)}:\\s*(.+)$`, "im"))?.[1]?.trim();
}

function requiredText(assertion: AgentCliAssertion): string {
  if (!assertion.text) {
    throw new Error(`Assertion ${assertion.id} requires text.`);
  }
  return assertion.text;
}

function receiptPassIf(
  assertion: AgentCliAssertion,
  condition: boolean,
  failureMessage: string,
): AgentCliAssertionResult {
  return {
    assertionId: assertion.id,
    kind: assertion.kind,
    status: condition ? "passed" : "failed",
    message: condition ? "Assertion passed." : failureMessage,
    evidence: ["browser-execution-receipt-assertions:evaluated"],
  };
}

function hasRawContentOrSecrets(value: string): boolean {
  const checkableValue = value
    .split(/\r?\n/)
    .filter((line) => !/\b(excluded|redacted|redactions?)\b/i.test(line))
    .join("\n");
  return /\bRAW_[A-Z0-9_]+\b/.test(checkableValue) ||
    /\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(checkableValue) ||
    /\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(checkableValue) ||
    /\b(provider credential|api key|auth token)\s*[:=]\s*\S+/i.test(checkableValue);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

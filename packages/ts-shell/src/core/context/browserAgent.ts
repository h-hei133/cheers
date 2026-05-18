import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import {
  planBrowserTransaction,
  type BrowserTxnPlan,
} from "./browserPlan.js";
import type { BrowserToolName } from "./browserToolPolicy.js";

export interface BrowserAgentAction {
  readonly toolName: BrowserToolName;
  readonly args: Record<string, unknown>;
}

export interface BrowserAgentPlan {
  readonly reason: string;
  readonly transactionPlan?: BrowserTxnPlan;
  readonly actions: readonly BrowserAgentAction[];
  readonly continuationSummary?: string;
  readonly evidence: readonly string[];
}

export function detectBrowserAgentPlan(input: {
  readonly prompt: string;
  readonly continuityState?: unknown;
}): BrowserAgentPlan | undefined {
  const normalized = input.prompt.toLowerCase();
  const priorEvidence = browserEvidenceFromContinuity(input.continuityState);
  if (priorEvidence.length > 0 && isBrowserContinuationPrompt(normalized)) {
    return {
      reason: "browser continuation evidence requested",
      actions: [],
      continuationSummary: priorEvidence.join(" | "),
      evidence: [
        "browser-agent:continuation-evidence-used",
        ...priorEvidence.map((entry) => sanitizeBrowserText(entry, 220)),
      ],
    };
  }

  if (!hasBrowserCue(normalized)) {
    return undefined;
  }

  const transactionPlan = planBrowserTransaction({ prompt: input.prompt });
  if (transactionPlan) {
    return {
      reason: transactionPlan.planner.reason,
      transactionPlan,
      actions: [],
      evidence: [
        "browser-agent:transaction-selected",
        `browser-agent:transaction-id:${transactionPlan.transactionId}`,
        ...transactionPlan.planner.evidence,
      ],
    };
  }

  const page = selectFixture(normalized, input.prompt);
  if (hasPublicWebCue(input.prompt)) {
    return {
      reason: "browser public-web request routed to policy gate",
      actions: [{
        toolName: "browser.observe",
        args: { page: extractFirstUrl(input.prompt) ?? "https://example.com", target: "public-web" },
      }],
      evidence: ["browser-agent:public-web-policy-test"],
    };
  }

  if (/\bclick\b|\bpress\b|\u70b9\u51fb/u.test(normalized)) {
    const target = /missing target|target missing|not found/i.test(input.prompt)
      ? "Missing target"
      : "Save draft";
    return sequencePlan("browser click controlled local fixture", [
      { toolName: "browser.observe", args: { page, target: "visible-text" } },
      { toolName: "browser.click", args: { page, target } },
    ]);
  }

  if (/\btype\b|\benter\b|\bfill\b|\u8f93\u5165/u.test(normalized)) {
    return sequencePlan("browser type controlled local fixture", [
      { toolName: "browser.observe", args: { page, target: "visible-text" } },
      {
        toolName: "browser.type",
        args: {
          page,
          target: "Safe note",
          text: "safe local note",
          valueClassification: "safe-test-text",
        },
      },
    ]);
  }

  if (/\bextract\b|\breport\b|rendered text|visible text|\u6587\u672c/u.test(normalized)) {
    return sequencePlan("browser observe/extract controlled local fixture", [
      { toolName: "browser.observe", args: { page, target: "visible-text" } },
      { toolName: "browser.extract", args: { page, extractionKind: "visible-text", target: "visible-text" } },
    ]);
  }

  return sequencePlan("browser observe controlled local fixture", [
    { toolName: "browser.observe", args: { page, target: "visible-text" } },
  ]);
}

function sequencePlan(
  reason: string,
  actions: readonly BrowserAgentAction[],
): BrowserAgentPlan {
  return {
    reason,
    actions,
    evidence: [
      "browser-agent:controlled-autonomous-use",
      `browser-agent:action-count:${actions.length}`,
      "browser-agent:no-stagehand-planner",
    ],
  };
}

function hasBrowserCue(normalized: string): boolean {
  return /\bbrowser\b|\bplaywright\b|local fixture|local-fixture|rendered text|\u6d4f\u89c8\u5668/u.test(normalized);
}

function isBrowserContinuationPrompt(normalized: string): boolean {
  return /\bcontinue\b|\bprevious\b|\bprior\b|\bwhat did\b|\bsummarize\b|\u7ee7\u7eed|\u4e0a\u4e00/u.test(normalized);
}

function selectFixture(normalized: string, original: string): string {
  if (/timeout|timed out|\u8d85\u65f6/u.test(normalized)) {
    return "local-fixture://pw/timeout";
  }
  if (/secret|redaction|token|api[_ -]?key/u.test(normalized)) {
    return "local-fixture://pw/redaction";
  }
  if (/js|javascript|rendered/u.test(normalized)) {
    return "local-fixture://pw/js";
  }
  return extractLocalFixture(original) ?? "local-fixture://pw/static";
}

function hasPublicWebCue(prompt: string): boolean {
  const url = extractFirstUrl(prompt);
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ||
      (parsed.protocol === "http:" &&
        parsed.hostname !== "localhost" &&
        parsed.hostname !== "127.0.0.1" &&
        parsed.hostname !== "::1");
  } catch {
    return false;
  }
}

function extractLocalFixture(prompt: string): string | undefined {
  return prompt.match(/local-fixture:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%-]+/)?.[0];
}

function extractFirstUrl(prompt: string): string | undefined {
  return prompt.match(/https?:\/\/[^\s"'<>]+/)?.[0];
}

function browserEvidenceFromContinuity(continuityState: unknown): readonly string[] {
  if (!continuityState || typeof continuityState !== "object") {
    return [];
  }
  const evidence = (continuityState as { lastContinuationEvidence?: unknown }).lastContinuationEvidence;
  if (!Array.isArray(evidence)) {
    return [];
  }
  return evidence
    .filter((entry): entry is string => typeof entry === "string")
    .filter((entry) =>
      entry.startsWith("browser-agent-observation:") ||
      entry.startsWith("browser-agent-transaction:") ||
      entry.startsWith("browser-agent-transaction-trace:")
    )
    .slice(0, 6);
}

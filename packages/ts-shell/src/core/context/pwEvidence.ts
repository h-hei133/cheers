import type { BrowserAccessibilityNodeInput } from "./browserAccessibilitySnapshot.js";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserRuntimeExecutorResult } from "./browserRuntimeExecutor.js";
import type { BrowserRuntimeManifest } from "./browserRuntimeManifest.js";

export type PwEvidenceStatus = "ok" | "blocked" | "unavailable" | "timed-out" | "failed";
export type PwCleanupStatus = "closed" | "close-failed" | "not-started";

export interface PwPageEvidence {
  readonly status: PwEvidenceStatus;
  readonly operation: BrowserExecutionRequest["actionKind"];
  readonly fixtureMarker: string;
  readonly urlSummary: string;
  readonly title?: string;
  readonly visibleText?: string;
  readonly rawHtml?: string;
  readonly accessibilityNodes?: readonly BrowserAccessibilityNodeInput[];
  readonly actionApplied?: boolean;
  readonly browserLaunched: boolean;
  readonly cleanupStatus: PwCleanupStatus;
  readonly targetSummary?: string;
  readonly errorKind?: "timeout" | "runtime" | "policy" | "unavailable";
  readonly errorSummary?: string;
  readonly redactions?: readonly string[];
  readonly warnings?: readonly string[];
  readonly evidence?: readonly string[];
}

export function mapPwEvidence(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserRuntimeManifest;
  readonly evidence: PwPageEvidence;
}): BrowserRuntimeExecutorResult {
  const textRedaction = redactPwText([
    input.evidence.title,
    input.evidence.visibleText,
    input.evidence.errorSummary,
  ].filter(Boolean).join(" "));
  const rawRedaction = redactPwText(input.evidence.rawHtml ?? "");
  const typedRedactions = input.request.actionKind === "type" && input.request.action.text
    ? ["typed-value-redacted"]
    : [];
  const hiddenRedactions = /type\s*=\s*["']hidden["']/i.test(input.evidence.rawHtml ?? "")
    ? ["hidden-input-redacted"]
    : [];
  const redactions = unique([
    ...textRedaction.redactions,
    ...rawRedaction.redactions,
    ...typedRedactions,
    ...hiddenRedactions,
    ...(input.evidence.redactions ?? []),
  ]);
  const title = sanitizeBrowserText(textRedaction.text ? input.evidence.title ?? "Direct Playwright page" : "Direct Playwright page", 160);
  const visibleText = sanitizeBrowserText(
    input.evidence.status === "ok"
      ? textRedaction.text || input.evidence.visibleText || title
      : input.evidence.errorSummary ?? input.evidence.status,
    Math.min(input.manifest.outputBudgetChars, 1200),
  );
  const status = toRuntimeStatus(input.request, input.evidence);
  return {
    status,
    runtimeMode: "direct-playwright-core",
    actionKind: input.request.actionKind,
    url: sanitizeBrowserText(input.evidence.urlSummary || input.evidence.fixtureMarker, 180),
    title,
    html: safeSummaryHtml({
      title,
      visibleText,
      operation: input.evidence.operation,
      targetSummary: input.evidence.targetSummary,
    }),
    renderedText: visibleText,
    accessibilityNodes: sanitizeAccessibilityNodes(input.evidence.accessibilityNodes ?? fallbackNodes(input.request, title)),
    actionApplied: input.evidence.actionApplied ??
      (input.evidence.status === "ok" && (input.request.actionKind === "click" || input.request.actionKind === "type")),
    browserLaunched: input.evidence.browserLaunched,
    publicAutomation: false,
    warnings: unique([
      ...(input.evidence.warnings ?? []),
      ...textRedaction.warnings,
      ...rawRedaction.warnings,
      `pw-evidence:cleanup:${input.evidence.cleanupStatus}`,
      "pw-evidence:safe-summary-only",
    ]),
    redactions,
    evidence: [
      ...(input.evidence.evidence ?? []),
      "pw-evidence:mapped",
      `pw-evidence:operation:${input.evidence.operation}`,
      `pw-evidence:status:${input.evidence.status}`,
      `pw-evidence:cleanup:${input.evidence.cleanupStatus}`,
      "pw-evidence:raw-dom-excluded",
      "pw-evidence:no-cookies-session-or-auth",
      "pw-evidence:no-provider-or-model-call",
    ],
    rawContent: "internal-only",
  };
}

function toRuntimeStatus(
  request: BrowserExecutionRequest,
  evidence: PwPageEvidence,
): BrowserRuntimeExecutorResult["status"] {
  if (evidence.status === "ok") {
    return request.actionKind === "click" || request.actionKind === "type" ? "acted" : "observed";
  }
  if (evidence.status === "blocked" || evidence.status === "unavailable") {
    return "blocked";
  }
  return "failed";
}

function safeSummaryHtml(input: {
  readonly title: string;
  readonly visibleText: string;
  readonly operation: string;
  readonly targetSummary?: string;
}): string {
  const target = input.targetSummary ? `<p data-target="${escapeHtml(input.targetSummary)}"></p>` : "";
  return [
    "<main>",
    `<h1>${escapeHtml(input.title)}</h1>`,
    `<p data-operation="${escapeHtml(input.operation)}">${escapeHtml(input.visibleText)}</p>`,
    target,
    "</main>",
  ].join("");
}

function sanitizeAccessibilityNodes(
  nodes: readonly BrowserAccessibilityNodeInput[],
): readonly BrowserAccessibilityNodeInput[] {
  return nodes.slice(0, 40).map((node) => {
    const sensitive = /password|payment|credit|card|token|secret|api[_ -]?key/i.test(node.name ?? "");
    return {
      role: sanitizeBrowserText(node.role || "generic", 60),
      name: sensitive ? "[REDACTED_SENSITIVE_LABEL]" : sanitizeBrowserText(redactPwText(node.name ?? "").text, 140),
      selector: node.selector ? sanitizeBrowserText(node.selector, 120) : undefined,
      disabled: node.disabled,
      hidden: node.hidden,
      value: undefined,
    };
  });
}

function fallbackNodes(
  request: BrowserExecutionRequest,
  title: string,
): readonly BrowserAccessibilityNodeInput[] {
  const nodes: Array<BrowserAccessibilityNodeInput | undefined> = [
    { role: "main", name: title },
    request.action.target ? { role: request.actionKind === "type" ? "textbox" : "button", name: request.action.target } : undefined,
  ];
  return nodes.filter((node): node is BrowserAccessibilityNodeInput => !!node);
}

function redactPwText(value: string): {
  readonly text: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
} {
  const redactions = new Set<string>();
  const text = value
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, () => {
      redactions.add("secret-looking-token");
      return "[REDACTED_SECRET]";
    })
    .replace(/\b(api[_ -]?key|token|authorization|password|secret)\s*[:=]\s*[^\s<>"']+/gi, (match) => {
      redactions.add("secret-looking-field");
      const label = match.split(/[:=]/)[0] ?? "secret";
      return `${label}=[REDACTED_SECRET]`;
    })
    .replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, () => {
      redactions.add("hidden-reasoning-label");
      return "[REDACTED_REASONING]";
    });
  return {
    text,
    warnings: redactions.size > 0 ? ["pw-evidence:sensitive-content-redacted"] : [],
    redactions: Array.from(redactions).sort(),
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}

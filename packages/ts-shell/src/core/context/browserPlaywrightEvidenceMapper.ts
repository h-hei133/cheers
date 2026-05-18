import type { BrowserAccessibilityNodeInput } from "./browserAccessibilitySnapshot.js";
import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserExecutionRequest } from "./browserExecutionContract.js";
import type { BrowserRuntimeExecutorResult } from "./browserRuntimeExecutor.js";
import type { BrowserRuntimeManifest } from "./browserRuntimeManifest.js";

export interface BrowserPlaywrightPageEvidence {
  readonly status: "ok" | "blocked" | "unavailable" | "timed-out" | "invalid" | "error";
  readonly url: string;
  readonly title?: string;
  readonly html?: string;
  readonly renderedText?: string;
  readonly accessibilityNodes?: readonly BrowserAccessibilityNodeInput[];
  readonly actionApplied?: boolean;
  readonly actionTarget?: {
    readonly selectorSummary?: string;
    readonly accessibleName?: string;
    readonly confidence?: number;
  };
  readonly warnings?: readonly string[];
  readonly errorSummary?: string;
}

export function mapPlaywrightEvidenceToRuntimeResult(input: {
  readonly request: BrowserExecutionRequest;
  readonly manifest: BrowserRuntimeManifest;
  readonly evidence: BrowserPlaywrightPageEvidence;
}): BrowserRuntimeExecutorResult {
  const redacted = redactSensitiveText([
    input.evidence.title,
    input.evidence.renderedText,
    input.evidence.html,
    input.evidence.errorSummary,
  ].filter(Boolean).join(" "));
  const title = sanitizeBrowserText(input.evidence.title ?? "Playwright page", 160);
  const renderedText = sanitizeBrowserText(
    input.evidence.status === "ok"
      ? input.evidence.renderedText ?? title
      : input.evidence.errorSummary ?? input.evidence.status,
    1200,
  );
  const actionApplied = input.evidence.actionApplied ??
    (input.evidence.status === "ok" && (input.request.actionKind === "click" || input.request.actionKind === "type"));
  const status = input.evidence.status === "ok"
    ? actionApplied ? "acted" : "observed"
    : input.evidence.status === "blocked" || input.evidence.status === "unavailable"
      ? "blocked"
      : "failed";
  return {
    status,
    runtimeMode: "direct-playwright-core",
    actionKind: input.request.actionKind,
    url: sanitizeBrowserText(input.evidence.url || (input.manifest.allowedOrigins[0] ?? "controlled-runtime://playwright"), 180),
    title,
    html: safeSummaryHtml({
      title,
      renderedText,
      actionTarget: input.evidence.actionTarget?.accessibleName ?? input.request.action.target,
    }),
    renderedText,
    accessibilityNodes: sanitizeAccessibilityNodes(input.evidence.accessibilityNodes ?? fallbackNodes(input.request, title)),
    actionApplied,
    browserLaunched: false,
    publicAutomation: false,
    warnings: unique([
      ...(input.evidence.warnings ?? []),
      ...redacted.warnings,
      "playwright-evidence-mapper:safe-summary-only",
    ]),
    redactions: redacted.redactions,
    evidence: [
      "playwright-evidence-mapper:mapped",
      `playwright-evidence-mapper:status:${input.evidence.status}`,
      "playwright-evidence-mapper:raw-dom-excluded",
      "playwright-evidence-mapper:no-provider-or-model-call",
    ],
    rawContent: "internal-only",
  };
}

function safeSummaryHtml(input: {
  readonly title: string;
  readonly renderedText: string;
  readonly actionTarget?: string;
}): string {
  const target = input.actionTarget ? `<button>${escapeHtml(input.actionTarget)}</button>` : "";
  return [
    "<main>",
    `<h1>${escapeHtml(input.title)}</h1>`,
    `<p>${escapeHtml(input.renderedText)}</p>`,
    target,
    "</main>",
  ].join("");
}

function fallbackNodes(
  request: BrowserExecutionRequest,
  title: string,
): readonly BrowserAccessibilityNodeInput[] {
  const nodes: Array<BrowserAccessibilityNodeInput | undefined> = [
    { role: "main", name: title },
    request.action.target ? { role: "button", name: request.action.target } : undefined,
  ];
  return nodes.filter((item): item is BrowserAccessibilityNodeInput => !!item);
}

function sanitizeAccessibilityNodes(
  nodes: readonly BrowserAccessibilityNodeInput[],
): readonly BrowserAccessibilityNodeInput[] {
  return nodes.slice(0, 40).map((node) => ({
    role: sanitizeBrowserText(node.role || "generic", 60),
    name: node.name ? sanitizeBrowserText(redactSensitiveText(node.name).text, 140) : undefined,
    selector: node.selector ? sanitizeBrowserText(node.selector, 120) : undefined,
    disabled: node.disabled,
    hidden: node.hidden,
    value: undefined,
  }));
}

function redactSensitiveText(value: string): {
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
    warnings: redactions.size > 0 ? ["sensitive-content-redacted"] : [],
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

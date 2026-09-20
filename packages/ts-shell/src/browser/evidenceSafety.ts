import { sanitizeBrowserText } from "./capabilityModel.js";
import { exceedsByteBudget } from "./outputBudget.js";

export type BrowserEvidenceSafetyStatus = "safe" | "redacted" | "unsafe" | "blocked";

export interface BrowserEvidenceSafetyResult {
  readonly safetyStatus: BrowserEvidenceSafetyStatus;
  readonly redactions: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
  readonly safeSummaries: readonly string[];
  readonly evidence: readonly string[];
}

export function classifyBrowserEvidenceSafety(input: {
  readonly values: readonly string[];
  readonly outputBudgetBytes?: number;
  readonly externalUrlEvidence?: boolean;
}): BrowserEvidenceSafetyResult {
  const redactions = new Set<string>();
  const blockers = new Set<string>();
  const warnings = new Set<string>();
  const safeSummaries: string[] = [];
  const budget = input.outputBudgetBytes ?? 4096;

  for (const value of input.values) {
    const checks = unsafeEvidenceChecks(value, budget);
    for (const redaction of checks.redactions) {
      redactions.add(redaction);
    }
    for (const blocker of checks.blockers) {
      blockers.add(blocker);
    }
    for (const warning of checks.warnings) {
      warnings.add(warning);
    }
    safeSummaries.push(safeEvidenceSummary(value));
  }

  if (input.externalUrlEvidence) {
    blockers.add("external-url-evidence");
    redactions.add("external-url");
  }

  const blockerList = Array.from(blockers);
  const redactionList = Array.from(redactions);
  const warningList = Array.from(warnings);
  const safetyStatus: BrowserEvidenceSafetyStatus = blockerList.includes("unsafe-external-url")
    ? "blocked"
    : blockerList.length > 0
      ? "unsafe"
      : redactionList.length > 0
        ? "redacted"
        : "safe";

  return {
    safetyStatus,
    redactions: redactionList,
    blockers: blockerList,
    warnings: warningList,
    safeSummaries: unique(safeSummaries.filter((value) => value.length > 0)).slice(0, 8),
    evidence: [
      "browser-evidence-safety:classified",
      "browser-evidence-safety:no-provider-or-model-call",
      "browser-evidence-safety:no-raw-unsafe-output",
    ],
  };
}

export function browserEvidenceHasUnsafeRawContent(value: string): boolean {
  return unsafeEvidenceChecks(value, 4096).blockers.length > 0;
}

/**
 * Redacts secret-shaped tokens, credential assignments and hidden reasoning
 * from browser-captured text, reporting which categories fired.
 *
 * This was hand-copied into `domSnapshot.ts`, `readOnlyContentNormalizer.ts` and
 * `playwrightEvidenceMapper.ts`. The first and third were byte-identical; the
 * second added a truncation step on top. Since these run on captured page
 * content, a rule that reaches one copy and not another is a leak in the copy
 * that missed it, so the chain lives here and the callers delegate.
 *
 * `truncate` preserves the `readOnlyContentNormalizer` variant, which caps the
 * result with `sanitizeBrowserText` at `max(280, length)` - a no-op unless the
 * text is under 280 characters, where it normalises whitespace instead.
 */
export function redactBrowserEvidenceText(
  value: string,
  options: { readonly truncate?: boolean } = {},
): {
  readonly text: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
} {
  const redactions = new Set<string>();
  let text = value
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
  if (options.truncate) {
    text = sanitizeBrowserText(text, Math.max(280, text.length));
  }
  return {
    text,
    warnings: redactions.size > 0 ? ["sensitive-content-redacted"] : [],
    redactions: Array.from(redactions).sort(),
  };
}

function unsafeEvidenceChecks(
  value: string,
  budget: number,
): {
  readonly redactions: readonly string[];
  readonly blockers: readonly string[];
  readonly warnings: readonly string[];
} {
  const redactions = new Set<string>();
  const blockers = new Set<string>();
  const warnings = new Set<string>();
  const normalized = value.trim();

  if (/<(?:html|body|main|script|div|span|button|input|section|article|head|meta)\b/i.test(normalized)) {
    redactions.add("raw-html");
    blockers.add("raw-html-marker");
  }
  if (/\bRAW_[A-Z0-9_]+\b/.test(normalized)) {
    redactions.add("raw-marker");
    blockers.add("raw-content-marker");
  }
  if (/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(normalized)) {
    redactions.add("secret-looking-content");
    blockers.add("secret-looking-content");
  }
  if (/\b(?:api key|auth token|provider credential|password|bearer token)\b/i.test(normalized)) {
    redactions.add("credential-looking-content");
    blockers.add("credential-looking-content");
  }
  if (/https?:\/\/[^/\s:@]+:[^/\s@]+@/i.test(normalized)) {
    redactions.add("credential-url");
    blockers.add("credential-url");
  }
  if (/\b(hidden reasoning|chain[- ]?of[- ]?thought|private reasoning)\b/i.test(normalized)) {
    redactions.add("hidden-reasoning-marker");
    blockers.add("hidden-reasoning-marker");
  }
  if (/\b(data:image\/|base64,|screenshot|ocr)\b/i.test(normalized)) {
    redactions.add("screenshot-or-ocr-marker");
    blockers.add("screenshot-or-ocr-marker");
  }
  if (/[^\x09\x0A\x0D\x20-\x7E]/.test(normalized) || /\bblob:|application\/octet-stream\b/i.test(normalized)) {
    redactions.add("binary-or-blob-payload");
    blockers.add("binary-or-blob-payload");
  }
  if (exceedsByteBudget(normalized, budget)) {
    redactions.add("over-budget-output");
    warnings.add("raw-output-over-budget");
  }
  if (/^https?:\/\//i.test(normalized) && !/^https?:\/\/(?:localhost|127\.0\.0\.1)(?:[:/]|$)/i.test(normalized)) {
    redactions.add("external-url");
    blockers.add("unsafe-external-url");
  }

  return {
    redactions: Array.from(redactions),
    blockers: Array.from(blockers),
    warnings: Array.from(warnings),
  };
}

function safeEvidenceSummary(value: string): string {
  if (!value.trim()) {
    return "";
  }
  const checks = unsafeEvidenceChecks(value, 4096);
  if (checks.blockers.length > 0) {
    return `[redacted:${checks.redactions[0] ?? "unsafe-evidence"}]`;
  }
  return sanitizeBrowserText(value.replace(/\s+/g, " "), 180);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values));
}

import { sanitizeBrowserText } from "./capabilityModel.js";

export type BrowserLocalFixtureKind =
  | "static-page"
  | "accessibility-summary"
  | "extraction-result";

export type BrowserLocalFixtureAction =
  | "observe"
  | "extract"
  | "navigate-local";

export interface BrowserLocalFixture {
  readonly fixtureId: string;
  readonly fixtureKind: BrowserLocalFixtureKind;
  readonly safeTitle: string;
  readonly safeUrl: string;
  readonly safeTextSummary: string;
  readonly allowedActions: readonly BrowserLocalFixtureAction[];
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
}

export function createBrowserLocalFixture(
  input: {
    readonly fixtureId?: string;
    readonly fixtureKind?: BrowserLocalFixtureKind;
    readonly title?: string;
    readonly url?: string;
    readonly text?: string;
    readonly allowedActions?: readonly BrowserLocalFixtureAction[];
  } = {},
): BrowserLocalFixture {
  const fixtureKind = input.fixtureKind ?? "static-page";
  const title = sanitizeBrowserEvidenceText(input.title ?? "Local fixture page", 80);
  const safeUrl = sanitizeLocalFixtureUrl(input.url ?? `local-fixture://${deterministicFixtureId(title.value)}`);
  const summary = sanitizeBrowserEvidenceText(input.text ?? "Local fixture content is available as a bounded summary.", 180);
  return {
    fixtureId: input.fixtureId ?? deterministicFixtureId(`${fixtureKind}:${title.value}:${safeUrl}`),
    fixtureKind,
    safeTitle: title.value,
    safeUrl,
    safeTextSummary: summary.value,
    allowedActions: input.allowedActions ?? ["observe", "extract", "navigate-local"],
    redactions: Array.from(new Set([...title.redactions, ...summary.redactions])),
    warnings: Array.from(new Set([...title.warnings, ...summary.warnings])),
  };
}

export function deterministicFixtureId(value: string): string {
  const normalized = sanitizeBrowserText(value, 80)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `fixture:${normalized || "local"}`;
}

export function sanitizeBrowserEvidenceText(
  value: string,
  maxLength: number,
): {
  readonly value: string;
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
} {
  const redactions: string[] = [];
  let result = value;
  if (/<[^>]+>/.test(result)) {
    result = result.replace(/<[^>]+>/g, " ");
    redactions.push("raw-html");
  }
  if (/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/.test(result)) {
    result = result.replace(/\b(sk-[A-Za-z0-9_-]{8,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g, "[REDACTED_SECRET]");
    redactions.push("secret-looking-content");
  }
  if (/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/i.test(result)) {
    result = result.replace(/\b(hidden reasoning|chain[- ]?of[- ]?thought)\b/gi, "[REDACTED_REASONING]");
    redactions.push("hidden-reasoning");
  }
  return {
    value: sanitizeBrowserText(result, maxLength),
    redactions,
    warnings: redactions.length > 0 ? ["Unsafe fixture content was redacted."] : [],
  };
}

function sanitizeLocalFixtureUrl(value: string): string {
  if (value.startsWith("local-fixture://")) {
    return sanitizeBrowserText(value, 120);
  }
  return `local-fixture://${deterministicFixtureId(value).replace(/^fixture:/, "")}`;
}

import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import { normalizeOriginLike } from "./browserRuntimeManifest.js";

export interface BrowserDomSnapshot {
  readonly snapshotId: string;
  readonly urlSummary: string;
  readonly originSummary: string;
  readonly title: string;
  readonly headings: readonly string[];
  readonly textNodes: readonly string[];
  readonly forms: readonly BrowserDomFormSummary[];
  readonly buttons: readonly BrowserDomElementSummary[];
  readonly links: readonly BrowserDomElementSummary[];
  readonly inputs: readonly BrowserDomInputSummary[];
  readonly redactions: readonly string[];
  readonly warnings: readonly string[];
  readonly rawDomStored: false;
}

export interface BrowserDomElementSummary {
  readonly label: string;
  readonly selectorSummary: string;
}

export interface BrowserDomInputSummary extends BrowserDomElementSummary {
  readonly inputType: string;
  readonly sensitive: boolean;
  readonly valueStored: false;
}

export interface BrowserDomFormSummary {
  readonly label: string;
  readonly fieldCount: number;
  readonly sensitive: boolean;
  readonly valuesStored: false;
}

export function createBrowserDomSnapshot(input: {
  readonly snapshotId?: string;
  readonly url: string;
  readonly rawHtml?: string;
  readonly title?: string;
  readonly outputBudgetChars: number;
}): BrowserDomSnapshot {
  const redactions = new Set<string>();
  const warnings = new Set<string>();
  const bounded = boundText(input.rawHtml ?? "", input.outputBudgetChars);
  if (bounded.truncated) {
    warnings.add("dom-snapshot-truncated-to-budget");
  }
  const stripped = stripUnsafeMarkup(bounded.text);
  const redacted = redactSensitiveText(decodeBasicEntities(stripped));
  redacted.redactions.forEach((item) => redactions.add(item));
  redacted.warnings.forEach((item) => warnings.add(item));
  const title = input.title ?? firstMatch(stripped, /<title[^>]*>([\s\S]*?)<\/title>/i) ?? "untitled";
  const headings = collectTagText(stripped, /<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi, 8);
  const buttons = collectTagText(stripped, /<button[^>]*>([\s\S]*?)<\/button>/gi, 12)
    .map((label, index) => element(label, `button:nth(${index + 1})`));
  const links = collectLinks(stripped);
  const inputs = collectInputs(stripped);
  const forms = collectForms(stripped, inputs);
  const textNodes = redacted.text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => sanitizeBrowserText(item, 240))
    .filter(Boolean)
    .slice(0, 10);
  return {
    snapshotId: sanitizeId(input.snapshotId ?? `dom:${input.url}`),
    urlSummary: sanitizeBrowserText(input.url, 180),
    originSummary: normalizeOriginLike(input.url),
    title: sanitizeBrowserText(decodeBasicEntities(stripTags(title)), 160),
    headings,
    textNodes,
    forms,
    buttons,
    links,
    inputs,
    redactions: Array.from(redactions).sort(),
    warnings: Array.from(warnings).sort(),
    rawDomStored: false,
  };
}

export function browserDomSnapshotTextSummary(snapshot: BrowserDomSnapshot): string {
  return [
    snapshot.title,
    ...snapshot.headings,
    ...snapshot.textNodes,
    ...snapshot.buttons.map((button) => button.label),
    ...snapshot.links.map((link) => link.label),
  ]
    .map((item) => sanitizeBrowserText(item, 160))
    .filter(Boolean)
    .slice(0, 16)
    .join(" | ");
}

function stripUnsafeMarkup(value: string): string {
  return value
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
}

function collectTagText(value: string, pattern: RegExp, limit: number): readonly string[] {
  return Array.from(value.matchAll(pattern))
    .map((match) => sanitizeBrowserText(decodeBasicEntities(stripTags(match[1] ?? "")), 180))
    .filter(Boolean)
    .slice(0, limit);
}

function collectLinks(value: string): readonly BrowserDomElementSummary[] {
  return Array.from(value.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi))
    .map((match, index) => {
      const attrs = match[1] ?? "";
      const href = firstMatch(attrs, /\bhref\s*=\s*["']([^"']+)["']/i);
      return element(
        sanitizeBrowserText(`${stripTags(match[2] ?? "")}${href ? ` -> ${href}` : ""}`, 180),
        `a:nth(${index + 1})`,
      );
    })
    .filter((item) => item.label.length > 0)
    .slice(0, 12);
}

function collectInputs(value: string): readonly BrowserDomInputSummary[] {
  return Array.from(value.matchAll(/<input\b([^>]*)>/gi))
    .map((match, index) => {
      const attrs = match[1] ?? "";
      const type = (firstMatch(attrs, /\btype\s*=\s*["']?([^"'\s>]+)/i) ?? "text").toLowerCase();
      const label = firstMatch(attrs, /\b(aria-label|placeholder|name|id)\s*=\s*["']([^"']+)["']/i, 2) ?? `input ${index + 1}`;
      return {
        label: sanitizeBrowserText(label, 120),
        selectorSummary: sanitizeBrowserText(`input:nth(${index + 1})`, 80),
        inputType: sanitizeBrowserText(type, 40),
        sensitive: isSensitiveField(type, label),
        valueStored: false as const,
      };
    })
    .slice(0, 16);
}

function collectForms(value: string, inputs: readonly BrowserDomInputSummary[]): readonly BrowserDomFormSummary[] {
  const count = Array.from(value.matchAll(/<form\b/gi)).length;
  if (count === 0 && inputs.length === 0) {
    return [];
  }
  const sensitive = inputs.some((input) => input.sensitive);
  return [{
    label: sensitive ? "form with sensitive fields" : "form",
    fieldCount: inputs.length,
    sensitive,
    valuesStored: false,
  }];
}

function element(label: string, selectorSummary: string): BrowserDomElementSummary {
  return {
    label: sanitizeBrowserText(decodeBasicEntities(stripTags(label)), 160),
    selectorSummary: sanitizeBrowserText(selectorSummary, 80),
  };
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

function isSensitiveField(type: string, label: string): boolean {
  return /password|card|cc-|credit|payment|token|secret|api[_ -]?key/i.test(`${type} ${label}`);
}

function stripTags(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeBasicEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function firstMatch(value: string, pattern: RegExp, group = 1): string | undefined {
  return value.match(pattern)?.[group];
}

function boundText(value: string, budget: number): { readonly text: string; readonly truncated: boolean } {
  if (value.length <= budget) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, Math.max(0, budget)), truncated: true };
}

function sanitizeId(value: string): string {
  return sanitizeBrowserText(value, 140)
    .toLowerCase()
    .replace(/[^a-z0-9:._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "dom:snapshot";
}

import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserReadOnlyContentTypeClassification } from "./browserReadOnlyContentType.js";

export interface BrowserReadOnlyContentNormalization {
  readonly normalizedText: string;
  readonly truncated: boolean;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

export function normalizeBrowserReadOnlyContent(input: {
  readonly body?: string;
  readonly byteBudget: number;
  readonly contentType: BrowserReadOnlyContentTypeClassification;
}): BrowserReadOnlyContentNormalization {
  if (!input.contentType.bodyExtractionAllowed) {
    return normalization("", {
      truncated: false,
      warnings: [input.contentType.reason, ...input.contentType.warnings],
      redactions: input.contentType.redactions,
      evidence: input.contentType.evidence,
    });
  }
  const bounded = boundText(input.body ?? "", input.byteBudget);
  const stripped = stripForContentClass(bounded.text, input.contentType.contentClass);
  const decoded = decodeBasicEntities(stripped);
  const redacted = redactSensitiveText(decoded);
  return normalization(redacted.text.replace(/\s+/g, " ").trim(), {
    truncated: bounded.truncated,
    warnings: [
      ...(bounded.truncated ? ["content-truncated-to-budget"] : []),
      ...redacted.warnings,
    ],
    redactions: redacted.redactions,
    evidence: [
      ...input.contentType.evidence,
      "browser-readonly-content-normalizer:normalized",
      "browser-readonly-content-normalizer:raw-body-excluded",
    ],
  });
}

function stripForContentClass(value: string, contentClass: string): string {
  if (contentClass === "html") {
    return value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
      .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ");
  }
  if (contentClass === "json-summary") {
    return summarizeJson(value);
  }
  return value;
}

function summarizeJson(value: string): string {
  try {
    return summarizeJsonValue(JSON.parse(value), 0);
  } catch {
    return value.replace(/[{}\[\]",]/g, " ");
  }
}

function summarizeJsonValue(value: unknown, depth: number): string {
  if (depth > 2) {
    return "nested value";
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, 4).map((item) => summarizeJsonValue(item, depth + 1));
    return `array ${value.length} items ${items.join(" ")}`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 8);
    return entries.map(([key, item]) => `${key}: ${summarizeJsonValue(item, depth + 1)}`).join(" ");
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return "";
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

function redactSensitiveText(value: string): {
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
  text = sanitizeBrowserText(text, Math.max(280, text.length));
  return {
    text,
    warnings: redactions.size > 0 ? ["sensitive-content-redacted"] : [],
    redactions: Array.from(redactions).sort(),
  };
}

function boundText(value: string, byteBudget: number): { readonly text: string; readonly truncated: boolean } {
  const maxLength = Math.max(0, byteBudget);
  if (Buffer.byteLength(value, "utf8") <= maxLength) {
    return { text: value, truncated: false };
  }
  return { text: value.slice(0, maxLength), truncated: true };
}

function normalization(
  normalizedText: string,
  input: {
    readonly truncated: boolean;
    readonly warnings: readonly string[];
    readonly redactions: readonly string[];
    readonly evidence: readonly string[];
  },
): BrowserReadOnlyContentNormalization {
  return {
    normalizedText: sanitizeBrowserText(normalizedText, 1200),
    truncated: input.truncated,
    warnings: unique(input.warnings),
    redactions: unique(input.redactions),
    evidence: input.evidence,
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

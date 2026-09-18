import { sanitizeBrowserText } from "./browserCapabilityModel.js";

export type BrowserReadOnlyContentClass =
  | "html"
  | "plain-text"
  | "json-summary"
  | "unsupported"
  | "binary-blocked"
  | "over-budget";

export interface BrowserReadOnlyContentTypeClassification {
  readonly contentClass: BrowserReadOnlyContentClass;
  readonly contentTypeBase: string;
  readonly supported: boolean;
  readonly bodyExtractionAllowed: boolean;
  readonly reason: string;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

const BINARY_CONTENT_TYPES = [
  "application/octet-stream",
  "application/pdf",
  "application/zip",
  "application/x-zip-compressed",
  "image/",
  "audio/",
  "video/",
] as const;

export function classifyBrowserReadOnlyContentType(input: {
  readonly contentType?: string;
  readonly contentTypeAllowlist?: readonly string[];
  readonly bodyBytes?: number;
  readonly responseByteBudget?: number;
}): BrowserReadOnlyContentTypeClassification {
  const contentTypeBase = normalizeContentTypeBase(input.contentType);
  const allowlist = new Set((input.contentTypeAllowlist ?? []).map((item) => normalizeContentTypeBase(item)));
  const overBudget =
    typeof input.bodyBytes === "number" &&
    typeof input.responseByteBudget === "number" &&
    input.bodyBytes > input.responseByteBudget;
  if (overBudget) {
    return classification("over-budget", contentTypeBase, {
      supported: false,
      bodyExtractionAllowed: false,
      reason: "Response body exceeded the public read-only byte budget.",
      warnings: ["response-over-budget"],
    });
  }
  if (isBinaryContentType(contentTypeBase)) {
    return classification("binary-blocked", contentTypeBase, {
      supported: false,
      bodyExtractionAllowed: false,
      reason: "Binary or blob-like public read-only content is blocked.",
      warnings: ["binary-content-blocked"],
    });
  }
  if (allowlist.size > 0 && !allowlist.has(contentTypeBase)) {
    return classification("unsupported", contentTypeBase, {
      supported: false,
      bodyExtractionAllowed: false,
      reason: "Content type is not in the explicit public read-only allowlist.",
      warnings: ["content-type-unsupported"],
    });
  }
  if (contentTypeBase === "text/html" || contentTypeBase === "application/xhtml+xml") {
    return classification("html", contentTypeBase, {
      supported: true,
      bodyExtractionAllowed: true,
      reason: "HTML content can be normalized into safe title, headings, snippets, and links.",
    });
  }
  if (contentTypeBase === "text/plain" || contentTypeBase === "text/markdown") {
    return classification("plain-text", contentTypeBase, {
      supported: true,
      bodyExtractionAllowed: true,
      reason: "Plain text content can be normalized into safe snippets.",
    });
  }
  if (contentTypeBase === "application/json" || contentTypeBase.endsWith("+json")) {
    return classification("json-summary", contentTypeBase, {
      supported: true,
      bodyExtractionAllowed: true,
      reason: "JSON content can be summarized without exposing raw objects.",
    });
  }
  return classification("unsupported", contentTypeBase, {
    supported: false,
    bodyExtractionAllowed: false,
    reason: "Content type is unsupported for public read-only extraction.",
    warnings: ["content-type-unsupported"],
  });
}

export function normalizeContentTypeBase(contentType: string | undefined): string {
  return sanitizeBrowserText(contentType?.split(";")[0]?.trim().toLowerCase() || "unknown", 120);
}

function classification(
  contentClass: BrowserReadOnlyContentClass,
  contentTypeBase: string,
  input: {
    readonly supported: boolean;
    readonly bodyExtractionAllowed: boolean;
    readonly reason: string;
    readonly warnings?: readonly string[];
    readonly redactions?: readonly string[];
  },
): BrowserReadOnlyContentTypeClassification {
  return {
    contentClass,
    contentTypeBase,
    supported: input.supported,
    bodyExtractionAllowed: input.bodyExtractionAllowed,
    reason: sanitizeBrowserText(input.reason, 180),
    warnings: unique(input.warnings ?? []),
    redactions: unique(input.redactions ?? []),
    evidence: [
      "browser-readonly-content-type:classified",
      `browser-readonly-content-type:${contentClass}`,
      input.supported ? "browser-readonly-content-type:supported" : "browser-readonly-content-type:not-supported",
      input.bodyExtractionAllowed
        ? "browser-readonly-content-type:body-extraction-allowed"
        : "browser-readonly-content-type:body-extraction-blocked",
    ],
  };
}

function isBinaryContentType(contentTypeBase: string): boolean {
  return BINARY_CONTENT_TYPES.some((item) => item.endsWith("/")
    ? contentTypeBase.startsWith(item)
    : contentTypeBase === item);
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import {
  classifyBrowserReadOnlyContentType,
  type BrowserReadOnlyContentTypeClassification,
} from "./browserReadOnlyContentType.js";
import {
  normalizeBrowserReadOnlyContent,
  type BrowserReadOnlyContentNormalization,
} from "./browserReadOnlyContentNormalizer.js";

export type BrowserReadOnlyExtractionCompleteness =
  | "complete"
  | "partial"
  | "head-no-body"
  | "unsupported"
  | "blocked"
  | "over-budget";

export interface BrowserReadOnlyLinkSummary {
  readonly text: string;
  readonly hrefSummary: string;
  readonly sameOrigin: boolean;
}

export interface BrowserReadOnlyExtraction {
  readonly contentType: BrowserReadOnlyContentTypeClassification;
  readonly normalized: BrowserReadOnlyContentNormalization;
  readonly title?: string;
  readonly canonicalUrlSummary?: string;
  readonly metaDescription?: string;
  readonly headings: readonly string[];
  readonly mainTextCandidates: readonly string[];
  readonly safeSnippets: readonly string[];
  readonly links: readonly BrowserReadOnlyLinkSummary[];
  readonly completeness: BrowserReadOnlyExtractionCompleteness;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}

export function createBrowserReadOnlyExtraction(input: {
  readonly method: "GET" | "HEAD";
  readonly finalOrigin: string;
  readonly contentType?: string;
  readonly contentTypeAllowlist?: readonly string[];
  readonly body?: string;
  readonly bodyBytes: number;
  readonly responseByteBudget: number;
  readonly redirectOrigins?: readonly string[];
  readonly warnings?: readonly string[];
  readonly redactions?: readonly string[];
}): BrowserReadOnlyExtraction {
  const contentType = classifyBrowserReadOnlyContentType({
    contentType: input.contentType,
    contentTypeAllowlist: input.contentTypeAllowlist,
    bodyBytes: input.bodyBytes,
    responseByteBudget: input.responseByteBudget,
  });
  if (input.method === "HEAD") {
    return extraction({
      contentType,
      normalized: {
        normalizedText: "HEAD response body excluded.",
        truncated: false,
        warnings: [],
        redactions: [],
        evidence: ["browser-readonly-extraction:head-no-body"],
      },
      completeness: "head-no-body",
      warnings: ["head-no-body-extraction"],
      redactions: input.redactions ?? [],
      evidence: ["browser-readonly-extraction:created", "browser-readonly-extraction:head-no-body"],
    });
  }
  const normalized = normalizeBrowserReadOnlyContent({
    body: input.body,
    byteBudget: input.responseByteBudget,
    contentType,
  });
  const html = input.body ?? "";
  const metadata = contentType.contentClass === "html" ? extractHtmlMetadata(html, input.finalOrigin) : {};
  const headings = contentType.contentClass === "html" ? extractHeadings(html) : [];
  const links = contentType.contentClass === "html" ? extractLinks(html, input.finalOrigin, 6) : [];
  const snippets = createSnippets(normalized.normalizedText, 3, 180);
  const completeness = contentType.contentClass === "over-budget"
    ? "over-budget"
    : !contentType.supported
      ? contentType.contentClass === "binary-blocked" ? "blocked" : "unsupported"
      : normalized.truncated
        ? "partial"
        : "complete";
  return extraction({
    contentType,
    normalized,
    title: metadata.title,
    canonicalUrlSummary: metadata.canonicalUrlSummary,
    metaDescription: metadata.metaDescription,
    headings,
    mainTextCandidates: snippets.slice(0, 2),
    safeSnippets: snippets,
    links,
    completeness,
    warnings: unique([
      ...(input.warnings ?? []),
      ...contentType.warnings,
      ...normalized.warnings,
      ...(links.length >= 6 ? ["link-summary-budget-reached"] : []),
    ]),
    redactions: unique([...(input.redactions ?? []), ...contentType.redactions, ...normalized.redactions]),
    evidence: [
      ...contentType.evidence,
      ...normalized.evidence,
      "browser-readonly-extraction:created",
      "browser-readonly-extraction:no-crawl",
      "browser-readonly-extraction:no-link-fetch",
      "browser-readonly-extraction:bounded-snippets-only",
    ],
  });
}

function extractHtmlMetadata(
  html: string,
  finalOrigin: string,
): Pick<BrowserReadOnlyExtraction, "title" | "canonicalUrlSummary" | "metaDescription"> {
  const title = matchContent(html, /<title[^>]*>([\s\S]*?)<\/title>/i, 120);
  const canonicalHref = matchAttribute(html, /<link\b[^>]*rel=["']?canonical["']?[^>]*>/i, "href");
  const descriptionTag = html.match(/<meta\b[^>]*(?:name|property)=["']?(?:description|og:description)["']?[^>]*>/i)?.[0];
  return {
    title,
    canonicalUrlSummary: canonicalHref ? safeUrlSummary(canonicalHref, finalOrigin) : undefined,
    metaDescription: descriptionTag ? sanitizeBrowserText(decodeEntities(attribute(descriptionTag, "content") ?? ""), 180) : undefined,
  };
}

function extractHeadings(html: string): readonly string[] {
  const headings: string[] = [];
  const pattern = /<h[1-3]\b[^>]*>([\s\S]*?)<\/h[1-3]>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && headings.length < 6) {
    const text = htmlText(match[1] ?? "", 140);
    if (text) {
      headings.push(text);
    }
  }
  return unique(headings);
}

function extractLinks(
  html: string,
  finalOrigin: string,
  limit: number,
): readonly BrowserReadOnlyLinkSummary[] {
  const links: BrowserReadOnlyLinkSummary[] = [];
  const pattern = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) && links.length < limit) {
    const href = match[1] ?? "";
    const text = htmlText(match[2] ?? "", 80) || "untitled link";
    const summary = safeUrlSummary(href, finalOrigin);
    if (summary) {
      links.push({
        text,
        hrefSummary: summary,
        sameOrigin: summary.startsWith(finalOrigin),
      });
    }
  }
  return links;
}

function createSnippets(value: string, limit: number, maxLength: number): readonly string[] {
  return unique(value
    .split(/(?<=[.!?])\s+|\n+/)
    .map((item) => sanitizeBrowserText(item, maxLength))
    .filter((item) => item.length >= 24)
    .slice(0, limit));
}

function matchContent(html: string, pattern: RegExp, maxLength: number): string | undefined {
  const match = html.match(pattern)?.[1];
  return match ? htmlText(match, maxLength) : undefined;
}

function matchAttribute(html: string, pattern: RegExp, name: string): string | undefined {
  const tag = html.match(pattern)?.[0];
  return tag ? attribute(tag, name) : undefined;
}

function attribute(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, "i"));
  return match?.[1];
}

function htmlText(value: string, maxLength: number): string {
  return sanitizeBrowserText(decodeEntities(value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()), maxLength);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;/gi, "'");
}

function safeUrlSummary(value: string, finalOrigin: string): string {
  if (/^(javascript|data|mailto):/i.test(value)) {
    return "";
  }
  try {
    const url = new URL(value, finalOrigin);
    if (url.username || url.password) {
      return `${url.origin}/[REDACTED_URL_CREDENTIALS]`;
    }
    return sanitizeBrowserText(`${url.origin}${url.pathname}`, 180);
  } catch {
    return sanitizeBrowserText(`relative:${value.split("?")[0]?.slice(0, 120) ?? ""}`, 180);
  }
}

function extraction(input: {
  readonly contentType: BrowserReadOnlyContentTypeClassification;
  readonly normalized: BrowserReadOnlyContentNormalization;
  readonly title?: string;
  readonly canonicalUrlSummary?: string;
  readonly metaDescription?: string;
  readonly headings?: readonly string[];
  readonly mainTextCandidates?: readonly string[];
  readonly safeSnippets?: readonly string[];
  readonly links?: readonly BrowserReadOnlyLinkSummary[];
  readonly completeness: BrowserReadOnlyExtractionCompleteness;
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly evidence: readonly string[];
}): BrowserReadOnlyExtraction {
  return {
    contentType: input.contentType,
    normalized: input.normalized,
    title: input.title,
    canonicalUrlSummary: input.canonicalUrlSummary,
    metaDescription: input.metaDescription,
    headings: input.headings ?? [],
    mainTextCandidates: input.mainTextCandidates ?? [],
    safeSnippets: input.safeSnippets ?? [],
    links: input.links ?? [],
    completeness: input.completeness,
    warnings: unique(input.warnings),
    redactions: unique(input.redactions),
    evidence: unique(input.evidence),
  };
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

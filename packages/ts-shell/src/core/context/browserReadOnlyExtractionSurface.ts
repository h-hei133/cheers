import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserReadOnlyRankedEvidence } from "./browserReadOnlyEvidenceRanking.js";
import type { BrowserReadOnlyExtractionQuality } from "./browserReadOnlyExtractionQuality.js";
import type { BrowserReadOnlyExtraction } from "./browserReadOnlyExtractionModel.js";

export interface BrowserReadOnlyExtractionSurface {
  readonly title: string;
  readonly origin: string;
  readonly contentType: string;
  readonly contentClass: string;
  readonly qualityStatus: BrowserReadOnlyExtractionQuality["status"];
  readonly qualityScore: number;
  readonly topSnippets: readonly string[];
  readonly safeLinks: readonly string[];
  readonly warnings: readonly string[];
  readonly redactions: readonly string[];
  readonly summary: string;
  readonly evidence: readonly string[];
}

export function createBrowserReadOnlyExtractionSurface(input: {
  readonly extraction: BrowserReadOnlyExtraction;
  readonly quality: BrowserReadOnlyExtractionQuality;
  readonly rankedEvidence: readonly BrowserReadOnlyRankedEvidence[];
  readonly origin: string;
}): BrowserReadOnlyExtractionSurface {
  const topSnippets = input.rankedEvidence
    .filter((item) => item.kind === "heading" || item.kind === "snippet" || item.kind === "meta")
    .map((item) => item.text)
    .slice(0, 4);
  const safeLinks = input.extraction.links
    .map((link) => `${link.text} -> ${link.hrefSummary}`)
    .slice(0, 4)
    .map((item) => safe(item, 180));
  const title = input.extraction.title ?? "none";
  const summary = input.extraction.completeness === "head-no-body"
    ? "HEAD response body excluded; no body extraction attempted."
    : topSnippets[0] ?? input.quality.reasons[0] ?? input.extraction.contentType.reason;
  return {
    title: safe(title, 120),
    origin: safe(input.origin, 180),
    contentType: safe(input.extraction.contentType.contentTypeBase, 120),
    contentClass: input.extraction.contentType.contentClass,
    qualityStatus: input.quality.status,
    qualityScore: input.quality.score,
    topSnippets,
    safeLinks,
    warnings: input.extraction.warnings,
    redactions: input.extraction.redactions,
    summary: safe(summary, 240),
    evidence: [
      "browser-readonly-extraction-surface:created",
      "browser-readonly-extraction-surface:no-browser-js-crawl-auth-writes",
      "browser-readonly-extraction-surface:raw-body-excluded",
    ],
  };
}

export function renderBrowserReadOnlyExtractionSurface(
  surface: BrowserReadOnlyExtractionSurface,
): string {
  return [
    "Public read-only extraction",
    `- Page title: ${safe(surface.title)}`,
    `- Origin: ${safe(surface.origin)}`,
    `- Content type: ${safe(surface.contentType)} (${surface.contentClass})`,
    `- Extraction quality: ${surface.qualityStatus} (${surface.qualityScore}/100)`,
    `- Top snippets: ${surface.topSnippets.length ? surface.topSnippets.map((item) => safe(item, 160)).join(" | ") : "none"}`,
    `- Safe links: ${surface.safeLinks.length ? surface.safeLinks.map((item) => safe(item, 140)).join(" | ") : "none"}`,
    `- Redactions/warnings: ${[...surface.redactions, ...surface.warnings].length ? [...surface.redactions, ...surface.warnings].map((item) => safe(item)).join(", ") : "none"}`,
    "- Not done: browser launch, JavaScript, crawling, auth/cookies, write action.",
    "- Next action: Use these ranked, sanitized snippets only; fetch linked pages only after a separate explicit route allows it.",
  ].join("\n");
}

function safe(value: string, maxLength = 180): string {
  return sanitizeBrowserText(value.replace(/\s+/g, " "), maxLength);
}

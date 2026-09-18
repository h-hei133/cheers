import { sanitizeBrowserText } from "./browserCapabilityModel.js";
import type { BrowserReadOnlyExtractionQuality } from "./browserReadOnlyExtractionQuality.js";
import type { BrowserReadOnlyExtraction } from "./browserReadOnlyExtractionModel.js";

export type BrowserReadOnlyRankedEvidenceKind =
  | "title"
  | "meta"
  | "heading"
  | "snippet"
  | "link"
  | "warning"
  | "redaction";

export interface BrowserReadOnlyRankedEvidence {
  readonly kind: BrowserReadOnlyRankedEvidenceKind;
  readonly rank: number;
  readonly text: string;
  readonly evidence: readonly string[];
}

export function rankBrowserReadOnlyEvidence(input: {
  readonly extraction: BrowserReadOnlyExtraction;
  readonly quality: BrowserReadOnlyExtractionQuality;
  readonly limit?: number;
}): readonly BrowserReadOnlyRankedEvidence[] {
  const rows: BrowserReadOnlyRankedEvidence[] = [];
  let rank = 1;
  const add = (kind: BrowserReadOnlyRankedEvidenceKind, text: string) => {
    if (text.trim()) {
      rows.push({
        kind,
        rank: rank++,
        text: sanitizeBrowserText(text, 220),
        evidence: [
          "browser-readonly-evidence-ranking:ranked",
          `browser-readonly-evidence-ranking:${kind}`,
        ],
      });
    }
  };
  add("title", input.extraction.title ?? "");
  add("meta", input.extraction.metaDescription ?? "");
  for (const heading of input.extraction.headings.slice(0, 3)) {
    add("heading", heading);
  }
  for (const snippet of input.extraction.safeSnippets.slice(0, 3)) {
    add("snippet", snippet);
  }
  for (const link of input.extraction.links.slice(0, 4)) {
    add("link", `${link.text} -> ${link.hrefSummary}`);
  }
  for (const warning of input.extraction.warnings.slice(0, 4)) {
    add("warning", warning);
  }
  for (const redaction of input.extraction.redactions.slice(0, 4)) {
    add("redaction", redaction);
  }
  if (rows.length === 0 && input.quality.status !== "high" && input.quality.status !== "medium") {
    add("warning", input.quality.reasons[0] ?? "no extractable public read-only content");
  }
  return rows.slice(0, input.limit ?? 8);
}

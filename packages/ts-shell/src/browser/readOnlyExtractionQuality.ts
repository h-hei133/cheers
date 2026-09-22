import type { BrowserReadOnlyExtraction } from "./readOnlyExtractionModel.js";

export type BrowserReadOnlyExtractionQualityStatus =
  | "high"
  | "medium"
  | "low"
  | "blocked"
  | "unsupported";

export interface BrowserReadOnlyExtractionQuality {
  readonly status: BrowserReadOnlyExtractionQualityStatus;
  readonly score: number;
  readonly confidence: "high" | "medium" | "low" | "none";
  readonly reasons: readonly string[];
  readonly evidence: readonly string[];
}

export function scoreBrowserReadOnlyExtractionQuality(input: {
  readonly extraction: BrowserReadOnlyExtraction;
  readonly finalOrigin: string;
  readonly redirectOrigins?: readonly string[];
}): BrowserReadOnlyExtractionQuality {
  const extraction = input.extraction;
  if (extraction.completeness === "blocked" || extraction.contentType.contentClass === "binary-blocked") {
    return quality("blocked", 0, "none", ["binary or unsafe content blocked"]);
  }
  if (extraction.completeness === "unsupported") {
    return quality("unsupported", 0, "none", ["content type unsupported"]);
  }
  if (extraction.completeness === "over-budget") {
    return quality("blocked", 5, "none", ["response exceeded byte budget"]);
  }
  if (extraction.completeness === "head-no-body") {
    return quality("low", 15, "low", ["HEAD response has no body extraction"]);
  }
  let score = 20;
  const reasons: string[] = ["supported content type"];
  if (extraction.title) {
    score += 20;
    reasons.push("title present");
  }
  if (extraction.headings.length > 0) {
    score += 15;
    reasons.push("heading evidence present");
  }
  if (extraction.safeSnippets.some((item) => item.length >= 80)) {
    score += 20;
    reasons.push("meaningful safe snippet present");
  }
  if (extraction.metaDescription) {
    score += 8;
    reasons.push("meta description present");
  }
  if (extraction.links.length > 0) {
    score += 5;
    reasons.push("safe link summaries present");
  }
  if (extraction.completeness === "partial") {
    score -= 20;
    reasons.push("body truncated to budget");
  }
  if (extraction.redactions.length > 0) {
    score -= Math.min(20, extraction.redactions.length * 8);
    reasons.push("redactions applied");
  }
  if ((input.redirectOrigins ?? []).some((origin) => origin !== input.finalOrigin)) {
    score -= 10;
    reasons.push("redirect origin changed");
  } else if ((input.redirectOrigins ?? []).length > 0) {
    reasons.push("redirect stayed within allowed origin");
  }
  const boundedScore = Math.max(0, Math.min(100, score));
  if (boundedScore >= 75) {
    return quality("high", boundedScore, "high", reasons);
  }
  if (boundedScore >= 45) {
    return quality("medium", boundedScore, "medium", reasons);
  }
  return quality("low", boundedScore, "low", reasons);
}

function quality(
  status: BrowserReadOnlyExtractionQualityStatus,
  score: number,
  confidence: BrowserReadOnlyExtractionQuality["confidence"],
  reasons: readonly string[],
): BrowserReadOnlyExtractionQuality {
  return {
    status,
    score,
    confidence,
    reasons,
    evidence: [
      "browser-readonly-extraction-quality:scored",
      `browser-readonly-extraction-quality:${status}`,
    ],
  };
}

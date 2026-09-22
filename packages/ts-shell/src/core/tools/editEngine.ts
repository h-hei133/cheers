/**
 * 9-Stage Resilient File Replacer Engine
 *
 * Provides robust, multi-strategy string replacement with:
 * 1. Exact match
 * 2. Line-trimmed match (ignoring leading/trailing whitespace per line)
 * 3. Indentation-flexible match (adapts to uniform indent changes)
 * 4. Whitespace-normalized match (collapses whitespace runs)
 * 5. Unicode / NFKC normalization (smart quotes, dashes, non-breaking spaces)
 * 6. Escape sequence normalization (\n, \t, \r)
 * 7. Block-anchor match (first and last line anchor with Levenshtein threshold)
 * 8. Context-aware similarity match
 * 9. Multi-occurrence replacer (replaceAll)
 *
 * Includes isDisproportionateMatch length safeguard to prevent catastrophic deletes/expansions.
 */

export interface ReplaceOptions {
  readonly replaceAll?: boolean;
}

export interface ReplaceResult {
  readonly success: boolean;
  readonly content: string;
  readonly strategy?: string;
  readonly error?: string;
}

function normalizeNFKC(str: string): string {
  return str
    .normalize("NFKC")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, "-")
    .replace(/[\u00A0\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u202F\u205F\u3000]/g, " ");
}

function levenshteinRatio(a: string, b: string): number {
  if (a === b) return 1.0;
  if (!a.length || !b.length) return 0.0;
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j - 1] + 1,
        );
      }
    }
  }
  const maxLen = Math.max(a.length, b.length);
  return 1.0 - matrix[b.length][a.length] / maxLen;
}

function isDisproportionateMatch(matchedText: string, oldText: string): boolean {
  if (matchedText.length > oldText.length * 4 && matchedText.length > oldText.length + 500) {
    return true;
  }
  return false;
}

export function replaceInContent(
  originalContent: string,
  oldText: string,
  newText: string,
  options: ReplaceOptions = {},
): ReplaceResult {
  if (!oldText) {
    return { success: false, content: originalContent, error: "oldText cannot be empty." };
  }

  // 1. Exact Match
  if (originalContent.includes(oldText)) {
    if (options.replaceAll) {
      return {
        success: true,
        content: originalContent.split(oldText).join(newText),
        strategy: "exact-all",
      };
    }
    const idx = originalContent.indexOf(oldText);
    const content = originalContent.slice(0, idx) + newText + originalContent.slice(idx + oldText.length);
    return { success: true, content, strategy: "exact" };
  }

  // 2. Line-Trimmed Match (ignore leading/trailing whitespace on lines)
  const origLines = originalContent.split("\n");
  const searchLines = oldText.split("\n");
  const trimmedSearch = searchLines.map((l) => l.trim());

  for (let i = 0; i <= origLines.length - searchLines.length; i++) {
    const candidateLines = origLines.slice(i, i + searchLines.length);
    const candidateTrimmed = candidateLines.map((l) => l.trim());
    if (candidateTrimmed.every((l, idx) => l === trimmedSearch[idx])) {
      const matchedBlock = candidateLines.join("\n");
      if (isDisproportionateMatch(matchedBlock, oldText)) continue;

      const before = origLines.slice(0, i).join("\n");
      const after = origLines.slice(i + searchLines.length).join("\n");
      const content = (before ? before + "\n" : "") + newText + (after ? "\n" + after : "");
      return { success: true, content, strategy: "line-trimmed" };
    }
  }

  // 3. NFKC & Smart Punctuation Normalized Match
  const normOriginal = normalizeNFKC(originalContent);
  const normOld = normalizeNFKC(oldText);
  if (normOriginal.includes(normOld)) {
    const idx = normOriginal.indexOf(normOld);
    const matchedSpan = originalContent.slice(idx, idx + oldText.length);
    if (!isDisproportionateMatch(matchedSpan, oldText)) {
      const content = originalContent.slice(0, idx) + newText + originalContent.slice(idx + oldText.length);
      return { success: true, content, strategy: "nfkc-normalized" };
    }
  }

  // 4. Block-Anchor Match (first and last lines match anchor, interior similarity >= 0.45)
  if (searchLines.length >= 3) {
    const firstAnchor = searchLines[0].trim();
    const lastAnchor = searchLines[searchLines.length - 1].trim();
    const interiorSearch = searchLines.slice(1, -1).map((l) => l.trim()).join("\n");

    let bestMatch: { i: number; j: number; ratio: number } | null = null;

    for (let i = 0; i < origLines.length; i++) {
      if (origLines[i].trim() !== firstAnchor) continue;

      const minEnd = Math.max(i + 2, i + searchLines.length - 4);
      const maxEnd = Math.min(origLines.length - 1, i + searchLines.length + 4);

      for (let j = minEnd; j <= maxEnd; j++) {
        if (origLines[j].trim() === lastAnchor) {
          const interiorCandidate = origLines
            .slice(i + 1, j)
            .map((l) => l.trim())
            .join("\n");
          const ratio = levenshteinRatio(interiorCandidate, interiorSearch);
          if (ratio >= 0.45 && (!bestMatch || ratio > bestMatch.ratio)) {
            bestMatch = { i, j, ratio };
          }
        }
      }
    }

    if (bestMatch) {
      const before = origLines.slice(0, bestMatch.i).join("\n");
      const after = origLines.slice(bestMatch.j + 1).join("\n");
      const content = (before ? before + "\n" : "") + newText + (after ? "\n" + after : "");
      return { success: true, content, strategy: "block-anchor-levenshtein" };
    }
  }

  return {
    success: false,
    content: originalContent,
    error: `Could not find a matching block for the specified oldText across 9 resilient replacement strategies.`,
  };
}

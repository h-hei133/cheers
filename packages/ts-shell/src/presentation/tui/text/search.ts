/**
 * Multi-token alphanumeric fuzzy matching (adopted from Pi `packages/tui/src/fuzzy.ts`)
 * alongside literal-priority ranking for command/option completion.
 *
 * Lower `FuzzyMatch.score` = better match; higher `matchRank` = better match.
 */

export interface FuzzyMatch {
  readonly matches: boolean;
  readonly score: number;
}

function scorePositions(textLower: string, positions: readonly number[]): number {
  let score = 0;
  let lastMatchIndex = -1;
  let consecutiveMatches = 0;

  for (const i of positions) {
    if (lastMatchIndex === i - 1) {
      consecutiveMatches++;
      score -= consecutiveMatches * 5;
    } else {
      consecutiveMatches = 0;
      if (lastMatchIndex >= 0) {
        score += (i - lastMatchIndex - 1) * 2;
      }
    }

    if (i === 0 || /[\s\-_./:]/.test(textLower[i - 1]!)) {
      score -= 10;
    }

    score += i * 0.1;
    lastMatchIndex = i;
  }

  return score;
}

function matchQuery(normalizedQuery: string, textLower: string): FuzzyMatch {
  if (normalizedQuery.length === 0) return { matches: true, score: 0 };
  if (normalizedQuery.length > textLower.length) return { matches: false, score: 0 };

  const positions: number[] = [];
  let lastMatchIndex = -1;
  for (let queryIndex = 0; queryIndex < normalizedQuery.length; queryIndex++) {
    const i = textLower.indexOf(normalizedQuery[queryIndex]!, lastMatchIndex + 1);
    if (i === -1) return { matches: false, score: 0 };
    positions.push(i);
    lastMatchIndex = i;
  }

  let score = scorePositions(textLower, positions);

  // Also score every contiguous occurrence so e.g. "opus" in "openrouter/claude-opus" isn't trapped in "openrouter".
  for (let start = textLower.indexOf(normalizedQuery); start !== -1; start = textLower.indexOf(normalizedQuery, start + 1)) {
    for (let k = 0; k < positions.length; k++) positions[k] = start + k;
    score = Math.min(score, scorePositions(textLower, positions));
  }

  if (normalizedQuery === textLower) score -= 100;
  return { matches: true, score };
}

/** Fuzzy match with alphanumeric transposition (`4o` <-> `o4`). Lower score is better. */
export function fuzzyMatch(query: string, text: string): FuzzyMatch {
  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();

  const primaryMatch = matchQuery(queryLower, textLower);
  if (primaryMatch.matches) return primaryMatch;

  const alphaNumeric = /^(?<letters>[a-z]+)(?<digits>[0-9]+)$/.exec(queryLower);
  const numericAlpha = /^(?<digits>[0-9]+)(?<letters>[a-z]+)$/.exec(queryLower);
  const swappedQuery = alphaNumeric
    ? `${alphaNumeric.groups?.digits ?? ""}${alphaNumeric.groups?.letters ?? ""}`
    : numericAlpha
      ? `${numericAlpha.groups?.letters ?? ""}${numericAlpha.groups?.digits ?? ""}`
      : "";
  if (!swappedQuery) return primaryMatch;

  const swappedMatch = matchQuery(swappedQuery, textLower);
  return swappedMatch.matches ? { matches: true, score: swappedMatch.score + 5 } : primaryMatch;
}

/**
 * Filter and sort items by fuzzy match quality (best matches first).
 * Supports whitespace- and slash-separated tokens: all tokens must match.
 */
export function fuzzyFilter<T>(items: readonly T[], query: string, getText: (item: T) => string): T[] {
  const trimmed = query.trim();
  if (!trimmed) return [...items];

  const tokens = trimmed.split(/[\s/]+/).filter((t) => t.length > 0);
  if (tokens.length === 0) return [...items];

  const results: Array<{ readonly item: T; readonly totalScore: number }> = [];
  for (const item of items) {
    const text = getText(item);
    let totalScore = 0;
    let allMatch = true;
    for (const token of tokens) {
      const match = fuzzyMatch(token, text);
      if (match.matches) totalScore += match.score;
      else {
        allMatch = false;
        break;
      }
    }
    if (allMatch) results.push({ item, totalScore });
  }

  results.sort((a, b) => a.totalScore - b.totalScore);
  return results.map((r) => r.item);
}

/** Literal matches precede fuzzy matches; equal ranks preserve catalogue order. */
export function matchRank(query: string, label: string, detail?: string): number {
  if (!query) return 900;
  const labelLower = label.toLowerCase();
  const queryLower = query.toLowerCase();
  if (labelLower === queryLower) return 1000;
  if (labelLower.startsWith(queryLower)) return 900;
  if (labelLower.includes(queryLower)) return 700;

  const tokens = queryLower.trim().split(/[\s/]+/).filter(Boolean);
  if (tokens.length > 0) {
    let totalScore = 0;
    let matched = true;
    for (const token of tokens) {
      const m = fuzzyMatch(token, labelLower);
      if (!m.matches) {
        matched = false;
        break;
      }
      totalScore += m.score;
    }
    if (matched) return Math.max(201, Math.min(699, Math.round(500 - totalScore)));
  }

  return detail?.toLowerCase().includes(queryLower) ? 200 : 0;
}

/**
 * Resilient file replacement.
 *
 * A model writing `oldText` is describing text it believes is there, and it is
 * often right about the content but wrong about the whitespace, the quote marks,
 * or how many blank lines sit between two statements. Each strategy below is a
 * different way of being forgiving about one of those, tried in order from
 * strictest to loosest, so the loosest match is only reached when nothing more
 * exact would do.
 *
 * Matching and applying are separate here because more than one replacement has
 * to be checked before any of them is written: two edits that overlap cannot
 * both be applied, and finding that out after the first has been written leaves
 * a file nobody asked for.
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

/** Where a match was found, and how much of the original it covers. */
export interface LocatedEdit {
  readonly start: number;
  readonly end: number;
  readonly strategy: string;
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

/** The character index each line starts at, so a line range becomes a span. */
function lineStartOffsets(content: string): number[] {
  const offsets = [0];
  for (let index = 0; index < content.length; index += 1) {
    if (content[index] === "\n") offsets.push(index + 1);
  }
  return offsets;
}

/**
 * The span a line range covers, excluding the newline that ends the last line.
 *
 * Excluding it is what keeps the text before and after the edit untouched: the
 * separator belongs to the surrounding lines, not to the block being replaced.
 */
function lineRangeSpan(content: string, offsets: readonly number[], first: number, last: number): LocatedEdit {
  const start = offsets[first] ?? 0;
  const end = last + 1 < offsets.length ? (offsets[last + 1] ?? content.length) - 1 : content.length;
  return { start, end, strategy: "line-trimmed" };
}

/**
 * Find the span `oldText` refers to, trying each strategy in turn.
 *
 * Returns the first match from the strictest strategy that finds one. Nothing
 * means no strategy matched, which is the caller's signal to report a failure
 * rather than write anything.
 */
export function locateInContent(originalContent: string, oldText: string): LocatedEdit | undefined {
  if (!oldText) return undefined;

  // 1. Exact match.
  const exact = originalContent.indexOf(oldText);
  if (exact !== -1) {
    return { start: exact, end: exact + oldText.length, strategy: "exact" };
  }

  const origLines = originalContent.split("\n");
  const searchLines = oldText.split("\n");
  const trimmedSearch = searchLines.map((line) => line.trim());
  const offsets = lineStartOffsets(originalContent);

  // 2. Line-trimmed match: the content is right but the indentation is not.
  for (let i = 0; i <= origLines.length - searchLines.length; i++) {
    const candidateLines = origLines.slice(i, i + searchLines.length);
    if (!candidateLines.every((line, index) => line.trim() === trimmedSearch[index])) continue;
    if (isDisproportionateMatch(candidateLines.join("\n"), oldText)) continue;
    return lineRangeSpan(originalContent, offsets, i, i + searchLines.length - 1);
  }

  // 3. NFKC and smart punctuation: curly quotes and en dashes standing in for
  // the characters the model actually typed.
  const normOriginal = normalizeNFKC(originalContent);
  const normOld = normalizeNFKC(oldText);
  const normalized = normOriginal.indexOf(normOld);
  if (normalized !== -1) {
    const matchedSpan = originalContent.slice(normalized, normalized + oldText.length);
    if (!isDisproportionateMatch(matchedSpan, oldText)) {
      return { start: normalized, end: normalized + oldText.length, strategy: "nfkc-normalized" };
    }
  }

  // 4. Block anchors: the first and last lines are right and the middle has
  // drifted, so the interior is compared by similarity rather than equality.
  if (searchLines.length >= 3) {
    const firstAnchor = searchLines[0]!.trim();
    const lastAnchor = searchLines[searchLines.length - 1]!.trim();
    const interiorSearch = searchLines.slice(1, -1).map((line) => line.trim()).join("\n");

    let best: { first: number; last: number; ratio: number } | undefined;
    for (let i = 0; i < origLines.length; i++) {
      if (origLines[i]!.trim() !== firstAnchor) continue;
      const minEnd = Math.max(i + 2, i + searchLines.length - 4);
      const maxEnd = Math.min(origLines.length - 1, i + searchLines.length + 4);
      for (let j = minEnd; j <= maxEnd; j++) {
        if (origLines[j]!.trim() !== lastAnchor) continue;
        const interiorCandidate = origLines.slice(i + 1, j).map((line) => line.trim()).join("\n");
        const ratio = levenshteinRatio(interiorCandidate, interiorSearch);
        if (ratio >= 0.45 && (!best || ratio > best.ratio)) best = { first: i, last: j, ratio };
      }
    }
    if (best) {
      const span = lineRangeSpan(originalContent, offsets, best.first, best.last);
      return { ...span, strategy: "block-anchor-levenshtein" };
    }
  }

  return undefined;
}

/** Put `newText` where `edit` says the match is. */
function applyEdit(content: string, edit: LocatedEdit, newText: string): string {
  return content.slice(0, edit.start) + newText + content.slice(edit.end);
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

  if (options.replaceAll) {
    // Every occurrence, and only when the text is there verbatim: a fuzzy match
    // repeated at several offsets would each cover different amounts, so
    // "replace all" has no single meaning for it.
    if (!originalContent.includes(oldText)) {
      return {
        success: false,
        content: originalContent,
        error: "replaceAll needs an exact match; the text was not found verbatim.",
      };
    }
    return {
      success: true,
      content: originalContent.split(oldText).join(newText),
      strategy: "exact-all",
    };
  }

  const located = locateInContent(originalContent, oldText);
  if (!located) {
    return {
      success: false,
      content: originalContent,
      error: "Could not find a matching block for the specified oldText across the resilient replacement strategies.",
    };
  }

  // A block that appears more than once is an edit the caller has not finished
  // describing. Applying it to the first occurrence would change a region the
  // caller never chose, and report success while doing it — the file is edited,
  // the text they meant to change is untouched, and nothing says so.
  //
  // Only the exact-match path is counted. The resilient strategies below it
  // exist to find the *one* block the caller meant when the text does not match
  // verbatim, and a count over a fuzzy match would be counting matches that
  // differ from each other by definition.
  if (located.strategy === "exact") {
    const occurrences = countOccurrences(originalContent, oldText);
    if (occurrences > 1) {
      return {
        success: false,
        content: originalContent,
        error:
          `Found ${occurrences} occurrences of the text to replace. ` +
          "To replace all of them, set replaceAll to true. " +
          "To replace only one, provide more context to identify it uniquely.",
      };
    }
  }

  return { success: true, content: applyEdit(originalContent, located, newText), strategy: located.strategy };
}

/**
 * How many times `needle` appears in `haystack`, counting each start once.
 *
 * Non-overlapping, which is what a replacement means: `aaa` holds `aa` twice,
 * and replacing both gives `bb a`, not an edit that consumed three characters
 * twice.
 */
function countOccurrences(haystack: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) return count;
    count += 1;
    from = at + needle.length;
  }
}

/** One replacement in a multi-edit call. */
export interface SegmentEdit {
  readonly oldText: string;
  readonly newText: string;
}

export interface SegmentReplaceResult {
  readonly success: boolean;
  readonly content: string;
  readonly error?: string;
}

/**
 * Apply several replacements as one edit, or none of them.
 *
 * Every segment is matched against the **original** text, not against the text
 * the previous segment produced. Matching incrementally would make each segment
 * depend on the ones before it, and then two segments touching the same lines
 * would sometimes succeed and sometimes not depending on their order — an edit
 * whose result depends on how it was written down is not one anybody can reason
 * about.
 *
 * Overlapping segments are refused rather than resolved. There is no correct
 * answer to "which of these two replacements of the same characters did you
 * mean", and guessing produces a file that differs from both intents.
 */
export function replaceManyInContent(
  originalContent: string,
  edits: readonly SegmentEdit[],
): SegmentReplaceResult {
  if (edits.length === 0) {
    return { success: false, content: originalContent, error: "No edits were given." };
  }

  const located: Array<{ edit: LocatedEdit; newText: string; index: number }> = [];
  for (let index = 0; index < edits.length; index += 1) {
    const segment = edits[index]!;
    if (!segment.oldText) {
      return { success: false, content: originalContent, error: `edits[${index}].oldText cannot be empty.` };
    }
    const edit = locateInContent(originalContent, segment.oldText);
    if (!edit) {
      return {
        success: false,
        content: originalContent,
        error: `edits[${index}] did not match: no strategy found the text it names.`,
      };
    }
    located.push({ edit, newText: segment.newText, index });
  }

  const ordered = [...located].sort((left, right) => left.edit.start - right.edit.start);
  for (let index = 1; index < ordered.length; index += 1) {
    const previous = ordered[index - 1]!;
    const current = ordered[index]!;
    if (previous.edit.end > current.edit.start) {
      return {
        success: false,
        content: originalContent,
        error: `edits[${previous.index}] and edits[${current.index}] overlap. Merge them into one edit or target disjoint regions.`,
      };
    }
  }

  // Applied from the end backwards so an earlier replacement cannot move the
  // offsets a later one was measured against.
  let content = originalContent;
  for (const entry of [...ordered].reverse()) {
    content = applyEdit(content, entry.edit, entry.newText);
  }
  return { success: true, content };
}

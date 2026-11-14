/**
 * The shape a text file is stored in, beside its content.
 *
 * Two invisible conventions differ between files and are easy to destroy by
 * accident: a leading byte order mark, and which characters end a line. A tool
 * that reads a file, changes a line and writes it back will silently convert a
 * Windows file to Unix line endings, or drop the mark, unless it puts back what
 * it found. Neither shows up in a diff, which is what makes it worth handling
 * here rather than leaving to whoever notices later.
 */

export type LineEnding = "\r\n" | "\n";

/** The leading byte order mark, if any, separated from the text that follows. */
export function splitByteOrderMark(content: string): { readonly bom: string; readonly text: string } {
  return content.startsWith("\uFEFF")
    ? { bom: "\uFEFF", text: content.slice(1) }
    : { bom: "", text: content };
}

/**
 * Which line ending the file uses.
 *
 * Decided by whichever appears first rather than by counting, so a single
 * occurrence early in the file settles it. A file with no line ending at all is
 * treated as Unix, because there is nothing to preserve and Unix is what a new
 * file gets.
 */
export function detectLineEnding(content: string): LineEnding {
  const crlf = content.indexOf("\r\n");
  if (crlf === -1) return "\n";
  const lf = content.indexOf("\n");
  return lf === crlf + 1 ? "\r\n" : "\n";
}

/**
 * The text with Unix line endings.
 *
 * Matching runs on this form so that a pattern written with Unix endings matches
 * regardless of how the file is stored. A lone carriage return counts as a line
 * ending too — files written on very old systems use it, and leaving it would
 * make such a file one enormous line.
 */
export function toUnixLines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * The text with `ending` on every line, for writing back in the file's own style.
 *
 * Normalises first rather than trusting the caller to have done it. Without that,
 * text still holding a carriage return comes back as `\r\r\n` — a corrupted line
 * ending produced by the very function meant to preserve them. The extra pass is
 * cheap next to the read and the replacement it follows, and it makes this
 * incapable of writing a broken file rather than merely unlikely to.
 */
export function withLineEnding(text: string, ending: LineEnding): string {
  const unix = toUnixLines(text);
  return ending === "\r\n" ? unix.replace(/\n/g, "\r\n") : unix;
}

export interface UnixReplacementSpan {
  readonly start: number;
  readonly end: number;
  readonly newText: string;
}

function buildUnixOffsetMap(rawText: string): readonly number[] {
  const map: number[] = [];
  let index = 0;
  while (index < rawText.length) {
    map.push(index);
    if (rawText[index] === "\r" && rawText[index + 1] === "\n") {
      index += 2;
    } else {
      index += 1;
    }
  }
  map.push(rawText.length);
  return map;
}

function localLineEndingAt(rawText: string, offset: number, fallback: LineEnding): LineEnding {
  const lineEnd = rawText.indexOf("\n", offset);
  if (lineEnd > 0 && rawText[lineEnd - 1] === "\r") return "\r\n";
  if (lineEnd >= 0) return "\n";
  const prevLineEnd = rawText.lastIndexOf("\n", Math.max(0, offset - 1));
  if (prevLineEnd > 0 && rawText[prevLineEnd - 1] === "\r") return "\r\n";
  if (prevLineEnd >= 0) return "\n";
  return fallback;
}

/**
 * Apply Unix-offset replacements directly onto `rawText`, preserving any mixed
 * line endings on untouched regions (Pi `applyReplacementsToOriginal` semantics).
 */
export function applyUnixReplacementsToOriginal(
  rawText: string,
  edits: readonly UnixReplacementSpan[],
): string {
  if (edits.length === 0) return rawText;
  const map = buildUnixOffsetMap(rawText);
  const fallback = detectLineEnding(rawText);
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = rawText;
  for (const edit of sorted) {
    const origStart = map[edit.start] ?? rawText.length;
    const origEnd = map[edit.end] ?? rawText.length;
    const ending = localLineEndingAt(rawText, origStart, fallback);
    const formatted = withLineEnding(edit.newText, ending);
    result = result.slice(0, origStart) + formatted + result.slice(origEnd);
  }
  return result;
}

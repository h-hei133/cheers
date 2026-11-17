export type EmphasisStyle = "em" | "strong" | "del";

export interface EmphasisMatch {
  readonly openStart: number;
  readonly openEnd: number;
  readonly closeStart: number;
  readonly closeEnd: number;
  readonly style: EmphasisStyle;
}

interface Delimiter {
  readonly marker: string;
  readonly canOpen: boolean;
  readonly canClose: boolean;
  left: number;
  right: number;
  previous: number;
  next: number;
}

const PUNCTUATION = /[\p{P}\p{S}]/u;
const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const CJK_PUNCTUATION = /[\u3000-\u303f\uff00-\uffef]/u;

/** Match source delimiter runs while code, links, math and escaped text stay opaque. */
export function matchEmphasis(text: string, opaque: readonly { readonly start: number; readonly end: number }[]): readonly EmphasisMatch[] {
  const delimiters = scanDelimiters(text, opaque);
  const matches: EmphasisMatch[] = [];
  const bottoms = new Map<string, number>();
  let current = delimiters.length ? 0 : -1;
  while (current >= 0) {
    const closer = delimiters[current]!;
    if (!closer.canClose) { current = closer.next; continue; }
    const length = closer.right - closer.left;
    const key = `${closer.marker}:${closer.canOpen}:${length % 3}`;
    const bottom = bottoms.get(key) ?? -1;
    let openerIndex = closer.previous;
    while (openerIndex > bottom) {
      const opener = delimiters[openerIndex]!;
      if (opener.marker === closer.marker && opener.canOpen && !oddMatch(opener, closer)) break;
      openerIndex = opener.previous;
    }
    if (openerIndex <= bottom) {
      bottoms.set(key, closer.previous);
      const next = closer.next;
      if (!closer.canOpen) removeDelimiter(delimiters, current);
      current = next;
      continue;
    }
    const opener = delimiters[openerIndex]!;
    const used = Math.min(opener.right - opener.left, length) >= 2 ? 2 : 1;
    matches.push({ openStart: opener.right - used, openEnd: opener.right,
      closeStart: closer.left, closeEnd: closer.left + used,
      style: closer.marker === "~" ? "del" : used === 2 ? "strong" : "em" });
    let between = opener.next;
    while (between !== current) {
      const next = delimiters[between]!.next;
      removeDelimiter(delimiters, between);
      between = next;
    }
    opener.right -= used;
    closer.left += used;
    if (opener.left === opener.right) removeDelimiter(delimiters, openerIndex);
    if (closer.left === closer.right) {
      const next = closer.next;
      removeDelimiter(delimiters, current);
      current = next;
    }
  }
  return matches;
}

function scanDelimiters(text: string, opaque: readonly { readonly start: number; readonly end: number }[]): Delimiter[] {
  const delimiters: Delimiter[] = [];
  let index = 0;
  let tokenIndex = 0;
  while (index < text.length) {
    const token = opaque[tokenIndex];
    if (token?.start === index) { index = token.end; tokenIndex++; continue; }
    const marker = text[index]!;
    if (marker !== "*" && marker !== "_" && marker !== "~") { index++; continue; }
    const start = index;
    while (text[index] === marker) index++;
    if (marker === "~" && index - start !== 2) continue;
    const flags = flanking(text, start, index, marker);
    const previous = delimiters.length - 1;
    if (previous >= 0) delimiters[previous]!.next = previous + 1;
    delimiters.push({ marker, canOpen: flags.open, canClose: flags.close,
      left: start, right: index, previous, next: -1 });
  }
  return delimiters;
}

function flanking(text: string, start: number, end: number, marker: string): { readonly open: boolean; readonly close: boolean } {
  const before = characterBefore(text, start);
  const nextCodePoint = text.codePointAt(end);
  const after = nextCodePoint === undefined ? "" : String.fromCodePoint(nextCodePoint);
  const beforeWhite = before === "" || /\s/u.test(before);
  const afterWhite = after === "" || /\s/u.test(after);
  // CJK sentence punctuation can sit inside emphasis immediately before prose.
  // Latin punctuation retains the ordinary left/right flanking decision.
  const beforePunctuation = PUNCTUATION.test(before) && !CJK_PUNCTUATION.test(before) && !CJK.test(after);
  const afterPunctuation = PUNCTUATION.test(after) && !CJK_PUNCTUATION.test(after) && !CJK.test(before);
  const left = !afterWhite && (!afterPunctuation || beforeWhite || beforePunctuation);
  const right = !beforeWhite && (!beforePunctuation || afterWhite || afterPunctuation);
  return marker === "_"
    ? { open: left && (!right || beforePunctuation), close: right && (!left || afterPunctuation) }
    : { open: left, close: right };
}

function characterBefore(text: string, index: number): string {
  if (index === 0) return "";
  const last = text.charCodeAt(index - 1);
  const previous = text.charCodeAt(index - 2);
  const size = last >= 0xdc00 && last <= 0xdfff && previous >= 0xd800 && previous <= 0xdbff ? 2 : 1;
  return text.slice(index - size, index);
}

function oddMatch(opener: Delimiter, closer: Delimiter): boolean {
  if (closer.marker === "~" || (!closer.canOpen && !opener.canClose)) return false;
  const left = opener.right - opener.left;
  const right = closer.right - closer.left;
  return (left + right) % 3 === 0 && (left % 3 !== 0 || right % 3 !== 0);
}

function removeDelimiter(delimiters: readonly Delimiter[], index: number): void {
  const delimiter = delimiters[index]!;
  if (delimiter.previous >= 0) delimiters[delimiter.previous]!.next = delimiter.next;
  if (delimiter.next >= 0) delimiters[delimiter.next]!.previous = delimiter.previous;
}

import { findCodeSpan } from "./codeSpan.js";
import { matchEmphasis, type EmphasisMatch, type EmphasisStyle } from "./emphasis.js";

export interface InlineRenderers {
  readonly renderCode: (code: string) => string;
  readonly renderText: (text: string) => string;
  readonly renderLink: (label: string, href: string, context: InlineContext) => string;
  readonly renderEmphasis?: (text: string, style: EmphasisStyle) => string;
  readonly renderEscape?: (character: string) => string;
  /** Enabled by a renderer only where newlines and explicit table breaks belong. */
  readonly renderBreak?: () => string;
  /** Find one math token at `start`; callers own the bounded parser. */
  readonly findMath?: (start: number) => { readonly end: number; readonly text: string } | undefined;
  readonly renderMath?: (text: string) => string;
}

export interface InlineContext {
  readonly depth: number;
  readonly allowLinks: boolean;
}

const ROOT_CONTEXT: InlineContext = Object.freeze({ depth: 0, allowLinks: true });
const MAX_INLINE_BYTES = 64 * 1024;
const MAX_INLINE_DEPTH = 8;
const MAX_LINK_HREF_CHARS = 4096;
const ESCAPABLE = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_{|}~]/;

interface InlineToken {
  readonly start: number;
  readonly end: number;
  readonly rendered: string;
}

/**
 * Transform inline spans from their original source positions.
 *
 * Code spans are recognized before links, so link-like text inside code stays
 * literal. A link label is passed back to the renderer as source text, allowing
 * it to recurse and render code spans inside the label. An unmatched backtick run
 * is skipped whole so its later characters cannot become a shorter opener.
 */
export function transformInline(
  text: string,
  render: InlineRenderers,
  context: InlineContext = ROOT_CONTEXT,
): string {
  if (!inlineWithinBudget(text, context)) {
    return render.renderText(text);
  }
  const tokens: InlineToken[] = [];
  const delimiters = context.allowLinks ? matchDelimiters(text) : undefined;
  const explicitBreak = /<br\s*\/?>/iy;
  let index = 0;
  const addToken = (end: number, rendered: string): void => {
    tokens.push({ start: index, end, rendered });
    index = end;
  };
  while (index < text.length) {
    if (text[index] === "`") {
      const span = findCodeSpan(text, index);
      if (span) {
        addToken(span.end, render.renderCode(text.slice(index + span.run, span.close)));
        continue;
      }
      index += backtickRun(text, index);
      continue;
    }
    if (render.findMath && (text[index] === "$" || text[index] === "\\")) {
      const math = render.findMath(index);
      if (math) {
        addToken(math.end, render.renderMath ? render.renderMath(math.text) : math.text);
        continue;
      }
    }
    if (text[index] === "\\") {
      const escaped = text[index + 1];
      // Unclosed formulas stay visible while the next streaming chunk arrives.
      // Their openers belong to math even when no complete projection exists.
      if (render.findMath && (escaped === "(" || escaped === "[")) {
        addToken(index + 2, render.renderText(text.slice(index, index + 2)));
        continue;
      }
      if (escaped && escaped !== "`" && ESCAPABLE.test(escaped)) {
        addToken(index + 2, render.renderEscape ? render.renderEscape(escaped) : render.renderText(escaped));
        continue;
      }
      // Escaped backticks retain the established literal-source contract.
      if (escaped === "`") { index += 2; continue; }
    }
    if (render.renderBreak) {
      if (text[index] === "\n" || text.slice(index, index + 2) === "\r\n") {
        addToken(index + (text[index] === "\r" ? 2 : 1), render.renderBreak());
        continue;
      }
      if (text.slice(index, index + 3).toLowerCase() === "<br") {
        explicitBreak.lastIndex = index;
        const lineBreak = explicitBreak.exec(text);
        if (lineBreak) { addToken(explicitBreak.lastIndex, render.renderBreak()); continue; }
      }
    }
    if (context.allowLinks && text[index] === "[") {
      const close = delimiters!.brackets.get(index);
      const link = close === undefined ? undefined : parseLink(text, index, close, delimiters!.parentheses);
      if (link) {
        addToken(link.end, render.renderLink(link.label, link.href, {
          depth: context.depth + 1,
          allowLinks: false,
        }));
        continue;
      }
    }
    index++;
  }
  return renderTokens(text, tokens, render.renderEmphasis ? matchEmphasis(text, tokens) : [], render, context);
}

function renderTokens(text: string, tokens: readonly InlineToken[], matches: readonly EmphasisMatch[],
  render: InlineRenderers, context: InlineContext): string {
  const opaque = new Map(tokens.map(token => [token.start, token]));
  const openings = new Map(matches.map(match => [match.openStart, match]));
  const range = (start: number, end: number, depth: number): string => {
    if (context.depth + depth > MAX_INLINE_DEPTH) return render.renderText(text.slice(start, end));
    const parts: string[] = [];
    let index = start;
    while (index < end) {
      const token = opaque.get(index);
      if (token) { parts.push(token.rendered); index = token.end; continue; }
      const match = openings.get(index);
      if (match && match.closeEnd <= end) {
        parts.push(render.renderEmphasis!(range(match.openEnd, match.closeStart, depth + 1), match.style));
        index = match.closeEnd;
        continue;
      }
      const plain = index++;
      while (index < end && !opaque.has(index) && !openings.has(index)) index++;
      parts.push(render.renderText(text.slice(plain, index)));
    }
    return parts.join("");
  };
  return range(0, text.length, 0);
}

export function inlineWithinBudget(text: string, context: InlineContext = ROOT_CONTEXT): boolean {
  return context.depth <= MAX_INLINE_DEPTH && Buffer.byteLength(text, "utf8") <= MAX_INLINE_BYTES;
}

interface InlineLink {
  readonly label: string;
  readonly href: string;
  readonly end: number;
}

interface DelimiterMatches {
  readonly brackets: ReadonlyMap<number, number>;
  readonly parentheses: ReadonlyMap<number, number>;
}

function matchDelimiters(text: string): DelimiterMatches {
  const brackets = new Map<number, number>();
  const parentheses = new Map<number, number>();
  const bracketStack: number[] = [];
  const parenthesisStack: number[] = [];
  let index = 0;
  while (index < text.length) {
    if (text[index] === "`") {
      const span = findCodeSpan(text, index);
      index = span?.end ?? index + backtickRun(text, index);
      continue;
    }
    if (text[index] === "\\") {
      index += 2;
      continue;
    }
    if (text[index] === "[") bracketStack.push(index);
    else if (text[index] === "]") {
      const open = bracketStack.pop();
      if (open !== undefined) brackets.set(open, index);
    } else if (text[index] === "(") parenthesisStack.push(index);
    else if (text[index] === ")") {
      const open = parenthesisStack.pop();
      if (open !== undefined) parentheses.set(open, index);
    }
    index++;
  }
  return { brackets, parentheses };
}

function parseLink(
  text: string,
  start: number,
  close: number,
  parentheses: ReadonlyMap<number, number>,
): InlineLink | undefined {
  const openParenthesis = close + 1;
  if (text[openParenthesis] !== "(") return undefined;
  const closeParenthesis = parentheses.get(openParenthesis);
  if (closeParenthesis === undefined || closeParenthesis - openParenthesis - 1 > MAX_LINK_HREF_CHARS) {
    return undefined;
  }
  const label = text.slice(start + 1, close);
  const href = text.slice(openParenthesis + 1, closeParenthesis);
  if (/\s/.test(href)) return undefined;
  return { label, href, end: closeParenthesis + 1 };
}

function backtickRun(text: string, start: number): number {
  let run = 1;
  while (text[start + run] === "`") run++;
  return run;
}

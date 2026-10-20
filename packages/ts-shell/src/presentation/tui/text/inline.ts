import { findCodeSpan } from "./codeSpan.js";

export interface InlineRenderers {
  readonly renderCode: (code: string) => string;
  readonly renderText: (text: string) => string;
  readonly renderLink: (label: string, href: string, context: InlineContext) => string;
}

export interface InlineContext {
  readonly depth: number;
  readonly allowLinks: boolean;
}

const ROOT_CONTEXT: InlineContext = Object.freeze({ depth: 0, allowLinks: true });
const MAX_INLINE_BYTES = 64 * 1024;
const MAX_INLINE_DEPTH = 8;
const MAX_LINK_HREF_CHARS = 4096;

/**
 * Transform top-level inline links and code spans in source order.
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
  const tokens: string[] = [];
  const prefix = uniqueMarkerPrefix(text);
  const delimiters = context.allowLinks ? matchDelimiters(text) : undefined;
  let tokenized = "";
  let cursor = 0;
  let index = 0;
  const addToken = (rendered: string): void => {
    tokenized += text.slice(cursor, index);
    tokens.push(rendered);
    tokenized += `${prefix}${tokens.length - 1}\uE001`;
  };
  while (index < text.length) {
    if (text[index] === "`") {
      const span = findCodeSpan(text, index);
      if (span) {
        addToken(render.renderCode(text.slice(index + span.run, span.close)));
        index = span.end;
        cursor = span.end;
        continue;
      }
      index += backtickRun(text, index);
      continue;
    }
    if (context.allowLinks && text[index] === "[") {
      const close = delimiters!.brackets.get(index);
      const link = close === undefined ? undefined : parseLink(text, index, close, delimiters!.parentheses);
      if (link) {
        addToken(render.renderLink(link.label, link.href, {
          depth: context.depth + 1,
          allowLinks: false,
        }));
        index = link.end;
        cursor = index;
        continue;
      }
    }
    index++;
  }
  tokenized += text.slice(cursor);
  const marker = new RegExp(`${prefix}(\\d+)\uE001`, "g");
  return render.renderText(tokenized).replace(marker, (_match, tokenIndex: string) => tokens[Number(tokenIndex)]!);
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

function uniqueMarkerPrefix(text: string): string {
  const used = new Set(text);
  for (let codePoint = 0xE000; codePoint <= 0x10FFFF; codePoint++) {
    if (codePoint >= 0xD800 && codePoint <= 0xDFFF) continue;
    const candidate = String.fromCodePoint(codePoint);
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("Inline text exhausted the Unicode marker space.");
}

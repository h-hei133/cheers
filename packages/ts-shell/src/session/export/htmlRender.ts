import hljs from "highlight.js";
import { scanBlocks, type ListBlock, type MarkdownBlock } from "../../presentation/tui/transcript/markdownScan.js";
import { createMathFinder, latexToDisplayText } from "../../presentation/tui/transcript/math.js";
import { splitTableRow } from "../../presentation/tui/transcript/table.js";
import { inlineWithinBudget, transformInline, type InlineContext } from "../../presentation/tui/text/inline.js";
import { safeLinkUrl } from "../../presentation/tui/text/link.js";

/**
 * Markdown as HTML, for the exported page.
 *
 * This is the second renderer over the same scan the terminal uses. That is the
 * whole reason the scan exists as its own module: the page and the terminal must
 * agree on what the text is, and the only difference between them should be that
 * one emits coloured rows fitted to a terminal width and the other emits markup
 * a browser can reflow.
 *
 * Everything that came from the session is escaped on the way in. An answer can
 * contain markup, and a tool's output can contain anything at all; the exported
 * file is opened in a browser, so a `<script>` in a tool result would otherwise
 * be a script.
 */

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/** `text` with every character that could start markup replaced. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

/**
 * A URL safe to place in `href` or `src`, or nothing.
 *
 * A scheme allowlist rather than a blocklist, because the set of dangerous
 * schemes is open-ended and the set of ones a conversation needs is not. A
 * relative link is allowed — it points inside the file's own directory, which is
 * what a link in an answer usually means. Anything else returns nothing and the
 * caller renders the text without a link, rather than dropping the text.
 */
export { safeLinkUrl as safeUrl };

/**
 * Inline spans: links, code, and emphasis, escaped.
 *
 * Links are extracted from the raw text before anything is escaped, because the
 * two need opposite treatment: the label is escaped as text, while the URL must
 * reach the attribute unescaped and then be escaped exactly once. Escaping the
 * whole line first and then pulling the link out would encode an `&` in the URL
 * twice, turning a working query string into a literal `&amp;`.
 */
export function renderInlineHtml(text: string): string {
  return renderInlineHtmlAt(text);
}

function renderInlineHtmlAt(text: string, context?: InlineContext, breaks = false): string {
  if (!inlineWithinBudget(text, context)) {
    const literal = escapeHtml(text);
    return breaks ? literal.replace(/\r?\n/g, "<br>") : literal;
  }
  return transformInline(text, {
    renderCode: (code) => `<code>${escapeHtml(code)}</code>`,
    renderText: escapeHtml,
    renderEscape: escapeHtml,
    renderEmphasis: (body, style) => `<${style}>${body}</${style}>`,
    ...(breaks ? { renderBreak: () => "<br>" } : {}),
    renderLink: (label, href, next) => {
      const url = safeLinkUrl(href);
      const renderedLabel = renderInlineHtmlAt(label, next, breaks);
      // A refused scheme loses the link, not the words: the label is still what
      // the author wrote.
      return url === undefined
        ? renderedLabel
        : `<a href="${escapeHtml(url)}" rel="noreferrer noopener">${renderedLabel}</a>`;
    },
    findMath: createMathFinder(text),
    renderMath: escapeHtml,
  }, context);
}

/** `text` as HTML blocks. */
export function renderMarkdownHtml(text: string): string {
  return groupBlocks(scanBlocks(text)).map(renderBlockHtml).join("");
}

/**
 * A block that owns several sibling lines.
 *
 * The scanner reports one block per line, because that is what a terminal draws.
 * A browser does not: three `<ul>` elements in a row are three lists with a gap
 * between them, and three `<ol>` elements each restart at 1, so a numbered list
 * came out as "1. 1. 1.". Grouping happens here rather than in the scanner so the
 * terminal renderer — which is correct as it stands — is untouched.
 */
interface HtmlList {
  readonly kind: "list";
  readonly ordered: boolean;
  readonly start: number;
  readonly marker: string;
  readonly indent: number;
  readonly items: { readonly source: ListBlock; readonly children: HtmlList[] }[];
}

type Grouped =
  | HtmlList
  | { readonly kind: "paragraph"; readonly lines: readonly string[] }
  | { readonly kind: "quote"; readonly paragraphs: readonly (readonly string[])[] }
  | Exclude<MarkdownBlock, { kind: "list" } | { kind: "quote" }>;

/**
 * Lists retain their authored hierarchy; adjacent prose lines form a paragraph.
 *
 * A quote continues across a blank line, which is how a multi-paragraph quote is
 * written; a list does not, because a blank line between items ends this tight
 * list projection. Indentation attaches a child list to its preceding parent
 * item while same-level marker changes start a sibling list.
 */
function groupBlocks(blocks: readonly MarkdownBlock[]): readonly Grouped[] {
  const grouped: Grouped[] = [];
  const lists: HtmlList[] = [];
  let quote: string[][] | undefined;
  let paragraph: string[] | undefined;

  const flush = (): void => {
    if (quote) grouped.push({ kind: "quote", paragraphs: quote });
    if (paragraph) grouped.push({ kind: "paragraph", lines: paragraph });
    lists.length = 0;
    quote = undefined;
    paragraph = undefined;
  };

  for (const block of blocks) {
    if (block.kind === "list") {
      if (quote || paragraph) flush();
      const ordered = /^\d+\.$/.test(block.marker);
      const indent = block.indent.replace(/\t/g, "    ").length;
      while (lists.length && lists.at(-1)!.indent > indent) lists.pop();
      let list = lists.at(-1);
      const sameMarker = list?.ordered || list?.marker === block.marker;
      if (list && list.indent === indent && (list.ordered !== ordered || !sameMarker)) {
        lists.pop();
        list = lists.at(-1);
      }
      if (!list || list.indent !== indent) {
        const fresh: HtmlList = { kind: "list", ordered, start: ordered ? Number.parseInt(block.marker, 10) : 1,
          marker: block.marker, indent, items: [] };
        const parent = list?.items.at(-1);
        if (parent) parent.children.push(fresh);
        else grouped.push(fresh);
        lists.push(fresh);
        list = fresh;
      }
      list.items.push({ source: block, children: [] });
      continue;
    }
    if (block.kind === "quote") {
      // A bare `>` is how a paragraph break inside a quote is written, and the
      // scanner reports it as a quote whose text is empty.
      if (quote) {
        if (block.text.trim() === "") quote.push([]);
        else quote[quote.length - 1]!.push(block.text);
      } else if (lists.length || paragraph) {
        // A quote after a list ends the list; the two are not the same element.
        flush();
        quote = [[block.text]];
      } else quote = [[block.text]];
      continue;
    }
    if (block.kind === "text" && block.line.trim() === "") {
      // A blank line ends a list but only starts a new paragraph inside a quote.
      if (lists.length || paragraph) flush();
      else if (quote) quote.push([]);
      continue;
    }
    if (block.kind === "text") {
      if (lists.length || quote) flush();
      if (paragraph) paragraph.push(block.line);
      else paragraph = [block.line];
    } else {
      flush();
      grouped.push(block);
    }
  }
  flush();
  return grouped;
}

function renderBlockHtml(block: Grouped): string {
  switch (block.kind) {
    case "heading": {
      const level = Math.min(6, Math.max(1, block.level));
      return `<h${level}>${renderInlineHtml(block.text)}</h${level}>`;
    }
    case "rule":
      return "<hr>";
    case "fence":
      return renderFenceHtml(block.lines, block.language);
    case "table":
      return renderTableHtml(block);
    case "math": {
      const projected = latexToDisplayText(block.body);
      return `<div class="math">${escapeHtml(projected ?? block.raw)}</div>`;
    }
    case "list": {
      // The marker decided the list kind when the items were grouped; a terminal
      // prints the marker and a browser does not, so this is where they part.
      return renderListHtml(block);
    }
    case "paragraph":
      return `<p>${renderInlineHtmlAt(block.lines.join("\n"), undefined, true)}</p>`;
    case "quote": {
      // Paragraphs inside one quote are separate `<p>` elements, which is what
      // makes a blank line between them mean what it looks like it means.
      const parts = block.paragraphs
        .filter((paragraph) => paragraph.length > 0)
        .map((paragraph) => `<p>${paragraph.map((line) => renderInlineHtml(line)).join(" ")}</p>`);
      return `<blockquote>${parts.join("")}</blockquote>`;
    }
    default:
      return block.line.trim() === "" ? "" : `<p>${renderInlineHtml(block.line)}</p>`;
  }
}

const HIGHLIGHT_MAX_CHARS = 32 * 1024;

/** Iterative traversal keeps arbitrary source indentation away from the JS call stack. */
function renderListHtml(root: HtmlList): string {
  const parts: string[] = [];
  const pending: (HtmlList | string)[] = [root];
  while (pending.length) {
    const next = pending.pop()!;
    if (typeof next === "string") { parts.push(next); continue; }
    const tag = next.ordered ? "ol" : "ul";
    const start = next.ordered && next.start !== 1 ? ` start="${next.start}"` : "";
    parts.push(`<${tag}${start}>`);
    pending.push(`</${tag}>`);
    for (let index = next.items.length - 1; index >= 0; index--) {
      const item = next.items[index]!;
      pending.push("</li>");
      for (let child = item.children.length - 1; child >= 0; child--) pending.push(item.children[child]!);
      const task = item.source.task;
      const checkbox = task ? `<input type="checkbox" disabled${task.checked ? " checked" : ""}> ` : "";
      pending.push(`<li>${checkbox}${renderInlineHtml(task ? task.text : item.source.text)}`);
    }
  }
  return parts.join("");
}

function renderFenceHtml(lines: readonly string[], language: string): string {
  const source = lines.join("\n");
  const label = language === "" ? "" : `<span class="fence-lang">${escapeHtml(language)}</span>`;
  const trimmedLang = language.trim();
  let highlighted: string;
  let codeClass = "hljs";
  if (source.length <= HIGHLIGHT_MAX_CHARS && trimmedLang !== "") {
    if (hljs.getLanguage(trimmedLang)) {
      highlighted = hljs.highlight(source, { language: trimmedLang, ignoreIllegals: true }).value;
      codeClass = `hljs language-${escapeHtml(trimmedLang)}`;
    } else {
      highlighted = escapeHtml(source);
    }
  } else if (source.length <= HIGHLIGHT_MAX_CHARS && source.trim() !== "") {
    highlighted = hljs.highlightAuto(source).value;
  } else {
    highlighted = escapeHtml(source);
  }
  return `<pre class="fence">${label}<code class="${codeClass}">${highlighted}</code></pre>`;
}

function renderTableHtml(block: Extract<MarkdownBlock, { kind: "table" }>): string {
  const headers = splitTableRow(block.header);
  const cellHtml = (tag: "th" | "td", cell: string, column: number): string => {
    const alignment = block.alignments[column];
    const style = alignment ? ` style="text-align:${alignment}"` : "";
    return `<${tag}${style}>${renderInlineHtmlAt(cell, undefined, true)}</${tag}>`;
  };
  const head = headers.map((cell, column) => cellHtml("th", cell, column)).join("");
  const body = block.rows
    .map(row => {
      const cells = splitTableRow(row);
      return `<tr>${headers.map((_cell, column) => cellHtml("td", cells[column] ?? "", column)).join("")}</tr>`;
    })
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

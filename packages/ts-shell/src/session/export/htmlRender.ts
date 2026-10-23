import { scanBlocks, type MarkdownBlock } from "../../presentation/tui/transcript/markdownScan.js";
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

function renderInlineHtmlAt(text: string, context?: InlineContext): string {
  if (!inlineWithinBudget(text, context)) return escapeHtml(text);
  return transformInline(text, {
    renderCode: (code) => `<code>${escapeHtml(code)}</code>`,
    renderText: (plain) => renderEmphasisHtml(escapeHtml(plain)),
    renderLink: (label, href, next) => {
      const url = safeLinkUrl(href);
      const renderedLabel = renderInlineHtmlAt(label, next);
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

/** Code and emphasis, on text that has already had its links taken out. */
function renderEmphasisHtml(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
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
type Grouped =
  | { readonly kind: "list"; readonly ordered: boolean; readonly items: readonly string[] }
  | { readonly kind: "quote"; readonly paragraphs: readonly (readonly string[])[] }
  | Exclude<MarkdownBlock, { kind: "list" } | { kind: "quote" }>;

/**
 * Adjacent list items become one list, and adjacent quote lines one quote.
 *
 * A quote continues across a blank line, which is how a multi-paragraph quote is
 * written; a list does not, because a blank line between items ends it. Only
 * items of the same kind and indent join, so an ordered list nested under an
 * unordered one stays a separate element.
 */
function groupBlocks(blocks: readonly MarkdownBlock[]): readonly Grouped[] {
  const grouped: Grouped[] = [];
  let list: { ordered: boolean; indent: string; items: string[] } | undefined;
  let quote: string[][] | undefined;

  const flush = (): void => {
    if (list) grouped.push({ kind: "list", ordered: list.ordered, items: list.items });
    if (quote) grouped.push({ kind: "quote", paragraphs: quote });
    list = undefined;
    quote = undefined;
  };

  for (const block of blocks) {
    if (block.kind === "list") {
      const ordered = /^\d+\.$/.test(block.marker);
      if (list && list.ordered === ordered && list.indent === block.indent) {
        list.items.push(block.text);
        continue;
      }
      flush();
      list = { ordered, indent: block.indent, items: [block.text] };
      continue;
    }
    if (block.kind === "quote") {
      // A bare `>` is how a paragraph break inside a quote is written, and the
      // scanner reports it as a quote whose text is empty.
      if (quote) {
        if (block.text.trim() === "") quote.push([]);
        else quote[quote.length - 1]!.push(block.text);
      } else if (list) {
        // A quote after a list ends the list; the two are not the same element.
        flush();
        quote = [[block.text]];
      } else quote = [[block.text]];
      continue;
    }
    if (block.kind === "text" && block.line.trim() === "") {
      // A blank line ends a list but only starts a new paragraph inside a quote.
      if (list) flush();
      else if (quote) quote.push([]);
      continue;
    }
    flush();
    grouped.push(block);
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
      return renderTableHtml(block.header, block.rows);
    case "math": {
      const projected = latexToDisplayText(block.body);
      return `<div class="math">${escapeHtml(projected ?? block.raw)}</div>`;
    }
    case "list": {
      // The marker decided the list kind when the items were grouped; a terminal
      // prints the marker and a browser does not, so this is where they part.
      const tag = block.ordered ? "ol" : "ul";
      return `<${tag}>${block.items.map((item) => `<li>${renderInlineHtml(item)}</li>`).join("")}</${tag}>`;
    }
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

function renderFenceHtml(lines: readonly string[], language: string): string {
  const body = escapeHtml(lines.join("\n"));
  // The language is echoed as a label rather than used to highlight. There is no
  // highlighter here, and a label that claims one would be the only part of the
  // block a reader could not trust.
  const label = language === "" ? "" : `<span class="fence-lang">${escapeHtml(language)}</span>`;
  return `<pre class="fence">${label}<code>${body}</code></pre>`;
}

function renderTableHtml(header: string, rows: readonly string[]): string {
  const head = splitTableRow(header).map((cell) => `<th>${renderTableCellHtml(cell)}</th>`).join("");
  const body = rows
    .map((row) => `<tr>${splitTableRow(row).map((cell) => `<td>${renderTableCellHtml(cell)}</td>`).join("")}</tr>`)
    .join("");
  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function renderTableCellHtml(cell: string): string {
  return cell.split(/<br\s*\/?>/i).map(renderInlineHtml).join("<br>");
}

import hljs from "highlight.js";
import { Marked, Renderer } from "marked";
import cjkFriendly from "marked-cjk-friendly";
import { inlineWithinBudget } from "../../presentation/tui/text/inline.js";
import { safeLinkUrl } from "../../presentation/tui/text/link.js";
import { exportSyntax } from "./syntax.js";

const ESCAPES: Readonly<Record<string, string>> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
};
const HIGHLIGHT_MAX_CHARS = 32 * 1024;
const MARKDOWN_MAX_BYTES = 512 * 1024;
const linkedImages = new WeakSet<object>();

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, char => ESCAPES[char]!);
}

export { safeLinkUrl as safeUrl };

function renderLink(href: string, title: string | null | undefined, label: string): string {
  const safe = safeLinkUrl(href);
  if (safe === undefined) return label;
  const tooltip = title ? ` title="${escapeHtml(title)}"` : "";
  return `<a href="${escapeHtml(safe)}" rel="noreferrer noopener"${tooltip}>${label}</a>`;
}

function renderFenceHtml(source: string, language: string): string {
  const label = language === "" ? "" : `<span class="fence-lang">${escapeHtml(language)}</span>`;
  const knownLanguage = language !== "" && /^[\w+-]+$/.test(language) && hljs.getLanguage(language);
  const highlight = source.length <= HIGHLIGHT_MAX_CHARS && source.trim() !== "";
  let content = escapeHtml(source);
  let codeClass = "hljs";
  if (highlight && knownLanguage) {
    content = hljs.highlight(source, { language, ignoreIllegals: true }).value;
    codeClass = `hljs language-${language}`;
  } else if (highlight && language === "") {
    content = hljs.highlightAuto(source).value;
  }
  return `<pre class="fence">${label}<code class="${codeClass}">${content}</code></pre>`;
}

const markdown = new Marked(cjkFriendly(), exportSyntax(escapeHtml), {
  gfm: true,
  breaks: true,
  renderer: {
    html({ text, block }) {
      // Only a bare line break is part of the export's Markdown dialect.
      const escaped = /^<br[ \t]*\/?>$/i.test(text.trim()) ? "<br>" : escapeHtml(text.trimEnd());
      return block ? `<p>${escaped}</p>` : escaped;
    },
    text(token) {
      // The default renderer trusts text tokenized inside raw tags.
      return "escaped" in token && token.escaped ? escapeHtml(token.text) : false;
    },
    link({ href, title, text, tokens, autolink }) {
      // Links may wrap images. Keep their fallback labels inside the authored link.
      if (!autolink) markdown.walkTokens(tokens, token => {
        if (token.type === "image") linkedImages.add(token);
      });
      return renderLink(href, title, autolink ? escapeHtml(text) : this.parser.parseInline(tokens));
    },
    image(token) {
      // Automatic image loads are reserved for inspected transcript attachments.
      const label = escapeHtml(token.text);
      return linkedImages.has(token) ? label : renderLink(token.href, token.title, label);
    },
    code({ text, lang }) {
      return renderFenceHtml(text, lang?.match(/^\S+/)?.[0] ?? "");
    },
    table(token) { return Renderer.prototype.table.call(this, token).trimEnd(); },
    heading({ depth, tokens }) { return `<h${depth}>${this.parser.parseInline(tokens)}</h${depth}>`; },
    paragraph({ tokens }) { return `<p>${this.parser.parseInline(tokens)}</p>`; },
    blockquote({ tokens }) { return `<blockquote>${this.parser.parse(tokens)}</blockquote>`; },
    hr() { return "<hr>"; },
    list({ ordered, start, items }) {
      const tag = ordered ? "ol" : "ul";
      const startAttribute = ordered && start !== 1 ? ` start="${start}"` : "";
      return `<${tag}${startAttribute}>${items.map(item => this.listitem(item)).join("")}</${tag}>`;
    },
    listitem({ tokens }) { return `<li>${this.parser.parse(tokens)}</li>`; },
  },
});

export function renderInlineHtml(text: string): string {
  if (!inlineWithinBudget(text)) return escapeHtml(text);
  try { return markdown.parseInline(text, { async: false }); }
  catch (error) { if (!(error instanceof RangeError)) throw error; return escapeHtml(text); }
}

export function renderMarkdownHtml(text: string): string {
  if (Buffer.byteLength(text, "utf8") <= MARKDOWN_MAX_BYTES) {
    try { return markdown.parse(text, { async: false }); }
    catch (error) { if (!(error instanceof RangeError)) throw error; }
  }
  return `<pre class="fence"><code>${escapeHtml(text)}</code></pre>`;
}

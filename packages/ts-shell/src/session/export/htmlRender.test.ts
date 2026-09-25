import { describe, expect, it } from "vitest";
import { escapeHtml, renderInlineHtml, renderMarkdownHtml, safeUrl } from "./htmlRender.js";

/**
 * Markdown as the exported page renders it.
 *
 * The page and the terminal share one scanner, so what is tested here is not
 * "does it understand markdown" — that is the scanner's job. It is that the
 * second renderer over that scan produces markup, and that nothing from the
 * session can become markup itself. An exported file is opened in a browser, and
 * a tool's output can contain anything at all.
 */

describe("escaping", () => {
  it("neutralises every character that could start markup", () => {
    expect(escapeHtml(`<script>alert("x")</script>`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;",
    );
  });

  it("escapes an ampersand once", () => {
    // Escaping twice turns a working query string into a literal `&amp;`.
    expect(escapeHtml("a&b")).toBe("a&amp;b");
  });
});

describe("links", () => {
  it("keeps a safe scheme", () => {
    expect(renderInlineHtml("[x](https://example.com)")).toBe(
      '<a href="https://example.com" rel="noreferrer noopener">x</a>',
    );
  });

  it("refuses a scheme that could execute, and keeps the words", () => {
    // The label is what the author wrote; losing the link is enough, and
    // dropping the text as well would lose meaning rather than risk.
    const rendered = renderInlineHtml("[click](javascript:alert(1))");
    expect(rendered).toBe("click");
    expect(rendered).not.toContain("javascript:");
  });

  it("refuses a data URL", () => {
    expect(safeUrl("data:text/html,<script>")).toBeUndefined();
  });

  it("allows a relative link, which points beside the file", () => {
    expect(safeUrl("./notes.md")).toBe("./notes.md");
  });

  it("escapes an ampersand in the URL exactly once", () => {
    expect(renderInlineHtml("[q](https://example.com/a?b=1&c=2)")).toBe(
      '<a href="https://example.com/a?b=1&amp;c=2" rel="noreferrer noopener">q</a>',
    );
  });

  it("handles a URL containing parentheses", () => {
    // The naive pattern stops at the first `)`, leaving a stray bracket and a
    // truncated link.
    expect(renderInlineHtml("[d](https://x.test/a_(b))")).toBe(
      '<a href="https://x.test/a_(b)" rel="noreferrer noopener">d</a>',
    );
  });

  it("does not treat an unmatched bracket as a link", () => {
    expect(renderInlineHtml("an [ordinary] bracket")).toBe("an [ordinary] bracket");
  });
});

describe("blocks", () => {
  it("renders a heading at its own level", () => {
    expect(renderMarkdownHtml("## Results")).toBe("<h2>Results</h2>");
  });

  it("renders a table with a header and a body", () => {
    const html = renderMarkdownHtml("| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(html).toContain("<th>a</th>");
    expect(html).toContain("<td>2</td>");
  });

  it("renders a fenced block as code, not as markup", () => {
    const html = renderMarkdownHtml("```ts\nconst x = 1;\n```");
    expect(html).toContain("<code>const x = 1;</code>");
    expect(html).toContain("fence-lang");
  });

  it("keeps markup inside a fence as text", () => {
    // The case that matters: an answer showing HTML must display it, not run it.
    const html = renderMarkdownHtml("```html\n<script>alert(1)</script>\n```");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("keeps markup in prose as text too", () => {
    expect(renderMarkdownHtml("<img onerror=alert(1)>")).toBe(
      "<p>&lt;img onerror=alert(1)&gt;</p>",
    );
  });

  it("renders a bullet list as a list", () => {
    expect(renderMarkdownHtml("- one")).toBe("<ul><li>one</li></ul>");
  });

  it("renders an ordered list as an ordered list", () => {
    // The scan keeps the marker because a terminal prints it; a browser does not.
    expect(renderMarkdownHtml("1. one")).toBe("<ol><li>one</li></ol>");
  });

  it("renders a quote", () => {
    expect(renderMarkdownHtml("> quoted")).toBe("<blockquote><p>quoted</p></blockquote>");
  });

  it("groups adjacent lines into one list", () => {
    // Three `<ul>` elements in a row are three lists with a gap between them, and
    // three `<ol>` elements each restart at 1. A reader who numbered five steps
    // saw five steps numbered "1.".
    expect(renderMarkdownHtml("- a\n- b\n- c")).toBe("<ul><li>a</li><li>b</li><li>c</li></ul>");
    expect(renderMarkdownHtml("1. a\n2. b")).toBe("<ol><li>a</li><li>b</li></ol>");
  });

  it("keeps an unordered list and an ordered one apart", () => {
    // The marker decides the element, so a change of kind ends the list rather
    // than merging two things that are drawn differently.
    expect(renderMarkdownHtml("1. a\n- b")).toBe("<ol><li>a</li></ol><ul><li>b</li></ul>");
  });

  it("ends a list at a blank line", () => {
    expect(renderMarkdownHtml("- a\n- b\n\nplain")).toBe("<ul><li>a</li><li>b</li></ul><p>plain</p>");
  });

  it("keeps the paragraphs of one quote apart", () => {
    // A bare `>` is how a paragraph break inside a quote is written. Joined into
    // one paragraph it would lose the break the author put there.
    expect(renderMarkdownHtml("> a\n>\n> b")).toBe("<blockquote><p>a</p><p>b</p></blockquote>");
    expect(renderMarkdownHtml("> a\n> b")).toBe("<blockquote><p>a b</p></blockquote>");
  });

  it("renders a rule", () => {
    expect(renderMarkdownHtml("---")).toBe("<hr>");
  });

  it("does not emit an empty paragraph for a blank line", () => {
    expect(renderMarkdownHtml("a\n\nb")).toBe("<p>a</p><p>b</p>");
  });
});

describe("inline spans", () => {
  it("renders emphasis, strong, and code", () => {
    expect(renderInlineHtml("**b** and `c` and *i*")).toBe(
      "<strong>b</strong> and <code>c</code> and <em>i</em>",
    );
  });
});

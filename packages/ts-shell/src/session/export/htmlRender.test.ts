import { describe, expect, it } from "vitest";
import { escapeHtml, renderInlineHtml, renderMarkdownHtml, safeUrl } from "./htmlRender.js";
import { renderMarkdown } from "../../presentation/tui/transcript/markdown.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";

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

  it("refuses a scheme written to evade the check", () => {
    // Each of these is a way the allowlist could have been fooled: mixed case, a
    // control character inside the scheme, leading whitespace, and an entity a
    // browser would decode. The first four never become a link at all.
    expect(safeUrl("JaVaScRiPt:alert(1)")).toBeUndefined();
    expect(safeUrl("java\tscript:alert(1)")).toBeUndefined();
    expect(safeUrl("  javascript:alert(1)")).toBeUndefined();
    expect(safeUrl("vbscript:msgbox(1)")).toBeUndefined();
    expect(safeUrl("file:///etc/passwd")).toBeUndefined();

    // The entity does become a link, and that is correct: the `&` is escaped to
    // `&amp;` on the way in, so what the browser parses is the literal text
    // `&#106;avascript:...` — no scheme, therefore a relative URL that cannot
    // execute. Verified in a real browser: the resolved href is that literal
    // string. Asserting the absence of `<a` would be asserting something the
    // escaping does not do, and the guarantee that matters is this one.
    const entity = renderInlineHtml("[x](&#106;avascript:alert(1))");
    expect(entity).toContain("&amp;#106;");
    expect(entity).not.toContain('href="&#106;');
    expect(entity).not.toContain("javascript:alert(1)");
  });

  it("keeps an attribute from ending early", () => {
    // The URL is escaped before it reaches the attribute, so a quote in it cannot
    // close the attribute and start a new one.
    const rendered = renderInlineHtml('[x](https://ok.com/"onmouseover="alert(1))');
    expect(rendered).toContain("&quot;onmouseover=&quot;");
    expect(rendered).not.toContain('"onmouseover="');
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

  it("uses the same escaped-pipe, code-span, and explicit-break cell semantics as the terminal", () => {
    const html = renderMarkdownHtml("| a | b |\n|---|---|\n| x \\| y | `p | q`<br>next |");
    expect(html).toContain("<td>x | y</td>");
    expect(html).toContain("<td><code>p | q</code><br>next</td>");
  });

  it("keeps a multi-backtick code-span pipe in one table cell", () => {
    const html = renderMarkdownHtml("| a | b |\n|---|---|\n| left | ``x | y`` |");
    expect(html.match(/<td>/g)).toHaveLength(2);
    expect(html).toContain("x | y");
  });

  it("keeps multiline display math as a bounded source block", () => {
    const html = renderMarkdownHtml("$$\nx^2 + y_1\n$$");
    expect(html).toBe('<div class="math">x² + y₁</div>');
  });

  it("projects whitelisted standalone math environments", () => {
    expect(renderMarkdownHtml("\\begin{equation}\n\\alpha+\\beta\n\\end{equation}"))
      .toBe('<div class="math">α+β</div>');
    const matrix = "\\begin{bmatrix}\n1&20\\\\300&4\n\\end{bmatrix}";
    expect(renderMarkdownHtml(matrix)).toBe('<div class="math">[ 1    20 ]\n[ 300  4 ]</div>');
    expect(renderMarkdown(matrix, 40).map(stripAnsi).filter(Boolean))
      .toEqual(["[ 1    20 ]", "[ 300  4 ]"]);
  });

  it("keeps nested matrix source rather than corrupting it", () => {
    const source = "$$\n\\begin{bmatrix}1&\\begin{matrix}2\\end{matrix}\\\\3&4\\end{bmatrix}\n$$";
    expect(renderMarkdownHtml(source)).toBe(`<div class="math">${escapeHtml(source)}</div>`);
  });

  it("keeps an unterminated display-math delimiter in the exported source", () => {
    const html = renderMarkdownHtml("$$\nx^2 + y_1");
    expect(html).toContain("$$");
    expect(html).toContain("x^2 + y_1");
  });

  it("keeps complete display-math delimiters when projection is over budget", () => {
    const html = renderMarkdownHtml(`$$\n${"x".repeat(5000)}\n$$`);
    expect(html).toContain("$$");
    expect(html).toContain("x".repeat(40));
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

  it("distinguishes escaped, multi-run, and unmatched backticks", () => {
    expect(renderInlineHtml("\\`text $x^2$\\`")).toBe("\\`text x²\\`");
    expect(renderInlineHtml("``code $x^2$``")).toBe("<code>code $x^2$</code>");
    expect(renderInlineHtml("`unmatched")).toBe("`unmatched");
    expect(renderInlineHtml("``unmatched")).toBe("``unmatched");
    expect(renderInlineHtml("``unmatched`")).toBe("``unmatched`");
  });

  it("projects inline math without interpreting its contents as Markdown", () => {
    expect(renderInlineHtml("$x^2 + y_1$")).toBe("x² + y₁");
    expect(renderInlineHtml("$a*b*c$")).toBe("a*b*c");
    expect(renderInlineHtml("$[docs](https://example.test)$")).toBe("[docs](https://example.test)");
    expect(renderInlineHtml("$\\unknown{x}+\\alpha$")).toBe("$\\unknown{x}+\\alpha$");
  });

  it("escapes code content and suppresses inline markup inside it", () => {
    expect(renderInlineHtml("`</code> **literal** [x](https://example.com)`")).toBe(
      "<code>&lt;/code&gt; **literal** [x](https://example.com)</code>",
    );
  });

  it("allows a code span inside a link label", () => {
    expect(renderInlineHtml("[`x`](https://example.com)")).toBe(
      '<a href="https://example.com" rel="noreferrer noopener"><code>x</code></a>',
    );
    expect(renderInlineHtml("[`a ] b`](https://example.com)")).toBe(
      '<a href="https://example.com" rel="noreferrer noopener"><code>a ] b</code></a>',
    );
  });

  it("allows emphasis to wrap code and link tokens", () => {
    expect(renderInlineHtml("**`x`**")).toBe("<strong><code>x</code></strong>");
    expect(renderInlineHtml("**[x](https://example.com)**")).toBe(
      '<strong><a href="https://example.com" rel="noreferrer noopener">x</a></strong>',
    );
  });

  it("bounds large unmatched brackets and refuses nested anchors", () => {
    const input = "[".repeat(80_000);
    expect(renderInlineHtml(input)).toBe(input);

    const nested = "[[inner](https://inner.test)](https://outer.test)";
    const rendered = renderInlineHtml(nested);
    expect(rendered.match(/<a /g)).toHaveLength(1);
    expect(rendered).toContain('href="https://outer.test"');
    expect(rendered).toContain("[inner](https://inner.test)");
  });

  it("keeps the exact 64 KiB budget and escapes raw source one byte over", () => {
    const prefix = "`**literal**` [x](https://e.test) <b>";
    const exact = prefix + "a".repeat(64 * 1024 - Buffer.byteLength(prefix, "utf8"));
    const over = `${exact}a`;
    const projected = renderInlineHtml(exact);
    expect(projected).toContain("<code>**literal**</code>");
    expect(projected).toContain('<a href="https://e.test"');
    expect(projected).toContain("&lt;b&gt;");
    expect(renderInlineHtml(over)).toBe(escapeHtml(over));
    expect(renderInlineHtml(over)).not.toContain("<code>");
  });
});

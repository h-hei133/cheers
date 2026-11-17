import { describe, expect, it } from "vitest";
import { renderInlineHtml, renderMarkdownHtml } from "./htmlRender.js";

// These are bounded conversation-rendering contracts. Passing them does not
// establish complete CommonMark/GFM conformance for every Markdown construct.
const compact = (html: string): string => html.replace(/>\s+</g, "><");

describe("exported task lists", () => {
  it.each(["x", "X", " "])("renders the %s task marker as a disabled checkbox", marker => {
    const html = renderMarkdownHtml(`- [${marker}] 保存中文结果`);
    const inputs = html.match(/<input\b[^>]*>/g) ?? [];
    expect(inputs).toHaveLength(1);
    expect(inputs[0]).toMatch(/\btype=["']checkbox["']/);
    expect(inputs[0]).toMatch(/\bdisabled(?:\s|=|\/?>)/);
    if (marker === " ") expect(inputs[0]).not.toMatch(/\bchecked(?:\s|=|\/?>)/);
    else expect(inputs[0]).toMatch(/\bchecked(?:\s|=|\/?>)/);
    expect(html).toContain("保存中文结果");
    expect(html).not.toContain(`[${marker}]`);
  });

  it("keeps ordinary bracketed items and links separate from task markers", () => {
    const html = renderMarkdownHtml("- [x]word\n- [docs](https://example.test)\n- 普通项目");
    expect(html).not.toContain("<input");
    expect(html).toContain("[x]word");
    expect(html).toContain('href="https://example.test"');
    expect(html).toContain("普通项目");
  });
});

describe("exported table structure", () => {
  it("recognizes a table without optional outer pipes", () => {
    const html = renderMarkdownHtml("名称 | 说明\n--- | ---\n甲 | 乙");
    expect(compact(html)).toBe("<table><thead><tr><th>名称</th><th>说明</th></tr></thead><tbody><tr><td>甲</td><td>乙</td></tr></tbody></table>");
  });

  it("preserves left, center and right alignment in headers and data", () => {
    const html = renderMarkdownHtml("名称 | 中间 | 数量\n:--- | :---: | ---:\n甲 | 乙 | 12");
    const heads = [...html.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/g)];
    const cells = [...html.matchAll(/<td\b([^>]*)>([\s\S]*?)<\/td>/g)];
    expect(heads).toHaveLength(3);
    expect(cells).toHaveLength(3);
    for (const [index, alignment] of ["left", "center", "right"].entries()) {
      const rule = new RegExp(`(?:text-align:\\s*${alignment}\\b|align=["']${alignment}["'])`);
      expect(heads[index]![1]).toMatch(rule);
      expect(cells[index]![1]).toMatch(rule);
    }
  });

  it("requires a valid delimiter cell for every header column", () => {
    for (const source of ["a | b\n--- | ordinary\nx | y", "a | b\n---\nx | y"]) {
      expect(renderMarkdownHtml(source)).not.toContain("<table");
    }
  });

  it("keeps explicit breaks inside code literal and breaks outside code", () => {
    const html = renderMarkdownHtml("| 代码 | 换行 |\n| --- | --- |\n| `a<br>b` | first<br>second |");
    expect(html).toContain("<td><code>a&lt;br&gt;b</code></td>");
    expect(html).toContain("<td>first<br>second</td>");
  });

  it("preserves a multi-backtick code span containing both a pipe and a break", () => {
    const html = renderMarkdownHtml("| 代码 | 值 |\n| --- | --- |\n| ``a | b<br>c`` | 尾部 |");
    expect(html.match(/<td\b/g)).toHaveLength(2);
    expect(html).toContain("<code>a | b&lt;br&gt;c</code>");
    expect(html).toContain("<td>尾部</td>");
  });
});

describe("exported list relationships", () => {
  it("starts an ordered list at its authored number", () => {
    expect(compact(renderMarkdownHtml("7. 七\n8. 八")))
      .toBe('<ol start="7"><li>七</li><li>八</li></ol>');
  });

  it("attaches a nested list to its parent and keeps the following sibling", () => {
    expect(compact(renderMarkdownHtml("- 父\n  - 子\n- 后")))
      .toBe("<ul><li>父<ul><li>子</li></ul></li><li>后</li></ul>");
  });

  it("preserves mixed nested list kinds and the nested ordered start", () => {
    expect(compact(renderMarkdownHtml("- 父\n  7. 七\n  8. 八\n- 后")))
      .toBe('<ul><li>父<ol start="7"><li>七</li><li>八</li></ol></li><li>后</li></ul>');
  });

  it("returns from a nested unordered list to the next ordered sibling", () => {
    expect(compact(renderMarkdownHtml("1. 父\n   - 子\n2. 后")))
      .toBe("<ol><li>父<ul><li>子</li></ul></li><li>后</li></ol>");
  });
});

describe("exported inline emphasis", () => {
  it.each([
    ["**这是测试。**后面", "<strong>这是测试。</strong>后面"],
    ["**一句话说清：**一台机器", "<strong>一句话说清：</strong>一台机器"],
    ["**要点到此为止。**20 小时", "<strong>要点到此为止。</strong>20 小时"],
    ["字**「引用」**字", "字<strong>「引用」</strong>字"],
    ["*斜体。*后面", "<em>斜体。</em>后面"],
  ])("supports CJK punctuation flanking in %s", (source, expected) => {
    expect(renderInlineHtml(source)).toBe(expected);
  });

  it("keeps non-CJK punctuation flanking literal", () => {
    expect(renderInlineHtml("**end.**Then next")).toBe("**end.**Then next");
  });

  it("renders underscore emphasis and strong", () => {
    expect(renderInlineHtml("_斜体_ and __粗体__"))
      .toBe("<em>斜体</em> and <strong>粗体</strong>");
  });

  it("keeps escaped emphasis delimiters literal", () => {
    expect(renderInlineHtml("\\*字\\* and \\_字\\_"))
      .toBe("*字* and _字_");
  });

  it("does not consume underscores within ordinary words", () => {
    expect(renderInlineHtml("snake_case_name and foo__bar__baz"))
      .toBe("snake_case_name and foo__bar__baz");
  });

  it("does not treat whitespace beside delimiters as emphasis", () => {
    expect(renderInlineHtml("* spaced * and ** spaced ** and ~~ spaced ~~"))
      .toBe("* spaced * and ** spaced ** and ~~ spaced ~~");
  });

  it("keeps emphasis-like code and math opaque", () => {
    expect(renderInlineHtml("`__字__ \\*字\\*` and $a*b*c$"))
      .toBe("<code>__字__ \\*字\\*</code> and a*b*c");
  });

  it("keeps incomplete formula openers visible until their closing delimiter arrives", () => {
    expect(renderInlineHtml("\\(")).toBe("\\(");
    expect(renderInlineHtml("\\[x^2")).toBe("\\[x^2");
    expect(renderInlineHtml("\\(x^2\\)")).toBe("x²");
  });
});

describe("exported paragraphs and fences", () => {
  it("keeps adjacent prose lines in one paragraph with visible soft breaks", () => {
    expect(compact(renderMarkdownHtml("第一行\n第二行\n\n后段")))
      .toBe("<p>第一行<br>第二行</p><p>后段</p>");
  });

  it("does not close a code fence on a marker with trailing language text", () => {
    const html = renderMarkdownHtml("```unknown\nfirst\n```ts\nTAIL_IN_FENCE\n```");
    const blocks = [...html.matchAll(/<pre\b[^>]*>[\s\S]*?<code\b[^>]*>([\s\S]*?)<\/code>[\s\S]*?<\/pre>/g)];
    expect(blocks).toHaveLength(1);
    expect(blocks[0]![1]).toContain("```ts\nTAIL_IN_FENCE");
  });

  it("keeps added Markdown fences inside a complete diff code block", () => {
    const html = renderMarkdownHtml("```unknown\n+```ts\n+const 值 = 1;\n+TAIL_IN_DIFF\n```");
    expect(html).toContain("+```ts\n+const 值 = 1;\n+TAIL_IN_DIFF");
    expect(html.match(/<pre\b/g)).toHaveLength(1);
  });
});

import { describe, it, expect } from "vitest";
import { htmlToMarkdown, createWebFetchToolDefinition } from "./webFetch.js";
import { formatSearchResults, createWebSearchToolDefinition } from "./webSearch.js";

describe("Web Fetch & Search Tools", () => {
  it("converts HTML structure cleanly into Markdown", () => {
    const html = `
      <html>
        <head><title>Test Page</title><style>.foo { color: red; }</style></head>
        <body>
          <h1>Heading 1</h1>
          <p>This is a paragraph with <a href="https://example.com">a link</a> and <code>inline code</code>.</p>
          <pre><code>function test() {\n  return 42;\n}</code></pre>
          <ul>
            <li>Item 1</li>
            <li>Item 2</li>
          </ul>
          <script>console.log("secret");</script>
        </body>
      </html>
    `;

    const md = htmlToMarkdown(html);
    expect(md).toContain("# Heading 1");
    expect(md).toContain("This is a paragraph with [a link](https://example.com) and `inline code`.");
    expect(md).toContain("function test() {\n  return 42;\n}");
    expect(md).toContain("- Item 1");
    expect(md).toContain("- Item 2");
    expect(md).not.toContain("secret");
    expect(md).not.toContain(".foo");
  });

  it("handles empty or invalid inputs gracefully in htmlToMarkdown", () => {
    expect(htmlToMarkdown("")).toBe("");
    expect(htmlToMarkdown("   ")).toBe("");
  });

  it("formats search results cleanly with title, url and summary", () => {
    const results = [
      {
        title: "TypeScript Official Docs",
        url: "https://www.typescriptlang.org",
        snippet: "TypeScript is JavaScript with syntax for types.",
      },
    ];

    const formatted = formatSearchResults("typescript", results);
    expect(formatted).toContain("### 1. TypeScript Official Docs");
    expect(formatted).toContain("- **URL**: https://www.typescriptlang.org");
    expect(formatted).toContain("- **Summary**: TypeScript is JavaScript with syntax for types.");
  });

  it("handles missing search query parameter in web_search", async () => {
    const tool = createWebSearchToolDefinition();
    const result = await tool.execute({ query: "" }, { workspaceRoot: "/workspace", taskId: "task-1" });
    expect(result.success).toBe(false);
    const errOutput = result.error || result.output;
    expect(errOutput).toContain("Search query parameter is required");
  });

  it("handles invalid URL parameter in web_fetch", async () => {
    const tool = createWebFetchToolDefinition();
    const result = await tool.execute({ url: "ftp://invalid-url" }, { workspaceRoot: "/workspace", taskId: "task-1" });
    expect(result.success).toBe(false);
    const errOutput = result.error || result.output;
    expect(errOutput).toContain("URL must start with http:// or https://");
  });
});

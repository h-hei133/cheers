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

  /**
   * The addresses a fetch must refuse before it makes a request.
   *
   * Written against the tool rather than the guard alone, because the guard being
   * correct is worth nothing if the call site does not ask it. The failure this
   * covers is the one that was there: any URL beginning `http` was fetched, and
   * `169.254.169.254` answers with the instance's temporary credentials.
   */
  describe("refuses addresses that are not public", () => {
    const tool = createWebFetchToolDefinition();
    const context = { workspaceRoot: "/workspace", taskId: "task-1" };

    it.each([
      ["the IPv4 metadata endpoint", "http://169.254.169.254/latest/meta-data/"],
      ["its IPv6 counterpart", "http://[fd00:ec2::254]/latest/meta-data/"],
      ["loopback by name", "http://localhost:8080/admin"],
      ["loopback by address", "http://127.0.0.1:3000/"],
      ["the IPv6 loopback", "http://[::1]:9000/"],
      ["a private range", "http://10.0.0.5/"],
      ["another private range", "http://192.168.1.1/"],
      ["a CGNAT address", "http://100.64.0.1/"],
      ["the unspecified address", "http://0.0.0.0/"],
      ["a bare hostname resolved by search domain", "http://intranet/"],
      ["an IPv4 address written in IPv6 form", "http://[::ffff:127.0.0.1]/"],
      ["a file URL that would read the disk", "file:///etc/passwd"],
    ])("refuses %s", async (_label, url) => {
      const result = await tool.execute({ url }, context);
      expect(result.success).toBe(false);
      const text = result.error || result.output;
      // Two refusal sites, both correct: the scheme check answers first for a
      // non-http scheme, and the address check answers for everything else.
      expect(text).toMatch(/refusing to fetch|must start with http/);
    });
  });
});

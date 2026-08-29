import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";

const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_CHARS = 10_000;

/**
 * Cleanly convert HTML string into readable Markdown/plain text
 * stripping script, style, and comments while formatting headings, lists, links, and code blocks.
 */
export function htmlToMarkdown(html: string): string {
  if (!html || typeof html !== "string") {
    return "";
  }

  let text = html;

  // 1. Strip head, scripts, styles, SVG, comments
  text = text.replace(/<head\b[^<]*(?:(?!<\/head>)<[^<]*)*<\/head>/gi, "");
  text = text.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
  text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");
  text = text.replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "");
  text = text.replace(/<!--[\s\S]*?-->/g, "");
  // 2. Protect preformatted code blocks with placeholders
  const codeBlocks: string[] = [];
  text = text.replace(/<pre\b[^>]*>([\s\S]*?)<\/pre>/gi, (_match, codeContent) => {
    const cleanCode = codeContent.replace(/<code\b[^>]*>/gi, "").replace(/<\/code>/gi, "");
    const placeholder = `__CODE_BLOCK_${codeBlocks.length}__`;
    codeBlocks.push(`\n\`\`\`\n${cleanCode.trimEnd()}\n\`\`\`\n`);
    return placeholder;
  });
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`");
  // 3. Headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "\n# $1\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "\n## $1\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "\n### $1\n");
  text = text.replace(/<h[4-6][^>]*>([\s\S]*?)<\/h[4-6]>/gi, "\n#### $1\n");

  // 4. Links and images
  text = text.replace(/<a\b[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");
  text = text.replace(/<img\b[^>]*alt=["']([^"']*)["'][^>]*>/gi, "![Image: $1]");

  // 5. Lists and list items
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "\n- $1");
  text = text.replace(/<\/(?:ul|ol)>/gi, "\n");

  // 6. Paragraphs, breaks, div dividers
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "\n\n$1\n\n");
  text = text.replace(/<div[^>]*>([\s\S]*?)<\/div>/gi, "\n$1\n");

  // 7. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // 8. Decode common HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–");

  // 9. Normalize multiple blank lines
  text = text
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // 10. Restore code blocks with exact indentation using replacer function to prevent $& expansion
  codeBlocks.forEach((block, index) => {
    text = text.replace(`__CODE_BLOCK_${index}__`, () => block);
  });
  return text;
}

export function createWebFetchToolDefinition(): ToolDefinition {
  return {
    name: "web_fetch",
    description:
      "Fetch content from a public web URL and convert it into clean Markdown text (for documentation, blogs, API specs, issues).",
    argsSchema: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "The full HTTP/HTTPS URL to fetch content from.",
        },
        timeoutMs: {
          type: "number",
          description: "Optional fetch timeout in milliseconds (default: 20000).",
        },
      },
      required: ["url"],
    },
    permissions: { check: () => [] },
    async execute(args, context) {
      const rawUrl = typeof args.url === "string" ? args.url.trim() : "";
      if (!rawUrl) {
        return deniedResult("Error: URL parameter is required for web_fetch.");
      }

      if (!rawUrl.startsWith("http://") && !rawUrl.startsWith("https://")) {
        return deniedResult("Error: URL must start with http:// or https://");
      }

      const timeoutMs =
        typeof args.timeoutMs === "number" && args.timeoutMs > 0
          ? Math.min(args.timeoutMs, 60_000)
          : DEFAULT_FETCH_TIMEOUT_MS;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      if (context.abortSignal) {
        context.abortSignal.addEventListener("abort", () => controller.abort(), {
          once: true,
        });
      }

      try {
        const response = await fetch(rawUrl, {
          method: "GET",
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            Accept:
              "text/markdown, text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          return deniedResult(
            `HTTP ${response.status} ${response.statusText} fetching ${rawUrl}`,
          );
        }

        const contentType = response.headers.get("content-type") || "";
        const rawBody = await response.text();

        let formattedContent: string;
        if (
          contentType.includes("markdown") ||
          rawUrl.endsWith(".md") ||
          rawUrl.endsWith(".txt")
        ) {
          formattedContent = rawBody;
        } else {
          formattedContent = htmlToMarkdown(rawBody);
        }

        if (!formattedContent.trim()) {
          return approvedResult(
            `[Fetched ${rawUrl} successfully, but no readable text was extracted]`,
          );
        }

        let output = formattedContent;
        if (output.length > MAX_OUTPUT_CHARS) {
          output =
            output.slice(0, MAX_OUTPUT_CHARS) +
            `\n\n[Content truncated to ${MAX_OUTPUT_CHARS} characters. Full length: ${formattedContent.length}]`;
        }

        return approvedResult(output);
      } catch (err) {
        clearTimeout(timeoutId);
        const errorMsg =
          err instanceof Error ? err.message : String(err);
        return deniedResult(`Web fetch failed for ${rawUrl}: ${errorMsg}`);
      }
    },
  };
}

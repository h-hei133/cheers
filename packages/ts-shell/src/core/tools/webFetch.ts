import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import { blockedHostReason } from "../security/egressGuard.js";
import type { ToolDefinition } from "../../tools/types.js";

const DEFAULT_FETCH_TIMEOUT_MS = 20_000;
const MAX_OUTPUT_CHARS = 10_000;

/**
 * How much of a response body is read before giving up on it.
 *
 * The tool only ever returns ten thousand characters, so a body past this cannot
 * change what the model sees; it can only occupy memory until the process dies.
 * The limit exists because `response.text()` reads the whole thing first and
 * checks afterwards, which means a large enough response — a download endpoint,
 * a misconfigured path that streams a disk image — is an out-of-memory before it
 * is ever a truncation.
 */
const MAX_BODY_BYTES = 5 * 1024 * 1024;

/**
 * How many redirects are followed, and why each one is re-checked.
 *
 * Followed at all because a documentation link that moved is a normal thing to
 * fetch. Re-checked because the address rule has to apply to where the request
 * actually goes: a public URL that redirects to `169.254.169.254` is a public URL
 * by the first check and a metadata read by the second, and only following the
 * chain by hand lets the second one happen.
 */
const MAX_REDIRECTS = 5;

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

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "text/markdown, text/html, application/xhtml+xml, text/plain;q=0.9, */*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7",
} as const;

type FetchOutcome =
  | { readonly ok: true; readonly response: Response; readonly finalUrl: string }
  | { readonly ok: false; readonly reason: string };

/**
 * Whether a URL may be requested, and why not when it may not.
 *
 * Parsed rather than prefix-matched. A string test on `http://` accepts
 * `http://[::1]/` and `http://169.254.169.254/` equally, and the address is the
 * part that decides.
 */
function refuseUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return `Error: ${url} is not a valid URL`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `Error: refusing to fetch ${parsed.protocol}// — only http and https are allowed`;
  }
  const reason = blockedHostReason(parsed.hostname);
  if (reason) {
    return `Error: refusing to fetch ${url} — ${parsed.hostname} is a ${reason}. This tool reaches the public web only.`;
  }
  return undefined;
}

/**
 * Fetch `url`, following redirects one at a time so each hop is checked.
 *
 * `redirect: "manual"` is what makes that possible: with the default the runtime
 * follows the chain internally and the only URL the guard ever sees is the first
 * one, which is exactly the URL an attacker does not need to control.
 */
async function fetchFollowingCheckedRedirects(
  url: string,
  signal: AbortSignal,
): Promise<FetchOutcome> {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const refusal = refuseUrl(current);
    if (refusal) return { ok: false, reason: refusal };

    const response = await fetch(current, {
      method: "GET",
      headers: BROWSER_HEADERS,
      redirect: "manual",
      signal,
    });

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { ok: false, reason: `HTTP ${response.status} from ${current} carried no Location` };
      }
      if (hop === MAX_REDIRECTS) {
        return {
          ok: false,
          reason: `Error: ${url} redirected more than ${MAX_REDIRECTS} times; refusing to follow further`,
        };
      }
      // Relative locations are resolved against the URL that named them.
      current = new URL(location, current).toString();
      continue;
    }

    if (!response.ok) {
      return {
        ok: false,
        reason: `HTTP ${response.status} ${response.statusText} fetching ${current}`,
      };
    }
    return { ok: true, response, finalUrl: current };
  }
  return { ok: false, reason: `Error: too many redirects fetching ${url}` };
}

/**
 * Read a body up to `MAX_BODY_BYTES`, then stop and say so.
 *
 * Streamed rather than `response.text()` because the length is only knowable
 * after the fact otherwise: the whole body is already in memory by the time the
 * limit could be applied, and the limit exists to prevent exactly that. The
 * declared `Content-Length` is checked first to avoid reading at all when the
 * server has already said the answer, and it is not trusted on its own because a
 * server may omit it or understate it.
 */
async function readBoundedBody(
  response: Response,
): Promise<{ readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: string }> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return {
      ok: false,
      reason: `Error: response declares ${declared} bytes, past the ${MAX_BODY_BYTES}-byte read limit`,
    };
  }

  const stream = response.body;
  if (!stream) return { ok: true, text: "" };

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let read = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      read += value.byteLength;
      if (read > MAX_BODY_BYTES) {
        return {
          ok: false,
          reason: `Error: response exceeded the ${MAX_BODY_BYTES}-byte read limit; refused rather than truncated`,
        };
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(read);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(joined) };
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
      const onAbort = () => controller.abort();

      if (context.abortSignal) {
        context.abortSignal.addEventListener("abort", onAbort, { once: true });
      }

      try {
        const fetched = await fetchFollowingCheckedRedirects(rawUrl, controller.signal);
        if (!fetched.ok) return deniedResult(fetched.reason);

        const { response, finalUrl } = fetched;
        const contentType = response.headers.get("content-type") || "";
        const body = await readBoundedBody(response);
        if (!body.ok) return deniedResult(body.reason);

        const rawUrlForName = finalUrl;
        const rawBody = body.text;

        let formattedContent: string;
        if (
          contentType.includes("markdown") ||
          rawUrlForName.endsWith(".md") ||
          rawUrlForName.endsWith(".txt")
        ) {
          formattedContent = rawBody;
        } else {
          formattedContent = htmlToMarkdown(rawBody);
        }

        const notRendered = "no readable text was extracted";
        if (!formattedContent.trim()) {
          return approvedResult(
            `[Fetched ${rawUrlForName} successfully, but ${notRendered}]`,
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
      } finally {
        clearTimeout(timeoutId);
        if (context.abortSignal) {
          context.abortSignal.removeEventListener("abort", onAbort);
        }
      }
    },
  };
}

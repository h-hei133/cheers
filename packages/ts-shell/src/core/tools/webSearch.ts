import { httpError } from '../network/error.js';
import { requestScope, type RequestScope } from '../network/request.js';
import { discardResponse, readResponseText } from '../network/response.js';
import { webFailure, type WebSource } from './web/result.js';
import { boundSearchResults, parseSearchResults, type SearchResultItem, type SearchResults } from './web/search.js';
import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";

const DEFAULT_NUM_RESULTS = 5;
const MAX_SEARCH_OUTPUT_CHARS = 10_000;

const MAX_SEARCH_BODY_BYTES = 2 * 1024 * 1024;

export function formatSearchResults(query: string, results: readonly SearchResultItem[]): string {
  if (!results || results.length === 0) {
    return `No search results found for query: "${query}"`;
  }

  const lines: string[] = [`Search results for: "${query}"\n`];
  results.forEach((item, index) => {
    lines.push(`### ${index + 1}. ${item.title || "Untitled"}`);
    lines.push(`- **URL**: ${item.url}`);
    if (item.snippet) {
      lines.push(`- **Summary**: ${item.snippet.trim()}`);
    }
    lines.push("");
  });

  let output = lines.join("\n").trim();
  if (output.length > MAX_SEARCH_OUTPUT_CHARS) {
    output = output.slice(0, MAX_SEARCH_OUTPUT_CHARS) + `\n\n[Results truncated to ${MAX_SEARCH_OUTPUT_CHARS} characters]`;
  }
  return output;
}

function decodeHtmlText(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(Number.parseInt(code, 16)))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function unwrapResultUrl(href: string): string | undefined {
  if (!href) return undefined;
  const decoded = href.replace(/&amp;/gi, "&");
  const wrapMatch = decoded.match(/[?&]uddg=([^&]+)/);
  if (wrapMatch) {
    try {
      return decodeURIComponent(wrapMatch[1]);
    } catch {
      return undefined;
    }
  }
  if (decoded.startsWith("//")) return `https:${decoded}`;
  if (decoded.startsWith("http://") || decoded.startsWith("https://")) return decoded;
  return undefined;
}

/**
 * Free, keyless DuckDuckGo HTML search provider.
 * POSTs query to https://html.duckduckgo.com/html/ and parses static result elements.
 */
async function searchWithDuckDuckGo(
  query: string,
  numResults: number,
  scope: RequestScope,
): Promise<SearchResults> {
  scope.check();
  const formData = new URLSearchParams();
  formData.append("q", query);
  formData.append("b", "");
  formData.append("kl", "us-en");

  const res = await fetch("https://html.duckduckgo.com/html/", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
    },
    body: formData.toString(),
    signal: scope.signal,
  });

  if (!res.ok) { discardResponse(res); throw httpError(res.status); }
  const html = await readResponseText(res, scope, MAX_SEARCH_BODY_BYTES);
  scope.check();
  const results: SearchResultItem[] = [];

  const blockRe =
    /<div\b[^>]*\bclass="[^"]*\bresult\b[^"]*"[^>]*>([\s\S]*?)(?=<div\b[^>]*\bclass="[^"]*\bresult\b|<div\b[^>]*\bclass="[^"]*\bnav-link\b|$)/g;
  const titleRe = /<a\b[^>]*\bclass="[^"]*\bresult__a\b[^"]*"[^>]*\bhref="([^"]+)"[^>]*>([\s\S]*?)<\/a>/;
  const snippetRe = /<(?:a|div|span)\b[^>]*\bclass="[^"]*\bresult__snippet\b[^"]*"[^>]*>([\s\S]*?)<\/(?:a|div|span)>/;

  for (const match of html.matchAll(blockRe)) {
    const block = match[1];
    const title = titleRe.exec(block);
    if (!title) continue;

    const url = unwrapResultUrl(title[1]);
    if (!url) continue;

    const titleText = decodeHtmlText(title[2]);
    if (!titleText) continue;

    const snippet = snippetRe.exec(block);
    const snippetText = snippet ? decodeHtmlText(snippet[1]) : "";

    results.push({
      title: titleText,
      url,
      snippet: snippetText,
    });

    if (results.length > numResults) {
      break;
    }
  }

  scope.check();
  return boundSearchResults(results, numResults);
}

async function searchWithExa(
  query: string,
  apiKey: string,
  numResults: number,
  scope: RequestScope,
): Promise<SearchResults> {
  scope.check();
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "User-Agent": "cheers/1.0.0",
    },
    body: JSON.stringify({
      query,
      numResults,
      useAutoprompt: true,
      highlights: { numSentences: 2 },
    }),
    signal: scope.signal,
  });
  if (!res.ok) { discardResponse(res); throw httpError(res.status); }
  return parseSearchResults(await readResponseText(res, scope, MAX_SEARCH_BODY_BYTES), 'exa', numResults);
}

async function searchWithTavily(
  query: string,
  apiKey: string,
  numResults: number,
  scope: RequestScope,
): Promise<SearchResults> {
  scope.check();
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "cheers/1.0.0",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: numResults,
      search_depth: "basic",
      include_answer: false,
    }),
    signal: scope.signal,
  });
  if (!res.ok) { discardResponse(res); throw httpError(res.status); }
  return parseSearchResults(await readResponseText(res, scope, MAX_SEARCH_BODY_BYTES), 'tavily', numResults);
}

/**
 * /web_search tool
 * Configured web search provider selection with a keyless HTML default.
 */
export function createWebSearchToolDefinition(): ToolDefinition {
  return {
    name: "web_search",
    description:
      "Search the public web for real-time information, documentation, libraries, and technical references. Uses Exa/Tavily when configured, or keyless DuckDuckGo otherwise. Requests are not automatically retried or switched after failure.",
    argsSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "The web search query.",
        },
        numResults: {
          type: "number",
          description: "Number of search results to return (default: 5, max: 10).",
        },
      },
      required: ["query"],
    },
    async execute(args, context) {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) {
        return deniedResult("Error: Search query parameter is required.");
      }

      const numResults =
        typeof args.numResults === "number" && Number.isFinite(args.numResults) && args.numResults >= 1
          ? Math.min(Math.floor(args.numResults), 10)
          : DEFAULT_NUM_RESULTS;

      const exaKey = process.env.EXA_API_KEY;
      const tavilyKey = process.env.TAVILY_API_KEY;

      const source: WebSource = exaKey ? 'exa' : tavilyKey ? 'tavily' : 'keyless';
      const scope = requestScope(source === 'keyless' ? 15_000 : 20_000, context.abortSignal);
      try {
        scope.check();
        const results = exaKey ? await searchWithExa(query, exaKey, numResults, scope)
          : tavilyKey ? await searchWithTavily(query, tavilyKey, numResults, scope)
          : await searchWithDuckDuckGo(query, numResults, scope);
        scope.check();
        const output = formatSearchResults(query, results.items)
          + (results.truncated ? '\n\n[Search results truncated to the requested count or display field limits.]' : '');
        scope.check();
        return approvedResult(output, {
          network: { source }, truncated: results.truncated || output.length > MAX_SEARCH_OUTPUT_CHARS,
        });
      } catch (error) {
        try { scope.check(); } catch (stopped) { return webFailure(source, stopped); }
        return webFailure(source, error);
      } finally {
        scope.dispose();
      }
    },
  };
}

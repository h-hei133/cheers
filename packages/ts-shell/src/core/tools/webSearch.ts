import { approvedResult, deniedResult } from "./toolResultLifecycle.js";
import type { ToolDefinition } from "../../tools/types.js";

const DEFAULT_NUM_RESULTS = 5;
const MAX_SEARCH_OUTPUT_CHARS = 10_000;

interface SearchResultItem {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

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

async function searchWithExa(
  query: string,
  apiKey: string,
  numResults: number,
  signal?: AbortSignal,
): Promise<SearchResultItem[]> {
  const effectiveSignal = signal ?? AbortSignal.timeout(20_000);
  const res = await fetch("https://api.exa.ai/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "User-Agent": "coding-agents/1.0.0",
    },
    body: JSON.stringify({
      query,
      numResults,
      useAutoprompt: true,
      highlights: { numSentences: 2 },
    }),
    signal: effectiveSignal,
  });
  if (!res.ok) {
    throw new Error(`Exa API returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      highlights?: string[];
      text?: string;
    }>;
  };

  return (data.results || []).map((r) => ({
    title: r.title || "Untitled",
    url: r.url || "",
    snippet: r.highlights?.join(" ") || r.text?.slice(0, 300) || "",
  }));
}

async function searchWithTavily(
  query: string,
  apiKey: string,
  numResults: number,
  signal?: AbortSignal,
): Promise<SearchResultItem[]> {
  const effectiveSignal = signal ?? AbortSignal.timeout(20_000);
  const res = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_key: apiKey,
      query,
      max_results: numResults,
      include_snippets: true,
    }),
    signal: effectiveSignal,
  });
  if (!res.ok) {
    throw new Error(`Tavily API returned ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as {
    results?: Array<{
      title?: string;
      url?: string;
      content?: string;
    }>;
  };

  return (data.results || []).map((r) => ({
    title: r.title || "Untitled",
    url: r.url || "",
    snippet: r.content || "",
  }));
}

export function createWebSearchToolDefinition(): ToolDefinition {
  return {
    name: "web_search",
    description:
      "Search the public web for real-time information, documentation, libraries, and technical references.",
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
    permissions: { check: () => [] },
    async execute(args, context) {
      const query = typeof args.query === "string" ? args.query.trim() : "";
      if (!query) {
        return deniedResult("Error: Search query parameter is required.");
      }

      const numResults =
        typeof args.numResults === "number" && args.numResults > 0
          ? Math.min(Math.floor(args.numResults), 10)
          : DEFAULT_NUM_RESULTS;

      const exaKey = process.env.EXA_API_KEY;
      const tavilyKey = process.env.TAVILY_API_KEY;

      try {
        let results: SearchResultItem[] = [];

        if (exaKey) {
          results = await searchWithExa(query, exaKey, numResults, context.abortSignal);
        } else if (tavilyKey) {
          results = await searchWithTavily(query, tavilyKey, numResults, context.abortSignal);
        } else {
          return deniedResult(
            `Web search is not configured: missing EXA_API_KEY / TAVILY_API_KEY environment variables.\n` +
            `Please configure your search provider API keys or use web_fetch to read specific URLs directly.`,
          );
        }

        return approvedResult(formatSearchResults(query, results));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return deniedResult(`Web search error for "${query}": ${msg}`);
      }
    },
  };
}

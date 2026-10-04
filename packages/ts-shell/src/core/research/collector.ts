import { createWebSearchToolDefinition } from "../tools/webSearch.js";
import { createWebFetchToolDefinition } from "../tools/webFetch.js";
import { ParallelDispatcher } from "../workflow/parallelDispatcher.js";
import type { ToolExecutionContext } from "../../tools/types.js";
import type { CollectedPage, CollectionReport } from "./types.js";

// Read only the URL fields emitted by web_search, not links in queries or snippets.
function resultUrls(output: string): string[] {
  const urls = new Set<string>();
  for (const match of output.matchAll(/^- \*\*URL\*\*: (https?:\/\/\S+)\s*$/gm)) {
    try {
      const url = new URL(match[1]);
      if (url.username || url.password) continue;
      url.hash = "";
      urls.add(url.href);
    } catch {
      // Malformed result URLs are not fetch candidates.
    }
  }
  return [...urls].slice(0, 3);
}

function excerptsFrom(output: string): string[] {
  // Keep whole lines verbatim so negation and punctuation retain their meaning.
  return output.split(/\r?\n/).map((line) => line.trim()).filter((line) =>
    line.length >= 25 && line.length <= 1000 &&
    !/^\[(Fetched .* successfully, but no readable text was extracted|Content truncated to )/.test(line)
  ).slice(0, 5);
}

export async function collectSources(topic: string, context: ToolExecutionContext): Promise<CollectionReport> {
  const search = createWebSearchToolDefinition();
  const fetchPage = createWebFetchToolDefinition();
  const queries = [
    `${topic} official documentation architecture best practices`,
    `${topic} implementation comparison tradeoffs benchmark`,
  ];
  const searches = await Promise.all(queries.map(async (query) => {
    try {
      const result = await search.execute({ query, numResults: 3 }, context);
      return { query, status: result.success ? "completed" as const : "failed" as const,
        urls: result.success ? resultUrls(result.output ?? "") : [] };
    } catch {
      return { query, status: "failed" as const, urls: [] };
    }
  }));
  const urls = [...new Set(searches.flatMap((result) => result.urls))];
  const pages = await ParallelDispatcher.run(urls.map((url) => async (): Promise<CollectedPage> => {
    try {
      const result = await fetchPage.execute({ url }, context);
      const excerpts = result.success ? excerptsFrom(result.output ?? "") : [];
      return { url, excerpts,
        status: !result.success ? "failed" : excerpts.length ? "collected" : "empty" };
    } catch {
      return { url, status: "failed", excerpts: [] };
    }
  }), { maxConcurrency: 2 });
  return { topic, queries: searches.map(({ query, status }) => ({ query, status })), pages };
}

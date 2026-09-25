import { describe, expect, it } from "vitest";
import http from "node:http";
import fs from "node:fs";
import { refreshCatalog } from "./catalogRefresh.js";

/**
 * What a refresh keeps from the published index.
 *
 * The index states more than this shell used to read, and the fields it dropped
 * were the ones nothing could be computed without: prices. A cost report could
 * not be produced from the shipped snapshot, and neither could any decision that
 * weighs a saving against a spend, because the rates were discarded on the way
 * in and never reached the catalog.
 */

/** Serve one index document on a loopback port for the duration of a test. */
async function withIndex<T>(document: unknown, run: (url: string) => Promise<T>): Promise<T> {
  const server = http.createServer((_request, response) => {
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify(document));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  try {
    return await run(`http://127.0.0.1:${port}/api.json`);
  } finally {
    server.close();
  }
}

function readCache(path: string): Record<string, { models?: readonly Record<string, unknown>[] }> {
  const parsed = JSON.parse(fs.readFileSync(path, "utf8")) as {
    providers: Record<string, { models?: readonly Record<string, unknown>[] }>;
  };
  return parsed.providers;
}

describe("refreshing the catalogue", () => {
  it("keeps the prices the index publishes", () => {
    // Dropped before, which is why no cost could be reported and why a decision
    // weighing a saving against a spend had nothing to weigh.
    const document = {
      demo: {
        name: "Demo",
        env: ["DEMO_API_KEY"],
        models: {
          large: {
            id: "large",
            limit: { context: 128_000 },
            cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
          },
        },
      },
    };

    return withIndex(document, async (url) => {
      const result = await refreshCatalog(url);
      expect(result.ok).toBe(true);
      const models = readCache(result.cachePath!).demo?.models ?? [];
      expect(models[0]?.cost).toEqual({
        promptPerMTok: 3,
        completionPerMTok: 15,
        cacheReadPerMTok: 0.3,
        cacheWritePerMTok: 3.75,
      });
    });
  });

  it("leaves a model unpriced rather than calling it free", () => {
    // An entry filled with zeroes claims the model costs nothing, which is a
    // measurement nobody made.
    const document = {
      demo: { name: "Demo", models: { plain: { id: "plain", limit: { context: 8_000 } } } },
    };

    return withIndex(document, async (url) => {
      const result = await refreshCatalog(url);
      const models = readCache(result.cachePath!).demo?.models ?? [];
      expect(models[0]?.cost).toBeUndefined();
      expect(models[0]?.contextWindow).toBe(8_000);
    });
  });

  it("keeps a partial price list without inventing the missing half", () => {
    // Some publishers state only what they charge for a cache read. The rates
    // that are absent stay absent.
    const document = {
      demo: {
        name: "Demo",
        models: { partial: { id: "partial", cost: { input: 1, cache_read: 0.1 } } },
      },
    };

    return withIndex(document, async (url) => {
      const result = await refreshCatalog(url);
      const models = readCache(result.cachePath!).demo?.models ?? [];
      expect(models[0]?.cost).toEqual({ promptPerMTok: 1, completionPerMTok: 0, cacheReadPerMTok: 0.1 });
    });
  });

  it("reports a failure rather than writing an empty catalogue", async () => {
    const result = await refreshCatalog("http://127.0.0.1:1/absent.json");
    expect(result.ok).toBe(false);
    expect(result.cachePath).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});

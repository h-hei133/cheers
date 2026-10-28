import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { refreshCatalog } from "./catalogRefresh.js";
import { catalogCachePath, loadCatalog, userCatalogPath } from "./catalogStore.js";
import { catalogModel } from "./catalog.js";
import { effortCapability } from "./capability.js";
import { resolveRequestShape } from "./requestShape.js";
import { renderCatalog } from "./catalogSurface.js";

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

let isolatedHome: string | undefined;

beforeEach(() => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  isolatedHome = fs.mkdtempSync('/tmp/cheers-test/catalog-refresh-');
  vi.stubEnv('HOME', isolatedHome);
  vi.stubEnv('USERPROFILE', isolatedHome);
  vi.stubEnv('CHEERS_TEST_ROOT', isolatedHome);
});

afterEach(() => {
  vi.unstubAllEnvs();
  if (isolatedHome) fs.rmSync(isolatedHome, { recursive: true, force: true });
  isolatedHome = undefined;
});

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

  it("keeps the capability metadata the index publishes", () => {
    const document = {
      demo: {
        name: "Demo",
        models: {
          multimodal: {
            id: "multimodal",
            reasoning: true,
            tool_call: true,
            temperature: false,
            modalities: { input: ["text", "image"], output: ["text"] },
            limit: { context: 200_000, input: 190_000, output: 32_000 },
          },
          plain: {
            id: "plain",
            reasoning: false,
            tool_call: false,
            temperature: true,
            modalities: { input: ["text"], output: ["text"] },
            limit: { context: 8_000, output: 2_000 },
          },
          legacy: {
            id: "legacy",
            limit: { context: 4_000 },
          },
        },
      },
    };

    return withIndex(document, async (url) => {
      const result = await refreshCatalog(url);
      expect(result.ok).toBe(true);
      const models = readCache(result.cachePath!).demo?.models ?? [];
      expect(models.find((model) => model.id === "multimodal")).toMatchObject({
        vision: true,
        reasoning: true,
        toolCalling: true,
        maxTokens: 32_000,
        inputLimit: 190_000,
        compat: { supportsTemperature: false },
      });
      expect(models.find((model) => model.id === "plain")).toMatchObject({
        vision: false,
        reasoning: false,
        toolCalling: false,
        maxTokens: 2_000,
        compat: { supportsTemperature: true },
      });
      const legacy = models.find((model) => model.id === "legacy");
      for (const field of ["vision", "reasoning", "toolCalling", "maxTokens", "compat"]) {
        expect(legacy).not.toHaveProperty(field);
      }
    });
  });

  it("does not persist malformed published limits", () => {
    const document = {
      demo: {
        name: "Demo",
        models: {
          negative: { id: "negative", limit: { context: -128_000, input: -120_000, output: -32_000 } },
          fractional: { id: "fractional", limit: { context: 128_000.5, input: 120_000.5, output: 32_000.5 } },
          textual: { id: "textual", limit: { context: "128000", input: "120000", output: "32000" } },
          zero: { id: "zero", limit: { context: 0, input: 0, output: 0 } },
          unsafe: { id: "unsafe", limit: { context: Number.MAX_SAFE_INTEGER + 1, input: Number.MAX_SAFE_INTEGER + 1, output: Number.MAX_SAFE_INTEGER + 1 } },
          valid: { id: "valid", limit: { context: 128_000, input: 120_000, output: 32_000 } },
        },
      },
    };

    return withIndex(document, async (url) => {
      const result = await refreshCatalog(url);
      expect(result.ok).toBe(true);
      const models = readCache(result.cachePath!).demo?.models ?? [];
      for (const id of ["negative", "fractional", "textual", "zero", "unsafe"]) {
        const model = models.find(candidate => candidate.id === id);
        for (const field of ["contextWindow", "inputLimit", "maxTokens"]) {
          expect(model).not.toHaveProperty(field);
        }
      }
      expect(models.find(model => model.id === "valid")).toMatchObject({
        contextWindow: 128_000,
        inputLimit: 120_000,
        maxTokens: 32_000,
      });
    });
  });

  it("drops malformed limits already present in a cache", () => {
    const cachePath = catalogCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({
      providers: {
        demo: {
          label: "Demo",
          runtime: "openai-compatible",
          auth: "api-key",
          models: [{
            id: "poisoned",
            contextWindow: -1,
            inputLimit: 0,
            maxTokens: Number.MAX_SAFE_INTEGER + 1,
          }],
        },
      },
    }));
    const model = catalogModel(loadCatalog(), "demo", "poisoned");
    expect(model).toBeDefined();
    for (const field of ["contextWindow", "inputLimit", "maxTokens"]) {
      expect(model).not.toHaveProperty(field);
    }
  });

  it("drops malformed limit patches to built-in models", () => {
    const cachePath = catalogCachePath();
    fs.mkdirSync(path.dirname(cachePath), { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify({
      providers: {
        openai: {
          models: [{
            id: "gpt-5.3",
            contextWindow: -1,
            inputLimit: -1,
            maxTokens: -1,
          }],
        },
      },
    }));
    const model = catalogModel(loadCatalog(), "openai", "gpt-5.3");
    expect(model?.contextWindow).toBe(400_000);
    expect(model).not.toHaveProperty("inputLimit");
    expect(model).not.toHaveProperty("maxTokens");
  });

  it("marks only providers from the user catalogue as custom", async () => {
    const document = {
      demo: {
        name: "Demo",
        models: { fresh: { id: "fresh", limit: { context: 8_000 } } },
      },
      openai: {
        name: "OpenAI",
        models: { "cached-model": { id: "cached-model", limit: { context: 16_000 } } },
      },
    };
    await withIndex(document, async (url) => {
      expect((await refreshCatalog(url)).ok).toBe(true);
      fs.writeFileSync(userCatalogPath(), JSON.stringify({
        providers: {
          mine: {
            label: "Mine",
            runtime: "openai-compatible",
            auth: "api-key",
            models: [{ id: "local" }],
          },
        },
      }));
      const catalog = loadCatalog();
      const rendered = renderCatalog({
        providers: catalog,
        availability: { activeProvider: "openai", providers: [] },
        configPath: userCatalogPath(),
      });
      const lineFor = (id: string) => rendered.split("\n").find(line => line.includes(`\`${id}\``));
      expect(lineFor("demo")).not.toContain("yours");
      expect(lineFor("openai")).not.toContain("yours");
      expect(lineFor("mine")).toContain("yours");
    });
  });

  it("projects only exact declared reasoning effort levels", async () => {
    const document = {
      demo: {
        name: "Demo",
        models: {
          partial: {
            id: "partial",
            reasoning: true,
            reasoning_options: [
              { type: "budget_tokens", max: 32_000 },
              { type: "effort", values: ["low", "high"] },
            ],
          },
          empty: { id: "empty", reasoning: true, reasoning_options: [] },
          special: {
            id: "special",
            reasoning: true,
            reasoning_options: [{ type: "effort", values: [null, "none", "minimal", "xhigh", "max", "default"] }],
          },
          toggle: { id: "toggle", reasoning: true, reasoning_options: [{ type: "toggle" }] },
          budget: { id: "budget", reasoning: true, reasoning_options: [{ type: "budget_tokens", max: 32_000 }] },
          absent: { id: "absent", reasoning: true },
          malformed: { id: "malformed", reasoning: true, reasoning_options: [{ type: "effort" }] },
          nonarray: { id: "nonarray", reasoning: true, reasoning_options: { type: "effort", values: ["low"] } },
          future: { id: "future", reasoning: true, reasoning_options: [{ type: "future" }] },
        },
      },
    };

    await withIndex(document, async (url) => {
      const result = await refreshCatalog(url);
      expect(result.ok).toBe(true);
      const models = readCache(result.cachePath!).demo?.models ?? [];
      expect(models.find(model => model.id === "partial")?.thinkingLevelMap).toEqual({
        low: "low",
        medium: null,
        high: "high",
      });
      const unsupported = { low: null, medium: null, high: null };
      for (const id of ["empty", "special", "toggle", "budget"]) {
        expect(models.find(model => model.id === id)?.thinkingLevelMap).toEqual(unsupported);
      }
      for (const id of ["absent", "malformed", "nonarray", "future"]) {
        expect(models.find(model => model.id === id)).toBeDefined();
        expect(models.find(model => model.id === id)).not.toHaveProperty("thinkingLevelMap");
      }

      const catalog = loadCatalog();
      expect(effortCapability(catalog, "demo", "partial", "low")).toBe("supported");
      expect(effortCapability(catalog, "demo", "partial", "medium")).toBe("unsupported");
      expect(effortCapability(catalog, "demo", "partial", null)).toBe("supported");
      expect(effortCapability(catalog, "demo", "budget", "low")).toBe("unsupported");
      expect(resolveRequestShape(catalog, "demo", "partial", "low").thinkingLevelName).toBe("low");
      expect(resolveRequestShape(catalog, "demo", "budget", "low").thinkingLevelName).toBeUndefined();
    });
  });

  it("fills missing built-in capabilities without overriding reviewed request constraints", async () => {
    const document = {
      openai: {
        name: "OpenAI",
        models: {
          "gpt-5.3-codex": {
            id: "gpt-5.3-codex",
            reasoning: false,
            temperature: true,
            modalities: { input: ["text", "image"], output: ["text"] },
            limit: { context: 500_000, output: 128_000 },
          },
        },
      },
    };
    await withIndex(document, async (url) => {
      expect((await refreshCatalog(url)).ok).toBe(true);
      const catalog = loadCatalog();
      const shape = resolveRequestShape(catalog, "openai", "gpt-5.3-codex");
      expect(shape).toMatchObject({
        supportsTemperature: false,
        vision: false,
        reasoningEffort: true,
        maxOutputCeiling: 128_000,
      });
    });
  });

  it("reports a failure rather than writing an empty catalogue", async () => {
    const result = await refreshCatalog("http://127.0.0.1:1/absent.json");
    expect(result.ok).toBe(false);
    expect(result.cachePath).toBeUndefined();
    expect(result.error).toBeTruthy();
  });
});

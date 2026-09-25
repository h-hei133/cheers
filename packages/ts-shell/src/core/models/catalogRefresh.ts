import type { CatalogProvider, CatalogModel, ModelCostRates } from "./catalog.js";
import { writeCatalogCache } from "./catalogStore.js";

/**
 * Refreshing the catalogue from a public index.
 *
 * Explicit, never automatic. The shipped snapshot is what a session starts from,
 * so nothing here runs unless a user asks — a background fetch would make an
 * outbound request a condition of starting up, and make the catalogue depend on
 * an endpoint we do not control.
 *
 * The request carries nothing: no key, no prompt, no project. It reads a public
 * index of providers and models and writes it to our own cache.
 */

const DEFAULT_INDEX = "https://models.dev/api.json";
const TIMEOUT_MS = 10_000;

export interface RefreshResult {
  readonly ok: boolean;
  readonly providers: number;
  readonly models: number;
  readonly cachePath?: string;
  readonly error?: string;
}

/** Shape of the public index: provider id → { name, models: { id → model } }. */
interface IndexProvider {
  readonly name?: string;
  readonly api?: string;
  readonly env?: readonly string[];
  readonly models?: Record<string, IndexModel>;
}

/** One model as the index describes it. */
interface IndexModel {
  readonly id?: string;
  readonly limit?: { readonly context?: number };
  /**
   * What the publisher charges, per million tokens.
   *
   * Optional in the index and optional here: a model with no published price is
   * one nothing can be said about, and inventing a rate would make a cost report
   * read like a measurement.
   */
  readonly cost?: {
    readonly input?: number;
    readonly output?: number;
    readonly cache_read?: number;
    readonly cache_write?: number;
  };
}

export async function refreshCatalog(indexUrl: string = DEFAULT_INDEX): Promise<RefreshResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(indexUrl, { signal: controller.signal });
    if (!response.ok) {
      return { ok: false, providers: 0, models: 0, error: `index returned ${response.status}` };
    }
    const index = (await response.json()) as Record<string, IndexProvider>;
    const providers = projectIndex(index);
    if (providers.length === 0) {
      return { ok: false, providers: 0, models: 0, error: "index held no providers" };
    }
    const models = providers.reduce((total, provider) => total + (provider.models?.length ?? 0), 0);
    return { ok: true, providers: providers.length, models, cachePath: writeCatalogCache(providers) };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, providers: 0, models: 0, error: message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Turn the index into provider patches.
 *
 * Only the fields we can act on are kept — id, label, models, key variable,
 * prices — and the request shape is left alone: the index describes providers,
 * not how this shell talks to them, and guessing that from a string would break
 * a connection that already works.
 */
function projectIndex(index: Record<string, IndexProvider>): Partial<CatalogProvider>[] {
  const providers: Partial<CatalogProvider>[] = [];
  for (const [id, entry] of Object.entries(index)) {
    if (!id || typeof entry !== "object" || entry === null) continue;
    const models: CatalogModel[] = [];
    for (const [modelId, model] of Object.entries(entry.models ?? {})) {
      const resolved = model?.id ?? modelId;
      if (!resolved) continue;
      const context = model?.limit?.context;
      const cost = projectCost(model?.cost);
      models.push({
        id: resolved,
        ...(context ? { contextWindow: context } : {}),
        ...(cost ? { cost } : {}),
      });
    }
    if (models.length === 0) continue;
    providers.push({
      id,
      label: entry.name ?? id,
      models,
      ...(entry.env?.[0] ? { envVar: entry.env[0] } : {}),
    });
  }
  return providers;
}

/**
 * The published prices, in this project's terms.
 *
 * The index names its rates `input`/`output`/`cache_read`/`cache_write` and
 * quotes them per million tokens, which is what `ModelCostRates` expects — the
 * mapping is a rename rather than a conversion, and it is written out so the two
 * vocabularies cannot drift apart silently.
 *
 * Absent when the index states no price at all. A model whose rates are all
 * missing is one whose cost cannot be reported, and a zero-filled entry would
 * claim it is free.
 */
function projectCost(cost: IndexModel["cost"]): ModelCostRates | undefined {
  if (!cost) return undefined;
  const prompt = finite(cost.input);
  const completion = finite(cost.output);
  if (prompt === undefined && completion === undefined) return undefined;
  const cacheRead = finite(cost.cache_read);
  const cacheWrite = finite(cost.cache_write);
  return {
    promptPerMTok: prompt ?? 0,
    completionPerMTok: completion ?? 0,
    ...(cacheRead !== undefined ? { cacheReadPerMTok: cacheRead } : {}),
    ...(cacheWrite !== undefined ? { cacheWritePerMTok: cacheWrite } : {}),
  };
}

/** A published rate, or nothing when the index did not state one. */
function finite(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

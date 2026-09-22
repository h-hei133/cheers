import type { CatalogProvider, CatalogModel } from "./catalog.js";
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
  readonly models?: Record<string, { readonly id?: string; readonly limit?: { readonly context?: number } }>;
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
 * Only the fields we can act on are kept — id, label, models, key variable — and
 * the request shape is left alone: the index describes providers, not how this
 * shell talks to them, and guessing that from a string would break a connection
 * that already works.
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
      models.push(context ? { id: resolved, contextWindow: context } : { id: resolved });
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

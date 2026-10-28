import { THINKING_LEVELS, type CatalogProvider, type CatalogModel, type ModelCostRates } from "./catalog.js";
import { writeCatalogCache } from "./catalogStore.js";
import { positiveTokenLimit } from "./limits.js";

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
  readonly limit?: { readonly context?: number; readonly input?: number; readonly output?: number };
  /** Whether the model reasons and whether it accepts sampling temperature. */
  readonly reasoning?: boolean;
  /** Whether the deployment supports tool declarations and tool-call history. */
  readonly tool_call?: boolean;
  /** How the provider lets a caller control reasoning. */
  readonly reasoning_options?: readonly IndexReasoningOption[];
  readonly temperature?: boolean;
  /** Inputs the deployment accepts; image support is a request-shape capability. */
  readonly modalities?: {
    readonly input?: readonly string[];
    readonly output?: readonly string[];
  };
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

interface IndexReasoningOption {
  readonly type?: unknown;
  readonly values?: readonly unknown[];
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
 * prices and explicitly published model capabilities. The provider protocol is
 * left alone: the index describes the model, not how this shell talks to the
 * provider, and guessing that from a string would break a connection that
 * already works.
 */
function projectIndex(index: Record<string, IndexProvider>): Partial<CatalogProvider>[] {
  const providers: Partial<CatalogProvider>[] = [];
  for (const [id, entry] of Object.entries(index)) {
    if (!id || typeof entry !== "object" || entry === null) continue;
    const models: CatalogModel[] = [];
    for (const [modelId, model] of Object.entries(entry.models ?? {})) {
      const resolved = model?.id ?? modelId;
      if (!resolved) continue;
      const context = positiveTokenLimit(model?.limit?.context);
      const inputLimit = positiveTokenLimit(model?.limit?.input);
      const maxTokens = positiveTokenLimit(model?.limit?.output);
      const cost = projectCost(model?.cost);
      const vision = Array.isArray(model?.modalities?.input)
        ? model.modalities.input.includes("image")
        : undefined;
      const thinkingLevelMap = projectThinkingLevelMap(model?.reasoning_options);
      const compat = typeof model?.temperature === "boolean"
        ? { supportsTemperature: model.temperature }
        : undefined;
      models.push({
        id: resolved,
        ...(context !== undefined ? { contextWindow: context } : {}),
        ...(inputLimit !== undefined ? { inputLimit } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
        ...(typeof model?.reasoning === "boolean" ? { reasoning: model.reasoning } : {}),
        ...(typeof model?.tool_call === "boolean" ? { toolCalling: model.tool_call } : {}),
        ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
        ...(vision !== undefined ? { vision } : {}),
        ...(compat ? { compat } : {}),
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

/**
 * Project only exact project-level effort names.
 *
 * Models.dev has a wider vocabulary. `minimal`, `xhigh`, and `max` are not
 * interchangeable with this project's levels, while `none` disables reasoning
 * and `default` is not the same as automatic. Guessing those names would turn a
 * capability claim into a request the endpoint may reject.
 *
 * Valid options without an exact named level cannot authorize a raw project
 * effort. Budget-only, toggle-only, and empty declarations therefore make all
 * three explicit project levels unsupported while automatic effort remains
 * available. Structurally unknown metadata stays unprojected for compatibility.
 */
function projectThinkingLevelMap(options: unknown): CatalogModel["thinkingLevelMap"] | undefined {
  if (!Array.isArray(options)) return undefined;
  const supported = new Set<string>();
  let hasEffort = false;
  let hasUnknown = false;
  for (const raw of options) {
    if (typeof raw !== "object" || raw === null) {
      hasUnknown = true;
      continue;
    }
    const option = raw as IndexReasoningOption;
    if (option.type === "effort") {
      if (!Array.isArray(option.values)) {
        hasUnknown = true;
        continue;
      }
      hasEffort = true;
      for (const value of option.values) {
        if (typeof value === "string") supported.add(value);
      }
    } else if (option.type !== "budget_tokens" && option.type !== "toggle") {
      hasUnknown = true;
    }
  }
  if (hasEffort) {
    return Object.fromEntries(
      THINKING_LEVELS.map(level => [level, supported.has(level) ? level : null]),
    ) as NonNullable<CatalogModel["thinkingLevelMap"]>;
  }
  if (hasUnknown) return undefined;
  return Object.fromEntries(
    THINKING_LEVELS.map(level => [level, null]),
  ) as NonNullable<CatalogModel["thinkingLevelMap"]>;
}

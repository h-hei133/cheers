import { THINKING_LEVELS, type CatalogProvider, type CatalogModel } from "./catalog.js";
import { projectIndexPrices } from './prices.js';
import { assertCacheCurrent, CacheFailure, captureCache, encodeCache, publishCache, type CacheOutcome } from './cache/store.js';
import { positiveTokenLimit } from "./limits.js";
import { normalizeModalities, withDefaultImageLimits } from "./modalities.js";

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
  readonly notModified?: boolean;
  readonly etag?: string;
  readonly cachePath?: string;
  readonly error?: string;
  /** This operation's own publication, independent of session application. */
  readonly cacheOutcome?: CacheOutcome;
  readonly errorKind?: 'network' | 'http' | 'json' | 'invalid_index' | 'cancelled' | 'admission' | 'stale' | 'storage';
}

export interface RefreshOptions {
  readonly etag?: string;
  readonly signal?: AbortSignal;
  readonly admission?: () => string | undefined;
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
  readonly type?: string;
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
    readonly tiers?: readonly unknown[];
    readonly context_over_200k?: unknown;
  };
}

interface IndexReasoningOption {
  readonly type?: unknown;
  readonly values?: readonly unknown[];
}

export async function refreshCatalog(
  indexUrl: string = DEFAULT_INDEX,
  options?: RefreshOptions,
): Promise<RefreshResult> {
  const { etag: suppliedEtag, signal: callerSignal, admission } = options ?? {};
  const controller = new AbortController();
  const signal = callerSignal ? AbortSignal.any([callerSignal, controller.signal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let phase: NonNullable<RefreshResult['errorKind']> = 'storage';
  const checkAdmission = () => {
    if (signal.aborted) throw new CacheFailure('cancelled');
    let refused: string | undefined;
    try { refused = admission?.(); }
    catch { throw new CacheFailure('admission'); }
    if (signal.aborted) throw new CacheFailure('cancelled');
    if (refused) throw new CacheFailure('admission');
  };
  try {
    checkAdmission();
    const captured = captureCache();
    const guard = () => { checkAdmission(); assertCacheCurrent(captured); };
    guard();
    const stored = captured.stored;
    const validator = stored?.indexUrl === indexUrl && typeof stored.etag === 'string' && stored.etag
      && (suppliedEtag === undefined || suppliedEtag === stored.etag) ? stored.etag : undefined;
    phase = 'network';
    const response = await fetch(indexUrl, {
      signal,
      ...(validator ? { headers: { "if-none-match": validator } } : {}),
    });
    guard();
    if (response.status === 304) {
      if (!stored || !validator) return refreshFailure('invalid_index');
      const rotatedEtag = response.headers.get("etag") ?? validator;
      const content = rotatedEtag === stored.etag ? undefined : `${JSON.stringify({ ...stored, etag: rotatedEtag }, null, 2)}\n`;
      const publication = publishCache(captured, content, checkAdmission);
      return { ...publication, providers: publication.ok || publication.cacheOutcome === 'saved' ? captured.providers : 0,
        models: publication.ok || publication.cacheOutcome === 'saved' ? captured.models : 0,
        ...(publication.ok ? { notModified: true } : {}),
        ...(publication.ok || publication.cacheOutcome === 'saved' ? { etag: rotatedEtag } : {}) };
    }
    if (!response.ok) {
      void response.body?.cancel().catch(() => {});
      return refreshFailure('http', response.status);
    }
    const responseEtag = response.headers.get("etag") ?? undefined;
    phase = 'json';
    const index: unknown = await response.json();
    guard();
    phase = 'invalid_index';
    const providers = projectIndex(index);
    if (providers.length === 0) return refreshFailure('invalid_index');
    const models = providers.reduce((total, provider) => total + (provider.models?.length ?? 0), 0);
    const publication = publishCache(captured, encodeCache(providers, { indexUrl, etag: responseEtag }), checkAdmission);
    return {
      ...publication,
      providers: publication.ok || publication.cacheOutcome === 'saved' ? providers.length : 0,
      models: publication.ok || publication.cacheOutcome === 'saved' ? models : 0,
      ...(responseEtag && (publication.ok || publication.cacheOutcome === 'saved') ? { etag: responseEtag } : {}),
    };
  } catch (error) {
    return refreshFailure(error instanceof CacheFailure ? error.kind : signal.aborted ? 'cancelled'
      : phase === 'json' && !(error instanceof SyntaxError) ? 'network' : phase);
  } finally {
    clearTimeout(timer);
    // A rejected header-only response still owns an open body until its request is retired.
    controller.abort();
  }
}

function refreshFailure(kind: NonNullable<RefreshResult['errorKind']>, status?: number): RefreshResult {
  const error = kind === 'network' ? 'Catalogue index is unavailable.'
    : kind === 'http' ? `Catalogue index returned HTTP ${status}.`
    : kind === 'json' ? 'Catalogue index returned invalid JSON.'
    : kind === 'invalid_index' ? 'Catalogue index held no usable model body.'
    : new CacheFailure(kind).message;
  return { ok: false, providers: 0, models: 0, cacheOutcome: 'unchanged', errorKind: kind, error };
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
function projectIndex(index: unknown): Partial<CatalogProvider>[] {
  const providers: Partial<CatalogProvider>[] = [];
  if (!index || typeof index !== 'object' || Array.isArray(index)) return providers;
  for (const [id, value] of Object.entries(index)) {
    if (!id.trim() || !value || typeof value !== 'object' || Array.isArray(value)) continue;
    const entry = value as IndexProvider;
    if (!entry.models || typeof entry.models !== 'object' || Array.isArray(entry.models)) continue;
    const models: CatalogModel[] = [];
    for (const [modelId, value] of Object.entries(entry.models)) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      const model = value as IndexModel;
      const resolved = model.id === undefined ? modelId : model.id;
      if (typeof resolved !== 'string' || !resolved.trim()) continue;
      const context = positiveTokenLimit(model?.limit?.context);
      const inputLimit = positiveTokenLimit(model?.limit?.input);
      const maxTokens = positiveTokenLimit(model?.limit?.output);
      const cost = projectIndexPrices(model?.cost);
      const inputModalities = normalizeModalities(model?.modalities?.input);
      const outputModalities = normalizeModalities(model?.modalities?.output);
      const vision = inputModalities
        ? inputModalities.includes("image")
        : Array.isArray(model?.modalities?.input)
          ? model.modalities.input.includes("image")
          : undefined;
      const thinkingLevelMap = projectThinkingLevelMap(model?.reasoning_options);
      const compat = typeof model?.temperature === "boolean"
        ? { supportsTemperature: model.temperature }
        : undefined;
      const modelType = model?.type === "image" || model?.type === "classifier" || model?.type === "chat"
        ? model.type
        : undefined;
      models.push(withDefaultImageLimits({
        id: resolved,
        ...(modelType ? { modelType } : {}),
        ...(context !== undefined ? { contextWindow: context } : {}),
        ...(inputLimit !== undefined ? { inputLimit } : {}),
        ...(maxTokens !== undefined ? { maxTokens } : {}),
        ...(typeof model?.reasoning === "boolean" ? { reasoning: model.reasoning } : {}),
        ...(typeof model?.tool_call === "boolean" ? { toolCalling: model.tool_call } : {}),
        ...(thinkingLevelMap ? { thinkingLevelMap } : {}),
        ...(vision !== undefined ? { vision } : {}),
        ...(inputModalities ? { input: inputModalities } : {}),
        ...(outputModalities ? { output: outputModalities } : {}),
        ...(compat ? { compat } : {}),
        ...(cost ? { cost } : {}),
      }));
    }
    if (models.length === 0) continue;
    providers.push({
      id,
      label: typeof entry.name === 'string' && entry.name.trim() ? entry.name : id,
      models,
      ...(Array.isArray(entry.env) && typeof entry.env[0] === 'string' && entry.env[0] ? { envVar: entry.env[0] } : {}),
    });
  }
  return providers;
}

/**
 * Project only exact project-level effort names.
 *
 * Models.dev also has non-level values: `none` disables reasoning
 * and `default` is not the same as automatic. Guessing those names would turn a
 * capability claim into a request the endpoint may reject.
 *
 * Valid options without an exact named level cannot authorize a raw project
 * effort. Budget-only, toggle-only, and empty declarations therefore make all
 * explicit project levels unsupported while automatic effort remains
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

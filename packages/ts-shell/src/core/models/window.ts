/**
 * How much context the active model actually has.
 *
 * The catalog knows each model's window (`claude-opus-4-6: 200_000`,
 * `gemini-3-pro: 1_048_576`), but that value was only ever used to decorate a
 * picker. Compaction read one global number instead, so a model with a million
 * tokens of room was compacted at sixty-four thousand and most of its capacity
 * went unused.
 *
 * Resolution is ordered by who knows best:
 *
 *   1. The user's own configuration. They know which endpoint they are talking
 *      to, and a proxy or a self-hosted model may serve a window the catalog has
 *      never heard of.
 *   2. The catalog entry for the active model.
 *   3. A conservative default, with a warning — because a window that is guessed
 *      too small compacts early, and one guessed too large overflows.
 *
 * There is deliberately no clamp against an advertised ceiling. Clamping needs a
 * second metadata field to clamp against, and this catalog carries one number per
 * model, so a ceiling would be invented rather than known. An over-large user
 * value fails loudly at the provider, which is a better signal than a fabricated
 * limit silently overruling them.
 */

import { catalogBaseUrl, catalogModel, catalogProvider, type CatalogProvider, type ModelCostRates } from './catalog.js'
import type { ModelTokenBudget } from '../../config/runtimeConfig.js'

/**
 * The window assumed when neither the user nor the catalog says otherwise.
 *
 * Chosen to be conservative rather than generous: guessing low compacts earlier
 * than necessary, which costs a summarization the user did not need, while
 * guessing high lets a request grow past what the model accepts.
 */
export const DEFAULT_CONTEXT_WINDOW = 64_000

export type WindowSource = 'config' | 'catalog' | 'default'

export interface ResolvedContextWindow {
  readonly window: number
  readonly source: WindowSource
  /**
   * What to tell the user, when the answer was not the model's own number.
   *
   * Present rather than logged here so the caller decides where a warning goes:
   * the same resolution feeds a policy, a status gauge and a report command.
   */
  readonly warning?: string
}

export interface WindowResolutionInput {
  readonly catalog: readonly CatalogProvider[]
  readonly provider: string
  readonly model?: string
  readonly baseUrl?: string
  /** The user's configured window, if any. */
  readonly configured?: number
}

/**
 * What the catalog says about a model, and who said it.
 *
 * Matched on the provider first, then by model id alone when the provider does
 * not match.
 *
 * The fallback exists because the two sides name providers differently: the
 * runtime reports a protocol (`openai-compatible`, `anthropic`) while the catalog
 * keys by vendor (`siliconflow`, `deepseek`). A model served over an
 * OpenAI-compatible endpoint is filed under its vendor, so requiring the protocol
 * to match would miss it and silently fall back to the default window.
 *
 * The fallback only answers when exactly one provider claims the id. Where several
 * do, it reports them instead of choosing: the number decides when compaction
 * runs, and picking one of two silently would compact at the wrong threshold with
 * nothing to show for it. Which providers claim a model id is a property of the
 * catalog as it happens to stand, not a promise about every catalog a user will
 * assemble — a third-party endpoint or a later addition can introduce a second
 * claim to an id that is unique today.
 */
function catalogWindow(
  catalog: readonly CatalogProvider[],
  provider: string,
  model: string | undefined,
  baseUrl?: string,
): { window?: number; claimedBy?: string[] } {
  if (model === undefined) return {}
  if (catalogBaseUrl(catalog, provider, baseUrl) !== undefined) {
    const binding = catalogProvider(catalog, provider, baseUrl)
    return { window: binding.entry?.models.find(candidate => candidate.id === model)?.contextWindow,
      ...(binding.conflicts ? { claimedBy: binding.conflicts } : {}) }
  }

  const entry = catalog.find((candidate) => candidate.id === provider)
  const direct = entry?.models.find((candidate) => candidate.id === model)?.contextWindow
  if (direct !== undefined) return { window: direct }

  // Collected in one pass so the window and its owner come from the same lookup,
  // rather than finding the owner and then looking up what it said a second time.
  const claims: { provider: string; window: number | undefined }[] = []
  for (const candidate of catalog) {
    const found = candidate.models.find((entry) => entry.id === model)
    if (found !== undefined) claims.push({ provider: candidate.id, window: found.contextWindow })
  }
  if (claims.length === 1) return { window: claims[0]?.window }
  if (claims.length > 1) return { claimedBy: claims.map((claim) => claim.provider).sort() }
  return {}
}

/**
 * What the catalog charges for one model, if it says.
 *
 * A known address selects that exact catalogue owner. Older usage has only a
 * provider/model pair: preserve its canonical or unique-model lookup, without
 * attributing those historical tokens to the current default relay.
 */
export function resolveModelCost(
  catalog: readonly CatalogProvider[],
  provider: string,
  model: string | undefined,
  baseUrl?: string,
): ModelCostRates | undefined {
  return catalogModel(catalog, provider, model, baseUrl)?.cost
}

/**
 * The context window in force for one model, and where the number came from.
 *
 * The source is returned rather than inferred from the value so a caller can
 * tell "the catalog says 64,000" from "nobody knew, so 64,000 was assumed" —
 * those two are the same number and completely different facts.
 */
export function resolveContextWindow(input: WindowResolutionInput): ResolvedContextWindow {
  if (input.configured !== undefined && input.configured > 0) {
    const fromCatalog = catalogWindow(input.catalog, input.provider, input.model, input.baseUrl).window
    if (fromCatalog !== undefined && input.configured > fromCatalog) {
      // Not refused: a provider may serve more than this catalog knows about.
      // Worth saying out loud, because if it does not, the failure arrives as a
      // provider error rather than as a compaction that never happens.
      return {
        window: input.configured,
        source: 'config',
        warning:
          `Configured context window ${input.configured} exceeds the ${fromCatalog} ` +
          `this catalog lists for ${input.model ?? input.provider}. If the model does not ` +
          'support it, the provider will reject the request.',
      }
    }
    return { window: input.configured, source: 'config' }
  }

  const { window: fromCatalog, claimedBy } = catalogWindow(input.catalog, input.provider, input.model, input.baseUrl)
  if (fromCatalog !== undefined && fromCatalog > 0) {
    return { window: fromCatalog, source: 'catalog' }
  }

  const named = input.model === undefined ? input.provider : `${input.provider}/${input.model}`
  const ambiguous =
    claimedBy === undefined
      ? undefined
      : `More than one provider lists ${input.model}: ${claimedBy.join(', ')}. ` +
        `Set contextWindow in your configuration to say which applies.`
  return {
    window: DEFAULT_CONTEXT_WINDOW,
    source: 'default',
    warning:
      ambiguous ??
      `No context window is known for ${named}; assuming ${DEFAULT_CONTEXT_WINDOW}. ` +
        'Set contextWindow in your configuration if the model has more room than that.',
  }
}

export type { ModelTokenBudget } from '../../config/runtimeConfig.js'

export type TokenBudgetField = keyof ModelTokenBudget

/**
 * One budget field for one model: its override, then the ordinary value, then
 * the caller's default.
 *
 * A field that is present but unusable is refused rather than ignored. Silently
 * discarding a negative or fractional budget would leave the user believing a
 * setting took effect when the engine is using something else.
 */
export function resolveTokenBudget(
  budgets: Readonly<Record<string, ModelTokenBudget>> | undefined,
  provider: string,
  model: string | undefined,
  field: TokenBudgetField,
  ordinary: number | undefined,
  fallback: number,
): number {
  const key = model === undefined ? undefined : `${provider}/${model}`
  const override = key === undefined ? undefined : budgets?.[key]?.[field]
  const chosen = override ?? ordinary ?? fallback
  if (!Number.isSafeInteger(chosen) || chosen < 0) {
    const where = override !== undefined ? `modelOverrides["${key}"].${field}` : field
    throw new Error(`Invalid ${where}: ${String(chosen)}. Expected a non-negative integer.`)
  }
  return chosen
}

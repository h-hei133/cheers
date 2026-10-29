/**
 * How the active model wants a request shaped.
 *
 * The catalog could describe each model's window and price but not how to talk
 * to it, so a model that refuses the `developer` role or that only accepts
 * `max_completion_tokens` failed on a request that was otherwise correct. The
 * information was already known — `ProviderCompatibilityFlags` has carried a
 * `developerRole` state all along — but nothing acted on it: every consumer
 * turned it into a sentence for a report, and the request itself was built from
 * constants.
 *
 * What is resolved here is only what changes the bytes on the wire. Capabilities
 * that describe a limitation without changing a request stay where they are,
 * because a field that looks like a switch but is not one is worse than no field
 * at all.
 *
 * Resolution is by provider and model id, then by the model id alone when
 * exactly one provider claims it — the same rule the window and the price use,
 * so all three describe the same model rather than three different guesses about
 * which one is running.
 */

import type { CatalogModel, CatalogProvider, ThinkingLevel } from "./catalog.js";
import { THINKING_LEVELS, catalogBaseUrl, catalogModel, catalogProvider, providerEndpoint } from "./catalog.js";
import { summaryProtocol } from './protocol.js';

/** What a request needs to know, with every choice already decided. */
export interface ResolvedRequestShape {
  /** The role carrying the system instruction. */
  readonly systemRole: "system" | "developer";
  /** The field carrying the output ceiling. */
  readonly maxTokensField: "max_tokens" | "max_completion_tokens";
  /**
   * The ceiling to send when the request does not set one.
   *
   * The ceiling is a property of the model — a value that fits one is truncated
   * by another — so the catalog is where it belongs. Nothing means the request
   * decides, which is what happened before the catalog could say.
   */
  readonly maxOutputCeiling?: number;
  /** Whether `reasoning_effort` may be sent at all. */
  readonly reasoningEffort: boolean;
  /** Declared visible-summary support, independent of a selected reasoning effort. */
  readonly reasoningSummary?: boolean;
  /**
   * Whether the model accepts tool declarations and prior tool-call history.
   *
   * Absent model metadata means capable, preserving what every request did
   * before the catalogue could state otherwise.
   */
  readonly toolCalling: boolean;
  /** Whether a synthetic assistant turn bridges tool results and a user turn. */
  readonly assistantAfterToolResult: boolean;
  /**
   * Whether this model can be sent an image.
   *
   * Read here so the decision is made once per request rather than at each place
   * that builds one. Absent in the catalogue means no: an image sent to a model
   * that cannot read it fails the whole request, while the words around it still
   * reach the model when the image is described instead.
   */
  readonly vision: boolean;
  /**
   * The provider's own name for a level, or nothing when it has none.
   *
   * Nothing means send the level's own name: the endpoints that use `low` and
   * `high` are common, and refusing to send anything would lose the setting for
   * exactly the models that do understand it.
   */
  readonly thinkingLevelName?: string;
  /**
   * Whether the model accepts a reasoning block with an empty signature.
   *
   * Read here for the same reason as `vision`: the endpoint that writes the
   * block should not be the place that decides whether this model tolerates it.
   * Absent in the catalogue means no, because a provider that validates
   * signatures rejects an unsigned block outright.
   */
  readonly allowEmptySignature: boolean;
  /**
   * Whether a sampling temperature may be sent.
   *
   * Defaults to yes, unlike `vision`: the field was always sent before the
   * catalogue could describe a model, and defaulting it off would silently
   * change every model nobody has described.
   */
  readonly supportsTemperature: boolean;
  /**
   * How many tokens the model may spend working out its answer, when a level is
   * set and the protocol takes a budget.
   *
   * Per level rather than one number, because the level is the user's request
   * about how much reasoning to do, and a single budget would make every level
   * mean the same thing. Absent when no level is set, which is the difference
   * between "think this much" and "the provider decides".
   */
  readonly thinkingBudgetTokens?: number;
}

/**
 * The shape used when nothing is known about a model.
 *
 * Every value here is what the request already did before the catalog could
 * describe a model, because a default decides what happens for every model the
 * snapshot does not list — which is all of them until one is described. The
 * reasoning field in particular: a level was always sent when one was set, and a
 * host that did not want it said so. Defaulting that off would silently disable
 * a working setting for every model nobody has described yet.
 */
export const DEFAULT_REQUEST_SHAPE: ResolvedRequestShape = {
  systemRole: "system",
  maxTokensField: "max_tokens",
  reasoningEffort: true,
  toolCalling: true,
  // No, not yes: this is what an undeclared model gets, and sending an image to
  // a model that cannot read one fails the request rather than the image.
  vision: false,
  assistantAfterToolResult: false,
  // No, not yes: an unsigned reasoning block is rejected by a provider that
  // validates signatures, and demoting it to content is accepted by both kinds.
  allowEmptySignature: false,
  // Yes, not no: this is what every model got before the catalogue could
  // describe one, and a host that dislikes the field says so. Defaulting it off
  // would silently drop a setting for every model nobody has described.
  supportsTemperature: true,
};

/**
 * The shape to use for one model.
 *
 * A level this model has no name for falls back to the nearest one it does have,
 * because a level is a preference and refusing to send anything would turn
 * "think a little less" into "do not think". Falling back downwards rather than
 * upwards: a model asked for less reasoning answers faster, and one asked for
 * more can spend a long time before saying anything.
 */
export function resolveRequestShape(
  catalog: readonly CatalogProvider[],
  provider: string,
  model: string | undefined,
  level: ThinkingLevel | undefined,
  baseUrl?: string,
  endpoint?: string,
): ResolvedRequestShape {
  const entry = catalogModel(catalog, provider, model, catalogBaseUrl(catalog, provider, baseUrl));
  // A model nobody described still gets its level sent under its own name. That
  // is what happened before the catalog could describe a model at all, and the
  // alternative — staying silent because the model is unknown — would disable a
  // setting that works for every model the snapshot does not list.
  if (!entry) {
    return {
      ...DEFAULT_REQUEST_SHAPE,
      ...(level ? { thinkingLevelName: level, thinkingBudgetTokens: THINKING_BUDGET_TOKENS[level] } : {}),
    };
  }

  const compat = entry.compat ?? {};
  // Undeclared is treated as capable, which is what happened before the catalog
  // could say otherwise: the level went out and a host that did not want it said
  // so. Defaulting the other way would silently disable a setting that works for
  // every model the snapshot does not describe — which is all of them.
  const reasoningEffort = entry.reasoning !== false && compat.reasoningEffort !== false;
  const wire = endpoint ?? providerEndpoint(catalog, provider, baseUrl, model);
  const owner = catalogProvider(catalog, provider, baseUrl).entry;
  const reasoningSummary = entry.reasoning === false || compat.reasoningSummary === false ? false
    : compat.reasoningSummary === true && summaryProtocol(owner, catalogBaseUrl(catalog, provider, baseUrl), wire) ? true : undefined;

  return {
    systemRole: compat.systemRole ?? DEFAULT_REQUEST_SHAPE.systemRole,
    maxTokensField: compat.maxTokensField ?? DEFAULT_REQUEST_SHAPE.maxTokensField,
    ...(entry.maxTokens !== undefined ? { maxOutputCeiling: entry.maxTokens } : {}),
    reasoningEffort,
    ...(reasoningSummary !== undefined ? { reasoningSummary } : {}),
    toolCalling: entry.toolCalling !== false,
    assistantAfterToolResult: compat.assistantAfterToolResult === true,
    allowEmptySignature: compat.allowEmptySignature === true,
    supportsTemperature: compat.supportsTemperature !== false,
    vision: entry.vision === true,
    ...(reasoningEffort && level ? { thinkingLevelName: levelNameFor(entry, level) } : {}),
    ...(reasoningEffort && level ? { thinkingBudgetTokens: THINKING_BUDGET_TOKENS[level] } : {}),
  };
}

/**
 * What this model calls the nearest level it supports.
 *
 * Walks down from the requested level, then up, so a model with only `high`
 * still gets `high` when `low` was asked for rather than nothing.
 */
function levelNameFor(entry: CatalogModel, level: ThinkingLevel): string | undefined {
  const map = entry.thinkingLevelMap;
  const index = THINKING_LEVELS.indexOf(level);
  for (let distance = 0; distance < THINKING_LEVELS.length; distance += 1) {
    for (const candidate of [index - distance, index + distance]) {
      const name = THINKING_LEVELS[candidate];
      if (name === undefined) continue;
      // An absent entry means "use the level's own name"; an explicit `null`
      // means this model does not have that level, so the search continues.
      const mapped = map?.[name];
      if (mapped === null) continue;
      return mapped ?? name;
    }
  }
  return undefined;
}

/**
 * Tokens a level may spend on working out the answer, when the protocol takes a
 * budget.
 *
 * The same ladder a reasoning effort implies elsewhere, so choosing a level
 * means the same thing whichever protocol carries it. The numbers are what the
 * providers' own guidance describes: enough to think through a problem, with
 * room left for the answer under the request's ceiling.
 */
const THINKING_BUDGET_TOKENS: Record<ThinkingLevel, number> = {
  low: 2_048,
  medium: 8_192,
  high: 16_384,
};

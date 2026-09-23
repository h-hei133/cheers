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
import { THINKING_LEVELS } from "./catalog.js";

/** What a request needs to know, with every choice already decided. */
export interface ResolvedRequestShape {
  /** The role carrying the system instruction. */
  readonly systemRole: "system" | "developer";
  /** The field carrying the output ceiling. */
  readonly maxTokensField: "max_tokens" | "max_completion_tokens";
  /** Whether `reasoning_effort` may be sent at all. */
  readonly reasoningEffort: boolean;
  /** Whether a synthetic assistant turn bridges tool results and a user turn. */
  readonly assistantAfterToolResult: boolean;
  /**
   * The provider's own name for a level, or nothing when it has none.
   *
   * Nothing means send the level's own name: the endpoints that use `low` and
   * `high` are common, and refusing to send anything would lose the setting for
   * exactly the models that do understand it.
   */
  readonly thinkingLevelName?: string;
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
  assistantAfterToolResult: false,
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
): ResolvedRequestShape {
  const entry = findModel(catalog, provider, model);
  // A model nobody described still gets its level sent under its own name. That
  // is what happened before the catalog could describe a model at all, and the
  // alternative — staying silent because the model is unknown — would disable a
  // setting that works for every model the snapshot does not list.
  if (!entry) {
    return {
      ...DEFAULT_REQUEST_SHAPE,
      ...(level ? { thinkingLevelName: level } : {}),
    };
  }

  const compat = entry.compat ?? {};
  // Undeclared is treated as capable, which is what happened before the catalog
  // could say otherwise: the level went out and a host that did not want it said
  // so. Defaulting the other way would silently disable a setting that works for
  // every model the snapshot does not describe — which is all of them.
  const reasoningEffort = entry.reasoning !== false && compat.reasoningEffort !== false;

  return {
    systemRole: compat.systemRole ?? DEFAULT_REQUEST_SHAPE.systemRole,
    maxTokensField: compat.maxTokensField ?? DEFAULT_REQUEST_SHAPE.maxTokensField,
    reasoningEffort,
    assistantAfterToolResult: compat.assistantAfterToolResult === true,
    ...(reasoningEffort && level ? { thinkingLevelName: levelNameFor(entry, level) } : {}),
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

/** The catalog entry for a model, by provider first and then by id alone. */
function findModel(
  catalog: readonly CatalogProvider[],
  provider: string,
  model: string | undefined,
): CatalogModel | undefined {
  if (model === undefined) return undefined;
  const direct = catalog
    .find((candidate) => candidate.id === provider)
    ?.models.find((candidate) => candidate.id === model);
  if (direct !== undefined) return direct;

  // Two providers serving the same id may disagree about how to talk to it, so
  // an ambiguous id is left unresolved rather than guessed at.
  const claims = catalog
    .map((candidate) => candidate.models.find((entry) => entry.id === model))
    .filter((entry): entry is CatalogModel => entry !== undefined);
  return claims.length === 1 ? claims[0] : undefined;
}

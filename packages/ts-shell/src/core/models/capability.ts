import { catalogBaseUrl, catalogModel, type CatalogModel, type CatalogProvider } from './catalog.js';
import type { ThinkingPreference } from './effort.js';

/** Catalogue absence cannot establish that a custom model does not exist. */
export function effortCapability(catalog: readonly CatalogProvider[], provider: string, model: string | undefined, effort: ThinkingPreference, baseUrl?: string): 'supported' | 'unsupported' | 'unverified' {
  if (effort === null) return 'supported';
  const entry = catalogModel(catalog, provider, model, catalogBaseUrl(catalog, provider, baseUrl));
  return declaredEffortCapability(entry, effort);
}

/** Reuse the same capability decision for an already resolved exact model. */
export function declaredEffortCapability(entry: CatalogModel | undefined, effort: ThinkingPreference): 'supported' | 'unsupported' | 'unverified' {
  if (effort === null) return 'supported';
  if (!entry) return 'unverified';
  if (entry.reasoning === false || entry.compat?.reasoningEffort === false || entry.thinkingLevelMap?.[effort] === null) return 'unsupported';
  return entry.reasoning === true || entry.compat?.reasoningEffort === true || typeof entry.thinkingLevelMap?.[effort] === 'string' ? 'supported' : 'unverified';
}

import { catalogModel, type CatalogModel, type CatalogProvider } from '../../../../core/models/catalog.js';
import { declaredEffortCapability } from '../../../../core/models/capability.js';
import { THINKING_LEVELS } from '../../../../core/models/effort.js';

/** An unconfigured row still belongs to its listed relay, not the active provider address. */
export function listedModelMetadata(catalog: readonly CatalogProvider[], provider: CatalogProvider, model: string, baseUrl?: string): CatalogModel | undefined {
  const address = baseUrl ?? provider.baseUrl;
  return address === undefined && provider.id !== provider.runtime ? provider.models.find(entry => entry.id === model)
    : catalogModel(catalog, provider.runtime, model, address);
}

/** Only declared catalogue facts establish capability; missing data stays unverified. */
export function modelMetadataDetails(catalog: readonly CatalogProvider[], provider: CatalogProvider, model: string, baseUrl?: string): readonly string[] {
  const metadata = listedModelMetadata(catalog, provider, model, baseUrl);
  const levels = THINKING_LEVELS.map(level => [level, declaredEffortCapability(metadata, level)] as const);
  const reasoning = levels.every(([, status]) => status === 'unsupported') ? 'unsupported'
    : levels.some(([, status]) => status === 'supported') ? 'supported' : 'unverified';
  return [
    ...(metadata?.contextWindow ? [`Context: ${metadata.contextWindow} tokens`] : []),
    ...(metadata?.inputLimit ? [`Input limit: ${metadata.inputLimit} tokens`] : []),
    ...(metadata?.maxTokens ? [`Max output: ${metadata.maxTokens} tokens`] : []),
    `Images: ${metadata?.vision === true ? 'supported' : metadata?.vision === false ? 'unsupported' : 'unverified'}`,
    // Undeclared means capable, the same reading every request uses. Saying so
    // matters because a model that takes no tools changes what the session can
    // do, not just how a request is shaped.
    `Tool calls: ${metadata?.toolCalling === false ? 'unsupported' : metadata?.toolCalling === true ? 'supported' : 'unverified'}`,
    `Reasoning settings: ${reasoning}`,
    `Effort levels: ${levels.map(([level, status]) => `${level} ${status}`).join(' · ')}`,
    ...(metadata?.cost ? [`Price per 1M tokens: input ${metadata.cost.promptPerMTok} · output ${metadata.cost.completionPerMTok}`
      + (metadata.cost.cacheReadPerMTok === undefined ? '' : ` · cache read ${metadata.cost.cacheReadPerMTok}`)
      + (metadata.cost.cacheWritePerMTok === undefined ? '' : ` · cache write ${metadata.cost.cacheWritePerMTok}`)] : []),
  ];
}

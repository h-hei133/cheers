import { DEFAULT_CONFIG, type RuntimeConfig } from '../../config/runtimeConfig.js';
import { endpointShape } from '../endpoints/index.js';

/** Defaults can yield to a provider-owned ceiling; an explicit limit cannot. */
export function configuredOutputLimit(config: RuntimeConfig | undefined, endpoint: string | undefined): number | undefined {
  if (endpointShape(endpoint).outputControl !== 'provider') return config?.maxOutputTokens;
  const sources = config?.configProvenance?.maxOutputTokens?.sources;
  if (config?.maxOutputTokens !== undefined && (config.maxOutputTokens !== DEFAULT_CONFIG.maxOutputTokens
    || !sources?.length || sources.some(source => source !== 'default'))) {
    throw new Error('This account service does not support an explicit maxOutputTokens limit.');
  }
  return undefined;
}

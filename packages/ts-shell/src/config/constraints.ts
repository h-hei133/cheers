import { DEFAULT_CONFIG, type RuntimeConfig } from './runtimeConfig.js';
import { catalogModel, providerEndpoint, type CatalogProvider } from '../core/models/catalog.js';
import { resolveContextWindow, resolveTokenBudget } from '../core/models/window.js';
import { outputLimitFailure, reserveLimitFailure } from '../core/models/limits.js';
import { effortCapability } from '../core/models/capability.js';
import type { ThinkingPreference } from '../core/models/effort.js';
import { endpointShape } from '../provider/endpoints/index.js';
import { effortOutputFailure } from '../provider/endpoints/effort.js';

export interface ConfigModelTarget {
  readonly provider: string;
  readonly model?: string;
  readonly thinkingEffort?: ThinkingPreference;
}

/** Final relations use the same target, precedence and window as the consumers. */
export function inspectConfigConstraints(config: RuntimeConfig, target: ConfigModelTarget, catalog: readonly CatalogProvider[]) {
  const errors: string[] = [];
  const notices: string[] = [];
  if ((config.retryBaseDelayMs ?? DEFAULT_CONFIG.retryBaseDelayMs!) > (config.retryMaxDelayMs ?? DEFAULT_CONFIG.retryMaxDelayMs!)) {
    errors.push('retryBaseDelayMs must not exceed retryMaxDelayMs.');
  }
  const entry = catalogModel(catalog, target.provider, target.model);
  const window = resolveContextWindow({ catalog, ...target, configured: config.contextWindow });
  const outputFailure = outputLimitFailure(config.maxOutputTokens ?? entry?.maxTokens, entry?.maxTokens, window.window);
  if (outputFailure) errors.push(outputFailure);
  const reserve = resolveTokenBudget(config.modelTokenBudgets, target.provider, target.model, 'reserveTokens', config.reserveTokens, DEFAULT_CONFIG.reserveTokens!);
  const reserveFailure = reserveLimitFailure(reserve, window.window);
  if (reserveFailure) errors.push(reserveFailure);
  if (target.thinkingEffort && effortCapability(catalog, target.provider, target.model, target.thinkingEffort) === 'unsupported') {
    errors.push('The selected model does not support this reasoning effort. Select another level or use /thinking auto.');
  }
  try {
    const shape = endpointShape(providerEndpoint(catalog, target.provider));
    const failure = target.thinkingEffort ? effortOutputFailure(shape, config.maxOutputTokens ?? entry?.maxTokens) : undefined;
    if (failure) errors.push(failure);
  } catch { errors.push('The selected model endpoint is unavailable.'); }
  if (target.model && window.source === 'default') notices.push('Model context capacity is unverified; the runtime fallback window is in use.');
  if (window.source === 'config' && window.warning) notices.push('contextWindow exceeds the model catalogue value; remote support is unverified.');
  if (entry?.compat?.supportsTemperature === false && config.configProvenance.temperature?.sources.some(source => source !== 'default')) {
    notices.push('temperature is not sent because the selected model does not support it.');
  }
  for (const [key, budget] of Object.entries(config.modelTokenBudgets ?? {})) {
    const separator = key.indexOf('/');
    if (separator <= 0 || separator === key.length - 1) {
      errors.push('modelTokenBudgets keys must name provider/model.');
      continue;
    }
    const provider = key.slice(0, separator);
    const model = key.slice(separator + 1);
    const resolved = resolveContextWindow({ catalog, provider, model, configured: config.contextWindow });
    // Unknown inactive models have no capacity to verify. Their active use is
    // checked above against the actual runtime fallback or explicit window.
    if (resolved.source === 'default' && (provider !== target.provider || model !== target.model)) {
      notices.push('modelTokenBudgets contains a model whose context capacity is unverified.');
      continue;
    }
    const reserved = budget.reserveTokens ?? config.reserveTokens ?? DEFAULT_CONFIG.reserveTokens!;
    if (reserveLimitFailure(reserved, resolved.window)) errors.push('modelTokenBudgets.reserveTokens must leave input space in the resolved context window.');
    if (budget.keepRecentTokens !== undefined && budget.keepRecentTokens > Math.max(0, resolved.window - reserved)) {
      notices.push('modelTokenBudgets.keepRecentTokens is limited to the available context space during compaction.');
    }
  }
  return { errors: [...new Set(errors)], notices: [...new Set(notices)] };
}

export function constrainRuntimeConfig(config: RuntimeConfig, target: ConfigModelTarget, catalog: readonly CatalogProvider[]): RuntimeConfig {
  const { errors, notices } = inspectConfigConstraints(config, target, catalog);
  if (!errors.length && !notices.length) return config;
  return { ...config,
    configValidation: { ...config.configValidation, ...(errors.length ? { valid: false, constraintsBlocked: true } : {}) },
    configDiagnostics: [...config.configDiagnostics, ...errors.map(error => `Config constraint: ${error}`), ...notices],
  };
}

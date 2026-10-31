import { DEFAULT_CONFIG, type RuntimeConfig } from './runtimeConfig.js';
import { catalogBaseUrl, catalogModel, catalogProvider, type CatalogProvider } from '../core/models/catalog.js';
import { configuredContextWindow, resolveContextWindow, resolveTokenBudget } from '../core/models/window.js';
import { outputLimitFailure, reserveLimitFailure } from '../core/models/limits.js';
import { effortCapability } from '../core/models/capability.js';
import type { ThinkingPreference } from '../core/models/effort.js';
import { endpointShape } from '../provider/endpoints/index.js';
import { effortOutputFailure } from '../provider/endpoints/effort.js';
import type { ProviderCredentialResolution } from '../core/auth/credential.js';
import { providerCredentialBaseUrl, providerCredentialEndpoint } from '../core/auth/account/target.js';
import { configuredOutputLimit } from '../provider/request/output.js';
import { normalizeBaseUrl } from './values.js';

export interface ConfigModelTarget {
  readonly provider: string;
  readonly model?: string;
  readonly baseUrl?: string;
  readonly thinkingEffort?: ThinkingPreference;
  readonly credential?: ProviderCredentialResolution['credential'];
  readonly blocked?: ProviderCredentialResolution['blocked'];
}

const ENDPOINT_NOTICE = 'The selected request endpoint overrides the stored provider endpoint. Other provider selections retain their own endpoint.';

/** Final relations use the same target, precedence and window as the consumers. */
export function inspectConfigConstraints(config: RuntimeConfig, target: ConfigModelTarget, catalog: readonly CatalogProvider[]) {
  const errors: string[] = [];
  const notices: string[] = [];
  const resolution = target;
  let endpoint: string | undefined;
  let output: number | undefined;
  try {
    target = { ...target, baseUrl: target.credential ? providerCredentialBaseUrl(catalog, resolution)
      : catalogBaseUrl(catalog, target.provider, target.baseUrl) };
    endpoint = providerCredentialEndpoint(catalog, resolution, target.baseUrl);
    output = configuredOutputLimit(config, endpoint)
      ?? (endpointShape(endpoint).outputControl === 'provider' ? undefined : catalogModel(catalog, target.provider, target.model, target.baseUrl)?.maxTokens);
  } catch { errors.push('The selected model endpoint or output control is unavailable.'); }
  const storedEndpoint = normalizeBaseUrl(config.providerCredentials?.[target.provider as RuntimeConfig['provider']]?.baseUrl);
  const requestEndpoint = normalizeBaseUrl(target.baseUrl);
  if (!errors.length && !target.blocked && storedEndpoint && requestEndpoint && storedEndpoint !== requestEndpoint) {
    // Compare the resolved request, including fallback, pool and CLI selection.
    // Endpoints can contain userinfo or secret query/path values; report only the relation.
    notices.push(ENDPOINT_NOTICE);
  }
  if ((config.retryBaseDelayMs ?? DEFAULT_CONFIG.retryBaseDelayMs!) > (config.retryMaxDelayMs ?? DEFAULT_CONFIG.retryMaxDelayMs!)) {
    errors.push('retryBaseDelayMs must not exceed retryMaxDelayMs.');
  }
  if (catalogProvider(catalog, target.provider, target.baseUrl).ambiguous) errors.push('Multiple model catalogue entries claim the selected endpoint. Resolve the duplicate entries before sending.');
  const entry = catalogModel(catalog, target.provider, target.model, target.baseUrl);
  const window = resolveContextWindow({ catalog, ...target, configured: configuredContextWindow(config, resolution) });
  const outputFailure = outputLimitFailure(output, entry?.maxTokens, window.window);
  if (outputFailure) errors.push(outputFailure);
  const reserve = resolveTokenBudget(config.modelTokenBudgets, target.provider, target.model, 'reserveTokens', config.reserveTokens, DEFAULT_CONFIG.reserveTokens!);
  const reserveFailure = reserveLimitFailure(reserve, window.window);
  if (reserveFailure) errors.push(reserveFailure);
  if (target.thinkingEffort && effortCapability(catalog, target.provider, target.model, target.thinkingEffort, target.baseUrl) === 'unsupported') {
    errors.push('The selected model does not support this reasoning effort. Select another level or use /thinking auto.');
  }
  try {
    const shape = endpointShape(endpoint);
    const failure = target.thinkingEffort ? effortOutputFailure(shape, output) : undefined;
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
    const resolved = resolveContextWindow({ catalog, provider, model,
      ...(provider === target.provider ? { baseUrl: target.baseUrl } : {}),
      configured: configuredContextWindow(config, { ...resolution, provider, model }) });
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
  const diagnostics = config.configDiagnostics.filter(message => message !== ENDPOINT_NOTICE);
  if (!errors.length && !notices.length && diagnostics.length === config.configDiagnostics.length) return config;
  return { ...config,
    configValidation: { ...config.configValidation, ...(errors.length ? { valid: false, constraintsBlocked: true } : {}) },
    configDiagnostics: [...diagnostics, ...errors.map(error => `Config constraint: ${error}`), ...notices],
  };
}

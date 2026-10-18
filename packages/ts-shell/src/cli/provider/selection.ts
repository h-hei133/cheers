import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import type { CatalogProvider } from '../../core/models/catalog.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import type { ThinkingPreference } from '../../core/models/effort.js';
import { captureThinkingPreference } from '../../core/models/preference.js';
import { inspectConfigConstraints } from '../../config/constraints.js';
import { delegatedTarget } from './target.js';
import type { ModelChoice } from '../../core/models/selection.js';

export function sourceChoice(root: string, resolution: ProviderCredentialResolution): ModelChoice {
  const model = resolution.model ?? resolution.credential?.model;
  if (!model) throw new Error('An active model is required for a temporary selection.');
  return { provider: resolution.provider, model, thinkingEffort: captureThinkingPreference(root, resolution.thinkingEffort).thinkingEffort,
    ...(resolution.credential?.connectionId ? { connectionId: resolution.credential.connectionId } : {}) };
}
export function executionChoice(model: string, effort: ThinkingPreference | undefined, source: ModelChoice,
  resolution: ProviderCredentialResolution, config: RuntimeConfig, catalog: readonly CatalogProvider[]): ModelChoice {
  if (model.includes('/') && model.slice(0, model.indexOf('/')) !== source.provider) throw new Error('Execution models must use the active provider connection.');
  // Public qualification may select a model on this connection, never another connection with a matching ID.
  const target = delegatedTarget(model, resolution, undefined, catalog);
  const choice = { ...source, model: target.model!, thinkingEffort: effort === undefined ? source.thinkingEffort : effort };
  const constraints = inspectConfigConstraints(config, { ...choice, baseUrl: resolution.baseUrl }, catalog);
  if (constraints.errors.length) throw new Error(`Execution model is unavailable: ${constraints.errors.join(' ')}`);
  return choice;
}

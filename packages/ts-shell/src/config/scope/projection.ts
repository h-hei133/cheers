import type { RuntimeConfig } from '../runtimeConfig.js';
import { freezeDeep } from '../../core/values/freeze.js';
import type { ScopeBasis } from './contract.js';
import { resolveConfigScope } from './resolution.js';

/** Provider/session/display identity stays with its existing owner. */
export function scopedRuntimeConfig(config: RuntimeConfig, target: string, basis: ScopeBasis = 'session'): RuntimeConfig {
  if (!config.configScopes) return config;
  const resolution = resolveConfigScope(config.configScopes, target, basis);
  return freezeDeep({ ...config, ...resolution.settings,
    configProvenance: { ...config.configProvenance, ...resolution.origins },
    configDiagnostics: [...config.configDiagnostics, ...resolution.diagnostics] });
}

/** This check never selects a fallback or resolves another connection. */
export function assertScopedModel(config: Pick<RuntimeConfig, 'allowedModels'> | undefined, target: { readonly provider: string; readonly model?: string }): void {
  if (config?.allowedModels !== undefined && (!target.model || !config.allowedModels.includes(`${target.provider}/${target.model}`))) {
    throw new Error('The selected model is not permitted in this configuration scope. Choose an allowed model or change the owning configuration.');
  }
}

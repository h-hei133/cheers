import { CONFIG_FIELDS, type RuntimeConfig } from './runtimeConfig.js';
import { sameValue } from './values.js';

/** Application outcome shared with consumers that do not own configuration state. */
export interface ConfigReloadResult {
  readonly restartRequired: readonly string[];
  readonly status: 'applied' | 'rejected' | 'superseded' | 'application-unverified';
  readonly before: RuntimeConfig;
  readonly after: RuntimeConfig;
  readonly revision: number;
  readonly admissionBlocked: boolean;
  readonly diagnostics: readonly string[];
}

export function describeConfigChanges(before: RuntimeConfig, after: RuntimeConfig): string[] {
  return Object.entries(CONFIG_FIELDS).flatMap(([key, policy]) => {
    const timing = policy.application;
    if (timing === 'metadata') return [];
    const field = key as keyof RuntimeConfig;
    return sameValue(before[field], after[field]) ? [] : [`${key}: changed (${timing})`];
  });
}

export function configRestartRequired(installed: RuntimeConfig, accepted: RuntimeConfig): string[] {
  return (['tuiMode', 'tui'] as const).filter(field => !sameValue(installed[field], accepted[field]));
}

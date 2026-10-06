import { CONFIG_FIELDS, type RuntimeConfig } from './runtimeConfig.js';
import { sameValue } from './values.js';

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

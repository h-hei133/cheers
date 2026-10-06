import { CONFIG_FIELDS, type RuntimeConfig } from './runtimeConfig.js';
import { sameValue } from './values.js';
import { tuiFields } from './fields.js';

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
    if (key === 'tui') return Object.entries(tuiFields).flatMap(([leaf, field]) => {
      const name = leaf as keyof NonNullable<RuntimeConfig['tui']>;
      return sameValue(before.tui?.[name], after.tui?.[name]) ? [] : [`tui.${leaf}: changed (${field.application})`];
    });
    const timing = policy.application;
    if (timing === 'metadata') return [];
    const field = key as keyof RuntimeConfig;
    return sameValue(before[field], after[field]) ? [] : [`${key}: changed (${timing})`];
  });
}

export function configRestartRequired(installed: RuntimeConfig, accepted: RuntimeConfig): string[] {
  const result = sameValue(installed.tuiMode, accepted.tuiMode) ? [] : ['tuiMode'];
  if (Object.entries(tuiFields).some(([leaf, field]) => {
    const name = leaf as keyof NonNullable<RuntimeConfig['tui']>;
    return field.application === 'restart' && !sameValue(installed.tui?.[name], accepted.tui?.[name]);
  })) result.push('tui');
  return result;
}

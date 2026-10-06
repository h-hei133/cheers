import { getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { isOffline, OFFLINE_ENV } from '../../core/network/policy.js';

export type SettingKey = 'attentionOnIdle' | 'offline';
export interface SettingValue {
  readonly effective: boolean;
  readonly stored: boolean | undefined;
  readonly source: string;
}
export interface SettingsDraft {
  readonly values: Readonly<Record<SettingKey, SettingValue>>;
  save(key: SettingKey, value: boolean): Promise<string>;
}

function effective(context: ShellRuntimeContext, key: SettingKey): boolean {
  return key === 'offline' ? isOffline({ configuredOffline: context.runtimeConfig.offline }) : context.runtimeConfig[key] === true;
}

function source(context: ShellRuntimeContext, key: SettingKey): string {
  if (key === 'offline' && process.env[OFFLINE_ENV] !== undefined) return 'environment';
  return context.runtimeConfig.configProvenance[key]?.sources.join(' + ') || 'unavailable';
}

function applicationNotice(context: ShellRuntimeContext, key: SettingKey, value: boolean): string {
  if (effective(context, key) === value) return 'Effective for the next operation.';
  if (key === 'offline' && process.env[OFFLINE_ENV] !== undefined) return `The current session uses the ${OFFLINE_ENV} environment override; restart with that override changed or removed to use the saved value.`;
  const override = context.runtimeConfigOverrides?.[key];
  if (override !== undefined && context.runtimeConfig[key] === override) return 'The current session keeps its launch override; restart without that override to use the saved value.';
  return 'The current effective value differs from the saved choice; configuration may have changed. Reopen Settings to inspect it.';
}

/** A menu holds its own edit baseline; confirmation cannot silently rebase an old choice. */
export function openSettings(context: ShellRuntimeContext, onApplied: () => void): SettingsDraft {
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const substrate = context.configuration.substrateRevision;
  const values = {
    attentionOnIdle: { effective: context.runtimeConfig.attentionOnIdle === true, stored: edit.values.attentionOnIdle, source: source(context, 'attentionOnIdle') },
    offline: { effective: effective(context, 'offline'), stored: edit.values.offline, source: source(context, 'offline') },
  };
  let consumed = false;
  return {
    values,
    async save(key, value) {
      if (consumed || substrate !== context.configuration.substrateRevision) return 'Settings changed or the session moved. Reopen Settings before saving.';
      consumed = true;
      try { writeUserRuntimeConfigFile({ [key]: value }, edit); }
      catch (error) {
        return error instanceof ConfigWriteError ? `${error.message} Current settings were not refreshed.` : 'Settings save outcome is unverified. Current settings were not refreshed.';
      }
      // A baseline-equal choice is a persistence no-op: another writer's value
      // may have been retained. Verify the selected field before claiming it.
      try {
        if (readRuntimeConfigEditAt(edit.path).values[key] !== value) return 'The selected value is not confirmed in your user configuration. Current settings were not refreshed; reopen Settings.';
      } catch { return 'The selected value could not be verified in your user configuration. Current settings were not refreshed; reopen Settings.'; }
      const saved = 'Saved to your user configuration.';
      try {
        const result = refreshShellRuntimeConfig(context);
        if (result.status !== 'applied') return `${saved} Configuration was not applied (${result.status}).${result.admissionBlocked ? ' New actions are blocked until a valid configuration is loaded.' : ''}`;
        onApplied();
        return `${saved} ${applicationNotice(context, key, value)}`;
      } catch { return `${saved} Configuration application outcome is unverified.`; }
    },
  };
}

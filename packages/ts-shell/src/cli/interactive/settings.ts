import { getProjectConfigPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeRuntimeConfigFileAt } from '../../config/runtimeConfig.js';
import { CONFIG_SETTINGS, settingDefinition, settingPatch, settingValue, validateSetting, type SettingDefinition, type SettingsScope } from '../../config/settings.js';
import { sameValue } from '../../config/values.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { isOffline, OFFLINE_ENV } from '../../core/network/policy.js';
import { readDiagramMode, readStatusItems } from './tuiSettings.js';
import { currentTheme } from '../../presentation/theme/theme.js';

export interface SettingValue {
  readonly effective: unknown;
  readonly requested: unknown;
  readonly stored: unknown;
  readonly source: string;
  readonly requestedSource: string;
  readonly restartRequired: boolean;
}
export interface SettingsDraft {
  readonly scope: SettingsScope;
  readonly definitions: readonly SettingDefinition[];
  readonly values: Readonly<Record<string, SettingValue>>;
  save(key: string, value: unknown): Promise<string>;
}

function effective(context: ShellRuntimeContext, setting: SettingDefinition): unknown {
  if (setting.key === 'tui.statusItems') return readStatusItems(context.projectRoot, context.runtimeConfig);
  if (setting.key === 'tui.diagrams') return readDiagramMode(context.projectRoot, context.runtimeConfig);
  if (setting.key === 'theme') return currentTheme();
  return setting.key === 'offline' ? isOffline({ configuredOffline: context.runtimeConfig.offline }) : settingValue(context.runtimeConfig, setting);
}

function source(context: ShellRuntimeContext, setting: SettingDefinition, requested = false): string {
  if (!requested && setting.key === 'offline' && process.env[OFFLINE_ENV] !== undefined) return 'environment';
  const [root, leaf] = setting.path;
  const trace = (requested ? context.configuration.current.requested : context.runtimeConfig).configProvenance[root];
  const label = (leaf ? trace?.children?.[leaf]?.sources : trace?.sources)?.join(' + ') || 'default';
  return !requested && label !== 'default' && !sameValue(effective(context, setting), settingValue(context.runtimeConfig, setting)) ? `derived from ${label}` : label;
}

function applicationNotice(context: ShellRuntimeContext, setting: SettingDefinition, value: unknown): string {
  const actual = effective(context, setting);
  const requested = settingValue(context.configuration.current.requested, setting);
  if (setting.policy.application === 'restart' && !sameValue(settingValue(context.runtimeConfig, setting), requested)) return 'Saved display preference is pending installation. Restart required.';
  if (setting.key === 'agentMode') return 'Saved default mode. Explicit session mode selection still takes precedence.';
  if (setting.policy.application === 'immediate' && sameValue(requested, value)) return 'Applied to the running surface.';
  if (value !== undefined && !sameValue(actual, value)) {
    if (setting.key === 'offline' && process.env[OFFLINE_ENV] !== undefined) return `The current session uses the ${OFFLINE_ENV} environment override; change or remove it to use the saved value.`;
    if (setting.policy.merge === 'replace' && source(context, setting).includes('override')) return 'The current session keeps its launch override; restart without that override to use the saved value.';
    return `The effective value follows ${source(context, setting)} policy and differs from the saved choice. Reopen Settings to inspect it.`;
  }
  return setting.policy.application === 'immediate' ? 'Applied to the running surface.'
    : setting.policy.application === 'restart' ? 'Matches the installed setting.' : 'Effective for the next operation.';
}

/** A menu holds its own explicit scope and edit baseline until Apply. */
export function openSettings(context: ShellRuntimeContext, onApplied: () => void, scope: SettingsScope = 'user'): SettingsDraft {
  const file = scope === 'project' ? getProjectConfigPath(context.projectRoot) : getUserRuntimeConfigPath();
  const edit = readRuntimeConfigEditAt(file);
  const substrate = context.configuration.substrateRevision;
  const definitions = CONFIG_SETTINGS.filter(setting => setting.policy.sensitivity === 'public' && setting.policy.sources.includes(scope));
  const values = Object.fromEntries(definitions.map(setting => {
    const actual = effective(context, setting); const requested = settingValue(context.configuration.current.requested, setting);
    return [setting.key, { effective: actual, requested, stored: settingValue(edit.values, setting), source: source(context, setting),
      requestedSource: source(context, setting, true), restartRequired: setting.policy.application === 'restart' && !sameValue(settingValue(context.runtimeConfig, setting), requested) }];
  }));
  let consumed = false;
  return {
    scope, definitions, values,
    async save(key, value) {
      const setting = settingDefinition(key);
      if (!setting || !definitions.includes(setting)) return 'This setting is not editable in the selected scope.';
      const invalid = validateSetting(setting, value);
      if (invalid) return invalid;
      if (consumed || substrate !== context.configuration.substrateRevision) return 'Settings changed or the session moved. Reopen Settings before saving.';
      consumed = true;
      try { writeRuntimeConfigFileAt(file, settingPatch(edit.values, setting, value), edit); }
      catch (error) {
        return error instanceof ConfigWriteError ? `${error.message} Current settings were not refreshed.` : 'Settings save outcome is unverified. Current settings were not refreshed.';
      }
      // A baseline-equal choice may preserve a concurrent writer's value.
      try {
        if (!sameValue(settingValue(readRuntimeConfigEditAt(edit.path).values, setting), value)) return `The selected value is not confirmed in your ${scope} configuration. Current settings were not refreshed; reopen Settings.`;
      } catch { return `The selected value could not be verified in your ${scope} configuration. Current settings were not refreshed; reopen Settings.`; }
      const saved = `Saved to your ${scope} configuration.`;
      try {
        const result = refreshShellRuntimeConfig(context);
        if (result.status !== 'applied') return `${saved} Configuration was not applied (${result.status}).${result.admissionBlocked ? ' New actions are blocked until a valid configuration is loaded.' : ''}`;
        onApplied();
        return `${saved} ${applicationNotice(context, setting, value)}`;
      } catch { return `${saved} Configuration application outcome is unverified.`; }
    },
  };
}

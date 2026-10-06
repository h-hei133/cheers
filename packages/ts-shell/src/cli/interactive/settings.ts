import { getProjectConfigPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeRuntimeConfigFileAt } from '../../config/runtimeConfig.js';
import { CONFIG_SETTINGS, settingDefinition, settingPatch, settingValue, validateSetting, type SettingDefinition, type SettingsScope } from '../../config/settings.js';
import { sameValue } from '../../config/values.js';
import { ConfigWriteError } from '../../config/outcome.js';
import { refreshShellRuntimeConfig, type ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { isOffline, OFFLINE_ENV } from '../../core/network/policy.js';
import { readComposerShape, readDiagramMode, readStatusItems } from './tuiSettings.js';
import { currentTheme } from '../../presentation/theme/theme.js';
import { configTrustNotice } from '../../config/trust.js';

export interface SettingValue {
  readonly effective: unknown;
  readonly requested: unknown;
  readonly stored: unknown;
  readonly source: string;
  readonly requestedSource: string;
  readonly restartRequired: boolean;
  readonly projectTrustNotice?: string;
}
export interface SettingsDraft {
  readonly scope: SettingsScope;
  readonly definitions: readonly SettingDefinition[];
  readonly values: Readonly<Record<string, SettingValue>>;
  save(key: string, value: unknown): Promise<SettingsSaveResult>;
}

export interface SettingsSaveResult {
  readonly note: string;
  /** True only when this runtime confirmed acceptance of the saved configuration. */
  readonly applied: boolean;
}

function unapplied(note: string): SettingsSaveResult { return { note, applied: false }; }

function effective(context: ShellRuntimeContext, setting: SettingDefinition): unknown {
  if (setting.key === 'tui.composerShape') return readComposerShape(context.runtimeConfig);
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

function projectTrustNotice(context: ShellRuntimeContext, setting: SettingDefinition): string | undefined {
  const [root, leaf] = setting.path;
  const trace = context.configuration.current.requested.configProvenance[root];
  const reasons = [...(trace?.rejected ?? []), ...(leaf ? trace?.children?.[leaf]?.rejected ?? [] : [])];
  return reasons.filter(item => item.source === 'project').map(item => configTrustNotice(item.reason)).find(Boolean);
}

function applicationNotice(context: ShellRuntimeContext, setting: SettingDefinition, value: unknown, scope: SettingsScope): string {
  const trustNotice = scope === 'project' && value !== undefined ? projectTrustNotice(context, setting) : undefined;
  if (trustNotice) return `The project value is not active. ${trustNotice} Use /trust to inspect the decision.`;
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
      requestedSource: source(context, setting, true), projectTrustNotice: projectTrustNotice(context, setting),
      restartRequired: setting.policy.application === 'restart' && !sameValue(settingValue(context.runtimeConfig, setting), requested) }];
  }));
  let consumed = false;
  return {
    scope, definitions, values,
    async save(key, value) {
      const setting = settingDefinition(key);
      if (!setting || !definitions.includes(setting)) return unapplied('This setting is not editable in the selected scope.');
      const invalid = validateSetting(setting, value);
      if (invalid) return unapplied(invalid);
      if (consumed || substrate !== context.configuration.substrateRevision) return unapplied('Settings changed or the session moved. Reopen Settings before saving.');
      consumed = true;
      try { writeRuntimeConfigFileAt(file, settingPatch(edit.values, setting, value), edit); }
      catch (error) {
        return unapplied(error instanceof ConfigWriteError ? `${error.message} Current settings were not refreshed.` : 'Settings save outcome is unverified. Current settings were not refreshed.');
      }
      // A baseline-equal choice may preserve a concurrent writer's value.
      try {
        if (!sameValue(settingValue(readRuntimeConfigEditAt(edit.path).values, setting), value)) return unapplied(`The selected value is not confirmed in your ${scope} configuration. Current settings were not refreshed; reopen Settings.`);
      } catch { return unapplied(`The selected value could not be verified in your ${scope} configuration. Current settings were not refreshed; reopen Settings.`); }
      const saved = `Saved to your ${scope} configuration.`;
      try {
        const result = refreshShellRuntimeConfig(context);
        if (result.status !== 'applied') return unapplied(`${saved} Configuration was not applied (${result.status}).${result.admissionBlocked ? ' New actions are blocked until a valid configuration is loaded.' : ''}`);
        onApplied();
        return { note: `${saved} ${applicationNotice(context, setting, value, scope)}`, applied: true };
      } catch { return unapplied(`${saved} Configuration application outcome is unverified.`); }
    },
  };
}

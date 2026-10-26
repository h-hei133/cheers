import type { Picker } from '../../overlay.js';
import type { SettingsDraft } from '../../settings.js';
import { formatSetting, type SettingDefinition } from '../../../../config/settings.js';
import { neutraliseForDisplay } from '../../../../core/text/safety.js';

/** Full public values and provenance stay in the settings interaction, never in prompt history. */
export function settingSources(draft: SettingsDraft, setting: SettingDefinition, back: () => Picker): Picker {
  const value = draft.values[setting.key];
  const lines = [
    `Field: ${setting.key}`,
    `Effective: ${formatSetting(value.effective)}`,
    `Source: ${value.source}`,
    `Accepted: ${formatSetting(value.requested)}`,
    `Accepted source: ${value.requestedSource}`,
    `Stored: ${formatSetting(value.stored)}`,
    `Save scope: ${draft.scope}`,
    'Only the selected primary user or project configuration is editable here. Launch inputs and environment overrides are read-only.',
    `Application: ${setting.policy.application}${value.restartRequired ? ' — restart required' : ''}`,
    ...(value.projectTrustNotice ? [`Project value inactive: ${value.projectTrustNotice} Use /trust to inspect.`] : []),
  ];
  return {
    title: `${setting.label} — values and sources`, form: 'panel', fullScreen: true,
    exclusive: true, holdInput: true, filterable: false, empty: '', back,
    load: async () => [], apply: async () => undefined,
    input: {
      initial: lines.map(neutraliseForDisplay).join('\n'), label: 'Read-only', readOnly: true,
      hint: '↑↓ / PgUp PgDn / wheel · Ctrl+Home/End · Enter / Esc: return', validate: () => undefined,
      apply: async () => ({ next: back() }),
    },
  };
}

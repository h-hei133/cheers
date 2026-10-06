import type { Option } from '../../../presentation/tui/chrome/options.js';
import { truncateToWidth } from '../../../presentation/tui/text/layout.js';
import { formatSetting, validateSetting, type SettingDefinition, type SettingsScope } from '../../../config/settings.js';
import type { Picker, PickerOutcome } from '../overlay.js';
import type { SettingsDraft } from '../settings.js';
import { normalizeStatusItems } from '../../../presentation/tui/chrome/items.js';
import { statusItemPicker } from './statusItems.js';

export interface SettingsHost {
  openSettings(scope?: SettingsScope): SettingsDraft;
}
interface StagedValue { readonly value: unknown }

function compact(value: unknown): string { return truncateToWidth(formatSetting(value), 36); }

function inputError(setting: SettingDefinition, text: string): string | undefined {
  try { return validateSetting(setting, JSON.parse(text)); }
  catch { return 'Enter a valid JSON value. Strings need double quotes.'; }
}

function valueEditor(host: SettingsHost, draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue): Picker {
  const current = draft.values[setting.key];
  const value = pending ? pending.value : current.stored === undefined ? current.requested : current.stored;
  if (setting.key === 'tui.statusItems') {
    const picker = statusItemPicker({ current: normalizeStatusItems(value as readonly string[] | undefined), save: async () => undefined, preview: () => {} });
    return { ...picker, title: 'Stage status items — Enter reviews; empty uses defaults', exclusive: true, holdInput: true,
      apply: async ids => validateSetting(setting, ids) ? undefined : ({ next: settingDetail(host, draft, setting, { value: normalizeStatusItems(ids) }) }) };
  }
  return {
    title: `Edit ${setting.label} — ${draft.scope}`, form: 'panel', exclusive: true, holdInput: true, empty: '',
    load: async () => [], apply: async () => undefined,
    input: {
      initial: value === undefined ? '' : formatSetting(value),
      label: `JSON ${setting.schema.type}. Enter stages the value; Apply saves it.`,
      validate: text => inputError(setting, text),
      apply: async text => ({ next: settingDetail(host, draft, setting, { value: JSON.parse(text) }) }),
    },
  };
}

function scopePicker(host: SettingsHost, setting: SettingDefinition, scope: SettingsScope): Picker {
  return {
    title: 'Choose save scope — pending value will be discarded', form: 'panel', exclusive: true, holdInput: true, empty: '', initialSelection: scope,
    load: async () => (['user', 'project'] as const).filter(scope => setting.policy.sources.includes(scope)).map(scope => ({ id: scope, label: scope === 'user' ? 'User configuration' : 'Project configuration' })),
    async apply(ids) {
      const scope = ids[0];
      if (ids.length !== 1 || (scope !== 'user' && scope !== 'project') || !setting.policy.sources.includes(scope)) return undefined;
      return { next: settingDetail(host, host.openSettings(scope), setting) };
    },
  };
}

function detailOptions(draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue): Option[] {
  const current = draft.values[setting.key];
  const options: Option[] = [
    { id: 'effective', label: `Effective: ${compact(current.effective)}`, note: current.source, disabled: true },
    { id: 'accepted', label: `Accepted: ${compact(current.requested)}`, note: current.restartRequired ? 'restart required' : current.requestedSource, disabled: true },
    { id: 'stored', label: `Stored: ${compact(current.stored)}`, note: `${draft.scope} file`, disabled: true },
  ];
  if (current.projectTrustNotice) options.push({ id: 'trust', label: 'Project value inactive', detail: `${current.projectTrustNotice} Use /trust to inspect.`, disabled: true });
  if (pending) options.push({ id: 'pending', label: `Pending: ${compact(pending.value)}`, note: setting.policy.application, disabled: true });
  if (setting.choices) setting.choices.forEach((value, index) => options.push({ id: `choice:${index}`, label: `Choose ${formatSetting(value)}`, detail: 'Stage without saving' }));
  else options.push({ id: 'edit', label: 'Edit value', detail: setting.key === 'tui.statusItems' ? 'Choose supported items; stage without saving' : `JSON ${setting.schema.type}; stage without saving` });
  options.push({ id: 'unset', label: 'Remove stored value', detail: 'Stage removal; other layers or defaults will apply' });
  if (setting.policy.sources.includes('project')) options.push({ id: 'scope', label: 'Change save scope', note: draft.scope });
  options.push({ id: 'apply', label: 'Apply', detail: pending ? `Save pending change to ${draft.scope} configuration` : 'Stage a value first', disabled: !pending });
  options.push({ id: 'back', label: 'Back to settings', detail: 'Discard pending value' });
  return options;
}

function settingDetail(host: SettingsHost, draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue): Picker {
  return {
    title: `${setting.label} — save to ${draft.scope}`, form: 'panel', exclusive: true, holdInput: true, empty: '', filterable: false,
    initialSelection: pending ? 'apply' : setting.choices ? 'choice:0' : 'edit',
    load: async () => detailOptions(draft, setting, pending),
    async apply(ids): Promise<PickerOutcome | undefined> {
      if (ids.length !== 1) return undefined;
      const id = ids[0];
      if (id === 'edit' && !setting.choices) return { next: valueEditor(host, draft, setting, pending) };
      if (id === 'unset') return { next: settingDetail(host, draft, setting, { value: undefined }) };
      if (id === 'scope' && setting.policy.sources.includes('project')) return { next: scopePicker(host, setting, draft.scope) };
      if (id === 'back') return { next: settingsPicker(host, draft.scope) };
      if (id === 'apply' && pending) return { note: `${setting.label}: ${await draft.save(setting.key, pending.value)}` };
      const index = setting.choices?.findIndex((_, position) => id === `choice:${position}`) ?? -1;
      if (index >= 0) return { next: settingDetail(host, draft, setting, { value: setting.choices![index] }) };
      return undefined;
    },
  };
}

/** Searchable grouped fields; selecting a row starts an explicit staged edit. */
export function settingsPicker(host: SettingsHost, scope: SettingsScope = 'user'): Picker {
  let draft: SettingsDraft | undefined;
  return {
    title: `Settings — ${scope} configuration`, form: 'panel', exclusive: true, holdInput: true,
    empty: 'Settings could not be loaded. Check your configuration and retry.',
    async load(): Promise<readonly Option[]> {
      draft = host.openSettings(scope);
      return draft.definitions.map(setting => ({ id: setting.key, label: `${setting.group} · ${setting.label}`,
        detail: `${setting.key}. ${setting.description}`, note: `${compact(draft!.values[setting.key].effective)} · ${draft!.values[setting.key].source}` }));
    },
    async apply(ids): Promise<PickerOutcome | undefined> {
      if (!draft || ids.length !== 1) return undefined;
      const setting = draft.definitions.find(item => item.key === ids[0]);
      return setting ? { next: settingDetail(host, draft, setting) } : undefined;
    },
  };
}

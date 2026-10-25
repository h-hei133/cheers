import type { Option } from '../../../presentation/tui/chrome/options.js';
import { truncateToWidth } from '../../../presentation/tui/text/layout.js';
import { matchRank } from '../../../presentation/tui/text/search.js';
import { formatSetting, parseSettingInput, settingEditor, validateSetting, type SettingDefinition, type SettingsScope } from '../../../config/settings.js';
import type { Picker, PickerOutcome } from '../overlay.js';
import type { SettingsDraft } from '../settings.js';
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { normalizeStatusItems } from '../../../presentation/tui/chrome/items.js';
import { statusItemPicker } from './statusItems.js';
import { settingPreview, type PreferenceHost } from './preview.js';
import { CatalogNavigation, type NavigationGroup } from './navigation.js';
import { settingSources } from './settings/source.js';

export interface SettingsHost extends PreferenceHost {
  openSettings(scope?: SettingsScope): SettingsDraft;
}
interface StagedValue { readonly value: unknown }

function compact(value: unknown): string { return truncateToWidth(formatSetting(value), 36); }

function inputError(setting: SettingDefinition, text: string): string | undefined {
  return parseSettingInput(setting, text).error;
}

/** The editor's starting text, in the shape that editor reads. */
function editorText(setting: SettingDefinition, value: unknown): string {
  const editor = settingEditor(setting);
  if (value === undefined) return '';
  if (editor === 'text' || editor === 'theme') return typeof value === 'string' ? value : String(value);
  if (editor === 'number') return String(value);
  if (editor === 'list' && Array.isArray(value)) {
    return value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
  }
  return formatSetting(value);
}

function editorLabel(setting: SettingDefinition): string {
  const editor = settingEditor(setting);
  if (editor === 'number') return `Number (${setting.schema.type}). Enter stages the value; Apply saves it.`;
  if (editor === 'list') return (setting.schema.items as { type?: string } | undefined)?.type === 'object'
    ? 'One JSON object per line. Enter stages the list; Apply saves it.'
    : 'One item per line. Enter stages the list; Apply saves it.';
  if (editor === 'text' || editor === 'theme') return 'Text value. Enter stages the value; Apply saves it.';
  return `JSON ${setting.schema.type}. Enter stages the value; Apply saves it.`;
}

function valueEditor(host: SettingsHost, draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue): Picker {
  const current = draft.values[setting.key];
  const value = pending ? pending.value : current.stored === undefined ? current.requested : current.stored;
  if (setting.key === 'tui.statusItems') {
    const preview = settingPreview(host, setting.key);
    const picker = statusItemPicker({ current: normalizeStatusItems(value as readonly string[] | undefined), save: async () => undefined,
      preview: items => { preview?.show(items); } });
    return { ...picker, title: 'Stage status items — Enter reviews; empty uses defaults', exclusive: true, holdInput: true,
      back: () => settingDetail(host, draft, setting, pending),
      previewEnd: preview?.end,
      apply: async ids => validateSetting(setting, ids) ? undefined : ({ next: settingDetail(host, draft, setting, { value: normalizeStatusItems(ids) }) }) };
  }
  return {
    title: `Edit ${setting.label} — ${draft.scope}`, form: 'panel', exclusive: true, holdInput: true, empty: '',
    back: () => settingDetail(host, draft, setting, pending),
    load: async () => [], apply: async () => undefined,
    input: {
      initial: editorText(setting, value),
      label: editorLabel(setting),
      validate: text => inputError(setting, text),
      apply: async text => {
        const parsed = parseSettingInput(setting, text);
        return parsed.ok ? { next: settingDetail(host, draft, setting, { value: parsed.value }) } : undefined;
      },
    },
  };
}

function scopePicker(host: SettingsHost, draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue): Picker {
  return {
    title: 'Choose save scope — pending value will be discarded', form: 'panel', exclusive: true, holdInput: true, empty: '', initialSelection: draft.scope,
    back: () => settingDetail(host, draft, setting, pending),
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
  options.push({ id: 'inspect', label: 'Values and sources', detail: 'Read full values and configuration origins' });
  if (setting.choices) setting.choices.forEach((value, index) => options.push({ id: `choice:${index}`, label: `Choose ${formatSetting(value)}`, detail: 'Stage without saving' }));
  else options.push({ id: 'edit', label: 'Edit value', detail: setting.key === 'tui.statusItems' ? 'Choose supported items; stage without saving' : `JSON ${setting.schema.type}; stage without saving` });
  options.push({ id: 'unset', label: 'Remove stored value', detail: 'Stage removal; other layers or defaults will apply' });
  if (setting.policy.sources.includes('project')) options.push({ id: 'scope', label: 'Change save scope', note: draft.scope });
  options.push({ id: 'apply', label: 'Apply', detail: pending ? `Save pending change to ${draft.scope} configuration` : 'Stage a value first', disabled: !pending });
  options.push({ id: 'back', label: 'Back to settings', detail: 'Discard pending value' });
  if (pending) options.push({ id: 'discard', label: 'Discard', detail: 'Return without saving the pending value' });
  return options;
}

function settingDetail(host: SettingsHost, draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue, failure?: string): Picker {
  if (setting.key === 'theme' && host.themes) setting = { ...setting, choices: host.themes.names() };
  const preview = settingPreview(host, setting.key);
  const accepted = setting.key === 'theme' ? host.themes?.selected() : draft.values[setting.key].effective;
  const currentChoice = preview ? Math.max(0, setting.choices?.findIndex(value => value === accepted) ?? 0) : 0;
  let previewError = false;
  return {
    get title() { return `${setting.label}${preview ? ' preview' : ''} — save to ${draft.scope}${failure ? ' — Apply not confirmed' : ''}${previewError ? ' — Preview unavailable' : ''}`; },
    form: 'panel', exclusive: true, holdInput: true, empty: '', filterable: false,
    back: () => settingsPicker(host, draft.scope, setting.group, setting.key),
    initialSelection: pending ? 'apply' : setting.choices ? `choice:${currentChoice}` : 'edit',
    load: async () => [ ...(failure ? [{ id: 'failure', label: failure, disabled: true }] : []), ...detailOptions(draft, setting, pending) ],
    ...(preview ? {
      previewChange(ids: readonly string[]) {
        if (failure && !ids[0]?.startsWith('choice:')) return;
        const index = setting.choices?.findIndex((_, position) => ids[0] === `choice:${position}`) ?? -1;
        const value = index >= 0 ? setting.choices![index] : pending ? pending.value : accepted;
        try { previewError = !preview.show(value); }
        catch { previewError = true; }
      },
      previewEnd: preview.end,
    } : {}),
    async apply(ids): Promise<PickerOutcome | undefined> {
      const index = setting.choices?.findIndex((_, position) => ids[0] === `choice:${position}`) ?? -1;
      if (setting.key === 'theme' && preview && index >= 0 && ids.length === 1) {
        try { previewError = !preview.show(setting.choices![index]); }
        catch { previewError = true; }
      }
      preview?.end();
      if (ids.length !== 1) return undefined;
      if (index >= 0 && previewError) return {
        note: `${setting.key === 'theme' ? 'Theme' : 'Display'} preview is unavailable because the accepted setting changed. Review the current value before applying.`,
        next: settingDetail(host, draft, setting, pending, failure),
      };
      const id = ids[0];
      if (id === 'inspect') return { next: settingSources(draft, setting, () => settingDetail(host, draft, setting, pending, failure)) };
      if (id === 'edit' && !setting.choices) return { next: valueEditor(host, draft, setting, pending) };
      if (id === 'unset') return { next: settingDetail(host, draft, setting, { value: undefined }, failure) };
      if (id === 'scope' && setting.policy.sources.includes('project')) return { next: scopePicker(host, draft, setting, pending) };
      if (id === 'back' || id === 'discard') return { next: settingsPicker(host, draft.scope, setting.group, setting.key) };
      if (id === 'apply' && pending) {
        let current = draft;
        if (failure) {
          try { current = host.openSettings(draft.scope); }
          catch {
            const note = 'Configuration could not be reopened. The pending choice is retained; retry when it is readable.';
            return { note, next: settingDetail(host, draft, setting, pending, note) };
          }
        }
        const result = await current.save(setting.key, pending.value);
        return {
          note: `${setting.label}: ${result.note}`,
          ...(!result.applied
            ? { next: settingDetail(host, current, setting, pending, result.note) }
            : result.applied ? { next: settingsPicker(host, draft.scope, setting.group, setting.key, result.note) } : {}),
        };
      }
      if (index >= 0) return { next: settingDetail(host, draft, setting, { value: setting.choices![index] }, failure) };
      return undefined;
    },
  };
}

const GROUP_ORDER = ['Appearance', 'Model', 'Interaction', 'Context', 'Memory', 'Files', 'Shell', 'Tools', 'Tasks', 'Providers'] as const;
const SETTINGS_GROUPS: readonly string[] = GROUP_ORDER.filter(group => CONFIG_SETTINGS.some(setting => setting.group === group));

/** Searchable grouped fields; selecting a row starts an explicit staged edit. */
export function settingsPicker(host: SettingsHost, scope: SettingsScope = 'user', group?: string, selected?: string, notice?: string): Picker {
  let draft: SettingsDraft | undefined;
  const active = group && SETTINGS_GROUPS.includes(group) ? group : 'all';
  const navigation = new CatalogNavigation(active, true);
  let searching = false;
  const groups = new Map<string, string>();
  return {
    get title() { return `Settings — ${scope} configuration${searching ? ' — Search all groups' : navigation.active === 'all' ? '' : ` — ${navigation.active}`}`; },
    form: 'panel', fullScreen: true, exclusive: true, holdInput: true, navigation,
    footer: [notice, '←→ categories · Tab: sections/rows/navigation · ↑↓ move · Enter: edit · Esc: back'].filter(Boolean).join(' '),
    ...(selected ? { initialSelection: selected } : {}),
    empty: 'Settings could not be loaded. Check your configuration and retry.',
    chips: {
      items: [{ id: 'all', label: 'All' }, ...SETTINGS_GROUPS.map(name => ({ id: name, label: name }))],
      get active() { return searching ? 'all' : navigation.active; },
      select: id => settingsPicker(host, scope, id === 'all' ? undefined : id),
    },
    filterOptions(query, options) {
      searching = query.length > 0;
      navigation.project(query);
      if (!searching) return navigation.project('');
      return searchSettings(query, navigation.all, groups);
    },
    async load(): Promise<readonly Option[]> {
      draft = host.openSettings(scope);
      groups.clear();
      const positions = new Map<string, NavigationGroup>();
      const rows = [...draft.definitions].sort((a, b) => GROUP_ORDER.indexOf(a.group as typeof GROUP_ORDER[number]) - GROUP_ORDER.indexOf(b.group as typeof GROUP_ORDER[number])
        || a.section.localeCompare(b.section)).map(setting => {
        groups.set(setting.key, setting.group);
        positions.set(setting.key, { category: setting.group, section: `${setting.group} / ${setting.section}` });
        const value = draft!.values[setting.key]!;
        return { id: setting.key, label: `${value.stored !== undefined ? '● ' : ''}${setting.label}`,
          searchText: `${setting.group} ${setting.section} ${setting.key} ${setting.description}`,
          note: compact(value.effective) };
      });
      navigation.set(rows, positions, [{ id: 'all', label: 'All' }, ...SETTINGS_GROUPS.map(id => ({ id, label: id }))]);
      return rows;
    },
    detail: id => {
      const setting = draft?.definitions.find(item => item.key === id);
      if (!setting || !draft) return [];
      const value = draft.values[setting.key];
      return [setting.description, `${setting.group} / ${setting.section}`, `Field: ${setting.key}`,
        `Effective: ${compact(value.effective)}`, `Stored: ${compact(value.stored)}`, `Source: ${value.source}`,
        `Save scope: ${scope}`, `Application: ${setting.policy.application}`,
        ...(value.projectTrustNotice ? [value.projectTrustNotice] : [])];
    },
    async apply(ids): Promise<PickerOutcome | undefined> {
      if (!draft || ids.length !== 1) return undefined;
      const setting = draft.definitions.find(item => item.key === ids[0]);
      return setting ? { next: settingDetail(host, draft, setting) } : undefined;
    },
  };
}

function searchSettings(query: string, options: readonly Option[], groups: ReadonlyMap<string, string>): readonly Option[] {
  const ranked = options.map((option, order) => ({ option, order, group: groups.get(option.id) ?? '',
    rank: Math.max(matchRank(query, option.id), matchRank(query, option.label, `${option.detail ?? ''} ${option.note ?? ''}`)),
  })).filter(entry => entry.rank > 0);
  const best = new Map<string, number>();
  for (const entry of ranked) best.set(entry.group, Math.max(best.get(entry.group) ?? 0, entry.rank));
  return ranked.sort((a, b) => (best.get(b.group)! - best.get(a.group)!) ||
    SETTINGS_GROUPS.indexOf(a.group) - SETTINGS_GROUPS.indexOf(b.group) || b.rank - a.rank || a.order - b.order)
    .map(entry => entry.option);
}

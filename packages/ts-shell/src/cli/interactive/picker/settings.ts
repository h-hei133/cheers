import type { Option } from '../../../presentation/tui/chrome/options.js';
import { truncateToWidth } from '../../../presentation/tui/text/layout.js';
import { matchRank } from '../../../presentation/tui/text/search.js';
import { formatSetting, type SettingDefinition, type SettingsScope } from '../../../config/settings.js';
import type { Picker, PickerOutcome } from '../overlay.js';
import type { SettingsDraft } from '../settings.js';
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { settingPreview } from './preview.js';
import { CatalogNavigation, type NavigationGroup } from './navigation.js';
import { settingSources } from './settings/source.js';
import { valueEditor } from './settings/editor.js';
import type { SettingsHost, StagedValue } from './settings/contract.js';
import { sameValue } from '../../../config/values.js';

export type { SettingsHost } from './settings/contract.js';

function compact(value: unknown): string { return truncateToWidth(formatSetting(value), 36); }

function scopePicker(host: SettingsHost, draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue): Picker {
  return {
    title: 'Choose save scope — pending value will be discarded', form: 'panel', exclusive: true, holdInput: true, empty: '', initialSelection: draft.scope,
    back: () => settingDetail(host, draft, setting, pending),
    load: async () => (['user', 'project'] as const).filter(scope => setting.policy.sources.includes(scope)).map(scope => ({ id: scope, label: scope === 'user' ? 'User configuration' : 'Project configuration' })),
    async apply(ids) {
      const scope = ids[0];
      if (ids.length !== 1 || (scope !== 'user' && scope !== 'project') || !setting.policy.sources.includes(scope)) return undefined;
      try {
        const current = draft.reopen(scope);
        if (current) return { next: settingDetail(host, current, setting) };
        const note = 'Settings changed or the session moved. Reopen Settings before changing save scope.';
        return { note, next: settingDetail(host, draft, setting, pending, note) };
      } catch {
        const note = 'Configuration could not be opened. The pending choice and save scope are retained; retry when it is readable.';
        return { note, next: settingDetail(host, draft, setting, pending, note) };
      }
    },
  };
}

function detailOptions(draft: SettingsDraft, setting: SettingDefinition, pending?: StagedValue, active?: unknown): Option[] {
  const current = draft.values[setting.key];
  const options: Option[] = [
    { id: 'effective', label: `Effective: ${compact(current.effective)}`, note: current.source, disabled: true },
    { id: 'accepted', label: `Accepted: ${compact(current.requested)}`, note: current.restartRequired ? 'restart required' : current.requestedSource, disabled: true },
    { id: 'stored', label: `Stored: ${compact(current.stored)}`, note: `${draft.scope} file`, disabled: true },
  ];
  if (current.projectTrustNotice) options.push({ id: 'trust', label: 'Project value inactive', detail: `${current.projectTrustNotice} Use /trust to inspect.`, disabled: true });
  if (pending) options.push({ id: 'pending', label: `Pending: ${compact(pending.value)}`, note: setting.policy.application, disabled: true });
  options.push({ id: 'inspect', label: 'Values and sources', detail: 'Read full values and configuration origins' });
  if (setting.choices) setting.choices.forEach((value, index) => options.push({ id: `choice:${index}`, label: `Choose ${formatSetting(value)}`, detail: 'Stage without saving',
    ...(sameValue(active, value) ? { note: 'active' } : {}) }));
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
  const currentChoice = setting.choices?.findIndex(value => sameValue(value, accepted)) ?? -1;
  let previewError = false;
  let consumed = false;
  return {
    get title() { return `${setting.label}${preview ? ' preview' : ''} — save to ${draft.scope}${failure ? ' — Apply not confirmed' : ''}${previewError ? ' — Preview unavailable' : ''}`; },
    form: 'panel', exclusive: true, holdInput: true, acceptsOwnership: true, empty: '', filterable: false,
    back: () => settingsPicker(host, draft.scope, setting.group, setting.key),
    initialSelection: pending ? 'apply' : setting.choices ? currentChoice >= 0 ? `choice:${currentChoice}` : 'inspect' : 'edit',
    load: async () => [ ...(failure ? [{ id: 'failure', label: failure, disabled: true }] : []), ...detailOptions(draft, setting, pending, accepted) ],
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
    async apply(ids, stillOwned = () => true): Promise<PickerOutcome | undefined> {
      if (consumed) return undefined;
      if (!stillOwned()) { consumed = true; preview?.end(); return undefined; }
      const index = setting.choices?.findIndex((_, position) => ids[0] === `choice:${position}`) ?? -1;
      if (setting.key === 'theme' && preview && index >= 0 && ids.length === 1) {
        try { previewError = !preview.show(setting.choices![index]); }
        catch { previewError = true; }
      }
      preview?.end();
      if (!stillOwned()) { consumed = true; return undefined; }
      if (ids.length !== 1) return undefined;
      if (index >= 0 && previewError) return {
        note: `${setting.key === 'theme' ? 'Theme' : 'Display'} preview is unavailable because the accepted setting changed. Review the current value before applying.`,
        next: settingDetail(host, draft, setting, pending, failure),
      };
      const id = ids[0];
      if (id === 'inspect') return { next: settingSources(draft, setting, () => settingDetail(host, draft, setting, pending, failure)) };
      if (id === 'edit' && !setting.choices) return { next: valueEditor(host, draft, setting, pending, value => settingDetail(host, draft, setting, value)) };
      if (id === 'unset') return { next: settingDetail(host, draft, setting, { value: undefined }, failure) };
      if (id === 'scope' && setting.policy.sources.includes('project')) return { next: scopePicker(host, draft, setting, pending) };
      if (id === 'back' || id === 'discard') return { next: settingsPicker(host, draft.scope, setting.group, setting.key) };
      if (id === 'apply' && pending) {
        consumed = true;
        let current = draft;
        if (failure) {
          let note: string | undefined;
          try {
            const reopened = draft.reopen();
            if (reopened) current = reopened;
            else note = 'Settings changed or the session moved. Reopen Settings before saving.';
          }
          catch {
            note = 'Configuration could not be reopened. The pending choice is retained; retry when it is readable.';
          }
          if (!stillOwned()) return note ? { note } : undefined;
          if (note) return { note, next: settingDetail(host, draft, setting, pending, note) };
        }
        const result = await current.save(setting.key, pending.value);
        const note = `${setting.label}: ${result.note}`;
        if (!stillOwned()) return { note };
        return {
          note,
          next: result.applied ? settingsPicker(host, draft.scope, setting.group, setting.key, result.note)
            : settingDetail(host, current, setting, pending, result.note),
        };
      }
      if (index >= 0) return { next: settingDetail(host, draft, setting, { value: setting.choices![index] }, failure) };
      return undefined;
    },
  };
}

const GROUP_ORDER = ['Appearance', 'Model', 'Session', 'Interaction', 'Context', 'Memory', 'Files', 'Shell', 'Tools', 'Tasks', 'Providers'] as const;
const CAPABILITY_ENTRIES = [
  {
    id: 'settings:memory', group: 'Memory', section: 'Memory / Review', label: 'Memory status', note: 'read-only',
    searchText: 'Memory status health candidates facts recall review /memory',
    detail: 'Insert /memory status to inspect memory health, candidates and saved facts through the memory owner.',
    draft: '/memory status',
  },
  {
    id: 'settings:shell', group: 'Shell', section: 'Shell / Diagnostics', label: 'Shell diagnostics', note: 'read-only',
    searchText: 'Shell diagnostics backend execution sandbox /shell',
    detail: 'Insert /shell status to inspect the selected backend and execution diagnostics through the shell owner.',
    draft: '/shell status',
  },
] as const;
const SETTINGS_GROUPS: readonly string[] = GROUP_ORDER.filter(group => CONFIG_SETTINGS.some(setting => setting.group === group)
  || CAPABILITY_ENTRIES.some(entry => entry.group === group));

/** Searchable grouped fields; selecting a row starts an explicit staged edit. */
export function settingsPicker(host: SettingsHost, scope: SettingsScope = 'user', group?: string, selected?: string, notice?: string): Picker {
  let draft: SettingsDraft | undefined;
  const categories = GROUP_ORDER.filter(name => SETTINGS_GROUPS.includes(name)
    || (name === 'Session' && Boolean(host.modelSettings || host.thinkingSettings)));
  const active = group && categories.includes(group as typeof categories[number]) ? group : 'all';
  const navigation = new CatalogNavigation(active, true, true);
  let searching = false;
  const groups = new Map<string, string>();
  const offered = new Set<string>();
  return {
    get title() {
      if (!searching && navigation.active === 'Session') return `Settings — current session — from ${scope} configuration`;
      return `Settings — ${scope} configuration${searching ? ' — Search all groups' : navigation.active === 'all' ? '' : ` — ${navigation.active}`}`;
    },
    form: 'panel', fullScreen: true, exclusive: true, holdInput: true, navigation,
    footer: [notice, '←→ categories · Tab: sections/rows/navigation · ↑↓ move · Enter: edit · Esc: back'].filter(Boolean).join(' '),
    ...(selected ? { initialSelection: selected } : {}),
    defaultSelection: options => searching ? options.find(option => !option.disabled)?.id : undefined,
    empty: 'Settings could not be loaded. Check your configuration and retry.',
    chips: {
      items: [{ id: 'all', label: 'All' }, ...categories.map(name => ({ id: name, label: name }))],
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
      draft = undefined;
      groups.clear();
      offered.clear();
      draft = host.openSettings(scope);
      const positions = new Map<string, NavigationGroup>();
      const rows: Option[] = draft.definitions.map(setting => {
        groups.set(setting.key, setting.group);
        positions.set(setting.key, { category: setting.group, section: `${setting.group} / ${setting.section}` });
        const value = draft!.values[setting.key]!;
        return { id: setting.key, label: `${value.stored !== undefined ? '● ' : ''}${setting.label}`,
          searchText: `${setting.group} ${setting.section} ${setting.key} ${setting.description}`,
          note: compact(value.effective) };
      });
      for (const [id, label, available] of [['settings:model', 'Models and roles', host.modelSettings],
        ['settings:thinking', 'Thinking effort', host.thinkingSettings]] as const) {
        if (!available) continue;
        groups.set(id, 'Session'); positions.set(id, { category: 'Session', section: 'Session / Current session' });
        rows.push({ id, label, note: 'current session', searchText: `Session ${id === 'settings:model' ? 'provider connection model roles /model' : 'reasoning thinking /thinking'}` });
      }
      for (const entry of CAPABILITY_ENTRIES) {
        groups.set(entry.id, entry.group); positions.set(entry.id, { category: entry.group, section: entry.section });
        rows.push({ id: entry.id, label: entry.label, note: entry.note, searchText: entry.searchText });
      }
      rows.sort((a, b) => GROUP_ORDER.indexOf(groups.get(a.id) as typeof GROUP_ORDER[number]) - GROUP_ORDER.indexOf(groups.get(b.id) as typeof GROUP_ORDER[number])
        || (positions.get(a.id)?.section ?? '').localeCompare(positions.get(b.id)?.section ?? ''));
      navigation.set(rows, positions, [{ id: 'all', label: 'All' }, ...categories.map(id => ({ id, label: id }))]);
      for (const row of rows) offered.add(row.id);
      return rows;
    },
    detail: id => {
      if (id === undefined || !offered.has(id)) return [];
      if (id === 'settings:model') return ['Browse models, configure connections and assign model roles.', 'Model and role choices apply to the current session and are saved for resume.', 'The settings file scope does not change session choices or the connection owner\'s save scope.'];
      if (id === 'settings:thinking') return ['Choose reasoning effort for the current request model.', 'Changes apply to the current session and are saved for resume; the settings file scope does not change them.', 'Supported levels follow the exact model and connection.'];
      const capability = CAPABILITY_ENTRIES.find(entry => entry.id === id);
      if (capability) return [capability.detail];
      const setting = draft?.definitions.find(item => item.key === id);
      if (!setting || !draft) return [];
      const value = draft.values[setting.key];
      return [setting.description, `${setting.group} / ${setting.section}`, `Field: ${setting.key}`,
        `Effective: ${compact(value.effective)}`, `Stored: ${compact(value.stored)}`, `Source: ${value.source}`,
        `Save scope: ${scope}`, `Application: ${setting.policy.application}`,
        ...(value.projectTrustNotice ? [value.projectTrustNotice] : [])];
    },
    async apply(ids): Promise<PickerOutcome | undefined> {
      if (!draft || ids.length !== 1 || !offered.has(ids[0])) return undefined;
      const back = (note?: string) => settingsPicker(host, scope, 'Session', ids[0], note);
      if (ids[0] === 'settings:model' && host.modelSettings) return { next: host.modelSettings(back) };
      if (ids[0] === 'settings:thinking' && host.thinkingSettings) return { next: host.thinkingSettings(back) };
      const capability = CAPABILITY_ENTRIES.find(entry => entry.id === ids[0]);
      if (capability) return { draft: capability.draft };
      const setting = draft.definitions.find(item => item.key === ids[0]);
      return setting ? { next: settingDetail(host, draft, setting) } : undefined;
    },
  };
}

function searchSettings(query: string, options: readonly Option[], groups: ReadonlyMap<string, string>): readonly Option[] {
  const ranked = options.map((option, order) => ({ option, order, group: groups.get(option.id) ?? '',
    rank: Math.max(matchRank(query, option.id), matchRank(query, option.label, `${option.detail ?? ''} ${option.note ?? ''} ${option.searchText ?? ''}`)),
  })).filter(entry => entry.rank > 0);
  const best = new Map<string, number>();
  for (const entry of ranked) best.set(entry.group, Math.max(best.get(entry.group) ?? 0, entry.rank));
  return ranked.sort((a, b) => (best.get(b.group)! - best.get(a.group)!) ||
    GROUP_ORDER.indexOf(a.group as typeof GROUP_ORDER[number]) - GROUP_ORDER.indexOf(b.group as typeof GROUP_ORDER[number]) || b.rank - a.rank || a.order - b.order)
    .map(entry => entry.option);
}

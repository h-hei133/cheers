import { formatSetting, parseSettingInput, settingEditor, validateSetting, type SettingDefinition } from '../../../../config/settings.js';
import { sameValue } from '../../../../config/values.js';
import { normalizeStatusItems } from '../../../../presentation/tui/chrome/items.js';
import type { Picker } from '../../overlay.js';
import type { SettingsDraft } from '../../settings.js';
import { settingPreview } from '../preview.js';
import { statusItemPicker } from '../statusItems.js';
import type { SettingsHost, StagedValue } from './contract.js';

/** The editor's starting text, in the shape that editor reads. */
function editorText(setting: SettingDefinition, value: unknown): string {
  const editor = settingEditor(setting);
  if (value === undefined) return '';
  if (editor === 'text' || editor === 'theme') return typeof value === 'string' ? value : String(value);
  if (editor === 'number') return String(value);
  if (editor === 'list' && Array.isArray(value)) {
    const text = value.map(item => typeof item === 'string' ? item : JSON.stringify(item)).join('\n');
    const parsed = parseSettingInput(setting, text.replace(/\r\n?/g, '\n'));
    return parsed.ok && sameValue(parsed.value, value) ? text : formatSetting(value);
  }
  return formatSetting(value);
}

function editorLabel(setting: SettingDefinition): string {
  const editor = settingEditor(setting);
  if (editor === 'number') return `Number (${setting.schema.type}). Enter stages the value; Apply saves it.`;
  if (editor === 'list') return (setting.schema.items as { type?: string } | undefined)?.type === 'object'
    ? 'One JSON object per line. Enter stages the list; Apply saves it.'
    : 'JSON array or one item per line. Enter stages the list; Apply saves it.';
  if (editor === 'text' || editor === 'theme') return 'Text value. Enter stages the value; Apply saves it.';
  return `JSON ${setting.schema.type}. Enter stages the value; Apply saves it.`;
}

/** A typed editor stages a value; its caller owns the detail and return path. */
export function valueEditor(host: SettingsHost, draft: SettingsDraft, setting: SettingDefinition,
  pending: StagedValue | undefined, review: (pending?: StagedValue) => Picker): Picker {
  const current = draft.values[setting.key];
  const value = pending ? pending.value : current.stored === undefined ? current.requested : current.stored;
  if (setting.key === 'tui.statusItems') {
    const preview = settingPreview(host, setting.key);
    const picker = statusItemPicker({ current: normalizeStatusItems(value as readonly string[] | undefined), save: async () => undefined,
      preview: items => { preview?.show(items); } });
    return { ...picker, title: 'Stage status items — Enter reviews; empty uses defaults', exclusive: true, holdInput: true,
      back: () => review(pending),
      previewEnd: preview?.end,
      apply: async ids => validateSetting(setting, ids) ? undefined : ({ next: review({ value: normalizeStatusItems(ids) }) }) };
  }
  return {
    title: `Edit ${setting.label} — ${draft.scope}`, form: 'panel', exclusive: true, holdInput: true, empty: '',
    back: () => review(pending),
    load: async () => [], apply: async () => undefined,
    input: {
      initial: editorText(setting, value),
      label: editorLabel(setting),
      multiline: ['list', 'object'].includes(settingEditor(setting)),
      validate: text => parseSettingInput(setting, text).error,
      apply: async text => {
        const parsed = parseSettingInput(setting, text);
        return parsed.ok ? { next: review({ value: parsed.value }) } : undefined;
      },
    },
  };
}

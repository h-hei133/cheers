import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { OverlayHost, type Picker } from '../overlay.js';
import { CatalogNavigation } from '../picker/navigation.js';
import { modelPicker } from '../picker/model.js';
import { settingsPicker, type SettingsHost } from '../picker/settings.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { defaultTheme } from '../../../presentation/theme/theme.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { parseMouseReport } from '../../../presentation/tui/input/mouse.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
let restoreTheme: () => void;
beforeEach(() => {
  restoreTheme = defaultTheme.snapshot();
  defaultTheme.apply({ name: 'hover-fixture', description: '', colors: { text: 'white', selectedBg: 'blue', statusBandBg: 'red' } }, '16');
  expect(defaultTheme.bgOpen('statusBandBg')).toBe('\x1b[41m');
});
afterEach(() => restoreTheme());
const move = (overlay: OverlayHost, row: number, column: number, top = 0) =>
  overlay.handlePointer(parseMouseReport(`\x1b[<35;${column + 1};${top + row + 1}M`)!, top);
const point = (rows: readonly string[], text: string, pane?: 'sidebar' | 'content' | 'list') => {
  const row = rows.findIndex(line => (pane === 'sidebar' || pane === 'list' ? stripAnsi(line).split('│')[0]
    : pane === 'content' ? stripAnsi(line).split('│')[1] : stripAnsi(line))?.includes(text));
  expect(row).toBeGreaterThanOrEqual(0);
  return { row, column: stripAnsi(rows[row]!).indexOf(text) };
};
const hovered = (rows: readonly string[], row: number) => expect(rows[row]).toContain(defaultTheme.bgOpen('statusBandBg'));

it.each(['panel', 'modal'] as const)('paints a separate hover band in %s without moving selection, applying or previewing', async form => {
  const redraw = vi.fn(), preview = vi.fn(), apply = vi.fn(), overlay = new OverlayHost(redraw);
  const picker: Picker = { title: 'Candidates', form, empty: '', previewChange: preview, apply,
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta', disabled: true, focusable: true }] };
  overlay.open(picker); await settle(); const rows = overlay.render(100, 20), p = point(rows, 'beta');
  preview.mockClear(); redraw.mockClear(); move(overlay, p.row, p.column, 7);
  expect(redraw).toHaveBeenCalledOnce();
  hovered(overlay.render(100, 20), p.row);
  move(overlay, p.row, p.column, 7); expect(redraw).toHaveBeenCalledOnce();
  expect(preview).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, ['a']); overlay.close();
});

it.each([40, 80, 120])('highlights a painted settings tab at %s columns without switching category or changing Enter', async width => {
  const save = vi.fn(async () => ({ applied: true })), preview = vi.fn();
  const host: SettingsHost = { openSettings: () => ({ scope: 'user', file: '/fixture/config.json', save, reopen: () => undefined,
    definitions: CONFIG_SETTINGS, values: Object.fromEntries(CONFIG_SETTINGS.map(setting => [setting.key,
      { stored: undefined, effective: false, requested: false, source: 'default', requestedSource: 'default', restartRequired: false }])) }) };
  const redraw = vi.fn(), overlay = new OverlayHost(redraw);
  const picker = { ...settingsPicker(host, 'user', 'Appearance', 'theme'), previewChange: preview };
  overlay.open(picker); await settle(); let rows = overlay.render(width, 30);
  const tab = point(rows, ' Model '), before = rows.map(stripAnsi);
  redraw.mockClear(); preview.mockClear(); move(overlay, tab.row, tab.column + 1, 7);
  expect(redraw).toHaveBeenCalledOnce();
  rows = overlay.render(width, 30); hovered(rows, tab.row);
  expect(rows.filter(line => line.includes(defaultTheme.bgOpen('statusBandBg')))).toHaveLength(1);
  expect(rows.map(stripAnsi)).toEqual(before);
  expect(picker.navigation?.active).toBe('Appearance');
  move(overlay, tab.row, tab.column + 1, 7); expect(redraw).toHaveBeenCalledOnce();
  expect(preview).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, ['theme']); overlay.close();
});

it.each(['panel', 'modal'] as const)('keeps %s chip hover separate from an identically named option and from activation', async form => {
  const select = vi.fn(), preview = vi.fn(), apply = vi.fn(), overlay = new OverlayHost(() => {});
  const picker: Picker = { title: 'Candidates', form, empty: '', apply, previewChange: preview,
    chips: { items: [{ id: 'a', label: 'First group' }, { id: 'b', label: 'Second group' }], active: 'a', select },
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }] };
  overlay.open(picker); await settle(); let rows = overlay.render(100, 20);
  const tab = point(rows, 'Second group'); preview.mockClear();
  move(overlay, tab.row, tab.column); rows = overlay.render(100, 20);
  hovered(rows, tab.row);
  expect(rows.filter(line => line.includes(defaultTheme.bgOpen('statusBandBg')))).toHaveLength(1);
  const option = point(rows, 'beta'); move(overlay, option.row, option.column);
  rows = overlay.render(100, 20); hovered(rows, option.row);
  expect(rows[tab.row]).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  const active = point(rows, 'First group'); move(overlay, active.row, active.column);
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  expect(select).not.toHaveBeenCalled(); expect(preview).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, ['a']); overlay.close();
});

it('retires tab hover and hit targets on search, resize and replacement before the next frame', async () => {
  const overlay = new OverlayHost(() => {}), select = vi.fn();
  const picker: Picker = { title: 'Candidates', form: 'panel', empty: '', apply: async () => undefined,
    chips: { items: [{ id: 'a', label: 'First group' }, { id: 'b', label: 'Second group' }], active: 'a', select },
    load: async () => [{ id: 'a', label: 'alpha' }] };
  overlay.open(picker); await settle(); let rows = overlay.render(100, 20), tab = point(rows, 'Second group');
  move(overlay, tab.row, tab.column); hovered(overlay.render(100, 20), tab.row);
  move(overlay, tab.row, tab.column + 'Second group'.length + 2);
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  move(overlay, tab.row, tab.column); overlay.handlePaste('alpha'); move(overlay, tab.row, tab.column);
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  rows = overlay.render(100, 20); tab = point(rows, 'Second group'); move(overlay, tab.row, tab.column);
  expect(overlay.render(40, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  rows = overlay.render(100, 20); tab = point(rows, 'Second group'); move(overlay, tab.row, tab.column);
  expect(overlay.render(100, 3).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  move(overlay, tab.row, tab.column);
  expect(overlay.render(100, 3).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  rows = overlay.render(100, 20); tab = point(rows, 'Second group'); move(overlay, tab.row, tab.column);
  overlay.open({ ...picker, chips: undefined }); move(overlay, tab.row, tab.column); await settle();
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  expect(select).not.toHaveBeenCalled(); overlay.close();
});

it('requires an unmodified tab motion with a painted origin and a finished load', async () => {
  const redraw = vi.fn(), overlay = new OverlayHost(redraw);
  let finish!: (rows: readonly { id: string; label: string }[]) => void;
  overlay.open({ title: 'Candidates', form: 'panel', empty: '', apply: async () => undefined,
    chips: { items: [{ id: 'a', label: 'First group' }, { id: 'b', label: 'Second group' }], active: 'a', select: vi.fn() },
    load: () => new Promise(resolve => { finish = resolve; }) });
  let rows = overlay.render(100, 20), tab = point(rows, 'Second group'); redraw.mockClear();
  move(overlay, tab.row, tab.column); expect(redraw).not.toHaveBeenCalled();
  finish([{ id: 'a', label: 'alpha' }]); await settle();
  rows = overlay.render(100, 20); tab = point(rows, 'Second group'); redraw.mockClear();
  for (const code of [35, 39, 43, 51]) {
    overlay.handlePointer(parseMouseReport(`\x1b[<${code};${tab.column + 1};${tab.row + 1}M`)!, code === 35 ? undefined : 0);
    expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  }
  expect(redraw).not.toHaveBeenCalled();
  move(overlay, tab.row, tab.column); hovered(overlay.render(100, 20), tab.row); overlay.close();
});

it.each(['top', 'side'] as const)('retains the current row when clicking away and back through %s navigation', async placement => {
  const navigation = new CatalogNavigation('first', false, false, placement), overlay = new OverlayHost(() => {});
  navigation.set([{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }, { id: 'c', label: 'gamma' }],
    new Map([['a', { category: 'first' }], ['b', { category: 'first' }], ['c', { category: 'second' }]]),
    [{ id: 'first', label: 'First category' }, { id: 'second', label: 'Second category' }]);
  const picker: Picker = { title: 'Candidates', form: 'panel', empty: '', navigation, initialSelection: 'b',
    load: async () => navigation.project(''), apply: async () => undefined };
  overlay.open(picker); await settle();
  for (const label of ['Second category', 'First category']) {
    const p = point(overlay.render(120, 20), label);
    overlay.handlePointer(parseMouseReport(`\x1b[<0;${p.column + 1};${p.row + 1}M`)!, 0);
  }
  expect(navigation.active).toBe('first');
  const apply = vi.fn();
  if (placement === 'side') overlay.handleKey(parseKeyEvent('\r'), apply);
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, ['b']); overlay.close();
});

it('moves the hover between sidebar and content, clears it over details and preserves the exact model selection', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'openai' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.invalid/v1', models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const overlay = new OverlayHost(() => {}), picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) });
  overlay.open(picker); await settle();
  let rows = overlay.render(120, 30); const category = point(rows, 'Fixture provider', 'sidebar');
  move(overlay, category.row, category.column); rows = overlay.render(120, 30); hovered(rows, category.row);
  expect(picker.navigation?.active).toBe('all');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;${category.column + 1};${category.row + 1}M`)!, 0);
  rows = overlay.render(120, 30); const model = point(rows, 'missing-b', 'content');
  move(overlay, model.row, model.column); rows = overlay.render(120, 30); hovered(rows, model.row);
  expect(stripAnsi(rows.join('\n'))).toContain('▸ Fixture provider');
  move(overlay, model.row, 110); rows = overlay.render(120, 30);
  expect(rows.join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply); // Transfer category focus.
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), [`model:${JSON.stringify([null, 'fixture', 'missing-a'])}`]);
  overlay.close();
});

it('keeps settings section labels out of hover while ordinary nonclickable content can highlight without staging', async () => {
  const save = vi.fn(async () => ({ applied: true }));
  const host: SettingsHost = { openSettings: () => ({ scope: 'user', file: '/fixture/config.json', save, reopen: () => undefined, definitions: CONFIG_SETTINGS,
    values: Object.fromEntries(CONFIG_SETTINGS.map(setting => [setting.key, { stored: undefined, effective: false,
      requested: false, source: 'default', requestedSource: 'default', restartRequired: false }])) }) };
  const overlay = new OverlayHost(() => {}); overlay.open(settingsPicker(host, 'user', 'Model')); await settle();
  overlay.handleKey(parseKeyEvent('\t'), vi.fn());
  let rows = overlay.render(120, 30), field = point(rows, 'Maximum turns', 'list');
  move(overlay, field.row, field.column); hovered(overlay.render(120, 30), field.row);
  const section = point(rows, 'Model / Limits', 'list'); move(overlay, section.row, section.column);
  expect(overlay.render(120, 30).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  expect(save).not.toHaveBeenCalled(); overlay.close();
});

it('expires hover on filter, resize, source refresh, wheel and replacement and rejects stale geometry', async () => {
  const overlay = new OverlayHost(() => {}); let publish!: (rows: readonly { id: string; label: string }[]) => void;
  overlay.open({ title: 'Candidates', form: 'panel', empty: '', apply: async () => undefined,
    subscribe: callback => { publish = callback; return () => {}; },
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }] });
  await settle(); let rows = overlay.render(100, 20), p = point(rows, 'beta');
  move(overlay, p.row, p.column); hovered(overlay.render(100, 20), p.row);
  expect(overlay.render(40, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  rows = overlay.render(100, 20); p = point(rows, 'beta'); move(overlay, p.row, p.column);
  overlay.handlePaste('a'); move(overlay, p.row, p.column);
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  overlay.handleKey(parseKeyEvent('\x15'), vi.fn()); rows = overlay.render(100, 20); p = point(rows, 'beta');
  move(overlay, p.row, p.column); publish([{ id: 'a', label: 'alpha' }]); move(overlay, p.row, p.column);
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  overlay.open({ title: 'Replacement', form: 'panel', empty: '', apply: async () => undefined,
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }] }); await settle();
  rows = overlay.render(100, 20); p = point(rows, 'beta'); move(overlay, p.row, p.column);
  overlay.handlePointer(parseMouseReport(`\x1b[<65;${p.column + 1};${p.row + 1}M`)!, 0);
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg')); overlay.close();
});

it('does not reveal a sidebar hover on a hidden narrow content page or with modified motion', async () => {
  const navigation = new CatalogNavigation('all'), overlay = new OverlayHost(() => {}), redraw = vi.fn();
  navigation.set([{ id: 'a', label: 'alpha' }], new Map([['a', { category: 'all' }]]),
    [{ id: 'all', label: 'All' }, { id: 'other', label: 'Other' }]);
  overlay.open({ title: 'Candidates', form: 'panel', empty: '', navigation, apply: async () => undefined,
    load: async () => navigation.project('') }); await settle();
  overlay.handleKey(parseKeyEvent('\t'), redraw); let rows = overlay.render(40, 20), p = point(rows, 'Other');
  move(overlay, p.row, p.column); hovered(overlay.render(40, 20), p.row);
  overlay.handleKey(parseKeyEvent('\t'), redraw); expect(overlay.render(40, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  overlay.handleKey(parseKeyEvent('\t'), redraw); rows = overlay.render(40, 20); p = point(rows, 'Other');
  overlay.handlePointer(parseMouseReport(`\x1b[<39;${p.column + 1};${p.row + 1}M`)!, 0);
  expect(overlay.render(40, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg')); overlay.close();
});

it('absorbs motion during loading, editing and pending actions and requires a painted screen origin', async () => {
  const redraw = vi.fn(), overlay = new OverlayHost(redraw), apply = vi.fn();
  const picker: Picker = { title: 'Candidates', form: 'panel', empty: '', apply,
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }] };
  overlay.open({ ...picker, load: () => new Promise(() => {}) }); overlay.render(100, 20); redraw.mockClear();
  move(overlay, 2, 5); expect(redraw).not.toHaveBeenCalled();
  overlay.open({ ...picker, input: { initial: 'original', label: '', validate: () => undefined, apply } });
  await settle(); overlay.render(100, 20); redraw.mockClear(); move(overlay, 2, 5);
  expect(redraw).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { void selected.apply(ids); });
  expect(apply).toHaveBeenCalledWith('original'); apply.mockClear();
  let finish!: (value: string) => void;
  overlay.open({ ...picker, onPin: () => new Promise<string>(resolve => { finish = resolve; }) });
  await settle(); let rows = overlay.render(100, 20), p = point(rows, 'beta');
  overlay.handlePointer(parseMouseReport(`\x1b[<35;${p.column + 1};${p.row + 1}M`)!);
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  move(overlay, p.row, p.column); hovered(overlay.render(100, 20), p.row);
  overlay.handleKey(parseKeyEvent('\x10'), apply); overlay.render(100, 20); redraw.mockClear();
  move(overlay, p.row, p.column); expect(redraw).not.toHaveBeenCalled();
  expect(overlay.render(100, 20).join('\n')).not.toContain(defaultTheme.bgOpen('statusBandBg'));
  finish('pinned'); await settle(); await settle(); overlay.close();
});

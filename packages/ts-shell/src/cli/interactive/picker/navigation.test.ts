import { expect, it, vi } from 'vitest';
import { OverlayHost, type Picker } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { settingsPicker } from './settings.js';
import { modelPicker } from './model.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { parseMouseReport } from '../../../presentation/tui/input/mouse.js';
import type { Option } from '../../../presentation/tui/chrome/options.js';
import type { SettingsDraft } from '../settings.js';
import { CatalogNavigation } from './navigation.js';
import { visibleWidth } from '../../../presentation/tui/text/measure.js';

function settings() {
  const save = vi.fn(async () => ({ applied: true, note: 'saved' }));
  const openSettings = (scope: 'user' | 'project' = 'user'): SettingsDraft => ({ scope, file: '/fixture/config.json', save, reopen: openSettings, definitions: CONFIG_SETTINGS,
    values: Object.fromEntries(CONFIG_SETTINGS.map(setting => [setting.key, { stored: undefined,
      effective: setting.key === 'maxTurns' ? 10 : false, requested: false, source: 'default', requestedSource: 'default', restartRequired: false }])) });
  return { save, openSettings };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const view = (host: OverlayHost, width = 120) => stripAnsi(host.render(width, 30).join('\n'));

it('drops removed row identities from every category while retaining surviving focus', () => {
  const navigation = new CatalogNavigation();
  const rows = [{ id: 'a', label: 'a' }, { id: 'b', label: 'b' }];
  const groups = new Map([['a', { category: 'first' }], ['b', { category: 'second' }]]);
  const categories = [{ id: 'all', label: 'All' }, { id: 'first', label: 'First' }, { id: 'second', label: 'Second' }];
  navigation.set(rows, groups, categories);
  navigation.focus('a'); navigation.select('first'); navigation.focus('a'); navigation.select('second'); navigation.focus('b');
  navigation.set([rows[1]!], groups, categories);
  expect(navigation.preferred).toBe('b'); navigation.select('first'); expect(navigation.preferred).toBeUndefined();
  navigation.select('all'); expect(navigation.preferred).toBeUndefined();
});

it('navigates top categories and section/row domains, edits a real number, discards and reopens the exact field', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {});
  const press = async (key: string) => {
    let pending: Promise<unknown> | undefined;
    overlay.handleKey(parseKeyEvent(key), (picker, ids) => { pending = picker.apply(ids).then(result => {
      if (result?.next) overlay.open(result.next);
    }); });
    await pending; await settle();
  };
  overlay.open(settingsPicker(h, 'project', 'Appearance')); await settle();
  expect(view(overlay)).toContain('[Appearance]'); expect(view(overlay)).toContain('Appearance / Composer');
  await press('\x1b[C'); // Model category
  expect(view(overlay)).toContain('Model / Limits');
  await press('\t'); // section domain
  expect(view(overlay)).toContain('▸ Model / Limits');
  await press('\x1b[B'); expect(view(overlay)).toContain('▸ Model / Sampling');
  await press('\r'); expect(view(overlay)).toContain('▸ Temperature');
  await press('\x1b[D'); // Appearance
  await press('\x1b[B');
  const retained = /▸ ([^\n│]+)/.exec(view(overlay))?.[1]?.trim();
  await press('maxTurns');
  expect(view(overlay)).toContain('Maximum turns');
  for (let index = 0; index < 8; index++) await press('\x7f');
  expect(view(overlay)).toContain(`▸ ${retained}`);
  await press('maxTurns');
  await press('\r'); await press('\r'); // field -> numeric editor
  expect(view(overlay)).toContain('Edit Maximum turns');
  await press('\x15'); overlay.handlePaste('42');
  await press('\x1b[D'); // input editor keeps ownership of the caret
  expect(view(overlay)).toContain('Edit Maximum turns');
  await press('\r'); expect(view(overlay)).toContain('Pending: 42');
  expect(h.save).not.toHaveBeenCalled();
  // Enter selects Apply by default; Discard is reached via two Down keys.
  await press('\x1b[B'); await press('\x1b[B'); await press('\r');
  expect(view(overlay)).toContain('▸ Maximum turns'); expect(h.save).not.toHaveBeenCalled();
  await press('\x1b'); expect(overlay.active).toBe(false);
});

it('browses an unavailable provider through navigation then returns from inspection at narrow and wide sizes', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1',
    models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) });
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await settle();
  overlay.handleKey(parseKeyEvent('\t'), vi.fn());
  expect(view(overlay, 40)).toContain('Browse');
  overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn()); // all -> provider
  expect(view(overlay, 40)).toContain('▸ Fixture provider');
  overlay.handleKey(parseKeyEvent('\r'), vi.fn());
  expect(view(overlay, 40)).toContain('missing-a');
  overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
  expect(view(overlay)).toContain('▸ missing-b');
  let pending: Promise<unknown> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected: Picker, ids) => { pending = selected.apply(ids).then(result => {
    if (result?.next) overlay.open(result.next);
  }); });
  await pending; await settle(); expect(view(overlay)).toContain('Configure connection');
  overlay.handleKey(parseKeyEvent('\x1b'), vi.fn()); await settle();
  expect(view(overlay)).toContain('▸ missing-b'); expect(view(overlay, 40)).toContain('missing-b');
  const retained = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), retained);
  expect(retained.mock.calls[0]?.[1]).toEqual([`model:${JSON.stringify([null, 'fixture', 'missing-b'])}`]);
  overlay.close();
});

it.each([40, 80, 120])('clicks top categories and settings rows across resize at %i columns without applying a value', async width => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  const picker = settingsPicker(h, 'project', 'Appearance');
  const click = (label: string, category = false, size = width) => {
    const frame = overlay.render(size, 30).map(stripAnsi);
    const row = category ? 1 : frame.findIndex(text => text.split('│')[0]?.includes(label));
    const column = (category ? frame[row]! : frame[row]!.split('│')[0]!).indexOf(label);
    expect(column).toBeGreaterThanOrEqual(0);
    overlay.handlePointer(parseMouseReport(`\x1b[<0;${column + 1};${row + 1}M`)!, 0);
    return { row, column };
  };
  overlay.open(picker); await settle();
  expect(picker.navigation?.placement).toBe('top'); expect(picker.chips).toBeUndefined();
  click('Model', true);
  for (const size of [40, 80, 120]) {
    const frame = overlay.render(size, 30).map(stripAnsi);
    expect(frame[1]).toContain('[Model]'); expect(frame.join('\n')).toContain('Maximum turns');
    expect(frame.join('\n')).not.toContain('Browse'); expect(frame.join('\n')).not.toContain('shift+tab/tab group');
  }
  expect(picker.navigation?.focused).toBe(false);
  const select = vi.spyOn(picker.navigation!, 'select');
  const old = click('Maximum turns');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;${old.column + 1};2M`)!, 0); // Retired category hit map.
  expect(select).not.toHaveBeenCalled();
  expect(view(overlay, width)).toContain('▸ Maximum turns');
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  expect(view(overlay, width)).toContain('▸ Output token');
  expect(picker.navigation?.active).toBe('Model'); expect(apply).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), ['maxOutputTokens']); overlay.close();
});

it('enters the settings section clicked after a category hop and requires Enter before editing', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  overlay.open(settingsPicker(h, 'user', 'Model')); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply); // sections
  const frame = overlay.render(120, 30).map(stripAnsi);
  const row = frame.findIndex(text => text.includes('Model / Sampling')); const column = frame[row]!.indexOf('Model / Sampling');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;${column + 1};${row + 1}M`)!, 0);
  expect(view(overlay)).toContain('▸ Model / Sampling');
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(view(overlay)).toContain('▸ Temperature'); expect(apply).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\r'), apply); expect(apply).toHaveBeenCalledWith(expect.anything(), ['temperature']);
  expect(h.save).not.toHaveBeenCalled(); overlay.close();
});

it('clicks an unconfigured model from category focus then opens its exact inspection after resize', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1', models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) });
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await settle(); const apply = vi.fn();
  const click = (label: string, pane: 'navigation' | 'content', width = 120) => {
    const frame = overlay.render(width, 30).map(stripAnsi);
    const row = frame.findIndex(text => (pane === 'navigation' ? text.split('│')[0] : text.split('│')[1])?.includes(label));
    expect(row).toBeGreaterThanOrEqual(0);
    const column = frame[row]!.indexOf(label);
    overlay.handlePointer(parseMouseReport(`\x1b[<0;${column + 1};${row + 1}M`)!, 0);
  };
  click('Fixture provider', 'navigation'); expect(view(overlay, 40)).toContain('Browse');
  click('missing-b', 'content'); expect(view(overlay, 40)).toContain('▸ missing-b'); expect(view(overlay, 40)).not.toContain('Browse');
  overlay.handleKey(parseKeyEvent('\x1b[A'), apply); expect(view(overlay)).toContain('▸ missing-a');
  expect(view(overlay)).toContain('• Fixture provider'); expect(apply).not.toHaveBeenCalled();
  let pending: Promise<unknown> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids).then(result => { if (result?.next) overlay.open(result.next); }); });
  await pending; await settle(); expect(view(overlay)).toContain('Configure connection'); expect(view(overlay)).toContain('missing-a');
  overlay.close();
});

it('does not expose top category hit targets outside an extremely short painted frame', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const picker = settingsPicker(h, 'user', 'Model');
  overlay.open(picker); await settle(); const apply = vi.fn();
  const select = vi.spyOn(picker.navigation!, 'select');
  for (const width of [40, 80, 120]) for (const height of [0, 1, 2]) {
    const frame = overlay.render(width, height);
    expect(frame.length).toBeLessThanOrEqual(height);
    overlay.handlePointer(parseMouseReport('\x1b[<0;3;2M')!, 0);
    expect(picker.navigation?.active).toBe('Model');
  }
  expect(select).not.toHaveBeenCalled(); select.mockRestore();
  expect(h.save).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled(); overlay.close();
});

it('preserves an uppercase settings search after clicking its result', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  overlay.open(settingsPicker(h)); await settle(); overlay.handlePaste('MAX');
  const frame = overlay.render(120, 30).map(stripAnsi);
  const row = frame.findIndex(text => text.includes('Output token'));
  const column = frame[row]!.indexOf('Output token');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;${column + 1};${row + 1}M`)!, 0);
  const selected = view(overlay); expect(selected).toContain('MAX'); expect(selected).toContain('▸ Output token');
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), ['maxOutputTokens']); expect(h.save).not.toHaveBeenCalled(); overlay.close();
});

it('retires top category hit spans when search changes its chip window and repaints All', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  const picker = settingsPicker(h, 'user', 'Model'); overlay.open(picker); await settle();
  const frame = overlay.render(40, 30).map(stripAnsi);
  const column = frame[1]!.indexOf('Interaction'); expect(column).toBeGreaterThanOrEqual(0);
  const select = vi.spyOn(picker.navigation!, 'select');
  overlay.handlePaste('maxTurns');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;${column + 1};2M`)!, 0);
  expect(select).not.toHaveBeenCalled();
  const filtered = overlay.render(40, 30).map(stripAnsi);
  expect(filtered[1]).toContain('[All]'); expect(filtered.join('\n')).toContain('▸ Maximum turns');
  overlay.handleKey(parseKeyEvent('\x1b'), apply);
  expect(view(overlay, 40)).toContain('[Model]'); expect(picker.navigation?.active).toBe('Model');
  expect(h.save).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled(); overlay.close();
});

it.each(['rows', 'sections'] as const)('restores the settings %s focus after clearing an empty-result search', async domain => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  const picker = settingsPicker(h, 'user', 'Model'); overlay.open(picker); await settle();
  if (domain === 'sections') overlay.handleKey(parseKeyEvent('\t'), apply);
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  const expected = domain === 'sections' ? '▸ Model / Sampling' : '▸ Output token';
  expect(view(overlay)).toContain(expected);
  overlay.handlePaste('no-such-setting');
  expect(view(overlay)).not.toContain(expected);
  for (const character of 'no-such-setting') overlay.handleKey(parseKeyEvent('\x7f'), apply);
  expect(picker.navigation?.focused).toBe(false);
  expect(view(overlay, 40)).toContain(expected);
  overlay.handleKey(parseKeyEvent(domain === 'sections' ? '\r' : '\x1b[B'), apply);
  expect(view(overlay)).toContain(`▸ ${CONFIG_SETTINGS.find(setting => setting.key === (domain === 'sections' ? 'temperature' : 'allowedModels'))!.label}`);
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, [domain === 'sections' ? 'temperature' : 'allowedModels']);
  expect(h.save).not.toHaveBeenCalled(); overlay.close();
});

it.each([40, 80, 120])('keeps every top category visible and moves vertically within its active domain at %i columns', async width => {
  const h = settings(); const picker = settingsPicker(h); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  overlay.open(picker); await settle();
  const navigation = picker.navigation!;
  for (const category of navigation.items) {
    const frame = overlay.render(width, 30).map(stripAnsi);
    expect(frame[1]).toContain(`[${category.label}]`);
    expect(frame.every(row => visibleWidth(row) <= width)).toBe(true);
    expect(navigation.focused).toBe(false);
    overlay.handleKey(parseKeyEvent('\x1b[C'), apply);
  }
  expect(navigation.active).toBe('all');
  overlay.handleKey(parseKeyEvent('\x1b[D'), apply);
  expect(navigation.active).toBe(navigation.items.at(-1)?.id);
  overlay.close(); const modelSettings = settingsPicker(h, 'user', 'Model'); overlay.open(modelSettings); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply);
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  expect(view(overlay, width)).toContain('▸ Model / Sam');
  overlay.handleKey(parseKeyEvent('\x1b[C'), apply);
  expect(view(overlay, width)).toContain('▸ Interaction /');
  overlay.handleKey(parseKeyEvent('\x1b[Z'), apply);
  expect(view(overlay, width)).toContain(`▸ ${CONFIG_SETTINGS.find(setting => setting.key === 'vimMode')!.label}`);
  overlay.handleKey(parseKeyEvent('\t'), apply);
  overlay.handleKey(parseKeyEvent('\t'), apply);
  expect(modelSettings.navigation?.focused).toBe(false);
  expect(view(overlay, width)).toContain(`▸ ${CONFIG_SETTINGS.find(setting => setting.key === 'vimMode')!.label}`);
  overlay.handleKey(parseKeyEvent('\x1b[Z'), apply);
  overlay.handleKey(parseKeyEvent('\x1b'), apply);
  expect(overlay.active).toBe(true); expect(view(overlay, width)).toContain(`▸ ${CONFIG_SETTINGS.find(setting => setting.key === 'vimMode')!.label}`);
  overlay.handleKey(parseKeyEvent('\x1b'), apply);
  expect(overlay.active).toBe(false); expect(apply).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
});

it('leaves settings search at the selected result without closing or applying it', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  const picker = settingsPicker(h, 'project', 'Interaction'); overlay.open(picker); await settle();
  overlay.handlePaste('maxTurns'); expect(view(overlay)).toContain('▸ Maximum turns');
  overlay.handleKey(parseKeyEvent('\x1b'), apply);
  expect(overlay.active).toBe(true); expect(picker.navigation?.active).toBe('Model');
  expect(view(overlay, 40)).toContain('▸ Maximum turns'); expect(view(overlay)).not.toContain('Search all groups');
  expect(apply).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, ['maxTurns']); overlay.close();
});

it('clears an empty model search before leaving the unconfigured provider', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1', models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) });
  const overlay = new OverlayHost(() => {}); const apply = vi.fn(); overlay.open(picker); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply); overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  overlay.handleKey(parseKeyEvent('\r'), apply); overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  expect(view(overlay)).toContain('▸ missing-b');
  overlay.handlePaste('no-such-model'); overlay.handleKey(parseKeyEvent('\x1b'), apply);
  expect(overlay.active).toBe(true); expect(picker.navigation?.active).toBe('fixture');
  expect(view(overlay, 40)).toContain('▸ missing-b'); expect(view(overlay)).not.toContain('no-such-model');
  expect(apply).not.toHaveBeenCalled();
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), [`model:${JSON.stringify([null, 'fixture', 'missing-b'])}`]);
  const result = await (apply.mock.calls[0]![0] as Picker).apply(apply.mock.calls[0]![1]);
  expect(result?.next?.title).toContain('missing-b'); overlay.close();
});

it('returns from a model search inspection to the exact content row after searching from the sidebar', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1', models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  overlay.open(modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) })); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply); expect(view(overlay, 40)).toContain('Browse');
  overlay.handlePaste('missing-b'); expect(view(overlay, 40)).toContain('▸ missing-b');
  let pending: Promise<unknown> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (picker, ids) => { pending = picker.apply(ids).then(outcome => {
    if (outcome?.next) overlay.open(outcome.next);
  }); });
  await pending; await settle(); expect(view(overlay)).toContain('Configure connection');
  overlay.handleKey(parseKeyEvent('\x1b'), apply); await settle();
  expect(view(overlay, 40)).toContain('▸ missing-b'); expect(view(overlay, 40)).not.toContain('Browse');
  expect(apply).not.toHaveBeenCalled(); overlay.close();
});

it('keeps explicit hierarchy navigation when leaving search and returning models reload without stealing sidebar focus', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  const settingsView = settingsPicker(h, 'user', 'Model'); overlay.open(settingsView); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply); // sections
  overlay.handlePaste('maxTurns'); overlay.handleKey(parseKeyEvent('\x1b[C'), apply);
  expect(settingsView.navigation?.active).toBe('Interaction');
  expect(view(overlay)).not.toContain('Search all groups');
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply); expect(view(overlay)).toContain('▸ Attention on idle');
  overlay.close(); expect(h.save).not.toHaveBeenCalled();

  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1', models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const target = `model:${JSON.stringify([null, 'fixture', 'missing-b'])}`;
  const picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) }, target);
  let publish: ((options: readonly Option[]) => void) | undefined;
  overlay.open({ ...picker, subscribe: callback => { publish = callback; return () => {}; } }); await settle();
  expect(view(overlay, 40)).toContain('▸ missing-b');
  overlay.handleKey(parseKeyEvent('\t'), apply); expect(view(overlay, 40)).toContain('Browse');
  publish!(await picker.load()); expect(view(overlay, 40)).toContain('Browse');
  expect(picker.navigation?.focused).toBe(true); expect(apply).not.toHaveBeenCalled(); overlay.close();
});

it('returns a nested model browser directly to its parent even while a search is active', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1', models: [{ id: 'missing-a' }] }];
  const parent: Picker = { title: 'Parent', empty: '', load: async () => [{ id: 'return', label: 'Returned' }], apply: vi.fn() };
  const assigning = { role: 'subagent' as const, thinkingEffort: null, assign: vi.fn(), back: vi.fn(() => parent) };
  const picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) }, undefined, undefined, assigning);
  const overlay = new OverlayHost(() => {}); const apply = vi.fn(); overlay.open(picker); await settle();
  overlay.handlePaste('missing'); overlay.handleKey(parseKeyEvent('\x1b'), apply); await settle();
  expect(view(overlay)).toContain('Parent'); expect(assigning.back).toHaveBeenCalledOnce();
  expect(assigning.assign).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled(); overlay.close();
});

it('returns from a cross-provider search inspection in the selected model provider', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = ['first', 'second'].map(id => ({ id, label: `${id} provider`, runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: `https://${id}.example.invalid/v1`, models: [{ id: `${id}-model` }] }));
  const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  overlay.open(modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) })); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply); overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  overlay.handleKey(parseKeyEvent('\r'), apply); expect(view(overlay)).toContain('▸ first-model');
  overlay.handlePaste('second-model'); expect(view(overlay)).toContain('▸ second-model');
  let pending: Promise<unknown> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (picker, ids) => { pending = picker.apply(ids).then(outcome => {
    if (outcome?.next) overlay.open(outcome.next);
  }); });
  await pending; await settle(); expect(view(overlay)).toContain('Configure connection');
  overlay.handleKey(parseKeyEvent('\x1b'), apply); await settle();
  expect(view(overlay, 40)).toContain('▸ second-model'); expect(view(overlay)).toContain('• second provider');
  expect(apply).not.toHaveBeenCalled(); overlay.close();
});

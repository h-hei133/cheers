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

function settings() {
  const save = vi.fn(async () => ({ applied: true, note: 'saved' }));
  const openSettings = (scope: 'user' | 'project' = 'user'): SettingsDraft => ({ scope, save, reopen: openSettings, definitions: CONFIG_SETTINGS,
    values: Object.fromEntries(CONFIG_SETTINGS.map(setting => [setting.key, { stored: undefined,
      effective: setting.key === 'maxTurns' ? 10 : false, requested: false, source: 'default', requestedSource: 'default', restartRequired: false }])) });
  return { save, openSettings };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const view = (host: OverlayHost, width = 120) => stripAnsi(host.render(width, 30).join('\n'));

it('navigates category/section/row domains, edits a real number, discards and reopens the exact field', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {});
  const press = async (key: string) => {
    let pending: Promise<unknown> | undefined;
    overlay.handleKey(parseKeyEvent(key), (picker, ids) => { pending = picker.apply(ids).then(result => {
      if (result?.next) overlay.open(result.next);
    }); });
    await pending; await settle();
  };
  overlay.open(settingsPicker(h, 'project', 'Appearance')); await settle();
  expect(view(overlay)).toContain('Browse'); expect(view(overlay)).toContain('Appearance / Composer');
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
  await press('\x1b'); expect(view(overlay, 40)).toContain('Browse');
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

it('moves category and settings row focus to the clicked pane across resize without applying a value', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  const click = (label: string, pane: 'navigation' | 'content', width = 120) => {
    const frame = overlay.render(width, 30).map(stripAnsi);
    const row = frame.findIndex(text => pane === 'navigation' ? text.split('│')[0]?.includes(label) : text.split('│')[1]?.includes(label));
    expect(row).toBeGreaterThanOrEqual(0);
    const column = frame[row]!.indexOf(label);
    expect(column).toBeGreaterThanOrEqual(0);
    overlay.handlePointer(parseMouseReport(`\x1b[<0;${column + 1};${row + 1}M`)!, 0);
  };
  overlay.open(settingsPicker(h, 'project', 'Appearance')); await settle();
  click('Model', 'navigation');
  expect(view(overlay)).toContain('▸ Model');
  expect(view(overlay, 40)).toContain('▸ Model'); expect(view(overlay, 40)).not.toContain('Maximum turns');
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  expect(view(overlay, 40)).toContain('▸ Interaction');
  overlay.handleKey(parseKeyEvent('\x1b[A'), apply);
  const beforeClick = overlay.render(120, 30).map(stripAnsi);
  const categoryRow = beforeClick.findIndex(text => text.split('│')[0]?.includes('Context'));
  click('Maximum turns', 'content');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;3;${categoryRow + 1}M`)!, 0); // Retired frame, before repaint.
  expect(view(overlay)).toContain('▸ Maximum turns'); expect(view(overlay, 40)).not.toContain('Browse');
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply);
  expect(view(overlay)).toContain('▸ Output token');
  expect(view(overlay)).toContain('• Model'); expect(apply).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled();
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

it('does not expose sidebar hit targets outside an extremely short painted frame', async () => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const picker = settingsPicker(h, 'user', 'Model');
  overlay.open(picker); await settle(); const apply = vi.fn();
  const select = vi.spyOn(picker.navigation!, 'select');
  overlay.handleKey(parseKeyEvent('\t'), apply); overlay.handleKey(parseKeyEvent('\t'), apply); // categories
  for (const width of [40, 120]) for (const height of [0, 1, 2]) {
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
  const row = frame.findIndex(text => text.split('│')[1]?.includes('Output token'));
  const column = frame[row]!.indexOf('Output token');
  overlay.handlePointer(parseMouseReport(`\x1b[<0;${column + 1};${row + 1}M`)!, 0);
  const selected = view(overlay); expect(selected).toContain('MAX'); expect(selected).toContain('▸ Output token');
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), ['maxOutputTokens']); expect(h.save).not.toHaveBeenCalled(); overlay.close();
});

it.each(['categories', 'sections'] as const)('restores the settings %s focus after clearing an empty-result search', async domain => {
  const h = settings(); const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  const picker = settingsPicker(h, 'user', 'Model'); overlay.open(picker); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply); // sections
  overlay.handleKey(parseKeyEvent('\x1b[B'), apply); // Sampling
  if (domain === 'categories') overlay.handleKey(parseKeyEvent('\t'), apply);
  expect(view(overlay)).toContain(domain === 'sections' ? '▸ Model / Sampling' : '▸ Model');
  overlay.handlePaste('no-such-setting');
  expect(view(overlay)).not.toContain('▸ Model / Sampling');
  for (const character of 'no-such-setting') overlay.handleKey(parseKeyEvent('\x7f'), apply);
  expect(picker.navigation?.focused).toBe(domain === 'categories');
  expect(view(overlay, 40)).toContain(domain === 'sections' ? '▸ Model / Sampling' : 'Browse');
  overlay.handleKey(parseKeyEvent(domain === 'sections' ? '\r' : '\x1b[B'), apply);
  expect(view(overlay)).toContain(domain === 'sections' ? '▸ Temperature' : '▸ Interaction');
  expect(apply).not.toHaveBeenCalled(); expect(h.save).not.toHaveBeenCalled(); overlay.close();
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

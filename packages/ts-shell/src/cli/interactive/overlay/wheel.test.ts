import { expect, it, vi } from 'vitest';
import { OverlayHost, type Picker } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { parseMouseReport } from '../../../presentation/tui/input/mouse.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { CONFIG_SETTINGS } from '../../../config/settings.js';
import { settingsPicker, type SettingsHost } from '../picker/settings.js';
import { modelPicker } from '../picker/model.js';
import { getRuntimeConfig } from '../../../config/runtimeConfig.js';
import { CatalogNavigation } from '../picker/navigation.js';

const settle = async () => { await Promise.resolve(); await Promise.resolve(); };
const wheel = (overlay: OverlayHost, raw: string, top: number | undefined = 0) => overlay.handlePointer(parseMouseReport(raw)!, top);
const painted = (overlay: OverlayHost, width = 120, height = 30) => overlay.render(width, height).map(stripAnsi);
const contentPoint = (frame: readonly string[], label: string, pane: 0 | 1 = 1) => {
  const row = frame.findIndex(text => text.split('│')[pane]?.includes(label));
  expect(row).toBeGreaterThanOrEqual(0);
  return { row, column: frame[row]!.indexOf(label) };
};
const report = (point: { row: number; column: number }, direction: -1 | 1, top = 0) =>
  `\x1b[<${direction < 0 ? 64 : 65};${point.column + 1};${top + point.row + 1}M`;

it('moves one browsable model per wheel notch, stops at boundaries and requires Enter for inspection', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1', models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) });
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await settle();
  const categoryFrame = painted(overlay);
  const category = categoryFrame.findIndex(row => row.split('│')[0]?.includes('Fixture provider'));
  overlay.handlePointer(parseMouseReport(`\x1b[<0;3;${category + 1}M`)!, 0);
  expect(painted(overlay).join('\n')).toContain('▸ Fixture provider');
  const frame = painted(overlay), point = contentPoint(frame, 'missing-a');
  wheel(overlay, report(point, 1));
  expect(painted(overlay).join('\n')).toContain('▸ missing-b');
  expect(painted(overlay, 40).join('\n')).not.toContain('Browse');
  wheel(overlay, report(contentPoint(painted(overlay), 'missing-b'), 1));
  expect(painted(overlay).join('\n')).toContain('▸ missing-b');
  wheel(overlay, report(contentPoint(painted(overlay), 'missing-b'), -1));
  expect(painted(overlay).join('\n')).toContain('▸ missing-a');
  let pending: Promise<unknown> | undefined;
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids).then(outcome => {
    if (outcome?.next) overlay.open(outcome.next);
  }); });
  await pending; await settle();
  expect(painted(overlay).join('\n')).toContain('Configure connection');
  expect(painted(overlay).join('\n')).toContain('missing-a'); overlay.close();
});

it('returns settings section focus to rows when wheeling content without staging or saving', async () => {
  const save = vi.fn(async () => ({ applied: true, note: 'saved' }));
  const host: SettingsHost = { openSettings: () => ({ scope: 'user', file: '/fixture/config.json', save, reopen: () => undefined, definitions: CONFIG_SETTINGS,
    values: Object.fromEntries(CONFIG_SETTINGS.map(setting => [setting.key, { stored: undefined,
      effective: false, requested: false, source: 'default', requestedSource: 'default', restartRequired: false }])) }) };
  const overlay = new OverlayHost(() => {}); const apply = vi.fn();
  overlay.open(settingsPicker(host, 'user', 'Model')); await settle();
  overlay.handleKey(parseKeyEvent('\t'), apply);
  expect(painted(overlay).join('\n')).toContain('▸ Model / Limits');
  wheel(overlay, report(contentPoint(painted(overlay), 'Maximum turns', 0), 1));
  const frame = painted(overlay).join('\n');
  expect(frame).toContain('▸ Output token'); expect(frame).not.toContain('Pending:');
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), ['maxOutputTokens']);
  expect(save).not.toHaveBeenCalled(); overlay.close();
});

it('uses painted list spans and offsets, skips blocked rows and does not wrap or toggle multiple selections', async () => {
  const apply = vi.fn(), preview = vi.fn(), overlay = new OverlayHost(() => {});
  const detail = vi.fn((id: string | undefined) => [`DETAIL-${id}`]);
  const picker: Picker = { title: 'Candidates', form: 'panel', empty: '', multiple: true, previewChange: preview,
    apply, load: async () => [{ id: 'a', label: 'alpha', selected: true }, { id: 'blocked', label: 'blocked', disabled: true },
      { id: 'b', label: 'beta' }], detail };
  overlay.open(picker); await settle();
  const frame = painted(overlay, 100, 20), row = frame.findIndex(text => text.includes('alpha'));
  const point = { row, column: 5 }, top = 7;
  expect(row).toBeGreaterThan(0);
  wheel(overlay, report(point, 1, top), top);
  expect(painted(overlay, 100, 20).join('\n')).toContain('DETAIL-b');
  expect(detail).toHaveBeenLastCalledWith('b');
  wheel(overlay, report(point, 1, top), top); painted(overlay, 100, 20);
  expect(detail).toHaveBeenLastCalledWith('b');
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), ['a']);
  expect(preview).not.toHaveBeenCalled();
  overlay.close();
});

it('ignores sidebar, details, headers, modified wheel and retired filter geometry', async () => {
  const overlay = new OverlayHost(() => {}), preview = vi.fn();
  const picker: Picker = { title: 'Candidates', form: 'panel', empty: '', previewChange: preview, apply: async () => undefined,
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }], detail: id => [id ?? 'none'] };
  overlay.open(picker); await settle(); const frame = painted(overlay, 100, 20);
  preview.mockClear();
  const row = frame.findIndex(text => text.includes('alpha'));
  for (const raw of [`\x1b[<65;90;${row + 1}M`, '\x1b[<65;5;1M', `\x1b[<69;5;${row + 1}M`]) wheel(overlay, raw);
  expect(painted(overlay, 100, 20).join('\n')).toContain('▸ alpha');
  overlay.handlePaste('a'); preview.mockClear(); wheel(overlay, `\x1b[<65;5;${row + 1}M`);
  expect(painted(overlay, 100, 20).join('\n')).toContain('▸ alpha');
  expect(preview).not.toHaveBeenCalled(); overlay.close();
});

it('absorbs wheel while loading or in an input form', async () => {
  const apply = vi.fn(), overlay = new OverlayHost(() => {});
  const picker: Picker = { title: 'Candidates', form: 'panel', empty: '', apply,
    load: () => new Promise(() => {}) };
  overlay.open(picker); painted(overlay);
  expect(wheel(overlay, '\x1b[<65;5;3M')).toBe(true);
  overlay.open({ ...picker, load: async () => [], input: { initial: 'original', label: '', validate: () => undefined, apply } });
  await settle(); painted(overlay); wheel(overlay, '\x1b[<65;5;3M');
  overlay.handleKey(parseKeyEvent('\r'), (selected, ids) => { void selected.apply(ids); });
  expect(apply).toHaveBeenCalledWith('original');
  overlay.close();
});

it('requires fresh painted rows and ignores the navigation sidebar even when it is focused', async () => {
  const config = { ...getRuntimeConfig('/tmp/cheers-test'), providerConnections: [], activeProviderConnectionId: undefined };
  const catalog = [{ id: 'fixture', label: 'Fixture provider', runtime: 'anthropic' as const, auth: 'api-key' as const,
    baseUrl: 'https://fixture.example.invalid/v1', models: [{ id: 'missing-a' }, { id: 'missing-b' }] }];
  const picker = modelPicker({ cwd: '/tmp/cheers-test', readConfiguration: () => ({ config, catalog }) });
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await settle();
  const frame = painted(overlay), categoryRow = frame.findIndex(row => row.split('│')[0]?.includes('Fixture provider'));
  overlay.handlePointer(parseMouseReport(`\x1b[<0;3;${categoryRow + 1}M`)!, 0);
  const providerFrame = painted(overlay), content = contentPoint(providerFrame, 'missing-a');
  const sidebar = providerFrame.findIndex(row => row.split('│')[0]?.includes('Fixture provider'));
  wheel(overlay, `\x1b[<65;3;${sidebar + 1}M`);
  expect(picker.navigation?.focused).toBe(true); expect(picker.navigation?.active).toBe('fixture');
  overlay.handlePointer(parseMouseReport(report(content, 1))!); // No current overlay origin.
  expect(picker.navigation?.focused).toBe(true);
  overlay.render(120, 0); wheel(overlay, report(content, 1));
  expect(picker.navigation?.focused).toBe(true);
  painted(overlay); wheel(overlay, report(content, 1));
  expect(painted(overlay).join('\n')).toContain('▸ missing-b');
  // The repaint above publishes usable geometry for the reverse notch.
  wheel(overlay, report(content, -1));
  expect(painted(overlay).join('\n')).toContain('▸ missing-a');
  const before = painted(overlay); const currentPoint = contentPoint(before, 'missing-a');
  wheel(overlay, report(currentPoint, 1)); wheel(overlay, report(currentPoint, -1));
  expect(painted(overlay).join('\n')).toContain('▸ missing-b'); overlay.close();
});

it('defers wheel changes during a mutation and preserves the selected identity after settlement', async () => {
  const overlay = new OverlayHost(() => {}), apply = vi.fn(), preview = vi.fn();
  let finish!: (note: string) => void;
  const onPin = vi.fn(() => new Promise<string>(resolve => { finish = resolve; }));
  overlay.open({ title: 'Candidates', form: 'panel', empty: '', apply, previewChange: preview, onPin,
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }] });
  await settle(); const frame = painted(overlay), row = frame.findIndex(text => text.includes('alpha'));
  overlay.handleKey(parseKeyEvent('\x10'), apply); expect(onPin).toHaveBeenCalledWith('a');
  painted(overlay); preview.mockClear(); wheel(overlay, `\x1b[<65;5;${row + 1}M`);
  expect(preview).not.toHaveBeenCalled(); expect(painted(overlay).join('\n')).toContain('▸ alpha');
  finish('pinned'); await settle(); await settle();
  const selected = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), selected);
  expect(selected).toHaveBeenCalledWith(expect.anything(), ['a']); overlay.close();
});

it.each(['panel', 'modal'] as const)('previews focus movement in a %s without applying and ignores retired coordinates', async form => {
  const overlay = new OverlayHost(() => {}), preview = vi.fn(), apply = vi.fn();
  overlay.open({ title: 'Candidates', form, empty: '', previewChange: preview, apply,
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }] });
  await settle(); preview.mockClear();
  const frame = painted(overlay), row = frame.findIndex(text => text.includes('alpha'));
  const point = { row, column: 5 };
  wheel(overlay, report(point, 1));
  expect(preview).toHaveBeenCalledOnce(); expect(preview).toHaveBeenCalledWith(['b']); expect(apply).not.toHaveBeenCalled();
  wheel(overlay, report(point, -1)); expect(preview).toHaveBeenCalledOnce();
  painted(overlay); wheel(overlay, report(point, -1));
  expect(preview).toHaveBeenLastCalledWith(['a']); expect(apply).not.toHaveBeenCalled(); overlay.close();
});

it('retires wheel geometry when keyboard navigation can move the visible window', async () => {
  const overlay = new OverlayHost(() => {}), preview = vi.fn();
  overlay.open({ title: 'Candidates', form: 'panel', empty: '', previewChange: preview, apply: async () => undefined,
    load: async () => [{ id: 'a', label: 'alpha' }, { id: 'b', label: 'beta' }, { id: 'c', label: 'gamma' }] });
  await settle(); const frame = painted(overlay), row = frame.findIndex(text => text.includes('alpha'));
  overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn()); preview.mockClear();
  wheel(overlay, report({ row, column: 5 }, 1));
  expect(preview).not.toHaveBeenCalled(); expect(painted(overlay).join('\n')).toContain('▸ beta'); overlay.close();
});

it('pans the sidebar without selecting a category or previewing, then clicks the newly painted category', async () => {
  const overlay = new OverlayHost(() => {}), preview = vi.fn(), apply = vi.fn();
  const navigation = new CatalogNavigation('0');
  const categories = Array.from({ length: 12 }, (_, index) => ({ id: String(index), label: `Category ${index}` }));
  const options = categories.map(category => ({ id: `row-${category.id}`, label: `Content ${category.id}` }));
  navigation.set(options, new Map(options.map((row, index) => [row.id, { category: String(index) }])), categories);
  overlay.open({ title: 'Candidates', form: 'panel', empty: '', navigation, previewChange: preview, apply,
    load: async () => navigation.project('') });
  await settle(); overlay.handleKey(parseKeyEvent('\t'), apply); preview.mockClear();
  const frame = overlay.render(100, 12, 5).map(stripAnsi), sidebar = { row: 1, column: 3 }, top = 7;
  expect(frame[1]!.split('│')[0]).toContain('Category 0');
  wheel(overlay, report(sidebar, 1, top), top);
  wheel(overlay, report(sidebar, 1, top), top); // The first pan retires its old geometry.
  const panned = overlay.render(100, 12, 5).map(stripAnsi);
  expect(panned[1]!.split('│')[0]).toContain('Category 1');
  expect(navigation.active).toBe('0'); expect(navigation.focused).toBe(true);
  expect(preview).not.toHaveBeenCalled(); expect(apply).not.toHaveBeenCalled();
  overlay.handlePointer(parseMouseReport(`\x1b[<0;4;${top + 2}M`)!, top);
  expect(navigation.active).toBe('1');
  expect(overlay.render(100, 12, 5).map(stripAnsi).join('\n')).toContain('Content 1');
  overlay.handleKey(parseKeyEvent('\r'), apply); // Enter transfers to content.
  overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(expect.anything(), ['row-1']); overlay.close();
});

it('pans the narrow navigation page and restores the active category when keyboard focus returns', async () => {
  const overlay = new OverlayHost(() => {}), navigation = new CatalogNavigation('0'), apply = vi.fn();
  const categories = Array.from({ length: 12 }, (_, index) => ({ id: String(index), label: `Category ${index}` }));
  navigation.set([{ id: 'row', label: 'Content' }], new Map([['row', { category: '0' }]]), categories);
  const picker: Picker = { title: 'Candidates', form: 'panel', empty: '', navigation, apply, load: async () => navigation.project('') };
  overlay.open(picker);
  await settle(); overlay.handleKey(parseKeyEvent('\t'), apply);
  const paint = () => overlay.render(40, 10, 5).map(stripAnsi).join('\n');
  paint(); wheel(overlay, report({ row: 1, column: 3 }, 1));
  expect(paint()).not.toContain('Category 0'); expect(navigation.active).toBe('0');
  overlay.handleKey(parseKeyEvent('\t'), apply); expect(paint()).toContain('Content');
  overlay.handleKey(parseKeyEvent('\t'), apply); expect(paint()).toContain('▸ Category 0');
  const before = paint(); wheel(overlay, '\x1b[<69;4;2M'); expect(paint()).toBe(before);
  wheel(overlay, '\x1b[<65;4;2M'); expect(paint()).not.toContain('Category 0');
  overlay.close(); overlay.open(picker); await settle(); expect(paint()).toContain('▸ Category 0');
  overlay.render(40, 1, 1); wheel(overlay, '\x1b[<65;4;2M');
  expect(navigation.active).toBe('0'); expect(apply).not.toHaveBeenCalled(); overlay.close();
});

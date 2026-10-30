import { expect, it, vi } from 'vitest';
import { NavigationViewport, renderNavigation } from './navigation.js';
import { OptionModel } from './options.js';
import { stripAnsi } from '../text/ansi.js';
import { visibleWidth } from '../text/measure.js';

const items = Array.from({ length: 12 }, (_, index) => ({ id: String(index), label: `Category ${index}` }));

it('pans independently, stops at both ends and reveals the active category on keyboard return and resize', () => {
  const viewport = new NavigationViewport();
  expect(viewport.window(items, '0', 3, true, false).offset).toBe(0);
  expect(viewport.pan(-1)).toBe(false);
  for (let index = 0; index < 20; index++) viewport.pan(1);
  expect(viewport.window(items, '0', 3, true, false)).toEqual({ offset: 9, count: 3, above: 9, below: 0 });
  expect(viewport.pan(1)).toBe(false);
  viewport.window(items, '0', 3, false, false);
  expect(viewport.window(items, '0', 3, true, false).offset).toBe(0);
  viewport.pan(1);
  expect(viewport.window(items, '0', 3, true, true).offset).toBe(0);
  viewport.pan(1);
  expect(viewport.window(items, '0', 2, true, true).offset).toBe(0);
  expect(viewport.window(items, '11', 2, true, true).offset).toBe(10);
});

it('retains a visible identity across reorder, clamps removal, and handles an empty or zero-height viewport', () => {
  const viewport = new NavigationViewport();
  viewport.window(items, '0', 3, false, false);
  viewport.pan(1); viewport.pan(1);
  const reordered = [items[10]!, ...items.filter(item => item.id !== '10')];
  expect(viewport.window(reordered, '0', 3, false, false).offset).toBe(3);
  expect(reordered[3]!.id).toBe('2');
  expect(viewport.window(items.slice(0, 2), '0', 3, false, false).offset).toBe(0);
  expect(viewport.window([], '0', 3, false, false)).toEqual({ offset: 0, count: 0, above: 0, below: 0 });
  expect(viewport.pan(1)).toBe(false);
  viewport.window(items, '11', 0, true, false); expect(viewport.pan(-1)).toBe(false);
});

it('registers only painted sidebar spans and maps clicks after panning without changing the content model', () => {
  const viewport = new NavigationViewport(), onItem = vi.fn(), onSidebarRow = vi.fn(), model = new OptionModel();
  model.setOptions([{ id: 'row', label: 'Content row' }]);
  const chrome = { title: 'Picker', empty: 'Empty', multiple: false };
  const navigation = { items, active: '0', focused: false, viewport, onItem, onSidebarRow };
  renderNavigation(model, chrome, navigation, 100, 5); viewport.pan(1);
  onItem.mockClear(); onSidebarRow.mockClear();
  const rows = renderNavigation(model, chrome, navigation, 100, 5).map(stripAnsi);
  expect(rows[1]!.split('│')[0]).toContain('Category 1');
  expect(onItem).toHaveBeenCalledWith(1, '1', 0, 20);
  expect(onSidebarRow).toHaveBeenCalledWith(1, 0, 20);
  expect(model.current()?.id).toBe('row');
  for (const width of [1, 40, 100]) for (const height of [0, 1, 2]) {
    onItem.mockClear(); onSidebarRow.mockClear();
    const short = renderNavigation(model, chrome, { ...navigation, focused: true }, width, height);
    expect(short.length).toBeLessThanOrEqual(height);
    for (const row of short) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
    expect(onItem).not.toHaveBeenCalled(); expect(onSidebarRow).not.toHaveBeenCalled();
  }
});

it.each([40, 80, 120])('paints group headings without registering pointer or wheel targets at %i columns', width => {
  const model = new OptionModel(); model.setOptions([{ id: 'row', label: 'Content' }]);
  const onItem = vi.fn(), onSidebarRow = vi.fn();
  const navigation = { items: [{ id: 'first', label: 'Ready' }, { id: 'group', label: 'Not ready', disabled: true },
    { id: 'last', label: 'Unavailable' }], active: 'last', focused: true, onItem, onSidebarRow };
  const rows = renderNavigation(model, { title: 'Picker', empty: '', multiple: false }, navigation, width, 10).map(stripAnsi);
  expect(rows[2]?.split('│')[0]).toContain('Not ready');
  expect(onItem.mock.calls.map(call => call[1])).toEqual(['first', 'last']);
  expect(onSidebarRow.mock.calls.map(call => call[0])).toEqual([1, 3]);
  expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
});

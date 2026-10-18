import { expect, it } from 'vitest';
import { OptionModel, type Option } from './options.js';
import { renderPanel } from './panel.js';
import { chipStrip } from './chips.js';
import { stripAnsi } from '../text/ansi.js';
import { visibleWidth } from '../text/measure.js';

const options: Option[] = Array.from({ length: 12 }, (_, index) => ({ id: `id-${index}`, label: `Option ${index}`, detail: `detail ${index}` }));
function model(): OptionModel {
  const value = new OptionModel();
  value.setOptions(options);
  return value;
}

it('renders a detail column only when the width can afford it', () => {
  const wide = renderPanel(model(), { title: 'Pick', empty: 'none', multiple: false, detail: id => [`for ${id}`, 'second line'] }, 80, 10);
  expect(wide.length).toBeLessThanOrEqual(10);
  for (const row of wide) expect(visibleWidth(row)).toBeLessThanOrEqual(80);
  expect(wide.some(row => stripAnsi(row).includes('│'))).toBe(true);
  expect(stripAnsi(wide.join('\n'))).toContain('for id-0');

  const narrow = renderPanel(model(), { title: 'Pick', empty: 'none', multiple: false, detail: id => [`for ${id}`] }, 40, 10);
  expect(narrow.some(row => stripAnsi(row).includes('│'))).toBe(false);
  for (const row of narrow) expect(visibleWidth(row)).toBeLessThanOrEqual(40);
});

it('reports selectable row spans that stop before the detail column', () => {
  const hits: Array<[number, string, number, number]> = [];
  renderPanel(model(), { title: 'Pick', empty: 'none', multiple: false, detail: () => ['detail'],
    onOptionRow: (row, id, from, to) => hits.push([row, id, from ?? -1, to ?? -1]) }, 100, 10);
  expect(hits.length).toBeGreaterThan(0);
  for (const [, , from, to] of hits) {
    expect(from).toBe(0);
    expect(to).toBeLessThan(100);
    expect(to).toBeGreaterThan(0);
  }
});

it.each([[18, 15], [34, 31], [54, 51]])('uses a %i-row budget to show %i candidates', (capacity, count) => {
  const value = new OptionModel();
  value.setOptions(Array.from({ length: 51 }, (_, index) => ({ id: String(index), label: `Model ${index}` })));
  const hits: string[] = [];
  const rows = renderPanel(value, { title: 'Models', empty: 'none', multiple: false,
    onOptionRow: (_row, id) => hits.push(id) }, 100, capacity);
  expect(hits).toHaveLength(count);
  expect(rows.length).toBeLessThanOrEqual(capacity);
  expect(hits.at(-1)).toBe(String(count - 1));
});

it('uses the available detail height when filtering leaves only one candidate', () => {
  const value = model();
  value.setFilter('Option 11');
  const hits: Array<[number, string]> = [];
  const rows = renderPanel(value, { title: 'Pick', empty: 'none', multiple: false,
    detail: () => ['Model: selected', 'Connection: personal', 'Status: unavailable', 'Reason: sign in required'],
    onOptionRow: (row, id) => hits.push([row, id]) }, 100, 8);
  expect(stripAnsi(rows.join('\n'))).toContain('Reason: sign in required');
  expect(rows).toHaveLength(6);
  expect(hits).toEqual([[1, 'id-11']]);
  expect(rows.length).toBeLessThanOrEqual(8);
  for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(100);
});

it('renders a chip strip inside the capacity and reports its spans', () => {
  const hits: Array<[number, string, number, number]> = [];
  const chips = chipStrip([{ id: 'a', label: 'All' }, { id: 'b', label: 'Session' }], 'a', 40);
  const rows = renderPanel(model(), { title: 'Pick', empty: 'none', multiple: false, chips,
    onChipRow: (row, id, from, to) => hits.push([row, id, from, to]) }, 40, 6);
  expect(rows.length).toBeLessThanOrEqual(6);
  expect(stripAnsi(rows[1]!)).toContain('Session');
  expect(hits.map(([, id]) => id)).toEqual(['a', 'b']);
  expect(hits[1]![3]).toBeGreaterThan(hits[1]![2]);
});

it('degrades to nothing or a footer at zero and one row', () => {
  expect(renderPanel(model(), { title: 'Pick', empty: 'none', multiple: false }, 40, 0)).toEqual([]);
  const one = renderPanel(model(), { title: 'Pick', empty: 'none', multiple: false }, 40, 1);
  expect(one).toHaveLength(1);
  expect(visibleWidth(one[0]!)).toBeLessThanOrEqual(40);
});

it('keeps every row inside the width at tiny widths', () => {
  for (const width of [0, 1, 2, 3, 10, 20, 59, 60]) {
    const rows = renderPanel(model(), { title: 'Pick', empty: 'none', multiple: false, detail: () => ['x'] }, width, 8);
    for (const row of rows) expect(visibleWidth(row)).toBeLessThanOrEqual(width);
  }
});

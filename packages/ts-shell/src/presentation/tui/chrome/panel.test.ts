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

it('wraps a long status footer before dropping it', () => {
  const rows = renderPanel(model(), {
    title: 'Pick',
    empty: 'none',
    multiple: false,
    footer: 'Session files: logical size; excludes attachments.',
  }, 40, 8);
  const output = stripAnsi(rows.join('\n'));
  expect(output).toContain('Session files: logical size;');
  expect(output).toContain('excludes attachments.');
  expect(rows.length).toBeLessThanOrEqual(8);
});

it('stacks a bounded selected-item preview below the two-column width', () => {
  const rows = renderPanel(model(), {
    title: 'Sessions',
    empty: 'none',
    multiple: false,
    detail: () => [
      'Current session',
      'Project: /workspace',
      'Prompt:',
      'saved question',
      'Latest answer:',
      'saved answer',
    ],
  }, 40, 12);
  const output = stripAnsi(rows.join('\n'));
  expect(output).toContain('Preview');
  expect(output).toContain('Current session');
  expect(output).toContain('saved question');
  expect(output).not.toContain('│');
  expect(rows.length).toBeLessThanOrEqual(12);
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

it('neutralises control sequences in option and detail text', () => {
  const value = new OptionModel();
  value.setOptions([{ id: 'unsafe', label: 'unsafe\x1b[2J', detail: 'detail\nforged', note: 'bad\x85' }]);
  const rows = renderPanel(value, {
    title: 'Pick\x1b[2J',
    empty: 'none',
    multiple: false,
    footer: 'footer\x1b[2J',
    detail: () => ['detail\x1b[2J'],
  }, 80, 8);
  const output = rows.join('\n');
  expect(output).not.toContain('\x1b[2J');
  expect(output).toContain('\\x1b[2J');
  expect(output).toContain('\\x0a');
  expect(output).toContain('\\x85');
});

it('reuses catalogue widths on focus changes and invalidates an in-place candidate refresh', () => {
  const value = new OptionModel();
  let measurements = 0;
  let tailLabel = 'tail';
  const candidates: Option[] = Array.from({ length: 20_000 }, (_, index) => ({ id: String(index),
    detail: 'aligned detail',
    get label() { if (index === 19_999) { measurements++; return tailLabel; } return 'row'; } }));
  value.setOptions(candidates);
  const chrome = { title: 'Pick', empty: 'none', multiple: false };
  renderPanel(value, chrome, 120, 10);
  expect(measurements).toBe(1);
  for (let index = 0; index < 30; index++) { value.step(1); renderPanel(value, chrome, 120, 10); }
  expect(measurements).toBe(1);
  tailLabel = 'longer offscreen label';
  value.setOptions(candidates);
  const refreshed = renderPanel(value, chrome, 120, 10);
  expect(measurements).toBe(2);
  expect(stripAnsi(refreshed[1]!).indexOf('aligned detail')).toBe(4 + visibleWidth(tailLabel) + 2);
  const fresh = new OptionModel(); fresh.setOptions(candidates); fresh.focus(value.current()!.id);
  expect(refreshed).toEqual(renderPanel(fresh, chrome, 120, 10));
});

it('extends a saturated measurement on resize and recalculates after filtering', () => {
  const value = new OptionModel();
  let tailReads = 0;
  const candidates: Option[] = [{ id: 'first', label: 'first moderately long label', detail: 'aligned detail' },
    ...Array.from({ length: 100 }, (_, index) => ({ id: `row-${index}`, label: 'row', detail: 'aligned detail' })),
    { id: 'tail', detail: 'aligned detail',
      get label() { tailReads++; return 'the longest hidden label in the entire supplied catalogue'; } }];
  value.setOptions(candidates);
  const chrome = { title: 'Pick', empty: 'none', multiple: false };
  renderPanel(value, chrome, 40, 10);
  expect(tailReads).toBe(0);
  const wide = renderPanel(value, chrome, 180, 10);
  expect(tailReads).toBe(1);
  expect(stripAnsi(wide[1]!).indexOf('aligned detail')).toBe(4 + visibleWidth(candidates.at(-1)!.label) + 2);
  const fresh = new OptionModel(); fresh.setOptions(candidates);
  expect(wide).toEqual(renderPanel(fresh, chrome, 180, 10));
  value.setFilter('first');
  const filtered = new OptionModel(); filtered.setOptions(candidates); filtered.setFilter('first');
  const narrowed = renderPanel(value, chrome, 180, 10);
  expect(stripAnsi(narrowed[1]!).indexOf('aligned detail')).toBe(4 + visibleWidth(candidates[0]!.label) + 2);
  expect(narrowed).toEqual(renderPanel(filtered, chrome, 180, 10));
});

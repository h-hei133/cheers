import { expect, it } from 'vitest';
import { Editor } from '../editor.js';
import { composerRowBudget } from '../surface/view.js';
import { visibleWidth } from '../text/measure.js';
import { layoutComposer } from './layout.js';
import { COMPOSER_SHAPES, type ComposerShapeId } from './shapes.js';

const shapes = Object.keys(COMPOSER_SHAPES) as ComposerShapeId[];

function draft(lines: number): Editor {
  const editor = new Editor();
  editor.setText(Array.from({ length: lines }, (_, index) => `line ${index} ${'x'.repeat(30)}`).join('\n'));
  return editor;
}

it('keeps the composer body at sixteen rows and the total inside the budget', () => {
  const layout = layoutComposer(draft(40), { busy: false, shape: 'band' }, 80, composerRowBudget(80));
  const content = layout.rows.filter(row => row.kind === 'content');
  expect(content.length).toBeLessThanOrEqual(16);
  expect(layout.height).toBeLessThanOrEqual(composerRowBudget(80));
});

it.each([
  [8, 4], [20, 12], [24, 14], [40, 20], [80, 20],
])('budgets %i rows of terminal as %i composer rows', (height, expected) => {
  expect(composerRowBudget(height)).toBe(expected);
});

it('never exceeds the terminal width or the supplied row budget across shapes and sizes', () => {
  for (const shape of shapes) {
    for (const width of [20, 40, 80, 120, 200]) {
      for (const rows of [8, 24, 40, 80]) {
        const layout = layoutComposer(draft(60), { busy: false, shape }, width, composerRowBudget(rows));
        expect(layout.height).toBeLessThanOrEqual(composerRowBudget(rows));
        for (const row of layout.rows) expect(visibleWidth(row.rendered)).toBeLessThanOrEqual(width);
      }
    }
  }
});

it('uses one cell of padding on each side instead of two', () => {
  for (const shape of shapes) {
    const layout = layoutComposer(new Editor(), { busy: false, shape }, 120);
    const content = layout.rows.find(row => row.kind === 'content');
    if (content) expect(content.contentColumn).toBeLessThanOrEqual(4 + COMPOSER_SHAPES[shape].gutter.length);
  }
});

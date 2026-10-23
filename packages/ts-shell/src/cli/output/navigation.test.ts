import { expect, it } from 'vitest';
import type { SessionNavigationPoint } from '../../session/query/navigation.js';
import { navigationLines, NAVIGATION_OUTPUT_LIMITS } from './navigation.js';

it('retains all 20,000 deep identities with bounded terminal indentation', () => {
  const points = Array.from({ length: 20_000 }, (_, depth) => ({ entryId: `entry-${depth}`, depth,
    label: `user: question ${depth}`, current: depth === 19_999 }));
  const before = structuredClone(points);
  let lines: string[] = [];
  expect(() => { lines = navigationLines(points); }).not.toThrow();
  expect(lines).toHaveLength(points.length);
  expect(Buffer.byteLength(lines.join('\n'))).toBeLessThan(2 * 1024 * 1024);
  expect(lines[2]).toBe('    - entry-2 user: question 2');
  expect(lines.at(-1)).toBe(`${'  '.repeat(10)}… - * entry-19999 user: question 19999`);
  expect(points).toEqual(before);
});

it('retains unavailable state and refuses excess rows or bytes instead of returning partial output', () => {
  const point: SessionNavigationPoint = { entryId: 'entry', depth: 11, label: 'Saved work', current: false,
    unavailable: 'broken ancestry' };
  expect(navigationLines([point])[0]).toBe(`${'  '.repeat(10)}… - entry Saved work [unavailable: broken ancestry]`);
  expect(() => navigationLines(Array.from({ length: NAVIGATION_OUTPUT_LIMITS.rows + 1 }, () => point))).toThrow('row limit');
  expect(() => navigationLines([{ ...point, label: '界'.repeat(Math.ceil(NAVIGATION_OUTPUT_LIMITS.bytes / 3)) }])).toThrow('byte limit');
  for (const field of ['entryId', 'label', 'unavailable'] as const) {
    expect(() => navigationLines([{ ...point, [field]: 'saved\n'.repeat(20_001) }])).toThrow('line boundary');
  }
});

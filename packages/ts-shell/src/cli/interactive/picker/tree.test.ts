import { expect, it } from 'vitest';
import type { SessionNavigationPoint } from '../../../session/query/navigation.js';
import { treePrefix } from './tree.js';

const point = (entryId: string, depth: number): SessionNavigationPoint => ({ entryId, depth, label: entryId, current: false });

it('draws branch and continuation glyphs from the depth-first point list', () => {
  const points = [point('root-a', 0), point('child-a1', 1), point('child-a2', 1), point('root-b', 0)];
  expect(points.map((_, index) => treePrefix(points, index))).toEqual(['├─ ', '│  ├─ ', '│  └─ ', '└─ ']);
});

it('closes a branch when the next point is shallower', () => {
  const points = [point('root', 0), point('only-child', 1), point('grandchild', 2)];
  expect(points.map((_, index) => treePrefix(points, index))).toEqual(['└─ ', '   └─ ', '      └─ ']);
});

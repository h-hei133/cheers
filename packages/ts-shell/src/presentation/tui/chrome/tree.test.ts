import { expect, it } from 'vitest';
import { OptionModel } from './options.js';
import { TreeModel } from './tree.js';

it('collapses descendants, retains stable focus, and restores the same subtree', () => {
  const tree = new TreeModel([
    { id: 'root', label: 'root', depth: 0 },
    { id: 'a', label: 'first', depth: 1 },
    { id: 'aa', label: 'saved answer', depth: 2 },
    { id: 'b', label: 'second', depth: 1 },
  ]);
  const model = new OptionModel((query, options) => tree.filter(query, options));
  model.setOptions(tree.catalogue); model.focus('a');
  const closed = tree.navigate('left', 'a', '')!;
  model.setOptions(closed.options);
  expect(model.current()?.id).toBe('a');
  expect(model.visible.map(x => x.id)).toEqual(['root', 'a', 'b']);
  expect(model.current()?.label).toContain('▸');
  expect(tree.navigate('left', 'a', '')?.focus).toBe('root');
  const open = tree.navigate('right', 'a', '')!;
  expect(open.focus).toBe('a');
  model.setOptions(open.options);
  expect(model.visible.map(x => x.id)).toEqual(['root', 'a', 'aa', 'b']);
  expect(tree.navigate('right', 'a', '')?.focus).toBe('aa');
});

it('searches collapsed nodes without resetting disclosure or granting hidden focus', () => {
  const tree = new TreeModel([
    { id: 'root', label: 'root', depth: 0 },
    { id: 'child', label: 'answer', searchText: 'needle past preview', depth: 1 },
  ]);
  tree.navigate('left', 'root', '');
  expect(tree.filter('needle', tree.catalogue).map(x => x.id)).toEqual(['child']);
  expect(tree.navigate('left', 'child', 'needle')?.focus).toBeUndefined();
  expect(tree.filter('', tree.catalogue).map(x => x.id)).toEqual(['root']);
});

it('skips disabled child identities and bounds a deep hierarchy without ancestor copies', () => {
  const tree = new TreeModel([
    { id: 'root', label: 'root', depth: 0 },
    { id: 'broken', label: 'broken', depth: 1, disabled: true },
    { id: 'safe', label: 'safe', depth: 1 },
  ]);
  expect(tree.navigate('right', 'root', '')?.focus).toBe('safe');
  const deep = new TreeModel(Array.from({ length: 20_000 }, (_, i) => ({ id: String(i), label: 'node', depth: i })));
  expect(deep.catalogue.length).toBe(20_000);
  deep.navigate('left', '0', '');
  expect(deep.filter('', deep.catalogue).map(x => x.id)).toEqual(['0']);
  expect(deep.filter('node', deep.catalogue).length).toBe(20_000);
});

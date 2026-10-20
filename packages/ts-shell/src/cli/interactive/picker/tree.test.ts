import { beforeEach, expect, it, vi } from 'vitest';
import type { SessionNavigationPoint } from '../../../session/query/navigation.js';

const navigation = vi.hoisted(() => ({ readSessionNavigation: vi.fn() }));
vi.mock('../../../session/query/navigation.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../session/query/navigation.js')>();
  return { ...actual, readSessionNavigation: navigation.readSessionNavigation };
});

import { treePicker, treePrefix } from './tree.js';

const point = (entryId: string, depth: number): SessionNavigationPoint => ({ entryId, depth, label: entryId, current: false });

beforeEach(() => navigation.readSessionNavigation.mockReset());

it('draws branch and continuation glyphs from the depth-first point list', () => {
  const points = [point('root-a', 0), point('child-a1', 1), point('child-a2', 1), point('root-b', 0)];
  expect(points.map((_, index) => treePrefix(points, index))).toEqual(['├─ ', '│  ├─ ', '│  └─ ', '└─ ']);
});

it('closes a branch when the next point is shallower', () => {
  const points = [point('root', 0), point('only-child', 1), point('grandchild', 2)];
  expect(points.map((_, index) => treePrefix(points, index))).toEqual(['└─ ', '   └─ ', '      └─ ']);
});

it('focuses the current point and only navigates to an offered healthy identity', async () => {
  navigation.readSessionNavigation.mockReturnValue({
    thread: {}, session: {}, points: [
      { ...point('root', 0), label: 'Session start' },
      { ...point('current', 1), label: 'user: current question', current: true, prompt: 'current question' },
      { ...point('broken', 1), label: 'user: broken branch', unavailable: 'broken ancestry' },
    ],
  });
  const rewind = vi.fn(async () => ({ note: 'rewound' }));
  const picker = treePicker({ sessionId: 'session', cwd: '/workspace' } as never, rewind);

  const options = await picker.load();
  expect(picker.initialSelection).toBe('current');
  expect(options.find(option => option.id === 'current')).toMatchObject({ note: 'current' });
  expect(options.find(option => option.id === 'broken')).toMatchObject({ disabled: true });
  expect(await picker.apply(['broken'])).toBeUndefined();
  expect(rewind).not.toHaveBeenCalled();
  expect(await picker.apply(['current'])).toEqual({ note: 'rewound' });
  expect(rewind).toHaveBeenCalledWith({ entryId: 'current', prompt: 'current question', dropped: 0 });
});

it('offers only saved user prompts to the fork picker', async () => {
  navigation.readSessionNavigation.mockReturnValue({
    thread: {}, session: {}, points: [
      { ...point('assistant', 0), label: 'assistant: answer' },
      { ...point('question', 1), label: 'user: question', prompt: 'question' },
    ],
  });
  const picker = treePicker({ sessionId: 'session', cwd: '/workspace' } as never, async () => undefined, true);
  expect((await picker.load()).map(option => option.id)).toEqual(['question']);
});

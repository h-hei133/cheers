import { beforeEach, expect, it, vi } from 'vitest';
import type { SessionNavigationPoint } from '../../../session/query/navigation.js';

const navigation = vi.hoisted(() => ({ readSessionNavigation: vi.fn() }));
vi.mock('../../../session/query/navigation.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../session/query/navigation.js')>();
  return { ...actual, readSessionNavigation: navigation.readSessionNavigation };
});

import { treePicker, treePrefixes } from './tree.js';
import { scanCommandArgs } from '../../../core/commands/arguments.js';

const point = (entryId: string, depth: number): SessionNavigationPoint => ({ entryId, depth, label: entryId, current: false });

beforeEach(() => navigation.readSessionNavigation.mockReset());

it('draws branch and continuation glyphs from the depth-first point list', () => {
  const points = [point('root-a', 0), point('child-a1', 1), point('child-a2', 1), point('root-b', 0)];
  expect(treePrefixes(points)).toEqual(['├─ ', '│  ├─ ', '│  └─ ', '└─ ']);
});

it('closes a branch when the next point is shallower', () => {
  const points = [point('root', 0), point('only-child', 1), point('grandchild', 2)];
  expect(treePrefixes(points)).toEqual(['└─ ', '   └─ ', '      └─ ']);
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
  const picker = treePicker({ sessionId: 'session', cwd: '/workspace' } as never, async () => undefined, 'fork');
  expect((await picker.load()).map(option => option.id)).toEqual(['question']);
});

it('browses the complete tree in history mode and stages an exact tree draft', async () => {
  navigation.readSessionNavigation.mockReturnValue({
    thread: {}, session: {}, points: [
      { ...point('root', 0), label: 'Session start' },
      { ...point('entry with space', 1), label: 'user: find the saved branch', prompt: 'find the saved branch' },
      { ...point('broken', 1), label: 'user: unavailable', unavailable: 'message unavailable' },
    ],
  });
  const rewind = vi.fn(async () => ({ note: 'must not navigate' }));
  const picker = treePicker({ sessionId: 'session', cwd: '/workspace' } as never, rewind, 'history');
  const options = await picker.load();

  expect(picker.title).toBe('Session history');
  expect(options.map(option => option.id)).toEqual(['root', 'entry with space', 'broken']);
  expect(options.find(option => option.id === 'entry with space')?.searchText).toContain('find the saved branch');
  expect(options.find(option => option.id === 'broken')).toMatchObject({ disabled: true });
  expect(await picker.apply(['entry with space'])).toEqual({ draft: '/tree -- "entry with space"' });
  expect(rewind).not.toHaveBeenCalled();
  expect(await picker.apply(['entry with space', 'root'])).toBeUndefined();
  expect(await picker.apply(['not-offered'])).toBeUndefined();
  expect(await picker.apply(['broken'])).toBeUndefined();
});

it.each(['help', '--help', 'entry "quoted" \\ $`', 'entry\nnext'])('drafts an exact positional entry ID: %s', async entryId => {
  navigation.readSessionNavigation.mockReturnValue({ points: [point(entryId, 0)] });
  const rewind = vi.fn();
  const picker = treePicker({ sessionId: 'session', cwd: '/workspace' } as never, rewind, 'history');
  await picker.load();
  const result = await picker.apply([entryId]);
  expect(scanCommandArgs(result!.draft!).map(token => token.value)).toEqual(['/tree', '--', entryId]);
  expect(rewind).not.toHaveBeenCalled();
});

it('keeps every deep history identity reachable with bounded visible indentation', async () => {
  const points = Array.from({ length: 10000 }, (_, index) => point(`entry-${index}`, index));
  navigation.readSessionNavigation.mockReturnValue({ points });
  const picker = treePicker({ sessionId: 'session', cwd: '/workspace' } as never, vi.fn(), 'history');
  const options = await picker.load();
  expect(options.map(option => option.id)).toEqual(points.map(point => point.entryId));
  expect(options.every(option => option.label.length <= option.id.length + 40)).toBe(true);
  expect(options.at(-1)!.label).toContain('…');
});

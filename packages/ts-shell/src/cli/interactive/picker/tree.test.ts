import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { SessionNavigationPoint } from '../../../session/query/navigation.js';

const navigation = vi.hoisted(() => ({ readSessionNavigation: vi.fn() }));
vi.mock('../../../session/query/navigation.js', async importOriginal => {
  const actual = await importOriginal<typeof import('../../../session/query/navigation.js')>();
  return {
    ...actual,
    readSessionNavigationAsync: async (...args: Parameters<typeof actual.readSessionNavigationAsync>) =>
      navigation.readSessionNavigation(args[0], args[1], args[2]),
  };
});

import { treePicker, treePrefixes } from './tree.js';
import { scanCommandArgs } from '../../../core/commands/arguments.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { visibleWidth } from '../../../presentation/tui/text/measure.js';

const point = (entryId: string, depth: number): SessionNavigationPoint => ({ entryId, depth, label: entryId, current: false });

let root: string;
beforeEach(() => { navigation.readSessionNavigation.mockReset(); root = fs.mkdtempSync(path.join(os.tmpdir(), 'tree-picker-')); });
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

it('routes disclosure through the real overlay and refuses an unoffered hidden descendant', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [
    { ...point('root', 0), label: 'Session start', current: true },
    { ...point('child', 1), label: 'saved answer', searchText: 'needle after preview', excerpt: 'detail excerpt', parentId: 'root' },
  ] });
  const action = vi.fn(); const picker = treePicker({ sessionId: 'session', cwd: root } as never, action);
  const host = new OverlayHost(() => {}); host.open(picker);
  const frame = () => host.render(120, 24).map(stripAnsi).join('\n');
  await vi.waitFor(() => expect(frame()).toContain('saved answer'));
  host.handleKey(parseKeyEvent('\x1b[D'), vi.fn());
  expect(frame()).not.toContain('saved answer');
  expect(await picker.apply(['child'])).toBeUndefined();
  expect(action).not.toHaveBeenCalled();
  host.handlePaste('needle');
  expect(frame()).toContain('saved answer');
  expect(frame()).toContain('detail excerpt');
  host.handleKey(parseKeyEvent('\x1b[D'), vi.fn());
  expect(frame()).toContain('detail excerpt');
  for (let i = 0; i < 6; i++) host.handleKey(parseKeyEvent('\x7f'), vi.fn());
  expect(frame()).not.toContain('saved answer');
  host.handleKey(parseKeyEvent('\x1b[C'), vi.fn());
  expect(frame()).toContain('saved answer');
  host.close();
  expect(await picker.apply(['root'])).toBeUndefined();
  expect(action).not.toHaveBeenCalled();
});

it('fits node details to every prescribed rectangle and neutralises saved control characters', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [
    { ...point('entry', 0), current: true, label: 'user: width界', excerpt: 'hello\x1b]52;inject\x07\nnext', timestamp: 'today' },
  ] });
  const host = new OverlayHost(() => {});
  host.open(treePicker({ sessionId: 'session', cwd: root } as never, vi.fn()));
  await vi.waitFor(() => expect(host.render(120, 24).join('\n')).toContain('Entry: entry'));
  for (const width of [20, 40, 80, 120, 200]) for (const height of [8, 24, 40, 80]) {
    const rows = host.render(width, height);
    expect(rows.length).toBeLessThanOrEqual(height);
    expect(rows.every(row => visibleWidth(row) <= width)).toBe(true);
  }
  const wide = host.render(120, 24).join('\n');
  expect(wide).toContain('Entry: entry');
  expect(wide).toContain('\\x1b]52;inject\\x07\\x0anext');
  expect(wide).not.toContain('\x1b]52;');
  expect(host.render(40, 24).map(stripAnsi).join('\n')).toContain('Preview');
  host.close();
});

it('releases accepted choices and details before a retained picker can be selected again', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [
    { ...point('entry', 0), current: true, excerpt: 'saved detail' },
  ] });
  const action = vi.fn(async () => ({ note: 'navigated' }));
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, action);
  const host = new OverlayHost(() => {}); host.open(picker);
  await vi.waitFor(() => expect(picker.detail?.('entry')).not.toEqual([]));
  let pending: Promise<unknown> | undefined;
  host.handleKey(parseKeyEvent('\r'), (selected, ids) => { pending = selected.apply(ids); });
  await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  await pending;
  expect(picker.detail?.('entry')).toEqual([]);
  expect(await picker.apply(['entry'])).toBeUndefined();
  expect(action).toHaveBeenCalledTimes(1);
  expect(host.active).toBe(false);
});

it('consumes the choice before asynchronous navigation settles', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point('entry', 0)] });
  let finish!: () => void;
  const action = vi.fn(() => new Promise<undefined>(resolve => { finish = () => resolve(undefined); }));
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, action);
  await picker.load(); const pending = picker.apply(['entry']);
  expect(await picker.apply(['entry'])).toBeUndefined();
  expect(picker.detail?.('entry')).toEqual([]);
  await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
  finish(); await pending;
});

it('draws branch and continuation glyphs from the depth-first point list', () => {
  const points = [point('root-a', 0), point('child-a1', 1), point('child-a2', 1), point('root-b', 0)];
  expect(treePrefixes(points)).toEqual(['├─ ', '│  ├─ ', '│  └─ ', '└─ ']);
});

it('closes a branch when the next point is shallower', () => {
  const points = [point('root', 0), point('only-child', 1), point('grandchild', 2)];
  expect(treePrefixes(points)).toEqual(['└─ ', '   └─ ', '      └─ ']);
});

it('focuses the current point and only navigates to an offered healthy identity', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root },
    thread: {}, points: [
      { ...point('root', 0), label: 'Session start' },
      { ...point('current', 1), label: 'user: current question', current: true, prompt: 'current question' },
      { ...point('broken', 1), label: 'user: broken branch', unavailable: 'broken ancestry' },
    ],
  });
  const rewind = vi.fn(async () => ({ note: 'rewound' }));
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, rewind);

  const options = await picker.load();
  expect(picker.initialSelection).toBe('current');
  expect(options.find(option => option.id === 'current')).toMatchObject({ note: 'current' });
  expect(options.find(option => option.id === 'broken')).toMatchObject({ disabled: true });
  expect(await picker.apply(['broken'])).toBeUndefined();
  expect(rewind).not.toHaveBeenCalled();
  expect(await picker.apply(['current'])).toEqual({ note: 'rewound' });
  expect(rewind).toHaveBeenCalledWith({ entryId: 'current', prompt: 'current question', dropped: 0, version: 'saved-v1' });
});

it('offers only saved user prompts to the fork picker', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root },
    thread: {}, points: [
      { ...point('assistant', 0), label: 'assistant: answer' },
      { ...point('question', 1), label: 'user: question', prompt: 'question' },
    ],
  });
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, async () => undefined, 'fork');
  expect((await picker.load()).map(option => option.id)).toEqual(['question']);
});

it('browses the complete tree in history mode and stages an exact tree draft', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root },
    thread: {}, points: [
      { ...point('root', 0), label: 'Session start' },
      { ...point('entry with space', 1), label: 'user: find the saved branch', prompt: 'find the saved branch' },
      { ...point('broken', 1), label: 'user: unavailable', unavailable: 'message unavailable' },
    ],
  });
  const rewind = vi.fn(async () => ({ note: 'must not navigate' }));
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, rewind, 'history');
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
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point(entryId, 0)] });
  const rewind = vi.fn();
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, rewind, 'history');
  await picker.load();
  const result = await picker.apply([entryId]);
  expect(scanCommandArgs(result!.draft!).map(token => token.value)).toEqual(['/tree', '--', entryId]);
  expect(rewind).not.toHaveBeenCalled();
});

it('keeps every deep history identity reachable with bounded visible indentation', async () => {
  const points = Array.from({ length: 10000 }, (_, index) => point(`entry-${index}`, index));
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points });
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, vi.fn(), 'history');
  const options = await picker.load();
  expect(options.map(option => option.id)).toEqual(points.map(point => point.entryId));
  expect(options.every(option => option.label.length <= option.id.length + 40)).toBe(true);
  expect(options.at(-1)!.label).toContain('…');
});

it.each(['tree', 'fork', 'history'] as const)('rejects a changed saved source before %s selection', async mode => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [{ ...point('question', 0), prompt: 'old question' }] });
  const action = vi.fn();
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, action, mode);
  await picker.load();
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v2', session: { id: 'session', projectRoot: root }, points: [{ ...point('question', 0), prompt: 'new question' }] });
  const result = await picker.apply(['question']);
  expect(result?.note).toContain('changed after this tree opened');
  expect(result?.draft).toBeUndefined();
  expect(action).not.toHaveBeenCalled();
});

it.each(['blocked', 'throw'] as const)('rejects stale runtime admission (%s) without rereading or acting', async state => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [{ ...point('question', 0), prompt: 'question' }] });
  let stale = false;
  const action = vi.fn();
  const picker = treePicker({ sessionId: 'session', cwd: root, admission: () => {
    if (stale && state === 'throw') throw new Error('PRIVATE_STORAGE_ERROR');
    return stale ? 'The owning session changed.' : undefined;
  } } as never, action);
  await picker.load();
  stale = true;
  const result = await picker.apply(['question']);
  expect(result?.note).toBeTruthy();
  expect(result?.note).not.toContain('PRIVATE_STORAGE_ERROR');
  expect(navigation.readSessionNavigation).toHaveBeenCalledTimes(1);
  expect(action).not.toHaveBeenCalled();
});

it('rejects canceled loads and unavailable selection sources without producing a draft', async () => {
  const controller = new AbortController(); controller.abort();
  const picker = treePicker({ sessionId: 'session', cwd: root } as never, vi.fn(), 'history');
  await expect(picker.load(controller.signal)).rejects.toThrow();
  expect(navigation.readSessionNavigation).not.toHaveBeenCalled();
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point('entry', 0)] });
  await picker.load();
  navigation.readSessionNavigation.mockImplementation(() => { throw new Error('PRIVATE_STORAGE_ERROR'); });
  const result = await picker.apply(['entry']);
  expect(result?.note).toContain('unavailable');
  expect(result?.draft).toBeUndefined();
  expect(result?.note).not.toContain('PRIVATE_STORAGE_ERROR');
  navigation.readSessionNavigation.mockReset();
});

it.each(['tree', 'fork', 'history'] as const)('revokes failed reload and closed %s choices', async mode => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [{ ...point('entry', 0), prompt: 'question' }] });
  const action = vi.fn(), picker = treePicker({ cwd: root, sessionId: 'session' } as never, action, mode);
  await picker.load();
  navigation.readSessionNavigation.mockImplementationOnce(() => { throw Error('Synthetic reload failure'); });
  await expect(picker.load()).rejects.toThrow('Synthetic reload failure');
  expect(await picker.apply(['entry'])).toBeUndefined();
  await picker.load(); picker.previewEnd?.();
  const reads = navigation.readSessionNavigation.mock.calls.length;
  await expect(picker.load()).rejects.toThrow('closed');
  expect(navigation.readSessionNavigation).toHaveBeenCalledTimes(reads);
  expect(await picker.apply(['entry'])).toBeUndefined(); expect(action).not.toHaveBeenCalled();
});

it.each(['tree', 'fork', 'history'] as const)('checks admission after actual fresh %s selection read', async mode => {
  const snapshot = { version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [{ ...point('entry', 0), prompt: 'question' }] };
  navigation.readSessionNavigation.mockReturnValue(snapshot);
  let denied = false;
  const action = vi.fn(), picker = treePicker({ cwd: root, sessionId: 'session', admission: () => denied ? 'Synthetic refused' : undefined } as never, action, mode);
  await picker.load();
  navigation.readSessionNavigation.mockImplementation(() => { denied = true; return snapshot; });
  const result = await picker.apply(['entry']);
  expect(result?.note).toContain('refused'); expect(result?.draft).toBeUndefined();
  expect(action).not.toHaveBeenCalled(); expect(await picker.apply(['entry'])).toBeUndefined();
});

it('rejects closure and signal cancellation during acquisition before publishing rows', async () => {
  const snapshot = { version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point('entry', 0)] };
  const signal = new AbortController();
  navigation.readSessionNavigation.mockImplementationOnce(() => { signal.abort(); return snapshot; });
  const picker = treePicker({ cwd: root, sessionId: 'session', signal: signal.signal } as never, vi.fn());
  await expect(picker.load()).rejects.toThrow(); expect(picker.detail?.('entry')).toEqual([]);
  const closed = treePicker({ cwd: root, sessionId: 'session' } as never, vi.fn());
  navigation.readSessionNavigation.mockImplementationOnce(() => { closed.previewEnd?.(); return snapshot; });
  await expect(closed.load()).rejects.toThrow('closed'); expect(closed.detail?.('entry')).toEqual([]);
  expect(await closed.apply(['entry'])).toBeUndefined();
});

it('publishes no tree rows when cancellation arrives while acquisition is pending', async () => {
  const snapshot = { version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point('entry', 0)] };
  let resolveRead!: (value: typeof snapshot) => void;
  navigation.readSessionNavigation.mockReturnValue(new Promise(resolve => { resolveRead = resolve; }));
  const controller = new AbortController();
  const picker = treePicker({ cwd: root, sessionId: 'session' } as never, vi.fn());

  const loading = picker.load(controller.signal);
  expect(navigation.readSessionNavigation.mock.calls[0]?.[2]).toMatchObject({ signal: controller.signal });
  expect(picker.detail?.('entry')).toEqual([]);
  controller.abort();
  resolveRead(snapshot);

  await expect(loading).rejects.toMatchObject({ name: 'AbortError' });
  expect(picker.detail?.('entry')).toEqual([]);
  expect(picker.filterOptions?.('', [])).toEqual([]);
  expect(await picker.apply(['entry'])).toBeUndefined();
});

it('accepts host browser release while refusing actual cancellation', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point('entry', 0)] });
  for (const accepted of [true, false]) {
    const signal = new AbortController(), picker = treePicker({ cwd: root, sessionId: 'session' } as never, vi.fn(), 'history');
    await picker.load(signal.signal); if (accepted) picker.previewAccept?.(); signal.abort();
    const result = await picker.apply(['entry']);
    if (accepted) expect(result).toEqual({ draft: '/tree -- entry' });
    else expect(result?.draft).toBeUndefined();
  }
});

it('rejects a browser aborted by the final fresh read without invoking navigation', async () => {
  const snapshot = { version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [{ ...point('entry', 0), prompt: 'question' }] };
  navigation.readSessionNavigation.mockReturnValue(snapshot);
  const controller = new AbortController(), action = vi.fn();
  const picker = treePicker({ cwd: root, sessionId: 'session' } as never, action, 'fork');
  await picker.load(controller.signal);
  navigation.readSessionNavigation.mockImplementation(() => { controller.abort(); return snapshot; });
  const result = await picker.apply(['entry']);
  expect(result?.draft).toBeUndefined(); expect(result?.note).toContain('unavailable'); expect(action).not.toHaveBeenCalled();
});

it('captures offered prompts independently and rejects mutable owner changes', async () => {
  const item = { ...point('entry', 0), prompt: 'original question' };
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [item] });
  const context = { cwd: root, sessionId: 'session' }, action = vi.fn(async () => undefined);
  const picker = treePicker(context as never, action, 'fork'); await picker.load(); item.prompt = 'mutated question';
  await picker.apply(['entry']); expect(action).toHaveBeenCalledWith(expect.objectContaining({ prompt: 'original question' }));
  const changed = treePicker(context as never, action, 'history'); await changed.load(); context.sessionId = 'other';
  expect((await changed.apply(['entry']))?.draft).toBeUndefined();
});

it('keeps the accepted live owner for publication and refuses physical workspace replacement', async () => {
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point('entry', 0)] });
  const owner = { sessionId: 'session', projectRoot: root, busy: false };
  const picker = treePicker({ cwd: root, sessionId: 'session' } as never, vi.fn(), 'history', () => owner);
  await picker.load(); expect(await picker.apply(['entry'])).toEqual({ draft: '/tree -- entry' });
  expect(picker.isCurrent?.()).toBe(true); owner.sessionId = 'other'; expect(picker.isCurrent?.()).toBe(false);
  const replaced = treePicker({ cwd: root, sessionId: 'session' } as never, vi.fn(), 'history'); await replaced.load();
  const held = root + '-held'; fs.renameSync(root, held); fs.mkdirSync(root);
  try { expect((await replaced.apply(['entry']))?.draft).toBeUndefined(); }
  finally { fs.rmSync(root, { recursive: true }); fs.renameSync(held, root); }
});

it('preserves distinct cwd and project roots while refusing a same-session wrong opening root', async () => {
  const cwd = path.join(root, 'working'); fs.mkdirSync(cwd);
  navigation.readSessionNavigation.mockReturnValue({ version: 'saved-v1', session: { id: 'session', projectRoot: root }, points: [point('entry', 0)] });
  const context = { cwd, projectRoot: root, sessionId: 'session' };
  const picker = treePicker(context as never, vi.fn(), 'history', () => ({ sessionId: 'session', projectRoot: root, busy: false }));
  await picker.load(); expect(await picker.apply(['entry'])).toEqual({ draft: '/tree -- entry' });
  const wrong = treePicker(context as never, vi.fn(), 'history', () => ({ sessionId: 'session', projectRoot: cwd, busy: false }));
  const before = navigation.readSessionNavigation.mock.calls.length;
  await expect(wrong.load()).rejects.toThrow('owner changed');
  expect(navigation.readSessionNavigation).toHaveBeenCalledTimes(before);
});

it('refuses a saved project mismatch both at load and after the actual fresh selection read', async () => {
  const wrong = { version: 'saved-v1', session: { id: 'session', projectRoot: path.join(root, 'other') }, points: [point('entry', 0)] };
  navigation.readSessionNavigation.mockReturnValue(wrong);
  const action = vi.fn(), picker = treePicker({ cwd: root, sessionId: 'session' } as never, action, 'history');
  await expect(picker.load()).rejects.toThrow('different project');
  expect(await picker.apply(['entry'])).toBeUndefined();
  navigation.readSessionNavigation.mockReturnValue({ ...wrong, session: { id: 'session', projectRoot: root } });
  await picker.load(); navigation.readSessionNavigation.mockReturnValue(wrong);
  const outcome = await picker.apply(['entry']);
  expect(outcome?.note).toContain('unavailable'); expect(outcome?.draft).toBeUndefined(); expect(action).not.toHaveBeenCalled();
});

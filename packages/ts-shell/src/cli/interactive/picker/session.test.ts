import { expect, it, vi } from 'vitest';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { sessionChoices } from '../../../session/navigation/selection.js';
import { summarizeSession } from '../../../session/store/catalog/projection.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { sessionPicker } from './session.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';

function session(id: string, updatedAt = '2026-10-07T00:00:00.000Z', projectRoot = '/workspace'): Session {
  return { id, projectRoot, title: id, updatedAt, createdAt: updatedAt, status: 'completed', turns: [{ role: 'user', content: 'saved conversation' }] };
}

function fixture(
  sessions = [session('current'), session('other')],
  pin = vi.fn(async () => undefined),
  overrides: {
    readonly allProjects?: boolean;
    readonly initialLimit?: number;
    readonly listingStatus?: 'scanning' | 'complete' | 'partial';
  } = {},
) {
  const records = new Map(sessions.map(item => [item.id, item]));
  const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
  const resume = vi.fn(async () => undefined); const remove = vi.fn(async () => undefined); const rename = vi.fn(async () => undefined);
  const manager = { catalog: { async *list(listContext: typeof context = context, _signal?: AbortSignal, limit = 40) { yield { ...sessionChoices([...records.values()].map(record => summarizeSession(record, 'version')), listContext, limit),
    scanned: records.size, unreadable: 0, limited: 0, status: overrides.listingStatus ?? 'complete' }; } }, getSession: (id: string) => records.get(id),
    files: { sizes: async (ids: readonly string[]) => new Map(ids.map(id => [id, { status: 'complete', bytes: 2048, sampledAt: '2026-10-07T00:00:00Z' }])) } } as unknown as SessionManager;
  return { records, context, resume, remove, rename,
    pin, picker: sessionPicker({ sessionManager: manager, context: () => ({ ...context }), resume, delete: remove, rename, pin, ...overrides }) };
}

it('focuses the current identity beyond the recent forty without importing another project', async () => {
  const entries = Array.from({ length: 45 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`));
  entries.push(session('current', '2025-01-01T00:00:00.000Z'), session('foreign', '2027-01-01T00:00:00.000Z', '/elsewhere'));
  const { picker } = fixture(entries);
  const choices = await picker.load();
  const selectable = choices.filter(item => !item.disabled && item.id !== 'more');
  expect(selectable).toHaveLength(41);
  expect(selectable[0]?.id).toBe('recent-00'); expect(selectable.at(-1)?.id).toBe('current');
  expect(selectable.filter(item => item.note?.startsWith('current')).map(item => item.id)).toEqual(['current']);
  expect(selectable[0]?.detail).toContain('2.0 KiB'); expect(selectable[0]?.detail).not.toMatch(/turns?/);
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, ['current']);
});

it('shows a filtered-current notice and restores current focus when the same picker reopens', async () => {
  const { picker } = fixture(); const overlay = new OverlayHost(() => {});
  vi.useFakeTimers();
  try {
    overlay.open(picker); await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('other');
    expect(stripAnsi(overlay.render(40, 20).join('\n'))).toContain('Searching…');
    await vi.advanceTimersByTimeAsync(100);
    expect(stripAnsi(overlay.render(40, 20).join('\n'))).toContain('Current session is hidden by the');
    const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenLastCalledWith(picker, ['other']);
    vi.useRealTimers();
    overlay.open(picker); await new Promise(resolve => setTimeout(resolve, 0)); overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenLastCalledWith(picker, ['current']);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps the current marker visible beside a long title at forty columns', async () => {
  const entry = session('current'); entry.title = 'A'.repeat(100);
  const { picker } = fixture([entry, session('other')]); const overlay = new OverlayHost(() => {});
  overlay.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
  const output = stripAnsi(overlay.render(40, 20).join('\n'));
  expect(output.split('\n').find(line => line.includes('AAAA'))).toContain('current');
  expect(output).toContain('Preview');
  expect(output).toContain('Prompt:');
  expect(output).toContain('saved conversation');
  expect(output).toContain('Session files: logical size;'); expect(output).toContain('excludes attachments.');
});

it('keeps a latest-answer excerpt visible in the narrow stacked preview', async () => {
  const entry = session('current');
  entry.turns = [
    { role: 'user', content: 'question '.repeat(40) },
    { role: 'assistant', content: `${'answer '.repeat(40)}tail phrase` },
  ];
  const { picker } = fixture([entry]);
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  const output = stripAnsi(overlay.render(40, 20).join('\n'));
  expect(output).toContain('Prompt:');
  expect(output).toContain('Latest answer:');
  expect(output).toContain('tail phrase');
});

it('uses the full-screen panel to preview the focused session facts', async () => {
  const current = session('current');
  const other = session('other', '2026-10-06T12:34:56.000Z', '/workspace/other');
  other.title = 'Other project work'; other.pinned = true;
  const { picker } = fixture([current, other], vi.fn(async () => undefined), { allProjects: true });
  const overlay = new OverlayHost(() => {});
  overlay.open(picker);
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(picker.form).toBe('panel');
  expect(picker.fullScreen).toBe(true);
  expect(overlay.fullScreen).toBe(true);
  const currentRows = stripAnsi(overlay.render(100, 24, 6).join('\n'));
  expect(overlay.render(100, 24, 6).length).toBeGreaterThan(6);
  expect(currentRows).toContain('Current session');
  expect(currentRows).toContain('Project: /workspace');
  expect(currentRows).toContain('Files: 2.0 KiB · complete preview');
  expect(currentRows).toContain('Prompt:');
  expect(currentRows).toContain('saved conversation');

  overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn());
  const otherRows = stripAnsi(overlay.render(100, 24, 6).join('\n'));
  expect(otherRows).toContain('Selected session');
  expect(otherRows).toContain('Other project work');
  expect(otherRows).toContain('Project: /workspace/other');
  expect(otherRows).toContain('Updated: 2026-10-06 12:34:56Z');
  expect(otherRows).toContain('pinned');
});

it.each(['missing', 'foreign', 'empty'] as const)('never bypasses scope or saved-content requirements for a %s current session', async kind => {
  const current = session('current');
  if (kind === 'foreign') current.projectRoot = '/Workspace';
  if (kind === 'empty') { current.turns = []; current.status = 'active'; }
  const setup = fixture([session('other'), ...(kind === 'missing' ? [] : [current])]);
  const choices = await setup.picker.load();
  expect(choices.filter(item => !item.disabled).map(item => item.id)).toEqual(['other']);
  expect(setup.picker.status?.(choices)).toMatch(/Current session.*(missing|different project|no saved)/);
  const overlay = new OverlayHost(() => {}); overlay.open(setup.picker); await new Promise(resolve => setTimeout(resolve, 0));
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(setup.picker, ['other']);
});

it.each(['missing', 'rebound', 'busy', 'session-changed', 'project-changed', 'empty', 'identity-changed'] as const)('revalidates the target and runtime before every action: %s', async change => {
  const setup = fixture(); await setup.picker.load();
  if (change === 'missing') setup.records.delete('other');
  if (change === 'rebound') setup.records.get('other')!.projectRoot = '/elsewhere';
  if (change === 'busy') setup.context.busy = true;
  if (change === 'session-changed') setup.context.sessionId = 'new-current';
  if (change === 'project-changed') setup.context.projectRoot = '/elsewhere';
  if (change === 'empty') { setup.records.get('other')!.turns = []; setup.records.get('other')!.status = 'active'; }
  if (change === 'identity-changed') setup.records.get('other')!.id = 'injected';
  expect((await setup.picker.apply(['other']))?.note).toBeTruthy();
  expect(await setup.picker.onDelete?.('other')).toBeTruthy();
  expect(await setup.picker.onRename?.('other', 'new title')).toBeTruthy();
  expect(setup.resume).not.toHaveBeenCalled(); expect(setup.remove).not.toHaveBeenCalled(); expect(setup.rename).not.toHaveBeenCalled();
});

it('blocks current deletion while permitting explicit rename and normal completed-session reentry', async () => {
  const setup = fixture(); await setup.picker.load();
  expect(await setup.picker.onDelete?.('current')).toContain('current session cannot be deleted');
  expect(setup.remove).not.toHaveBeenCalled();
  await setup.picker.onRename?.('current', 'changed'); expect(setup.rename).toHaveBeenCalledWith('current', 'changed', 'version');
  await setup.picker.apply(['other']); expect(setup.resume).toHaveBeenCalledWith('other');
  await setup.picker.onDelete?.('other'); expect(setup.remove).toHaveBeenCalledWith('other', 'version');
  expect((await setup.picker.apply(['not-offered']))?.note).toContain('not offered');
  const overlay = new OverlayHost(() => {}); overlay.open(setup.picker); await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handleKey(parseKeyEvent('\x04'), () => {}); overlay.handleKey(parseKeyEvent('\r'), () => {});
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(stripAnsi(overlay.render(40, 20).join('\n'))).toContain('current session cannot be');
});

it('sorts timestamp ties by ID regardless of input ordering', () => {
  const context = { sessionId: 'a', projectRoot: '/workspace', busy: false };
  expect(sessionChoices([session('b'), session('a')], context).sessions.map(item => item.id)).toEqual(['a', 'b']);
});

it('keeps load failure separate from a filtered-current explanation', async () => {
  const picker = sessionPicker({ sessionManager: { catalog: { list: () => { throw new Error('PRIVATE_PATH'); } } } as unknown as SessionManager,
    context: () => ({ sessionId: 'current', projectRoot: '/workspace', busy: false }), resume: async () => undefined });
  const overlay = new OverlayHost(() => {}); overlay.open(picker);
  expect(overlay.render(100, 20).join('\n')).not.toContain('hidden by the filter');
  await new Promise(resolve => setTimeout(resolve, 0));
  const output = overlay.render(100, 20).join('\n');
  expect(output).toContain('Saved sessions could not be loaded');
  expect(output).not.toMatch(/hidden by the filter|PRIVATE_PATH/);
});

it('searches all projects without bypassing the action scope', async () => {
  const entries = [session('current'), session('other'), session('foreign', '2026-10-07T00:00:00.000Z', '/elsewhere')];
  const { picker } = fixture(entries);
  const scoped = await picker.load();
  expect(scoped.some(row => row.id === 'foreign')).toBe(false);
  const all = picker.chips!.select('all')!;
  const rows = await all.load();
  expect(rows.some(row => row.id === 'foreign')).toBe(true);
  expect((await all.apply(['foreign']))?.note).toBeTruthy();
});

it('searches the complete authorized catalogue beyond the loaded page', async () => {
  const entries = Array.from({ length: 100 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`));
  entries[75]!.turns = [{ role: 'user', content: 'Needle target conversation' }];
  const { picker } = fixture(entries);
  const overlay = new OverlayHost(() => {});
  vi.useFakeTimers();
  try {
    overlay.open(picker);
    await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('Needle target');
    await vi.advanceTimersByTimeAsync(100);
    const output = stripAnsi(overlay.render(100, 24).join('\n'));
    expect(output).toContain('Needle target conversation');

    const apply = vi.fn();
    overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(picker, ['recent-75']);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps catalogue results whose full identity matched the search', async () => {
  const entries = Array.from({ length: 100 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`));
  entries[75]!.title = 'Unrelated visible title';
  const { picker } = fixture(entries);
  const overlay = new OverlayHost(() => {});
  vi.useFakeTimers();
  try {
    overlay.open(picker);
    await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('recent-75');
    await vi.advanceTimersByTimeAsync(100);
    expect(stripAnsi(overlay.render(100, 24).join('\n'))).toContain('Unrelated visible title');
  } finally {
    vi.useRealTimers();
  }
});

it('does not turn a partial search into a confirmed no-match result', async () => {
  const { picker } = fixture(undefined, undefined, { listingStatus: 'partial' });
  const overlay = new OverlayHost(() => {});
  vi.useFakeTimers();
  try {
    overlay.open(picker);
    await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('not-present');
    await vi.advanceTimersByTimeAsync(100);
    const output = stripAnsi(overlay.render(100, 24).join('\n'));
    expect(output).toContain('Search results are incomplete');
    expect(output).not.toContain('No sessions in this project match this search.');
  } finally {
    vi.useRealTimers();
  }
});

it('does not claim no-match before the complete search settles', async () => {
  const setup = fixture();
  const rows = await setup.picker.load();
  expect(setup.picker.status?.(rows, 'not-present') ?? '').not.toContain('No sessions in this project match this search.');
  const searched = await setup.picker.search!('not-present');
  expect(searched).toEqual([]);
  expect(setup.picker.status?.(searched, 'not-present')).toContain('No sessions in this project match this search.');
});

it('restores base action authority after clearing a completed search', async () => {
  const setup = fixture();
  const overlay = new OverlayHost(() => {});
  vi.useFakeTimers();
  try {
    overlay.open(setup.picker);
    await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('other');
    await vi.advanceTimersByTimeAsync(100);
    for (let index = 0; index < 'other'.length; index++) overlay.handleKey(parseKeyEvent('\x7f'), vi.fn());
    await vi.advanceTimersByTimeAsync(100);

    overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    const apply = vi.fn();
    overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(setup.picker, ['current']);
  } finally {
    vi.useRealTimers();
  }
});

it('invalidates completed search authority as soon as the query changes', async () => {
  const setup = fixture();
  const overlay = new OverlayHost(() => {});
  vi.useFakeTimers();
  try {
    overlay.open(setup.picker);
    await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('other');
    await vi.advanceTimersByTimeAsync(100);

    overlay.handleKey(parseKeyEvent('\x7f'), vi.fn());
    overlay.handleKey(parseKeyEvent('\x10'), vi.fn());
    await Promise.resolve(); await Promise.resolve();
    expect(setup.pin).toHaveBeenCalledWith('other', 'version');
  } finally {
    vi.useRealTimers();
  }
});

it('keeps search authority through a mutation reload and restores base authority on clear', async () => {
  const setup = fixture();
  const overlay = new OverlayHost(() => {});
  vi.useFakeTimers();
  try {
    overlay.open(setup.picker);
    await Promise.resolve(); await Promise.resolve();
    overlay.handlePaste('other');
    await vi.advanceTimersByTimeAsync(100);
    vi.useRealTimers();
    overlay.handleKey(parseKeyEvent('\x10'), vi.fn());
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(setup.pin).toHaveBeenCalledWith('other', 'version');

    overlay.handleKey(parseKeyEvent('\x10'), vi.fn());
    await new Promise(resolve => setTimeout(resolve, 0));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(setup.pin).toHaveBeenLastCalledWith('other', 'version');

    for (let index = 0; index < 'other'.length; index++) overlay.handleKey(parseKeyEvent('\x7f'), vi.fn());
    await new Promise(resolve => setTimeout(resolve, 0));
    overlay.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    const apply = vi.fn();
    overlay.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(setup.picker, ['current']);
  } finally {
    vi.useRealTimers();
  }
});

it('keeps search pagination reachable and carries the query into the next page', async () => {
  const entries = Array.from({ length: 100 }, (_, index) => session(`common-${index.toString().padStart(3, '0')}`));
  entries.forEach(entry => { entry.title = `Common result ${entry.id}`; });
  const { picker } = fixture(entries);
  const rows = await picker.search!('Common result');
  expect(rows.some(row => row.id === 'more')).toBe(true);
  const next = (await picker.apply(['more']))!.next!;
  expect(next.initialFilter).toBe('Common result');
  const nextRows = await next.search!('Common result');
  expect(nextRows.some(row => row.id === 'common-000')).toBe(true);
  expect(nextRows.filter(row => !row.disabled && row.id !== 'more')).toHaveLength(80);
  expect(nextRows.some(row => row.id === 'more')).toBe(true);
});

it('restores base pagination copy after clearing a search', async () => {
  const entries = Array.from({ length: 100 }, (_, index) => session(`session-${index.toString().padStart(3, '0')}`));
  const { picker } = fixture(entries);
  await picker.load();
  const searched = await picker.search!('session');
  expect(searched.find(row => row.id === 'more')?.detail).toContain('of 100 matches');

  const restored = picker.onSearchClear?.() ?? [];
  expect(restored.find(row => row.id === 'more')?.detail).toContain('newest 40');
  expect(restored.find(row => row.id === 'more')?.searchText).toBeUndefined();
});

it('loads older sessions through an explicit page row', async () => {
  const entries = Array.from({ length: 45 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`, new Date(Date.now() - index * 1000).toISOString()));
  const { picker } = fixture(entries);
  const first = await picker.load();
  expect(first.some(row => row.id === 'more')).toBe(true);
  expect(first.filter(row => !row.disabled && row.id !== 'more')).toHaveLength(40);
  const next = (await picker.apply(['more']))!.next!;
  const second = await next.load();
  expect(second.some(row => row.id === 'more')).toBe(false);
  expect(second.filter(row => !row.disabled)).toHaveLength(45);
});

it('does not offer another page when the result count equals the page limit', async () => {
  const entries = Array.from({ length: 40 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`));
  const { picker } = fixture(entries);
  const rows = await picker.load();
  expect(rows.some(row => row.id === 'more')).toBe(false);
  expect(rows.filter(row => !row.disabled)).toHaveLength(40);
});

it('reaches the final session at the 10000-row page limit', async () => {
  const entries = Array.from({ length: 10_000 }, (_, index) => session(`recent-${index.toString().padStart(5, '0')}`));
  const { picker } = fixture(entries, undefined, { initialLimit: 9_960 });
  const first = await picker.load();
  expect(first.some(row => row.id === 'more')).toBe(true);
  expect(first.some(row => row.id === 'recent-09999')).toBe(false);

  const final = (await picker.apply(['more']))!.next!;
  const rows = await final.load();
  expect(rows.some(row => row.id === 'more')).toBe(false);
  expect(rows.some(row => row.id === 'recent-09999')).toBe(true);
  expect(rows.filter(row => !row.disabled)).toHaveLength(10_000);
});

it('pins the focused session through the existing management path', async () => {
  const setup = fixture();
  const overlay = new OverlayHost(() => {}); overlay.open(setup.picker);
  await new Promise(resolve => setTimeout(resolve, 0));
  overlay.handleKey(parseKeyEvent('\x10'), vi.fn());
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(setup.pin).toHaveBeenCalledWith('current', 'version');
});

it('groups sessions by pin and recency with non-selectable headers', async () => {
  const { groupedOptions } = await import('./session.js');
  const now = Date.now();
  const summary = (id: string, updatedAt: number, pinned?: boolean) => ({
    id, projectRoot: '/workspace', title: id, ...(pinned ? { pinned: true } : {}), titleComplete: true,
    createdAt: new Date(updatedAt).toISOString(), updatedAt: new Date(updatedAt).toISOString(),
    reentry: 'available' as const, quality: 'complete' as const, version: 'v',
  });
  const rows = groupedOptions([
    summary('pinned', now, true),
    summary('today', now),
    summary('yesterday', now - 86_400_000),
    summary('old', Date.parse('2020-01-01T00:00:00.000Z')),
  ], 'today', new Map());
  expect(rows.filter(row => row.disabled).map(row => row.label)).toEqual(['Pinned', 'Sessions', 'Today', 'Yesterday', 'Older']);
  expect(rows.filter(row => !row.disabled).map(row => row.id)).toEqual(['pinned', 'today', 'yesterday', 'old']);
  expect(rows.filter(row => row.disabled).every(row => row.id.startsWith('group:'))).toBe(true);
});

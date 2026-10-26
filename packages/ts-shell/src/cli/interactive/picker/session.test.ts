import { expect, it, vi } from 'vitest';
import type { SessionManager } from '../../../session/SessionManager.js';
import type { Session } from '../../../session/schema/sessionRecord.js';
import { sessionChoices } from '../../../session/navigation/selection.js';
import { summarizeSession } from '../../../session/store/catalog/projection.js';
import { OverlayHost } from '../overlay.js';
import { parseKeyEvent } from '../../../presentation/tui/input/keys.js';
import { sessionPicker } from './session.js';
import { stripAnsi } from '../../../presentation/tui/text/ansi.js';
import { SessionCatalogPage } from '../../../session/store/catalog/query.js';
import type { SessionCatalogQuery } from '../../../session/store/catalog/model.js';

function session(id: string, updatedAt = '2026-10-07T00:00:00.000Z', projectRoot = '/workspace'): Session {
  return { id, projectRoot, title: id, updatedAt, createdAt: updatedAt, status: 'completed', turns: [{ role: 'user', content: 'saved conversation' }] };
}

function fixture(
  sessions = [session('current'), session('other')],
  pin = vi.fn(async () => undefined),
  overrides: {
    readonly allProjects?: boolean;
    readonly action?: 'resume' | 'pin';
    readonly initialLimit?: number;
    readonly listingStatus?: 'scanning' | 'complete' | 'partial';
  } = {},
) {
  const records = new Map(sessions.map(item => [item.id, item]));
  const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
  const resume = vi.fn(async () => undefined); const remove = vi.fn(async () => undefined); const rename = vi.fn(async () => undefined);
  const manager = { catalog: { async *list(listContext: typeof context = context, _signal?: AbortSignal, limit = 40,
    _source?: unknown, _diagnostic?: unknown, query?: SessionCatalogQuery) {
    const summaries = [...records.values()].map(record => summarizeSession(record, 'version'));
    const page = query ? new SessionCatalogPage(listContext, limit, query) : undefined;
    if (query?.after) page!.assertBoundary(summaries.find(summary => summary.id === query.after!.boundary.id));
    summaries.forEach(summary => page?.accept(summary));
    yield { ...(page?.snapshot(true) ?? sessionChoices(summaries, listContext, limit)),
    scanned: records.size, unreadable: 0, limited: 0, status: overrides.listingStatus ?? 'complete' }; } }, getSession: (id: string) => records.get(id),
    files: { sizes: async (ids: readonly string[]) => new Map(ids.map(id => [id, { status: 'complete', bytes: 2048, sampledAt: '2026-10-07T00:00:00Z' }])) } } as unknown as SessionManager;
  return { records, context, resume, remove, rename,
    pin, picker: sessionPicker({ sessionManager: manager, context: () => ({ ...context }), resume, delete: remove, rename, pin, ...overrides }) };
}

it('keeps current visible beyond forty while defaulting to the latest authorized session', async () => {
  const entries = Array.from({ length: 45 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`));
  entries.push(session('current', '2025-01-01T00:00:00.000Z'), session('foreign', '2027-01-01T00:00:00.000Z', '/elsewhere'));
  const { picker } = fixture(entries);
  const choices = await picker.load();
  const selectable = choices.filter(item => !item.disabled && item.id !== 'action:more');
  expect(selectable).toHaveLength(41);
  expect(selectable[0]?.id).toBe('recent-00'); expect(selectable.at(-1)?.id).toBe('current');
  expect(selectable.filter(item => item.note?.startsWith('current')).map(item => item.id)).toEqual(['current']);
  expect(selectable[0]?.detail).toContain('2.0 KiB'); expect(selectable[0]?.detail).not.toMatch(/turns?/);
  const overlay = new OverlayHost(() => {}); overlay.open(picker); await new Promise(resolve => setTimeout(resolve, 0));
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(picker, ['recent-00']);
});

it.each([false, true])('follows newest progressive results unless the user touches selection (%s)', async touched => {
  const older = session('current', '2026-10-24T00:00:00Z'); older.pinned = true;
  const latest = ['09', '11', '10'].map(hour => session(`today-${hour}`, `2026-10-26T${hour}:00:00Z`));
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
  const records = new Map([older, ...latest].map(item => [item.id, item]));
  const manager = { catalog: { async *list() {
    yield { ...sessionChoices([summarizeSession(older, 'version')], context, 40), scanned: 1, unreadable: 0, limited: 0, status: 'scanning' };
    await gate;
    for (let index = 0; index < latest.length; index++) yield {
      ...sessionChoices([older, ...latest.slice(0, index + 1)].map(item => summarizeSession(item, 'version')), context, 40),
      scanned: index + 2, unreadable: 0, limited: 0, status: index === 2 ? 'complete' : 'scanning',
    };
  } }, getSession: (id: string) => records.get(id), files: { sizes: async () => new Map() } } as unknown as SessionManager;
  const chosen = sessionPicker({ sessionManager: manager, context: () => context, resume: vi.fn() });
  const overlay = new OverlayHost(() => {}); overlay.open(chosen);
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 24).join('\n'))).toContain('Loading sessions: 1'));
  if (touched) overlay.handleKey(parseKeyEvent('\x1b[B'), vi.fn()); // even a one-row wrap is explicit intent
  release();
  await vi.waitFor(() => expect(stripAnsi(overlay.render(100, 24).join('\n'))).toContain('today-11'));
  const apply = vi.fn(); overlay.handleKey(parseKeyEvent('\r'), apply);
  expect(apply).toHaveBeenCalledWith(chosen, [touched ? 'current' : 'today-11']);
});

it.each([
  { name: 'negative offset', older: '2026-10-26T10:00:00Z', latest: '2026-10-26T09:30:00-05:00' },
  { name: 'positive offset', older: '2026-10-26T18:00:00+08:00', latest: '2026-10-26T11:00:00Z' },
  { name: 'fractional timestamp', older: '2026-10-26T11:00:00Z', latest: '2026-10-26T11:00:00.500Z' },
])('defaults to the latest actual session time across a %s without changing pinned ordering', async entry => {
  const pinned = session('older', entry.older); pinned.pinned = true;
  const latest = session('latest', entry.latest);
  const setup = fixture([session('current', '2026-10-24T00:00:00Z'), pinned, latest]);
  expect((await setup.picker.load()).filter(row => !row.disabled).map(row => row.id).slice(0, 2)).toEqual(['older', 'latest']);
  const host = new OverlayHost(() => {}); host.open(setup.picker); await new Promise(resolve => setTimeout(resolve, 0));
  try {
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(setup.picker, ['latest']); expect(setup.resume).not.toHaveBeenCalled();
    host.open(setup.picker); await new Promise(resolve => setTimeout(resolve, 0));
    host.handleKey(parseKeyEvent('\x1b[A'), vi.fn()); const manual = vi.fn(); host.handleKey(parseKeyEvent('\r'), manual);
    expect(manual).toHaveBeenCalledWith(setup.picker, ['older']);
  } finally { host.close(); }
});

it('recomputes newest actual-time focus after search and project scope changes without treating prior manual focus as activation', async () => {
  const older = session('older', '2026-10-26T18:00:00+08:00'); older.pinned = true;
  const setup = fixture([session('current', '2026-10-24T00:00:00Z'), older,
    session('latest', '2026-10-26T11:00:00Z'), session('foreign', '2026-10-26T09:30:00-05:00', '/elsewhere')]);
  const host = new OverlayHost(() => {}); host.open(setup.picker); await new Promise(resolve => setTimeout(resolve, 0));
  try {
    host.handleKey(parseKeyEvent('\x1b[A'), vi.fn());
    expect(stripAnsi(host.render(100, 24).join('\n'))).toContain('▸ older');
    host.handlePaste('latest'); await vi.waitFor(() => expect(stripAnsi(host.render(100, 24).join('\n'))).toContain('▸ latest'));
    for (let index = 0; index < 'latest'.length; index++) host.handleKey(parseKeyEvent('\x7f'), vi.fn());
    await vi.waitFor(() => expect(stripAnsi(host.render(100, 24).join('\n'))).toContain('▸ latest'));
    host.handleKey(parseKeyEvent('\t'), vi.fn());
    await vi.waitFor(() => expect(stripAnsi(host.render(100, 24).join('\n'))).toContain('▸ foreign'));
    host.handleKey(parseKeyEvent('\x1b[Z'), vi.fn());
    await vi.waitFor(() => expect(stripAnsi(host.render(100, 24).join('\n'))).toContain('▸ latest'));
    const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply.mock.calls[0]?.[1]).toEqual(['latest']); expect(setup.resume).not.toHaveBeenCalled();
  } finally { host.close(); }
});

it('uses stable identity as a tie break for equal instants expressed in different time zones', async () => {
  const setup = fixture([session('current', '2026-10-24T00:00:00Z'),
    session('a-latest', '2026-10-26T11:00:00Z'), session('z-latest', '2026-10-26T19:00:00+08:00')]);
  const host = new OverlayHost(() => {}); host.open(setup.picker); await new Promise(resolve => setTimeout(resolve, 0));
  try { const apply = vi.fn(); host.handleKey(parseKeyEvent('\r'), apply);
    expect(apply).toHaveBeenCalledWith(setup.picker, ['a-latest']); }
  finally { host.close(); }
});

it('pins through the offered version, preserves the query and refreshes the same action without resuming', async () => {
  const pin = vi.fn(async () => undefined);
  const setup = fixture(undefined, pin, { action: 'pin' });
  await setup.picker.load();
  setup.picker.onSearchChange?.('other');
  await setup.picker.search!('other');
  const result = await setup.picker.apply(['other']);
  expect(pin).toHaveBeenCalledOnce();
  expect(pin).toHaveBeenCalledWith('other', 'version');
  expect(setup.resume).not.toHaveBeenCalled();
  expect(result?.next?.title).toBe('Pin saved session');
  expect(result?.next?.initialFilter).toBe('other');
  expect(result?.note).toBeUndefined();
  expect((await result!.next!.load()).some(row => row.id === 'other')).toBe(true);
});

it.each(['busy', 'session', 'project', 'missing', 'foreign', 'unoffered', 'multiple'] as const)(
  'refuses a pin selection after %s changes', async change => {
    const setup = fixture(undefined, undefined, { action: 'pin' });
    await setup.picker.load();
    if (change === 'busy') setup.context.busy = true;
    if (change === 'session') setup.context.sessionId = 'elsewhere';
    if (change === 'project') setup.context.projectRoot = '/elsewhere';
    if (change === 'missing') setup.records.delete('other');
    if (change === 'foreign') setup.records.get('other')!.projectRoot = '/elsewhere';
    await setup.picker.apply(change === 'multiple' ? ['other', 'current'] : [change === 'unoffered' ? 'injected' : 'other']);
    expect(setup.pin).not.toHaveBeenCalled();
    expect(setup.resume).not.toHaveBeenCalled();
  },
);

it('cancels pin selection without changing metadata and reports a refused owner result without a success continuation', async () => {
  const pin = vi.fn(async () => 'The saved session changed after the preview.');
  const setup = fixture(undefined, pin, { action: 'pin' });
  const overlay = new OverlayHost(() => {});
  overlay.open(setup.picker);
  await vi.waitFor(() => expect(overlay.render(100, 24).join('\n')).toContain('Pin saved session'));
  overlay.handleKey(parseKeyEvent('\x1b'), () => { throw new Error('Canceled selection applied'); });
  expect(pin).not.toHaveBeenCalled();
  await setup.picker.load();
  const result = await setup.picker.apply(['other']);
  expect(result?.note).toContain('changed after the preview');
  expect(result?.next).toBeUndefined();
  expect(setup.resume).not.toHaveBeenCalled();
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
  expect(output).toContain('End of this session page range.');
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
  await setup.picker.apply(['other']); expect(setup.resume).toHaveBeenCalledWith('other', 'version');
  await setup.picker.load();
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
  expect(rows.some(row => row.id === 'action:more')).toBe(true);
  const next = (await picker.apply(['action:more']))!.next!;
  expect(next.initialFilter).toBe('Common result');
  const nextRows = await next.search!('Common result');
  expect(nextRows.some(row => row.id === 'common-000')).toBe(false);
  expect(nextRows.some(row => row.id === 'common-040')).toBe(true);
  expect(nextRows.filter(row => !row.disabled && row.id !== 'action:more')).toHaveLength(40);
  expect(nextRows.some(row => row.id === 'action:more')).toBe(true);
});

it('restores base pagination copy after clearing a search', async () => {
  const entries = Array.from({ length: 100 }, (_, index) => session(`session-${index.toString().padStart(3, '0')}`));
  const { picker } = fixture(entries);
  await picker.load();
  const searched = await picker.search!('session');
  expect(searched.find(row => row.id === 'action:more')?.detail).toContain('100 matches checked');

  const restored = picker.onSearchClear?.() ?? [];
  expect(restored.find(row => row.id === 'action:more')?.detail).toContain('older sessions');
  expect(restored.find(row => row.id === 'action:more')?.searchText).toBeUndefined();
});

it('loads older sessions through an explicit page row', async () => {
  const entries = Array.from({ length: 45 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`, new Date(Date.now() - index * 1000).toISOString()));
  const { picker } = fixture(entries);
  const first = await picker.load();
  expect(first.some(row => row.id === 'action:more')).toBe(true);
  expect(first.filter(row => !row.disabled && row.id !== 'action:more')).toHaveLength(40);
  const next = (await picker.apply(['action:more']))!.next!;
  const second = await next.load();
  expect(second.some(row => row.id === 'action:more')).toBe(false);
  expect(second.filter(row => !row.disabled)).toHaveLength(5);
  expect(second.some(row => row.id === 'recent-00')).toBe(false);
});

it('does not offer another page when the result count equals the page limit', async () => {
  const entries = Array.from({ length: 40 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`));
  const { picker } = fixture(entries);
  const rows = await picker.load();
  expect(rows.some(row => row.id === 'action:more')).toBe(false);
  expect(rows.filter(row => !row.disabled)).toHaveLength(40);
});

it('requires an offered finished page and unchanged runtime before continuing', async () => {
  const setup = fixture(Array.from({ length: 45 }, (_, index) => session(`recent-${index}`)));
  expect((await setup.picker.apply(['action:more']))?.note).toContain('not offered');
  await setup.picker.load();
  setup.context.projectRoot = '/changed';
  expect((await setup.picker.apply(['action:more']))?.note).toContain('expired');
  expect(setup.resume).not.toHaveBeenCalled();
});

it('keeps valid saved IDs distinct from presentation actions', async () => {
  const setup = fixture([session('current'), session('refresh'), session('more')]);
  await setup.picker.load();
  expect((await setup.picker.apply(['action:refresh']))?.note).toContain('not offered');
  await setup.picker.apply(['refresh']);
  expect(setup.resume).toHaveBeenCalledWith('refresh', 'version');
  await setup.picker.load();
  await setup.picker.apply(['more']);
  expect(setup.resume).toHaveBeenCalledWith('more', 'version');
});

it('consumes an accepted page before a repeated apply and resets query-cleared continued base', async () => {
  const setup = fixture(Array.from({ length: 90 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`)));
  await setup.picker.load();
  const second = (await setup.picker.apply(['action:more']))!.next!;
  expect((await setup.picker.apply(['action:more']))?.note).toContain('not offered');
  const rows = await second.load();
  expect(rows.some(row => row.id === 'recent-40')).toBe(true);
  second.onSearchChange?.('recent');
  await second.search!('recent');
  const clear = second.onSearchClear!()!;
  expect(clear.map(row => row.id)).toEqual(['action:refresh']);
  expect((await second.apply(['action:more']))?.note).toContain('not offered');
  const fresh = (await second.apply(['action:refresh']))!.next!;
  expect((await fresh.load()).some(row => row.id === 'recent-00')).toBe(true);
});

it('clears local pin ordering boundaries before the same picker reloads', async () => {
  const setup = fixture(Array.from({ length: 90 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`)));
  await setup.picker.load();
  const second = (await setup.picker.apply(['action:more']))!.next!;
  await second.load();
  await second.onPin!('recent-40');
  expect(setup.pin).toHaveBeenCalledWith('recent-40', 'version');
  expect((await second.load()).some(row => row.id === 'recent-00')).toBe(true);
});

it('refuses a changed catalogue anchor and keeps cancellation from retaining action authority', async () => {
  const setup = fixture(Array.from({ length: 45 }, (_, index) => session(`recent-${index.toString().padStart(2, '0')}`)));
  await setup.picker.load();
  const second = (await setup.picker.apply(['action:more']))!.next!;
  setup.records.get('recent-39')!.pinned = true;
  await expect(second.load()).rejects.toThrow(/page changed/);
  const reopened = fixture();
  await reopened.picker.load();
  reopened.picker.previewEnd?.();
  expect((await reopened.picker.apply(['other']))?.note).toContain('not offered');
  expect(reopened.resume).not.toHaveBeenCalled();
});

it('does not resurrect a continued base page when its scan settles after query clear', async () => {
  const summaries = Array.from({ length: 90 }, (_, index) => summarizeSession(session(`recent-${index.toString().padStart(2, '0')}`), 'version'));
  const context = { sessionId: 'current', projectRoot: '/workspace', busy: false };
  const first = new SessionCatalogPage(context, 40, { needle: '' });
  summaries.forEach(summary => first.accept(summary));
  let release!: () => void;
  let entered!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const pending = new Promise<void>(resolve => { entered = resolve; });
  const manager = { catalog: { async *list(_context: typeof context, signal: AbortSignal, limit: number,
    _source: unknown, _diagnostic: unknown, query: SessionCatalogQuery) {
    const page = new SessionCatalogPage(context, limit, query);
    summaries.forEach(summary => page.accept(summary));
    if (!query.needle) {
      yield { ...page.snapshot(false), scanned: 90, unreadable: 0, limited: 0, status: 'scanning' };
      entered(); await gate;
      signal.throwIfAborted();
    }
    yield { ...page.snapshot(true), scanned: 90, unreadable: 0, limited: 0, status: 'complete' };
  } }, files: { sizes: async () => new Map() } } as unknown as SessionManager;
  const picker = sessionPicker({ sessionManager: manager, context: () => context, resume: vi.fn(), continuation: first.snapshot(true).continuation });
  await picker.load();
  const publish = vi.fn(); const stop = picker.subscribe!(publish);
  await pending;
  picker.onSearchChange!('recent'); await picker.search!('recent');
  expect(picker.onSearchClear!()!.map(row => row.id)).toEqual(['action:refresh']);
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(publish).not.toHaveBeenCalled();
  expect((await picker.apply(['action:more']))?.note).toContain('not offered');
  stop();
});

it('reaches sessions beyond ten thousand without retaining a growing prefix', async () => {
  const entries = Array.from({ length: 10_045 }, (_, index) => session(`recent-${index.toString().padStart(5, '0')}`));
  let picker = fixture(entries).picker;
  let rows = await picker.load();
  const seen = new Set<string>();
  for (;;) {
    const sessions = rows.filter(row => !row.disabled && row.id !== 'action:more');
    expect(sessions.length).toBeLessThanOrEqual(40);
    for (const row of sessions) { expect(seen.has(row.id)).toBe(false); seen.add(row.id); }
    if (!rows.some(row => row.id === 'action:more')) break;
    picker = (await picker.apply(['action:more']))!.next!;
    rows = await picker.load();
  }
  expect(seen.size).toBe(10_045);
  expect(seen.has('recent-10044')).toBe(true);
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

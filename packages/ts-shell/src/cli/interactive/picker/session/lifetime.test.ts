import fs from 'node:fs';
import * as io from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import type { SessionManager } from '../../../../session/SessionManager.js';
import type { Session } from '../../../../session/schema/sessionRecord.js';
import { OverlayHost } from '../../overlay.js';
import { parseKeyEvent } from '../../../../presentation/tui/input/keys.js';
import { projectSessionMetadata } from '../../../../session/schema/sessionMetadataCodec.js';
import { buildSessionStateSnapshot } from '../../../../session/schema/sessionStateSnapshot.js';
import { createMessageTranscriptEvent, createTranscriptHeader } from '../../../../session/sessionEventCodec.js';
import { SessionCatalog } from '../../../../session/store/catalog/index.js';
import { CATALOG_LIMITS } from '../../../../session/store/catalog/model.js';
import { SessionFiles } from '../../../../session/store/files.js';
import { createSessionStoreLayout, projectSessionFileLayout } from '../../../../session/store/sessionFileLayout.js';
import type { Option } from '../../../../presentation/tui/chrome/options.js';
import type { Picker } from '../../overlay.js';
import { sessionPicker } from '../session.js';
import { SessionBrowser } from './browser.js';
import { sessionActions } from './actions.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, open: vi.fn(actual.open), opendir: vi.fn(actual.opendir) };
});

const roots: string[] = [];
afterEach(() => {
  vi.mocked(io.open).mockReset().mockImplementation(fs.promises.open);
  vi.mocked(io.opendir).mockReset().mockImplementation(fs.promises.opendir);
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

function fixture(contentBytes = 0) {
  const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
  const root = fs.mkdtempSync(path.join(scratch, 'session-page-lifetime-')); roots.push(root);
  const layout = createSessionStoreLayout(root);
  const timestamp = '2026-10-07T00:00:00.000Z';
  for (const id of ['current', 'saved-a', 'saved-b', 'saved-c']) {
    const session: Session = { id, projectRoot: '/workspace', createdAt: timestamp, updatedAt: timestamp,
      status: 'completed', turns: [{ id: `${id}-prompt`, role: 'user', content: `Conversation ${id}${'x'.repeat(contentBytes)}`, timestamp }] };
    const files = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: id });
    fs.mkdirSync(files.sessionDir, { recursive: true });
    fs.writeFileSync(files.metadataPath, JSON.stringify(projectSessionMetadata(session)));
    fs.writeFileSync(files.statePath, JSON.stringify(buildSessionStateSnapshot(session, undefined)));
    fs.writeFileSync(files.transcriptPath, [createTranscriptHeader({ sessionId: id, timestamp, cwd: session.projectRoot }),
      createMessageTranscriptEvent(session.turns[0]!)].map(event => JSON.stringify(event)).join('\n') + '\n');
  }
  const catalog = new SessionCatalog(layout);
  const files = new SessionFiles(layout);
  const sizes = vi.spyOn(files, 'sizes');
  const manager = { catalog, files, getSession: (id: string) => ({ id, projectRoot: '/workspace', status: 'completed',
    turns: [{ role: 'user', content: `Conversation ${id}` }] }) } as unknown as SessionManager;
  const createPicker = () => sessionPicker({ sessionManager: manager, context: () => ({ sessionId: 'current', projectRoot: '/workspace', busy: false }),
    initialLimit: 1, resume: vi.fn(async () => undefined) });
  const sourceBytes = fs.readdirSync(layout.sessionsDir).reduce((sum, id) => {
    const saved = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: id });
    return sum + [saved.metadataPath, saved.statePath, saved.transcriptPath].reduce((bytes, file) => bytes + fs.statSync(file).size, 0);
  }, 0);
  return { picker: createPicker(), createPicker, catalog, sizes, sourceBytes, manager, layout };
}

it('deletes through the actual overlay and reloads/searches the original browse without rediscovery', async () => {
  const { catalog, manager, layout } = fixture();
  const counts = observeSources(), begin = vi.spyOn(catalog, 'beginBrowse'), retire = vi.spyOn(catalog, 'retireBrowse');
  const remove = vi.fn(async (id: string) => { fs.rmSync(path.join(layout.sessionsDir, id), { recursive: true }); return undefined; });
  const picker = sessionPicker({ sessionManager: manager, context: () => ({ sessionId: 'current', projectRoot: '/workspace', busy: false }),
    resume: vi.fn(), initialLimit: 2, delete: remove });
  const overlay = new OverlayHost(() => {});
  const visible = () => (overlay as unknown as { model: { visible: readonly Option[] } }).model.visible;
  overlay.open(picker);
  try {
    await vi.waitFor(() => expect(visible().some(row => row.id === 'action:more')).toBe(true));
    const initialBytes = counts.bytes, directories = counts.directories;
    const offered = visible().find(row => row.id.startsWith('saved-'))!;
    overlay.handleKey(parseKeyEvent('\x1b[B'), () => {});
    const model = (overlay as unknown as { model: { focus(id: string): void } }).model;
    model.focus(offered.id);
    overlay.handleKey(parseKeyEvent('\x1b[3~'), () => {}); overlay.handleKey(parseKeyEvent('\r'), () => {});
    await vi.waitFor(() => expect(remove).toHaveBeenCalledWith(offered.id, expect.any(String)));
    await vi.waitFor(() => { expect(visible().some(row => row.id === offered.id)).toBe(false);
      expect(picker.status?.(visible()) ?? '').not.toContain('Loading'); });
    expect(overlay.active).toBe(true); expect(begin).toHaveBeenCalledOnce(); expect(retire).not.toHaveBeenCalled();
    expect(counts.directories).toBe(directories); expect(counts.bytes).toBe(initialBytes);
    const rows = await picker.search!('Conversation', new AbortController().signal);
    expect(rows.some(row => row.id === offered.id)).toBe(false);
    expect(counts.directories).toBe(directories); expect(counts.bytes).toBe(initialBytes);
    const next = (await picker.apply(['action:more']))?.next;
    expect(next).toBeDefined();
    overlay.open(next!);
    await vi.waitFor(() => expect(visible().some(row => row.id.startsWith('saved-'))).toBe(true));
    expect(visible().some(row => row.id === offered.id)).toBe(false);
    expect(begin).toHaveBeenCalledOnce(); expect(retire).not.toHaveBeenCalled();
    expect(counts.directories).toBe(directories); expect(counts.bytes).toBe(initialBytes);
  } finally { overlay.close(); }
  expect(retire).toHaveBeenCalledOnce(); expect(counts.active).toBe(0); expect(counts.closed).toBe(counts.opened);
});

it.each([false, true])('binds a pending deletion to its browse lifetime, including a page refresh: reopened=%s', async reopened => {
  const { catalog, manager, layout } = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const browser = new SessionBrowser({ sessionManager: manager,
    context: () => ({ sessionId: 'current', projectRoot: '/workspace', busy: false }), resume: vi.fn(),
    delete: async id => { await gate; fs.rmSync(path.join(layout.sessionsDir, id), { recursive: true }); return undefined; } });
  browser.open();
  const finishPage = async () => {
    await browser.load();
    await new Promise<void>(resolve => { browser.subscribe(rows => {
      if (browser.status(rows)?.includes('End of this session page range')) resolve();
    }); });
  };
  try {
    await finishPage();
    const forgotten = vi.spyOn(catalog, 'forgetBrowse');
    const pending = sessionActions(browser, () => { throw new Error('Unexpected page handoff'); }).onDelete!('saved-a');
    if (reopened) browser.open();
    await finishPage();
    release(); await pending;
    expect(forgotten.mock.calls.length).toBe(reopened ? 0 : 1);
    if (!reopened) {
      await finishPage();
      expect(browser.active()?.offered.has('saved-a')).toBe(false);
    }
  } finally { release(); browser.close(); }
});

async function finish(picker: Picker, signal?: AbortSignal): Promise<readonly Option[]> {
  await picker.load(signal);
  return new Promise(resolve => {
    picker.subscribe!(rows => {
      if (rows.some(row => row.id === 'action:more') || picker.status?.(rows)?.includes('End of this session page range.')) resolve(rows);
    });
  });
}

function observeSources(beforeOpen?: (target: string) => Promise<void>) {
  const counts = { opened: 0, closed: 0, active: 0, peak: 0, bytes: 0, chunk: 0, directories: 0, directoriesClosed: 0 };
  vi.mocked(io.open).mockImplementation((async (target, ...args) => {
    const handle = await fs.promises.open(target, ...args);
    counts.opened++; counts.active++; counts.peak = Math.max(counts.peak, counts.active);
    const read = handle.read.bind(handle); const close = handle.close.bind(handle);
    handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
      counts.chunk = Math.max(counts.chunk, length);
      const result = await read(buffer, offset, length, position);
      counts.bytes += result.bytesRead;
      return result;
    }) as typeof handle.read;
    handle.close = async () => { await close(); counts.closed++; counts.active--; };
    await beforeOpen?.(String(target));
    return handle;
  }) as typeof io.open);
  vi.mocked(io.opendir).mockImplementation((async (...args: Parameters<typeof io.opendir>) => {
    const directory = await fs.promises.opendir(...args);
    counts.directories++;
    const close = directory.close.bind(directory);
    directory.close = (async () => { await close(); counts.directoriesClosed++; }) as typeof directory.close;
    return directory;
  }) as typeof io.opendir);
  return counts;
}

it('hands a real catalogue to the next picker after closing the previous listing', async () => {
  const { picker, catalog } = fixture();
  const begin = vi.spyOn(catalog, 'beginBrowse');
  const retire = vi.spyOn(catalog, 'retireBrowse');
  const previous = new AbortController();
  try {
    await finish(picker, previous.signal);
    const outcome = await picker.apply(['action:more']);
    expect(outcome?.next).toBeDefined();
    previous.abort(new Error('Previous overlay released'));
    picker.previewEnd?.();
    expect(retire).not.toHaveBeenCalled();
    const next = outcome!.next!;
    try {
      await expect(finish(next, new AbortController().signal)).resolves.toEqual(expect.arrayContaining([
        expect.objectContaining({ id: 'saved-a' }), expect.objectContaining({ id: 'action:more' }),
      ]));
      expect(next.detail?.('saved-a')).toBeDefined();
      expect(begin).toHaveBeenCalledOnce();
    } finally { next.previewEnd?.(); }
    expect(retire).toHaveBeenCalledOnce();
  } finally { picker.previewEnd?.(); }
});

it.each([32, 128 * 1024])('bounds real paging acquisition and retention across repeated browsing with %i-byte prompt suffixes', async contentBytes => {
  const { createPicker, catalog, sizes, sourceBytes } = fixture(contentBytes);
  const counts = observeSources();
  const retained = catalog as unknown as {
    cache: ReadonlyMap<string, unknown>;
    continuations: { readonly attempts: ReadonlyMap<string, { readonly entries: readonly unknown[] }> };
    browses: { readonly states: ReadonlyMap<string, { readonly summaries: ReadonlyMap<string, unknown> }> };
  };
  for (let browse = 0; browse < 10; browse++) {
    let picker = createPicker();
    const visited = new Set<string>();
    try {
      for (let page = 0; page < 4; page++) {
        const rows = await finish(picker);
        const sessions = rows.filter(row => !row.disabled && !row.id.startsWith('action:'));
        expect(sessions.length).toBeLessThanOrEqual(2); // One page row plus the current identity.
        sessions.forEach(row => visited.add(row.id));
        expect(counts.active).toBe(0);
        expect(counts.directories).toBe(browse + 1); // Continuations never rediscover the catalogue.
        expect(counts.directoriesClosed).toBe(counts.directories);
        expect(counts.bytes).toBe(sourceBytes); // Reopening uses the same unchanged summary cache.
        const next = rows.some(row => row.id === 'action:more') ? (await picker.apply(['action:more']))?.next : undefined;
        picker.previewEnd?.();
        for (const row of sessions) {
          expect(picker.detail?.(row.id)).toEqual([]);
          expect(await picker.apply([row.id])).toMatchObject({ note: expect.stringContaining('not offered') });
        }
        if (!next) break;
        picker = next;
      }
      expect([...visited].sort()).toEqual(['current', 'saved-a', 'saved-b', 'saved-c']);
      expect(retained.cache.size).toBe(4);
      expect(retained.continuations.attempts.size).toBeLessThanOrEqual(8);
      expect([...retained.continuations.attempts.values()].reduce((sum, attempt) => sum + attempt.entries.length, 0)).toBeLessThanOrEqual(32);
      expect(retained.browses.states.size).toBe(0);
    } finally { picker.previewEnd?.(); }
  }
  expect(counts.opened).toBe(12);
  expect(counts.closed).toBe(counts.opened);
  expect(counts.peak).toBeLessThanOrEqual(CATALOG_LIMITS.concurrency);
  expect(counts.chunk).toBeLessThanOrEqual(CATALOG_LIMITS.readChunkBytes);
  expect(sizes.mock.calls.every(([ids]) => ids.length <= 2)).toBe(true);
  expect(sizes.mock.results).toHaveLength(40); // Four visible identities sampled once per browse.
  for (const result of sizes.mock.results) {
    expect(result.type).toBe('return');
    const sampled = await result.value;
    expect(sampled.size).toBeLessThanOrEqual(2);
    for (const size of sampled.values()) expect(size).toMatchObject({ status: 'complete', bytes: expect.any(Number) });
  }
});

it('drains real in-flight acquisition on close without reading or publishing the retired page', async () => {
  const { picker, createPicker } = fixture();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void;
  const acquisitionStarted = new Promise<void>(resolve => { started = resolve; });
  const counts = observeSources(async target => {
    if (path.basename(path.dirname(target)) !== 'current') {
      if (counts.active === 3) started();
      await gate;
    }
  });
  let published!: () => void;
  const initialPublished = new Promise<void>(resolve => { published = resolve; });
  const publish = vi.fn((rows: readonly Option[]) => {
    if (rows.some(row => row.id === 'current')) published();
  });
  let unsubscribe: (() => void) | undefined;
  try {
    await picker.load();
    const initialBytes = counts.bytes;
    unsubscribe = picker.subscribe!(publish);
    await Promise.all([acquisitionStarted, initialPublished]);
    expect(counts.active).toBe(3);
    expect(publish).toHaveBeenCalled();
    expect(publish.mock.calls.every(([rows]) => !rows.some(row => row.id.startsWith('saved-')))).toBe(true);
    const publishedBeforeClose = publish.mock.calls.length;
    picker.previewEnd?.();
    release();
    await vi.waitFor(() => expect({ active: counts.active, directoriesClosed: counts.directoriesClosed }).toEqual({ active: 0, directoriesClosed: 1 }));
    expect(counts.bytes).toBe(initialBytes);
    expect(counts.closed).toBe(counts.opened);
    expect(publish).toHaveBeenCalledTimes(publishedBeforeClose);
    expect(picker.detail?.('current')).toEqual([]);
    const reopened = createPicker();
    try { expect(await finish(reopened)).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'action:more' })])); }
    finally { reopened.previewEnd?.(); }
    expect(counts.active).toBe(0);
    expect(counts.closed).toBe(counts.opened);
    expect(counts.directoriesClosed).toBe(2);
  } finally {
    release(); unsubscribe?.(); picker.previewEnd?.();
    await vi.waitFor(() => expect(counts.active).toBe(0));
  }
});

it('reuses one real scan for cancelled searches, clear and matching pages', async () => {
  const { picker, catalog, sizes, sourceBytes } = fixture();
  const begin = vi.spyOn(catalog, 'beginBrowse'); const retire = vi.spyOn(catalog, 'retireBrowse');
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  const counts = observeSources(async target => {
    if (path.basename(path.dirname(target)) !== 'current') await gate;
  });
  const publish = vi.fn(); let unsubscribe: (() => void) | undefined;
  try {
    await picker.load(); unsubscribe = picker.subscribe!(publish);
    await vi.waitFor(() => expect(counts.active).toBe(3));
    const controller = new AbortController(); picker.onSearchChange?.('saved');
    const pending = picker.search!('saved', controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    controller.abort(); await rejected;
    expect(retire).not.toHaveBeenCalled();
    release();
    picker.onSearchChange?.('saved'); const matches = await picker.search!('saved');
    expect(matches.some(row => row.id === 'action:more')).toBe(true);
    picker.onSearchChange?.('saved-b');
    expect(await picker.search!('saved-b')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'saved-b' })]));
    picker.onSearchClear?.();
    await vi.waitFor(() => expect(publish.mock.lastCall?.[0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'current' }), expect.objectContaining({ id: 'action:more' }),
    ])));
    picker.onSearchChange?.('saved'); await picker.search!('saved');
    const next = (await picker.apply(['action:more']))!.next!;
    unsubscribe(); picker.previewEnd?.();
    expect(retire).not.toHaveBeenCalled();
    try { expect(await next.search!('saved')).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'saved-b' })])); }
    finally { next.previewEnd?.(); }
    expect(begin).toHaveBeenCalledOnce(); expect(retire).toHaveBeenCalledOnce();
    expect(counts.directories).toBe(1); expect(counts.directoriesClosed).toBe(1);
    expect(counts.bytes).toBe(sourceBytes); expect(counts.closed).toBe(counts.opened);
    expect(sizes.mock.calls.flatMap(([ids]) => ids).sort()).toEqual(['current', 'saved-a', 'saved-b']);
  } finally { release(); unsubscribe?.(); picker.previewEnd?.(); }
});

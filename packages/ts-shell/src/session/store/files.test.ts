import fs from 'node:fs';
import * as io from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { SessionFiles } from './files.js';
import { createSessionStoreLayout, projectSessionFileLayout, type SessionStoreLayout } from './sessionFileLayout.js';
import { sessionSizeLabel } from '../presentation/size.js';

vi.mock('node:fs/promises', async () => {
  const actual = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  return { ...actual, lstat: vi.fn(actual.lstat) };
});

const roots: string[] = [];
afterEach(() => { vi.mocked(io.lstat).mockReset().mockImplementation(fs.promises.lstat); for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'session-size-')); roots.push(root);
  const layout = createSessionStoreLayout(root);
  const files = new SessionFiles(layout);
  return { root, layout, files };
}

function seed(layout: SessionStoreLayout, id = 'current', content = '\uFEFF中文\r\n') {
  const target = projectSessionFileLayout({ sessionsDir: layout.sessionsDir, sessionId: id });
  fs.mkdirSync(target.sessionDir, { recursive: true });
  for (const file of [target.metadataPath, target.transcriptPath, target.statePath]) fs.writeFileSync(file, content);
  return target;
}

it('samples exact logical UTF-8 bytes, including retained transcript content and excluding locks/attachments', async () => {
  const { layout, files } = fixture(); const target = seed(layout);
  fs.appendFileSync(target.transcriptPath, 'retained branch\n');
  fs.writeFileSync(target.stateLockPath, 'lock does not count'.repeat(100));
  fs.mkdirSync(path.join(target.sessionDir, 'artifacts'));
  fs.writeFileSync(path.join(target.sessionDir, 'artifacts', 'output'), 'attachment'.repeat(100));
  const expected = [target.metadataPath, target.transcriptPath, target.statePath].reduce((sum, file) => sum + fs.statSync(file).size, 0);
  const first = (await files.sizes(['current'])).get('current')!;
  expect(first).toEqual({ status: 'complete', bytes: expected, sampledAt: expect.any(String) });
  expect(Number.isFinite(Date.parse(first.sampledAt))).toBe(true);
  fs.appendFileSync(target.transcriptPath, '追加');
  expect((await files.sizes(['current'])).get('current')?.bytes).toBe(expected + Buffer.byteLength('追加'));
  expect(sessionSizeLabel(first)).toBe(`${expected} B`);
});

it('uses historical layout lookup, current-directory precedence and mandatory core files', async () => {
  const { root, layout } = fixture();
  const legacyDir = path.join(root, 'historical-sessions');
  const legacy = { ...layout, sessionsDir: legacyDir };
  const target = seed(legacy, 'saved');
  const files = new SessionFiles({ ...layout, sessionsSearchDirs: [layout.sessionsDir, legacyDir] });
  expect((await files.sizes(['saved'])).get('saved')?.status).toBe('complete');
  fs.unlinkSync(target.statePath);
  const partial = (await files.sizes(['saved'])).get('saved')!;
  expect(partial).toMatchObject({ status: 'partial', bytes: fs.statSync(target.metadataPath).size + fs.statSync(target.transcriptPath).size });
  expect(sessionSizeLabel(partial)).toContain('partial');
  seed(layout, 'saved', 'x');
  expect((await files.sizes(['saved'])).get('saved')).toMatchObject({ status: 'complete', bytes: 3 });
});

it('distinguishes genuine zero bytes from missing, inaccessible and non-file components', async () => {
  const { layout, files } = fixture(); const target = seed(layout, 'empty', '');
  const zero = (await files.sizes(['empty'])).get('empty')!;
  expect(zero).toMatchObject({ status: 'complete', bytes: 0 }); expect(sessionSizeLabel(zero)).toBe('0 B');
  fs.unlinkSync(target.statePath); fs.symlinkSync(target.metadataPath, target.statePath);
  expect((await files.sizes(['empty'])).get('empty')).toMatchObject({ status: 'partial', bytes: 0 });
  const real = fs.promises.lstat;
  vi.mocked(io.lstat).mockImplementation((async (file: fs.PathLike) => {
    if (String(file) === target.sessionDir) throw Object.assign(new Error('private path'), { code: 'EACCES' });
    return real(file);
  }) as typeof io.lstat);
  const unknown = (await files.sizes(['empty', 'gone'])).get('empty')!;
  expect(unknown).toMatchObject({ status: 'unknown', bytes: null }); expect(sessionSizeLabel(unknown)).toBe('size unknown');
});

it('does not treat a failed core stat as zero or silently omit it from a complete total', async () => {
  const { layout, files } = fixture(); const target = seed(layout, 'saved', 'data');
  const real = fs.promises.lstat;
  vi.mocked(io.lstat).mockImplementation((async (file: fs.PathLike) => {
    if (String(file) === target.transcriptPath) throw Object.assign(new Error('private'), { code: 'EACCES' });
    return real(file);
  }) as typeof io.lstat);
  expect((await files.sizes(['saved'])).get('saved')).toMatchObject({ status: 'partial', bytes: 8 });
});

it('excludes an append observed during sampling from the stable partial bytes', async () => {
  const { layout, files } = fixture(); const target = seed(layout, 'saved', 'x');
  const real = fs.promises.lstat; let transcriptStats = 0;
  vi.mocked(io.lstat).mockImplementation((async (file: fs.PathLike) => {
    if (String(file) === target.transcriptPath && ++transcriptStats === 2) fs.appendFileSync(target.transcriptPath, 'changed');
    return real(file);
  }) as typeof io.lstat);
  expect((await files.sizes(['saved'])).get('saved')).toMatchObject({ status: 'partial', bytes: 2 });
});

it('discards a historical sample if a higher-priority layout appears during sampling', async () => {
  const { root, layout } = fixture(); const legacyDir = path.join(root, 'history');
  const target = seed({ ...layout, sessionsDir: legacyDir });
  const files = new SessionFiles({ ...layout, sessionsSearchDirs: [layout.sessionsDir, legacyDir] });
  const real = fs.promises.lstat; let stateStats = 0;
  vi.mocked(io.lstat).mockImplementation((async (file: fs.PathLike) => {
    if (String(file) === target.statePath && ++stateStats === 2) seed(layout, 'current', 'different');
    return real(file);
  }) as typeof io.lstat);
  expect((await files.sizes(['current'])).get('current')).toMatchObject({ status: 'unknown', bytes: null });
});

it('limits stat concurrency and drains in-flight work on cancellation without dispatching remaining sessions', async () => {
  const { layout, files } = fixture(); const ids = Array.from({ length: 8 }, (_, i) => `id-${i}`);
  ids.forEach(id => seed(layout, id));
  const real = fs.promises.lstat; let active = 0; let peak = 0; let calls = 0; let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  vi.mocked(io.lstat).mockImplementation((async (file: fs.PathLike) => {
    calls++; active++; peak = Math.max(peak, active);
    await gate;
    try { return await real(file); } finally { active--; }
  }) as typeof io.lstat);
  const controller = new AbortController();
  const pending = files.sizes(ids, controller.signal);
  const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  await vi.waitFor(() => expect(active).toBe(4)); controller.abort(); release();
  await rejected;
  expect({ calls, peak, active }).toEqual({ calls: 4, peak: 4, active: 0 });
});

it('rejects oversized batches, unsafe identities and pre-cancelled reads before filesystem access', async () => {
  const { files } = fixture(); const spy = vi.mocked(io.lstat);
  await expect(files.sizes(Array.from({ length: 42 }, (_, i) => `id-${i}`))).rejects.toThrow('Too many');
  for (const id of ['..', '.', '../escape', ' saved ']) await expect(files.sizes([id])).rejects.toThrow();
  await expect(files.sizes(['saved'], AbortSignal.abort())).rejects.toMatchObject({ name: 'AbortError' });
  expect(spy).not.toHaveBeenCalled();
});

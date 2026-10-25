import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readContextEntry, type ContextEntry } from './entry.js';
import { verifyContextEntries } from './verify.js';
import { inspectWorkspaceFileAsync } from '../../core/workspace/files.js';

let root: string;
beforeEach(() => { fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/attachment-verify-'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });
const selected = (name: string, content: string) => { fs.writeFileSync(path.join(root, name), content); return readContextEntry({ root, target: name }); };

it('reads entries serially with exact BOM/CRLF bytes and their declared limits', async () => {
  const entries = [selected('one', '\uFEFF中文\r\n'), selected('two', 'second')]; let active = 0; let peak = 0;
  const read = vi.fn(async (target: string, maxBytes: number) => {
    active++; peak = Math.max(peak, active);
    try { return await inspectWorkspaceFileAsync(root, path.relative(root, target), undefined, maxBytes); }
    finally { active--; }
  });
  await verifyContextEntries(root, entries, read, new AbortController().signal);
  expect(read.mock.calls).toEqual(entries.map(entry => [entry.path, entry.bounds.maxBytes])); expect(peak).toBe(1); expect(active).toBe(0);
});

it('rejects equal-size changed content without relying on timestamps', async () => {
  const entry = selected('notes', 'old text'); fs.writeFileSync(entry.path, 'new text');
  await expect(verifyContextEntries(root, [entry], (target, maximum) => inspectWorkspaceFileAsync(root, path.relative(root, target), undefined, maximum), new AbortController().signal)).rejects.toThrow('changed');
});

it('rechecks root containment after acquisition and refuses outside entries before reads', async () => {
  const entry = selected('notes', 'text'); const read = vi.fn(async () => {
    fs.unlinkSync(entry.path); fs.symlinkSync('/dev/null', entry.path);
    return { state: 'exists' as const, content: entry.content, hash: entry.digest, mode: 0, identity: 'fixture' };
  });
  await expect(verifyContextEntries(root, [entry], read, new AbortController().signal)).rejects.toThrow('changed'); expect(read).toHaveBeenCalledTimes(1);
  read.mockClear(); await expect(verifyContextEntries(root, [{ ...entry, path: '/dev/null' }], read, new AbortController().signal)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
});

it('stops after cancellation and preserves acquisition or cleanup failures', async () => {
  const entries = [selected('one', 'first'), selected('two', 'second')]; const controller = new AbortController();
  const read = vi.fn(async () => { controller.abort(); return { state: 'exists' as const, content: entries[0]!.content, hash: entries[0]!.digest, identity: '', mode: 0 }; });
  await expect(verifyContextEntries(root, entries, read, controller.signal)).rejects.toMatchObject({ name: 'AbortError' }); expect(read).toHaveBeenCalledTimes(1);
  const failure = new Error('Inspection cleanup failed.');
  await expect(verifyContextEntries(root, entries, async () => { throw failure; }, new AbortController().signal)).rejects.toBe(failure);
});

it('rejects aggregate bounds and already cancelled work before acquisition', async () => {
  const entry = selected('notes', 'text'); const read = vi.fn(); const controller = new AbortController(); controller.abort();
  await expect(verifyContextEntries(root, [entry], read, controller.signal)).rejects.toThrow();
  await expect(verifyContextEntries(root, Array<ContextEntry>(17).fill(entry), read, new AbortController().signal)).rejects.toThrow('limited');
  expect(read).not.toHaveBeenCalled();
});

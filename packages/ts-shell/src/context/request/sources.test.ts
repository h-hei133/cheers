import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { capturePromptSources } from './sources.js';
import * as revisions from '../../runtime/execution/read.js';
import * as snapshots from '../../runtime/execution/snapshot.js';

let root: string;
beforeEach(() => { fs.mkdirSync('/tmp/cheers-test', { recursive: true }); root = fs.mkdtempSync('/tmp/cheers-test/prompt-sources-'); });
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

it('invalidates unchanged-length edits, absent candidate creation and symlink retargeting', () => {
  const file = path.join(root, 'rules'); fs.writeFileSync(file, 'old');
  const edited = capturePromptSources(); edited.track(file); edited.verify();
  fs.writeFileSync(file, 'new'); fs.utimesSync(file, new Date(0), new Date(1000));
  expect(() => edited.verify()).toThrow('changed');
  const missing = path.join(root, 'nested', 'rules'); const absent = capturePromptSources(); absent.track(missing); absent.verify();
  fs.mkdirSync(path.dirname(missing)); fs.writeFileSync(missing, 'created'); expect(() => absent.verify()).toThrow('changed');
  const target = path.join(root, 'other'); fs.writeFileSync(target, 'new');
  const link = path.join(root, 'link'); fs.symlinkSync(file, link);
  const linked = capturePromptSources(); linked.track(link); linked.verify();
  fs.unlinkSync(link); fs.symlinkSync(target, link); expect(() => linked.verify()).toThrow('changed');
});

it('bounds source metadata and detects changes during repeated capture', () => {
  const sources = capturePromptSources(); const target = path.join(root, 'rules'); fs.writeFileSync(target, 'old'); sources.track(target);
  fs.writeFileSync(target, 'changed'); expect(() => sources.track(target)).toThrow('changed');
  const bounded = capturePromptSources();
  for (let i = 0; i < 512; i++) bounded.track(path.join(root, `missing-${i}`));
  expect(() => bounded.track(path.join(root, 'overflow'))).toThrow('limit');
});

it('binds exact bytes when equal-length edits have indistinguishable metadata and decoded text', async () => {
  vi.spyOn(revisions, 'readRevision').mockReturnValue('stable');
  const file = path.join(root, 'rules'); const raw = Buffer.from([0xef, 0xbb, 0xbf, 0xff]);
  fs.writeFileSync(file, raw); const sources = capturePromptSources(); sources.track(file, raw);
  await sources.verifyContent(new AbortController().signal);
  const changed = Buffer.from([0xef, 0xbb, 0xbf, 0xfe]);
  expect(changed.toString('utf8')).toBe(raw.toString('utf8'));
  fs.writeFileSync(file, changed); expect(() => sources.verify()).not.toThrow();
  await expect(sources.verifyContent(new AbortController().signal)).rejects.toThrow('bytes changed');
  expect(() => sources.track(file, changed)).toThrow('bytes changed during capture');
});

it('bounds content bytes across unique paths without charging identical captures twice', () => {
  const sources = capturePromptSources(); const bytes = Buffer.alloc(512 * 1024);
  for (let i = 0; i < 16; i++) {
    const file = path.join(root, `file-${i}`); sources.track(file, bytes); sources.track(file, bytes);
  }
  expect(() => sources.track(path.join(root, 'overflow'), Buffer.from('a'))).toThrow('byte limit');
  expect(() => capturePromptSources().track(path.join(root, 'oversized'), Buffer.alloc(512 * 1024 + 1))).toThrow('byte limit');
});

it('accepts empty sources and does no acquisition after cancellation', async () => {
  const file = path.join(root, 'empty'); fs.writeFileSync(file, '');
  const sources = capturePromptSources(); sources.track(file, Buffer.alloc(0));
  await sources.verifyContent(new AbortController().signal);
  const read = vi.spyOn(snapshots, 'readBinarySnapshot'); const cancelled = new AbortController(); cancelled.abort();
  await expect(sources.verifyContent(cancelled.signal)).rejects.toThrow(); expect(read).not.toHaveBeenCalled();
});

it('stops serial content acquisition after cancellation between sources', async () => {
  const sources = capturePromptSources();
  for (const name of ['one', 'two']) { const file = path.join(root, name); fs.writeFileSync(file, name); sources.track(file, name); }
  const controller = new AbortController(); const original = snapshots.readBinarySnapshot;
  const read = vi.spyOn(snapshots, 'readBinarySnapshot').mockImplementation(async (...args) => {
    const bytes = await original(...args); controller.abort(); return bytes;
  });
  await expect(sources.verifyContent(controller.signal)).rejects.toThrow(); expect(read).toHaveBeenCalledTimes(1);
});

it('rechecks the original alias after content acquisition', async () => {
  const first = path.join(root, 'first'); const second = path.join(root, 'second'); const link = path.join(root, 'alias');
  fs.writeFileSync(first, 'same'); fs.writeFileSync(second, 'same'); fs.symlinkSync(first, link);
  const sources = capturePromptSources(); sources.track(link, 'same'); const original = snapshots.readBinarySnapshot;
  vi.spyOn(snapshots, 'readBinarySnapshot').mockImplementation(async (...args) => {
    const bytes = await original(...args); fs.unlinkSync(link); fs.symlinkSync(second, link); return bytes;
  });
  await expect(sources.verifyContent(new AbortController().signal)).rejects.toThrow('source changed');
});

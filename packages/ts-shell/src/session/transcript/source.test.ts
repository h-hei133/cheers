import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { readTranscriptSnapshot, readTranscriptSnapshotAsync } from './read.js';

let root: string;
let target: string;
beforeEach(() => {
  const scratch = path.join(process.cwd(), '.tmp');
  fs.mkdirSync(scratch, { recursive: true });
  root = fs.mkdtempSync(path.join(scratch, 'transcript-source-'));
  target = path.join(root, 'transcript.jsonl');
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(root, { recursive: true, force: true }); });

const message = (id: string, content = id) => JSON.stringify({
  type: 'message', id, role: 'user', content, timestamp: '2026-10-24T00:00:00.000Z',
});

it('stops source reads at the admitted line prefix instead of reading the remaining body', async () => {
  fs.writeFileSync(target, message('first') + '\n' + 'x'.repeat(512 * 1024));
  const open = fs.promises.open.bind(fs.promises);
  let acquired = 0;
  let reads = 0;
  vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    const read = handle.read.bind(handle);
    vi.spyOn(handle, 'read').mockImplementation(async (...readArgs) => {
      const result = await read(...readArgs);
      acquired += result.bytesRead; reads++;
      return result;
    });
    return handle;
  });
  const snapshot = await readTranscriptSnapshotAsync(target, { maxBytes: 1024 * 1024, maxLines: 1 }, true);
  expect(snapshot.events.map(event => event.id)).toEqual(['first']);
  expect(snapshot.truncated).toBe(true);
  expect(snapshot.warnings.join(' ')).toContain('readable prefix');
  expect(acquired).toBeLessThanOrEqual(64 * 1024);
  expect(reads).toBe(1);
});

it.each(['', '\n', '\r\n', '\n\n'])(
  'matches synchronous salvage at every byte and line boundary with suffix %j', async suffix => {
    const source = '\n' + message('first', '界👩🏽‍💻') + '\n{damaged}\n' + message('last') + suffix;
    fs.writeFileSync(target, source);
    for (const maxLines of [1, 2, 3, 4, 5, 10]) {
      for (const maxBytes of [1, 10, 70, Buffer.byteLength(source) - 1, Buffer.byteLength(source), 1024]) {
        const limits = { maxBytes, maxLines };
        expect(await readTranscriptSnapshotAsync(target, limits, true))
          .toEqual(readTranscriptSnapshot(target, limits, true));
      }
    }
  },
);

it('preserves a UTF-8 character spanning descriptor chunks and an unterminated final record', async () => {
  const base = message('first', '');
  const contentOffset = base.indexOf('"content":"') + '"content":"'.length;
  const first = message('first', 'a'.repeat(64 * 1024 - contentOffset - 1) + '界👩🏽‍💻');
  fs.writeFileSync(target, first + '\r\n' + message('last', 'tail'));
  const limits = { maxBytes: 256 * 1024, maxLines: 2 };
  const snapshot = await readTranscriptSnapshotAsync(target, limits, true);
  expect(snapshot).toEqual(readTranscriptSnapshot(target, limits, true));
  expect(snapshot.truncated).toBe(false);
  expect(snapshot.events.map(event => event.id)).toEqual(['first', 'last']);
});

it('still rejects duplicate identities across descriptor chunks', async () => {
  fs.writeFileSync(target, message('same', 'a'.repeat(70 * 1024)) + '\n' + message('same'));
  await expect(readTranscriptSnapshotAsync(target, { maxBytes: 256 * 1024, maxLines: 10 }, true))
    .rejects.toThrow('duplicate entry');
});

it('verifies the source version even after an early line stop and closes the descriptor', async () => {
  const source = message('first') + '\n' + 'x'.repeat(128 * 1024);
  fs.writeFileSync(target, source);
  const open = fs.promises.open.bind(fs.promises);
  const close = vi.fn();
  vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
    const handle = await open(...args);
    const read = handle.read.bind(handle);
    const closeHandle = handle.close.bind(handle);
    vi.spyOn(handle, 'close').mockImplementation(async () => { close(); await closeHandle(); });
    vi.spyOn(handle, 'read').mockImplementation(async (...readArgs) => {
      const result = await read(...readArgs);
      fs.appendFileSync(target, '\n');
      return result;
    });
    return handle;
  });
  await expect(readTranscriptSnapshotAsync(target, { maxBytes: 256 * 1024, maxLines: 1 }, true))
    .rejects.toThrow('changed');
  expect(close).toHaveBeenCalledOnce();
});

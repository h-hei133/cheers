import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import type { FileHandle } from 'node:fs/promises';
import { ARTIFACT_CHUNK_BYTES, verifyArtifactContent, writeArtifactSource } from './stream.js';

describe('artifact byte streams', () => {
  it('awaits partial writes and produces the exact byte, line and digest receipt in bounded blocks', async () => {
    const source = Buffer.alloc(ARTIFACT_CHUNK_BYTES * 3 + 19, 97);
    source[3] = 10; source[source.length - 1] = 10;
    const stored = Buffer.alloc(source.length);
    const offered: number[] = [];
    let active = false;
    const writer = { async write(buffer: Uint8Array, offset: number, length: number, position: number) {
      expect(active).toBe(false); active = true;
      offered.push(length);
      await Promise.resolve();
      const bytesWritten = Math.min(997, length);
      stored.set(buffer.subarray(offset, offset + bytesWritten), position);
      active = false;
      return { bytesWritten, buffer };
    } } as unknown as FileHandle;
    const receipt = await writeArtifactSource(writer, source);
    expect(stored.equals(source)).toBe(true);
    expect(Math.max(...offered)).toBeLessThanOrEqual(ARTIFACT_CHUNK_BYTES);
    expect(receipt).toEqual({ totalBytes: source.length, totalLines: 3,
      sha256: createHash('sha256').update(source).digest('hex') });
  });

  it('does not borrow mutable caller bytes during a pending block write', async () => {
    const source = Buffer.from('owned');
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const stored = Buffer.alloc(source.length);
    const writer = { async write(buffer: Uint8Array, offset: number, length: number) {
      await held; stored.set(buffer.subarray(offset, offset + length)); return { bytesWritten: length, buffer };
    } } as unknown as FileHandle;
    const saving = writeArtifactSource(writer, source);
    await Promise.resolve(); source.fill(120); release();
    expect((await saving).sha256).toBe(createHash('sha256').update('owned').digest('hex'));
    expect(stored.toString()).toBe('owned');
  });

  it('cancels a stalled next without awaiting stalled return and observes late failures', async () => {
    const controller = new AbortController();
    let rejectNext!: (error: Error) => void;
    const next = vi.fn(() => new Promise<IteratorResult<Uint8Array>>((_resolve, reject) => { rejectNext = reject; }));
    const retire = vi.fn(() => new Promise<IteratorResult<Uint8Array>>(() => {}));
    const source = { [Symbol.asyncIterator]: () => ({ next, return: retire }) };
    const saving = writeArtifactSource({} as FileHandle, source, controller.signal);
    await Promise.resolve(); controller.abort(new Error('cancelled'));
    await expect(saving).rejects.toThrow('cancelled');
    expect(retire).toHaveBeenCalledOnce();
    rejectNext(new Error('late source failure'));
    await Promise.resolve();
  });

  it('verifies with one fixed read buffer and refuses trailing bytes even when stat reports the expected size', async () => {
    const content = Buffer.alloc(ARTIFACT_CHUNK_BYTES * 2 + 5, 97);
    const stat = { isFile: () => true, dev: 1n, ino: 2n, size: BigInt(content.length), mtimeNs: 3n, ctimeNs: 4n };
    const lengths: number[] = [];
    let trailing = false;
    const reader = { stat: async () => stat, async read(buffer: Uint8Array, offset: number, length: number, position: number) {
      lengths.push(buffer.byteLength);
      const bytesRead = trailing && position === content.length ? 1 : Math.min(length, Math.max(0, content.length - position));
      buffer.set(content.subarray(position, position + bytesRead), offset);
      return { bytesRead, buffer };
    } } as unknown as FileHandle;
    const receipt = { totalBytes: content.length, totalLines: 1, sha256: createHash('sha256').update(content).digest('hex') };
    await expect(verifyArtifactContent(reader, receipt)).resolves.toBe(stat);
    expect(new Set(lengths)).toEqual(new Set([ARTIFACT_CHUNK_BYTES]));
    trailing = true;
    await expect(verifyArtifactContent(reader, receipt)).rejects.toThrow('byte verification');
  });
});

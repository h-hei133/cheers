import { expect, it, vi } from 'vitest';
import { createCommandOutputCapture } from './capture.js';
import type { OutputSpill } from './sink.js';

async function sourceText(source: AsyncIterable<Uint8Array>): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of source) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
}

function staging() {
  const chunks: Buffer[] = [];
  const stage: OutputSpill = {
    write: vi.fn(async bytes => { chunks.push(Buffer.from(bytes)); }),
    close: vi.fn(async () => {}),
    async *read() { yield* chunks; },
    dispose: vi.fn(async () => {}),
  };
  return stage;
}

it('shares one bounded tail per stream and preserves the complete prefix through lazy spill', async () => {
  const stage = staging();
  const openSpill = vi.fn(async () => stage);
  const capture = createCommandOutputCapture({ limitBytes: 8, openSpill });
  await capture.append('stdout', Buffer.from('first\n'));
  expect(openSpill).not.toHaveBeenCalled();
  await capture.append('stdout', Buffer.from('middle\n'));
  await capture.append('stdout', Buffer.from('last\n'));
  await capture.append('stderr', Buffer.from('error'));
  await capture.finish();
  expect(openSpill).toHaveBeenCalledTimes(1);
  expect(capture.snapshot('stdout')).toMatchObject({ truncated: true, totalRawBytes: 18,
    totalBytes: 18, totalLines: 3, totalNewlines: 3 });
  expect(Buffer.byteLength(capture.snapshot('stdout').tail)).toBeLessThanOrEqual(8);
  expect(await sourceText(capture.source('stdout'))).toBe('first\nmiddle\nlast\n');
  expect(await sourceText(capture.source('stderr'))).toBe('error');
  expect(capture.complete).toBe(true);
  await capture.dispose();
  expect(stage.dispose).toHaveBeenCalledTimes(1);
});

it('decodes each stream independently and observes original bytes for the promotion journal', async () => {
  const capture = createCommandOutputCapture();
  const observed: { stream: string; bytes: Buffer }[] = [];
  capture.onChunk((stream, bytes) => observed.push({ stream, bytes: Buffer.from(bytes) }));
  const text = Buffer.from('界');
  await capture.append('stdout', text.subarray(0, 1));
  await capture.append('stderr', Buffer.from('warning\n'));
  await capture.append('stdout', text.subarray(1));
  await capture.finish();
  expect(await sourceText(capture.source('stdout'))).toBe('界');
  expect(await sourceText(capture.source('stderr'))).toBe('warning\n');
  expect(Buffer.concat(observed.filter(item => item.stream === 'stdout').map(item => item.bytes))).toEqual(text);
  expect(capture.snapshot('stdout')).toMatchObject({ totalRawBytes: 3, totalBytes: 3, totalLines: 1 });
  await capture.dispose();
});

it('waits for the one pending spill write before sealing, without admitting an unbounded queue', async () => {
  const stage = staging();
  let drain!: () => void;
  stage.write = vi.fn(() => new Promise<void>(resolve => { drain = resolve; }));
  const capture = createCommandOutputCapture({ limitBytes: 2, openSpill: async () => stage });
  const pending = capture.append('stdout', Buffer.from('overflow'));
  await Promise.resolve();
  expect(() => capture.append('stdout', Buffer.from('more'))).toThrow(/backpressure/);
  const closing = capture.finish();
  expect(capture.complete).toBe(false);
  expect(stage.close).not.toHaveBeenCalled();
  drain();
  await pending;
  await closing;
  expect(stage.close).toHaveBeenCalledTimes(1);
  expect(capture.complete).toBe(false);
  await expect(sourceText(capture.source('stdout'))).rejects.toThrow(/unavailable/);
  await capture.dispose();
});

it('retains a bounded tail without advertising full output when spill is unavailable', async () => {
  const capture = createCommandOutputCapture({ limitBytes: 4, openSpill: async () => { throw new Error('storage unavailable'); } });
  await capture.append('stdout', Buffer.from('prefix-tail'));
  await expect(capture.finish()).rejects.toThrow();
  expect(capture.snapshot('stdout').tail).toBe('tail');
  expect(capture.complete).toBe(false);
  await expect(sourceText(capture.source('stdout'))).rejects.toThrow(/unavailable/);
  await expect(capture.dispose()).rejects.toThrow();
});

it('keeps cancellation incomplete even after already captured bytes seal successfully', async () => {
  const capture = createCommandOutputCapture();
  await capture.append('stdout', Buffer.from('partial'));
  await capture.finish(true);
  await capture.finish();
  expect(capture.complete).toBe(false);
  expect(capture.snapshot('stdout').tail).toBe('partial');
  await expect(sourceText(capture.source('stdout'))).rejects.toThrow(/unavailable/);
  await capture.dispose();
});

it('preserves decoded stdout and stderr order in the optional combined view', async () => {
  const capture = createCommandOutputCapture({ combinedOutput: true });
  await capture.append('stdout', Buffer.from('first:'));
  await capture.append('stdout', Buffer.from([0xe4]));
  await capture.append('stderr', Buffer.from('error:'));
  await capture.append('stdout', Buffer.from([0xb8, 0x96]));
  await capture.append('stderr', Buffer.from('last'));
  await capture.finish();
  expect(capture.snapshot('combined').tail).toBe('first:error:世last');
  expect(await sourceText(capture.source('combined'))).toBe('first:error:世last');
  expect(await sourceText(capture.source('stdout'))).toBe('first:世');
  expect(await sourceText(capture.source('stderr'))).toBe('error:last');
  await capture.dispose();
});

it('spills one complete combined view and retains a bounded tail across both streams', async () => {
  const spills: OutputSpill[] = [];
  const capture = createCommandOutputCapture({ limitBytes: 8, combinedOutput: true,
    openSpill: async () => { const value = staging(); spills.push(value); return value; },
  });
  await capture.append('stdout', Buffer.from('first\n'));
  await capture.append('stderr', Buffer.from('error\n'));
  await capture.append('stdout', Buffer.from('last\n'));
  await capture.finish();
  expect(capture.snapshot('combined')).toMatchObject({ truncated: true, totalRawBytes: 17 });
  expect(Buffer.byteLength(capture.snapshot('combined').tail)).toBeLessThanOrEqual(8);
  expect(await sourceText(capture.source('combined'))).toBe('first\nerror\nlast\n');
  await capture.dispose();
  expect(spills.every(spill => vi.mocked(spill.dispose).mock.calls.length === 1)).toBe(true);
});

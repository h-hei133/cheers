import { expect, it } from 'vitest';
import { classifyEventStreamContentType, withoutResumptionIds } from './stream.js';

async function read(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    chunks.push(next.value);
    size += next.value.length;
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

it('classifies SSE media types and rejects an explicitly non-UTF-8 charset', () => {
  expect(classifyEventStreamContentType('text/event-stream')).toBe('event-stream');
  expect(classifyEventStreamContentType('text/event-stream; charset=UTF-8')).toBe('event-stream');
  expect(classifyEventStreamContentType('text/event-stream; charset="utf8"')).toBe('event-stream');
  expect(classifyEventStreamContentType('text/event-stream; charset=iso-8859-1')).toBe('invalid-charset');
  expect(classifyEventStreamContentType('application/json')).toBe('other');
});

it('rejects malformed UTF-8 instead of replacing damaged protocol bytes', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(Uint8Array.of(0xff));
      controller.close();
    },
  });
  await expect(read(withoutResumptionIds(body))).rejects.toThrow();
});

it('still removes resumption ids without changing valid UTF-8 payloads', async () => {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('id: one\ndata: 你好\n\n'));
      controller.close();
    },
  });
  expect(new TextDecoder().decode(await read(withoutResumptionIds(body)))).toBe('data: 你好\n\n');
});

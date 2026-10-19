import { isRecord } from '../../../core/values/record.js';

const FRAME_LIMIT = 8 * 1024 * 1024;

/** Bounded SSE frames; decoding preserves UTF-8 and CR/LF across transport chunks. */
export async function* responseEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<Record<string, unknown>> {
  const reader = body.getReader(); const decoder = new TextDecoder();
  let buffer = ''; let lines: string[] = []; let size = 0;
  const line = (value: string): Record<string, unknown> | undefined => {
    if (value !== '') {
      size += value.length;
      if (size > FRAME_LIMIT) throw new Error('Response event exceeded the frame limit.');
      if (value.startsWith('data:')) lines.push(value.slice(5).replace(/^ /, ''));
      return undefined;
    }
    const data = lines.join('\n'); lines = []; size = 0;
    if (!data || data === '[DONE]') return undefined;
    let event: unknown;
    try { event = JSON.parse(data); } catch { throw new Error('Response event contained invalid JSON.'); }
    if (!isRecord(event) || typeof event.type !== 'string') throw new Error('Response event has an invalid shape.');
    return event;
  };
  try {
    for (;;) {
      const chunk = await reader.read();
      buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      let match: RegExpExecArray | null;
      while ((match = /\r\n|\r|\n/.exec(buffer))) {
        if (!chunk.done && match[0] === '\r' && match.index === buffer.length - 1) break;
        const value = buffer.slice(0, match.index); buffer = buffer.slice(match.index + match[0].length);
        const event = line(value); if (event) yield event;
      }
      if (size + buffer.length > FRAME_LIMIT) throw new Error('Response event exceeded the frame limit.');
      if (chunk.done) { if (buffer) line(buffer); const event = line(''); if (event) yield event; return; }
    }
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
}

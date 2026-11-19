import { WIRE_BYTES, type ServiceResponse } from '../contract/model.js';
import { CollaborationError, keys, object, parseJson, requireValue } from '../contract/value.js';

function decodeLine(line: Buffer, principal: string): ServiceResponse | undefined {
  const source = line.toString('utf8'); requireValue(Buffer.from(source).equals(line));
  const frame = object(parseJson(source, WIRE_BYTES));
  if (frame.type === 'heartbeat') { keys(frame, ['type']); return undefined; }
  if (frame.type === 'error') {
    keys(frame, ['type', 'code']);
    const code = frame.code;
    if (code === 'denied' || code === 'stale' || code === 'capacity' || code === 'unavailable' || code === 'gap') throw new CollaborationError(code);
    throw new CollaborationError('invalid');
  }
  requireValue(frame.type === 'page'); keys(frame, ['type', 'response']);
  return decodeResponse(frame.response, principal);
}

export function decodeResponse(value: unknown, principal: string): ServiceResponse {
  const payload = object(value); keys(payload, ['version', 'epoch', 'principal', 'result']);
  requireValue(payload.version === 1 && payload.principal === principal && typeof payload.epoch === 'string');
  return { version: 1, principal, epoch: payload.epoch, result: payload.result };
}

/** Retain only one bounded line, including when a UTF-8 character spans chunks. */
export async function* readRoomStream(body: ReadableStream<Uint8Array>, principal: string, check: () => void): AsyncGenerator<ServiceResponse | undefined> {
  const reader = body.getReader(); let partial: Buffer | undefined; let bytes = 0;
  try {
    for (;;) {
      check();
      const next = await reader.read(); check();
      if (next.done) { requireValue(bytes === 0, 'unavailable'); return; }
      const chunk = Buffer.from(next.value.buffer, next.value.byteOffset, next.value.byteLength);
      let offset = 0;
      while (offset < chunk.length) {
        const end = chunk.indexOf(0x0a, offset);
        const part = chunk.subarray(offset, end < 0 ? chunk.length : end);
        requireValue(bytes + part.length <= WIRE_BYTES, 'capacity');
        let line = part;
        if (bytes || end < 0) {
          partial ??= Buffer.allocUnsafe(WIRE_BYTES);
          part.copy(partial, bytes); bytes += part.length;
          if (end < 0) break;
          line = partial.subarray(0, bytes);
        }
        check();
        yield decodeLine(line, principal);
        bytes = 0; offset = end + 1;
      }
    }
  } finally {
    try { await reader.cancel(); } catch { /* The caller owns the transport outcome. */ }
    finally { reader.releaseLock(); }
  }
}

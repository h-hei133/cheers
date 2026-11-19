import { once } from 'node:events';
import type { ServerResponse } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import type { ServiceRequest } from '../contract/model.js';
import { STATE_BYTES, WIRE_BYTES } from '../contract/model.js';
import { ROOM_STREAM_TYPE, ROOM_STREAM_WINDOW_MS, type RoomStreamFrame } from '../contract/stream.js';
import { CollaborationError, digest, identifier, integer, keys, object, requireValue, text } from '../contract/value.js';
import type { ServiceDispatcher } from './dispatch.js';

const HEARTBEAT_MS = 2_000;

/** Send a bounded window from the native ticket-checked cursor reader. */
export async function streamRoom(response: ServerResponse, dispatcher: ServiceDispatcher, principal: string, request: ServiceRequest): Promise<void> {
  requireValue(request.principal === principal, 'denied');
  const roomId = identifier(request.roomId);
  const data = object(request.data); keys(data, ['epoch', 'generation', 'after']);
  const epoch = text(data.epoch, 36); const generation = integer(data.generation, 1);
  let after = integer(data.after); let bytes = 0; let lastSnapshot: string | undefined;
  const lifetime = new AbortController(); const close = () => lifetime.abort();
  const timer = setTimeout(close, ROOM_STREAM_WINDOW_MS); response.once('close', close);
  let wake: AbortController | undefined; let dirty = false;
  const release = dispatcher.observeRoom(roomId, () => { dirty = true; wake?.abort(); });
  try {
    while (!lifetime.signal.aborted) {
      dirty = false;
      const payload = dispatcher.readRoomStream(principal, request, epoch, generation, after);
      const page = object(payload.result); const snapshot = object(page.snapshot);
      const snapshotDigest = digest(snapshot);
      const next = Math.max(integer(page.cursor), integer(snapshot.cutover));
      const frame: RoomStreamFrame = next > after || lastSnapshot !== snapshotDigest
        ? { type: 'page', response: { ...payload, result: { ...page, ...(lastSnapshot === snapshotDigest ? { snapshot: undefined } : {}) } } }
        : { type: 'heartbeat' };
      const line = JSON.stringify(frame) + '\n'; const length = Buffer.byteLength(line);
      requireValue(length <= WIRE_BYTES, 'capacity');
      if (bytes + length > STATE_BYTES) break;
      if (!response.headersSent) response.writeHead(200, { 'content-type': ROOM_STREAM_TYPE, 'cache-control': 'no-store', connection: 'close' });
      if (!response.write(line)) await once(response, 'drain', { signal: lifetime.signal });
      bytes += length;
      const more = next > after && next < integer(page.sequence);
      after = next; lastSnapshot = snapshotDigest;
      if (more || dirty) continue;
      wake = new AbortController();
      const wait = AbortSignal.any([lifetime.signal, wake.signal]);
      await delay(HEARTBEAT_MS, undefined, { signal: wait }).catch(error => { if (!wait.aborted) throw error; });
      wake = undefined;
    }
    response.end();
  } catch (error) {
    if (!response.headersSent && !lifetime.signal.aborted) throw error;
    if (lifetime.signal.aborted || !(error instanceof CollaborationError)) response.destroy();
    else {
      const frame: RoomStreamFrame = { type: 'error', code: error.code };
      const line = JSON.stringify(frame) + '\n';
      if (bytes + Buffer.byteLength(line) <= STATE_BYTES) response.end(line);
      else response.destroy();
    }
  } finally {
    release(); response.removeListener('close', close); clearTimeout(timer);
  }
}

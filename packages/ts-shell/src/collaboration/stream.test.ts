import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { createServer, request as forward, type ServerResponse } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { CollaborationClient } from './client/service.js';
import { CollaborationGuest } from './client/guest.js';
import { cursorPath } from './client/cursor.js';
import { readRoomStream } from './client/stream.js';
import { WIRE_BYTES, type Owner } from './contract/model.js';
import { object } from './contract/value.js';
import { streamRoom } from './service/stream.js';
import { bound, emptySnapshot, fixture, startFixtureService } from './__tests__/fixture.js';

type Fixture = ReturnType<typeof fixture>;
const cleanups: Array<() => void | Promise<void>> = [];

afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
  vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs();
});

function setup(): Fixture {
  const s = fixture(); cleanups.push(s.cleanup);
  const home = path.join(s.root, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
  return s;
}

function client(s: Fixture, principal: 'alice' | 'bob', origin: string): CollaborationClient {
  const value = new CollaborationClient({ version: 1, principal, origin, token: s.tokens[principal], addresses: ['127.0.0.1'], check() {} });
  cleanups.push(() => value.close());
  return value;
}

interface Attempt { after: number; response: ServerResponse; opened: boolean; closed: boolean }

async function relay(destination: string) {
  const attempts: Attempt[] = []; const operations: string[] = [];
  const server = createServer(async (incoming, response) => {
    try {
      let body = ''; for await (const chunk of incoming) body += String(chunk);
      const value = JSON.parse(body); operations.push(value.operation);
      let attempt: Attempt | undefined;
      if (value.operation === 'stream') {
        const current = { after: value.data.after, response, opened: false, closed: false };
        attempt = current;
        attempts.push(current); response.once('close', () => { current.closed = true; });
      }
      const upstream = forward(destination + '/v1', { method: 'POST', headers: {
        'content-type': 'application/json', authorization: incoming.headers.authorization!,
      } }, selected => {
        if (attempt) attempt.opened = selected.statusCode === 200;
        selected.once('error', () => response.destroy());
        response.writeHead(selected.statusCode!, selected.headers); selected.pipe(response);
      });
      upstream.once('error', () => response.destroy()); response.once('close', () => upstream.destroy());
      upstream.end(body);
    } catch { response.destroy(); }
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  return { attempts, operations, origin: `http://127.0.0.1:${(server.address() as { port: number }).port}` };
}

async function liveRoom() {
  const s = setup(); const service = await startFixtureService(s.config); cleanups.push(service.close);
  const alice = client(s, 'alice', service.origin); const through = await relay(service.origin);
  const bob = client(s, 'bob', through.origin);
  const start = object((await alice.request('begin', { data: { binding: bound, snapshot: emptySnapshot, acl: { bob: ['observe'] } } }, true)).result);
  const roomId = String(start.roomId); const owner = start.owner as Owner;
  const publish = (after: number) => alice.request('frame', { roomId, owner, data: {
    after, events: [{ sequence: after + 1, kind: 'turn.started', timestamp: after + 1 }],
  } });
  const join = () => bob.request('join', { roomId, data: {} });
  return { alice, bob, through, roomId, owner, publish, join };
}

it('resumes from a persisted cursor over real HTTP after a dropped stream and stops on revoke', async () => {
  const room = await liveRoom(); const selected = await room.join();
  expect(object(selected.result).stream).toBe(1);
  const guest = new CollaborationGuest(room.bob, 'local-room', selected.result, () => true);
  cleanups.push(() => guest.close());
  await guest.poll(); guest.start(); guest.start();
  await vi.waitFor(() => expect(room.through.attempts.map(item => item.after)).toEqual([0]), { timeout: 3500 });
  await room.publish(0);
  await vi.waitFor(() => expect(guest.view()).toMatchObject({ status: 'observing', cursor: 1 }), { timeout: 3500 });
  const target = cursorPath(room.through.origin, 'bob', room.roomId, 'local-room');
  expect(JSON.parse(fs.readFileSync(target, 'utf8')).cursor).toBe(1);
  room.through.attempts[0]!.response.destroy();
  await vi.waitFor(() => expect(room.through.attempts.map(item => item.after)).toEqual([0, 1]), { timeout: 3500 });
  await room.publish(1);
  await vi.waitFor(() => expect(guest.view()).toMatchObject({ status: 'observing', cursor: 2 }), { timeout: 3500 });
  expect(object(guest.view()).events).toMatchObject([{ sequence: 1 }, { sequence: 2 }]);
  await room.alice.request('acl', { roomId: room.roomId, owner: room.owner, data: { principal: 'bob', rights: [] } }, true);
  await vi.waitFor(() => expect(guest.status()).toBe('disconnected'), { timeout: 3500 });
  await room.publish(2);
  expect(JSON.parse(fs.readFileSync(target, 'utf8')).cursor).toBe(2);
  expect(room.through.operations).toEqual(['join', 'poll', 'stream', 'stream']);
}, 15000);

it('fences a late stream page after replacement and leaves the new guest cursor intact', async () => {
  const room = await liveRoom(); const selected = await room.join();
  let current: CollaborationGuest | undefined;
  const old: CollaborationGuest = new CollaborationGuest(room.bob, 'local-room', selected.result, () => current === old);
  current = old; cleanups.push(() => { old.close(); current?.close(); });
  await old.poll(); old.start();
  await vi.waitFor(() => expect(room.through.attempts).toMatchObject([{ opened: true }]), { timeout: 3500 });
  const successor: CollaborationGuest = new CollaborationGuest(room.bob, 'local-room', selected.result, () => current === successor);
  current = successor;
  await room.publish(0); await successor.poll();
  await vi.waitFor(() => expect(room.through.attempts[0]?.closed).toBe(true), { timeout: 3500 });
  expect(old.view()).toMatchObject({ status: 'disconnected', cursor: 0 });
  expect(successor.view()).toMatchObject({ status: 'observing', cursor: 1 });
  const target = cursorPath(room.through.origin, 'bob', room.roomId, 'local-room');
  expect(JSON.parse(fs.readFileSync(target, 'utf8')).cursor).toBe(1);
}, 10000);

class HeldResponse extends EventEmitter {
  headersSent = false;
  readonly lines: string[] = [];
  writeHead(): void { this.headersSent = true; }
  write(line: string): boolean { this.lines.push(line); return this.lines.length > 1; }
  end(): void { this.emit('close'); }
  destroy(): void { this.emit('close'); }
}

it.each(['close', 'drain'] as const)('waits on socket backpressure and handles %s without retaining its observer', async outcome => {
  const s = setup(); const room = s.begin(); const roomId = String(room.roomId);
  const joined = object(s.request('bob', 'join', { roomId, data: {} }).result);
  const response = new HeldResponse();
  const pages = vi.spyOn(s.dispatcher, 'readRoomStream');
  const observed = s.dispatcher.observeRoom.bind(s.dispatcher); const release = vi.fn();
  vi.spyOn(s.dispatcher, 'observeRoom').mockImplementation((id, wake) => { const stop = observed(id, wake); return () => { release(); stop(); }; });
  const streaming = streamRoom(response as unknown as ServerResponse, s.dispatcher, 'bob', {
    version: 1, principal: 'bob', operation: 'stream', roomId, ticket: String(joined.ticket),
    data: { epoch: joined.epoch, generation: joined.generation, after: 0 },
  });
  try {
    expect(response.lines).toHaveLength(1);
    s.request('alice', 'frame', { roomId, owner: room.owner as Owner, data: { after: 0,
      events: [{ sequence: 1, kind: 'turn.started', timestamp: 1 }] } });
    await Promise.resolve();
    expect(pages).toHaveBeenCalledOnce();
    if (outcome === 'drain') {
      response.emit('drain');
      await vi.waitFor(() => expect(response.lines).toHaveLength(2));
      expect(JSON.parse(response.lines[1]!)).toMatchObject({ type: 'page', response: { result: { cursor: 1 } } });
    }
  } finally { response.destroy(); await streaming; }
  expect(pages).toHaveBeenCalledTimes(outcome === 'drain' ? 2 : 1);
  expect(release).toHaveBeenCalledOnce();
  expect(response.listenerCount('drain')).toBe(0);
});

it('retains polling with a service that does not advertise the stream', async () => {
  const s = setup(); vi.useFakeTimers();
  const bob = client(s, 'bob', 'http://127.0.0.1:24001');
  const request = vi.spyOn(bob, 'request').mockResolvedValue({ version: 1, principal: 'bob', epoch: 'epoch',
    result: { roomId: 'room', epoch: 'epoch', generation: 1, sequence: 0, cursor: 0, events: [], snapshot: emptySnapshot } });
  const stream = vi.spyOn(bob, 'stream');
  const guest = new CollaborationGuest(bob, 'local-room', { roomId: 'room', epoch: 'epoch', generation: 1, binding: bound,
    ticket: 'opaque-ticket', expiresAt: Date.now() + 60_000 }, () => true);
  cleanups.push(() => guest.close());
  guest.start(); await vi.advanceTimersByTimeAsync(620);
  expect(request.mock.calls.map(([operation]) => operation)).toEqual(['poll', 'poll']);
  expect(stream).not.toHaveBeenCalled();
});

it('preserves split UTF-8 and rejects oversized or incomplete stream frames', async () => {
  const response = { version: 1, principal: 'bob', epoch: 'epoch', result: { text: '中文' } }; // Split inside a multibyte character.
  const bytes = Buffer.from(JSON.stringify({ type: 'page', response }) + '\n');
  const split = bytes.indexOf(Buffer.from('中')) + 1;
  const stream = (...chunks: Uint8Array[]) => new ReadableStream<Uint8Array>({ start(controller) {
    for (const chunk of chunks) controller.enqueue(chunk);
    controller.close();
  } });
  const received = [];
  for await (const frame of readRoomStream(stream(bytes.subarray(0, split), bytes.subarray(split)), 'bob', () => {})) received.push(frame);
  expect(received).toEqual([response]);
  await expect(readRoomStream(stream(bytes.subarray(0, -1)), 'bob', () => {}).next()).rejects.toThrow('unavailable');
  await expect(readRoomStream(stream(Buffer.alloc(WIRE_BYTES + 1, 0x20)), 'bob', () => {}).next()).rejects.toThrow('capacity');
});

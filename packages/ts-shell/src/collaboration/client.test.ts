import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { CollaborationClient, UnknownMutation } from './client/service.js';
import { readProfile, canonicalOrigin } from './client/profile.js';
import { CollaborationGuest } from './client/guest.js';
import { readServiceConfig } from './service/config.js';
import { startCollaborationService } from './service/listener.js';
import { emptySnapshot, bound, fixture, freePort } from './__tests__/fixture.js';
import { object } from './contract/value.js';

const cleanups: (() => Promise<void> | void)[] = [];
afterEach(async () => { for (const cleanup of cleanups.splice(0).reverse()) await cleanup(); vi.unstubAllEnvs(); });
function setup() { const value = fixture(); cleanups.push(value.cleanup); return value; }
function profile(s: ReturnType<typeof fixture>, principal: keyof typeof s.tokens, origin: string, token = s.tokens[principal]) {
  const tokenFile = path.join(s.root, principal + '.token'); const target = path.join(s.root, principal + '.profile.json');
  fs.writeFileSync(tokenFile, token + '\n', { mode: 0o600 });
  fs.writeFileSync(target, JSON.stringify({ version: 1, origin, principal, tokenFile, addresses: ['127.0.0.1'] }), { mode: 0o600 });
  const selected = readProfile(target); return { selected, target, tokenFile };
}

it('checks explicit loopback/TLS, private bytes and profile identity without any network', () => {
  const s = setup();
  for (const value of ['http://localhost:80', 'http://192.168.1.1', 'https://user:secret@example.com', 'https://example.com/a', 'https://example.com/?token=x'])
    expect(() => canonicalOrigin(value)).toThrow();
  const selected = profile(s, 'alice', 'http://127.0.0.1:24001'); selected.selected.check();
  fs.writeFileSync(selected.tokenFile, 'Z'.repeat(40)); expect(() => selected.selected.check()).toThrow();
  fs.chmodSync(selected.target, 0o644); expect(() => readProfile(selected.target)).toThrow();
  const configFile = path.join(s.root, 'service.json'); fs.writeFileSync(configFile, JSON.stringify({ ...s.config, host: '0.0.0.0' }), { mode: 0o600 });
  expect(() => readServiceConfig(configFile)).toThrow();
});
it('runs two authenticated native clients, rejects declared identity mismatch and denies a second listener', async () => {
  const s = setup(); s.config.port = await freePort(); const service = await startCollaborationService(s.config); cleanups.push(service.close);
  const alice = new CollaborationClient(profile(s, 'alice', service.origin).selected); const bob = new CollaborationClient(profile(s, 'bob', service.origin).selected);
  cleanups.push(() => { alice.close(); bob.close(); });
  expect(object((await alice.request('hello', { data: {} })).result).principal).toBe('alice');
  const started = object((await alice.request('begin', { data: { binding: bound, snapshot: emptySnapshot, acl: { bob: ['observe'] } } }, true)).result);
  const joined = object((await bob.request('join', { roomId: String(started.roomId), data: {} })).result);
  expect(object((await bob.request('poll', { roomId: String(started.roomId), ticket: String(joined.ticket), data: { after: 0 } })).result).rights).toEqual(['observe']);
  const mismatch = new CollaborationClient({ ...alice.profile, principal: 'carol' }); cleanups.push(() => mismatch.close());
  await expect(mismatch.request('begin', { data: { binding: bound, snapshot: emptySnapshot, acl: {} } }, true)).rejects.toBeInstanceOf(UnknownMutation);
  expect(JSON.parse(fs.readFileSync(s.config.stateFile, 'utf8')).rooms).toHaveLength(1);
  await expect(startCollaborationService(s.config)).rejects.toThrow(/busy/);
});
it('queries a lost mutation reply without resending its remote effect', async () => {
  const s = setup(); const operations: string[] = []; let drop = true;
  const server = createServer(async (request, response) => {
    let source = ''; for await (const chunk of request) source += String(chunk); const value = JSON.parse(source); operations.push(value.operation);
    const result = s.dispatcher.execute('alice', value);
    if (value.operation === 'publish' && drop) { drop = false; request.socket.destroy(); return; }
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(result));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const client = new CollaborationClient(profile(s, 'alice', `http://127.0.0.1:${(server.address() as { port: number }).port}`).selected); cleanups.push(() => client.close());
  let receipt = '';
  try { await client.request('publish', { data: { binding: bound, snapshot: emptySnapshot, acl: ['bob'], ttl: 60 } }, true); }
  catch (error) { expect(error).toBeInstanceOf(UnknownMutation); receipt = (error as UnknownMutation).requestId; }
  const queried = object((await client.request('receipt', { data: { requestId: receipt } })).result);
  expect(queried.status).toBe('committed'); expect(operations).toEqual(['publish', 'receipt']); expect(s.store.transaction(state => state.shares.length)).toBe(1);
});
it('aborts a held native request and never automatically repeats it', async () => {
  const s = setup(); let received!: () => void; const ready = new Promise<void>(resolve => { received = resolve; }); let requests = 0;
  const server = createServer(async request => { for await (const _chunk of request) { /* consume the bounded fixture request */ } requests++; received(); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); });
  const client = new CollaborationClient(profile(s, 'alice', `http://127.0.0.1:${(server.address() as { port: number }).port}`).selected); cleanups.push(() => client.close());
  const signal = new AbortController(); const pending = client.request('publish', { data: {} }, true, signal.signal); await ready; signal.abort();
  await expect(pending).rejects.toBeInstanceOf(UnknownMutation); expect(requests).toBe(1);
});
it('explicitly rejoins a changed host generation with a visible cursor gap and no stale snapshot', async () => {
  const s = setup(); const isolatedHome = path.join(s.root, 'home'); fs.mkdirSync(isolatedHome); vi.stubEnv('HOME', isolatedHome); vi.stubEnv('USERPROFILE', isolatedHome);
  const selected = profile(s, 'bob', 'http://127.0.0.1:24001').selected;
  let generation = 1;
  const client = new CollaborationClient(selected); vi.spyOn(client, 'request').mockImplementation(async () => ({ version: 1, principal: 'bob', epoch: 'same-epoch',
    result: { roomId: 'room', epoch: 'same-epoch', generation, sequence: 1, cursor: 1, gap: false, events: [{ sequence: 1, kind: 'turn.started', timestamp: Date.now() }], snapshot: { ...emptySnapshot, cutover: 1 } } }));
  const joined = () => ({ roomId: 'room', epoch: 'same-epoch', generation, binding: bound, ticket: 'opaque-ticket', expiresAt: Date.now() + 60000 });
  const first = new CollaborationGuest(client, 'local-id', joined(), () => true); await first.poll(); first.close(); generation++;
  const second = new CollaborationGuest(client, 'local-id', joined(), () => true); await second.poll();
  expect(object(second.view()).gap).toBe(true); expect(object(second.view()).generation).toBe(2); second.close(); client.close();
});

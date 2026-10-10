import { afterEach, expect, it } from 'vitest';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import type { Owner, ServiceRequest } from './contract/model.js';
import { digest, object } from './contract/value.js';
import { ServiceStore } from './service/store.js';
import { ServiceDispatcher } from './service/dispatch.js';
import { emptySnapshot, bound, fixture } from './__tests__/fixture.js';

const fixtures: ReturnType<typeof fixture>[] = [];
afterEach(() => { for (const item of fixtures.splice(0)) item.cleanup(); });
function setup() { const item = fixture(); fixtures.push(item); return item; }
function hostFields(value: Record<string, unknown>): Pick<ServiceRequest, 'roomId' | 'owner'> { return { roomId: String(value.roomId), owner: value.owner as Owner }; }

it('rejects protocol and declared-account mismatch before reserving or mutating', () => {
  const s = setup(); const source = fs.readFileSync(s.config.stateFile, 'utf8');
  for (const value of [{ version: 2, principal: 'alice', operation: 'begin' }, { version: 1, principal: 'bob', operation: 'begin',
    requestId: randomUUID(), data: { binding: bound, snapshot: emptySnapshot, acl: { bob: ['observe'] } } }])
    expect(() => s.dispatcher.execute('alice', value)).toThrow();
  expect(fs.readFileSync(s.config.stateFile, 'utf8')).toBe(source);
});
it('checks separate observe, ask and control rights and fences old tickets after revoke and regrant', () => {
  const s = setup(); const host = hostFields(s.begin({ bob: ['observe'] }));
  const joined = object(s.request('bob', 'join', { roomId: host.roomId, data: {} }).result);
  const guest = { roomId: host.roomId, ticket: String(joined.ticket) };
  expect(s.request('bob', 'poll', { ...guest, data: { after: 0 } }).result).toBeTruthy();
  for (const data of [{ kind: 'ask', text: 'run this' }, { kind: 'cancel', target: randomUUID() }])
    expect(() => s.request('bob', 'propose', { ...guest, data })).toThrow();
  expect(() => s.request('carol', 'poll', { ...guest, data: { after: 0 } })).toThrow();
  s.request('alice', 'acl', { ...host, data: { principal: 'bob', rights: [] } });
  expect(() => s.request('bob', 'poll', { ...guest, data: { after: 0 } })).toThrow();
  s.request('alice', 'acl', { ...host, data: { principal: 'bob', rights: ['observe', 'ask'] } });
  expect(() => s.request('bob', 'poll', { ...guest, data: { after: 0 } })).toThrow();
});
it('fences every stale host after takeover and rejects wrong creation/project identity', () => {
  const s = setup(); const first = s.begin(); const old = hostFields(first); s.advance(6000);
  const plan = object(s.request('alice', 'room-plan', { roomId: old.roomId, data: bound }).result);
  for (const binding of [{ ...bound, sessionCreatedAt: 'wrong' }, { ...bound, projectId: 'b'.repeat(64) }])
    expect(() => s.request('alice', 'lease', { roomId: old.roomId, data: { binding, snapshot: emptySnapshot,
      epoch: plan.epoch, aclRevision: plan.aclRevision, generation: plan.generation } })).toThrow();
  const next = object(s.request('alice', 'lease', { roomId: old.roomId, data: { binding: bound, snapshot: emptySnapshot,
    epoch: plan.epoch, aclRevision: plan.aclRevision, generation: plan.generation } }).result);
  expect(Number(object(next.owner).generation)).toBeGreaterThan(Number(object(first.owner).generation));
  for (const [operation, data] of [['renew', {}], ['frame', { after: 0, events: [] }], ['stop', {}], ['acl', { principal: 'bob', rights: ['observe'] }]] as const)
    expect(() => s.request('alice', operation, { ...old, data })).toThrow();
});
it('binds resume disclosure to the exact retained ACL revision before writing a fresh snapshot', () => {
  const s = setup(); const first = s.begin({ bob: ['observe'] }); const host = hostFields(first);
  const plan = object(s.request('alice', 'room-plan', { roomId: host.roomId, data: bound }).result);
  s.request('alice', 'acl', { ...host, data: { principal: 'carol', rights: ['observe'] } }); s.advance(6000);
  const snapshot = { ...emptySnapshot, entries: [{ id: 'c'.repeat(64), role: 'user', content: 'New private contents' }] };
  expect(() => s.request('alice', 'lease', { roomId: host.roomId, data: { binding: bound, snapshot,
    epoch: plan.epoch, aclRevision: plan.aclRevision, generation: plan.generation } })).toThrow();
  expect(s.store.transaction(state => state.rooms[0]!.snapshot)).toEqual(emptySnapshot);
});
it('rejects two live host leases for the same owner/session/project across different room IDs', () => {
  const s = setup(); const first = hostFields(s.begin()); s.advance(6000); const second = hostFields(s.begin());
  const plan = object(s.request('alice', 'room-plan', { roomId: first.roomId, data: bound }).result);
  expect(() => s.request('alice', 'lease', { roomId: first.roomId, data: { binding: bound, snapshot: emptySnapshot,
    epoch: plan.epoch, aclRevision: plan.aclRevision, generation: plan.generation } })).toThrow(/busy/);
  expect(s.request('alice', 'renew', { ...second, data: {} }).result).toBeTruthy();
  expect(s.store.transaction(state => state.rooms.filter(room => room.lease && room.lease.expiresAt > s.now()).length)).toBe(1);
});
it('claims and dispatches a proposal once and retains digest-bound receipts for lost replies', () => {
  const s = setup(); const host = hostFields(s.begin()); const ticket = String(object(s.request('bob', 'join', { roomId: host.roomId, data: {} }).result).ticket);
  const proposed = object(s.request('bob', 'propose', { roomId: host.roomId, ticket, data: { kind: 'ask', text: 'Inspect the workspace without changes.' } }).result);
  const claimId = randomUUID(); const claimed = object(s.request('alice', 'claim', { ...host, requestId: claimId, data: { proposalId: proposed.proposalId } }).result);
  const duplicate = s.request('alice', 'claim', { ...host, requestId: claimId, data: { proposalId: proposed.proposalId } }).result;
  expect(duplicate).toEqual(claimed);
  expect(() => s.request('alice', 'claim', { ...host, data: { proposalId: proposed.proposalId } })).toThrow();
  expect(() => s.request('alice', 'claim', { ...host, requestId: claimId, data: { proposalId: randomUUID() } })).toThrow();
  const dispatchId = randomUUID(); const data = { acceptanceId: claimed.acceptanceId, digest: claimed.digest };
  const dispatched = s.request('alice', 'dispatch', { ...host, requestId: dispatchId, data }).result;
  expect(s.request('alice', 'dispatch', { ...host, requestId: dispatchId, data }).result).toEqual(dispatched);
  expect(() => s.request('alice', 'dispatch', { ...host, data })).toThrow();
  expect(object(s.request('alice', 'receipt', { data: { requestId: dispatchId } }).result).status).toBe('committed');
  expect(object(s.request('carol', 'receipt', { data: { requestId: dispatchId } }).result).status).toBe('unknown');
});
it('rejects accepted work revoked before dispatch and stale cancellation after its target settled', () => {
  const s = setup(); const host = hostFields(s.begin()); const ticket = String(object(s.request('bob', 'join', { roomId: host.roomId, data: {} }).result).ticket);
  const ask = object(s.request('bob', 'propose', { roomId: host.roomId, ticket, data: { kind: 'ask', text: 'A prompt' } }).result);
  const accepted = object(s.request('alice', 'claim', { ...host, data: { proposalId: ask.proposalId } }).result);
  s.request('alice', 'dispatch', { ...host, data: { acceptanceId: accepted.acceptanceId, digest: accepted.digest } });
  const cancel = object(s.request('bob', 'propose', { roomId: host.roomId, ticket, data: { kind: 'cancel', target: accepted.acceptanceId } }).result);
  const control = object(s.request('alice', 'claim', { ...host, data: { proposalId: cancel.proposalId } }).result);
  s.request('alice', 'settle', { ...host, data: { acceptanceId: accepted.acceptanceId, outcome: 'completed' } });
  expect(() => s.request('alice', 'dispatch', { ...host, data: { acceptanceId: control.acceptanceId, digest: control.digest } })).toThrow();
  const second = object(s.request('bob', 'propose', { roomId: host.roomId, ticket, data: { kind: 'ask', text: 'Another prompt' } }).result);
  const waiting = object(s.request('alice', 'claim', { ...host, data: { proposalId: second.proposalId } }).result);
  s.request('alice', 'acl', { ...host, data: { principal: 'bob', rights: ['observe'] } });
  expect(() => s.request('alice', 'dispatch', { ...host, data: { acceptanceId: waiting.acceptanceId, digest: waiting.digest } })).toThrow();
});
it('publishes contiguous bounded frames with explicit retention gaps and snapshot cutover', () => {
  const s = setup(); const host = hostFields(s.begin());
  for (let batch = 0; batch < 3; batch++) {
    const events = Array.from({ length: 128 }, (_, index) => ({ sequence: batch * 128 + index + 1, kind: 'turn.started', timestamp: s.now() }));
    const data = { after: batch * 128, events, snapshot: { ...emptySnapshot, cutover: (batch + 1) * 128 } };
    const result = s.request('alice', 'frame', { ...host, data }).result;
    expect(s.request('alice', 'frame', { ...host, data }).result).toEqual(result);
  }
  const ticket = String(object(s.request('bob', 'join', { roomId: host.roomId, data: {} }).result).ticket);
  const page = object(s.request('bob', 'poll', { roomId: host.roomId, ticket, data: { after: 0 } }).result);
  expect(page.gap).toBe(true); expect((page.events as unknown[]).length).toBe(64); expect(object(page.snapshot).cutover).toBe(384);
  expect(() => s.request('alice', 'frame', { ...host, data: { after: 0, events: [] } })).toThrow();
  expect(() => s.request('alice', 'frame', { ...host, data: { after: 384, events: [{ sequence: 386, kind: 'turn.started', timestamp: s.now() }] } })).toThrow();
});
it('preserves dispatched uncertainty when takeover is followed by revocation', () => {
  const s = setup(); let host = hostFields(s.begin());
  const ticket = String(object(s.request('bob', 'join', { roomId: host.roomId, data: {} }).result).ticket);
  const ask = object(s.request('bob', 'propose', { roomId: host.roomId, ticket, data: { kind: 'ask', text: 'Run once' } }).result);
  const accepted = object(s.request('alice', 'claim', { ...host, data: { proposalId: ask.proposalId } }).result);
  s.request('alice', 'dispatch', { ...host, data: { acceptanceId: accepted.acceptanceId, digest: accepted.digest } });
  const cancel = object(s.request('bob', 'propose', { roomId: host.roomId, ticket, data: { kind: 'cancel', target: accepted.acceptanceId } }).result);
  const control = object(s.request('alice', 'claim', { ...host, data: { proposalId: cancel.proposalId } }).result);
  s.request('alice', 'dispatch', { ...host, data: { acceptanceId: control.acceptanceId, digest: control.digest } });
  s.advance(6000); const plan = object(s.request('alice', 'room-plan', { roomId: host.roomId, data: bound }).result);
  host = hostFields(object(s.request('alice', 'lease', { roomId: host.roomId, data: { binding: bound, snapshot: emptySnapshot,
    epoch: plan.epoch, aclRevision: plan.aclRevision, generation: plan.generation } }).result));
  s.request('alice', 'acl', { ...host, data: { principal: 'bob', rights: [] } });
  const retained = s.store.transaction(state => state.rooms[0]!.proposals);
  expect(retained.map(proposal => proposal.status)).toEqual(['unknown', 'unknown']);
  expect(retained.every(proposal => proposal.outcome === undefined)).toBe(true);
});
it.each(['revoke-regrant', 'takeover'] as const)('refuses a completed outcome for fenced work after %s', change => {
  const s = setup(); let host = hostFields(s.begin());
  const ticket = String(object(s.request('bob', 'join', { roomId: host.roomId, data: {} }).result).ticket);
  const ask = object(s.request('bob', 'propose', { roomId: host.roomId, ticket, data: { kind: 'ask', text: 'Adopt once' } }).result);
  const claimed = object(s.request('alice', 'claim', { ...host, data: { proposalId: ask.proposalId } }).result);
  s.request('alice', 'dispatch', { ...host, data: { acceptanceId: claimed.acceptanceId, digest: claimed.digest } });
  if (change === 'revoke-regrant') {
    s.request('alice', 'acl', { ...host, data: { principal: 'bob', rights: ['observe'] } });
    s.request('alice', 'acl', { ...host, data: { principal: 'bob', rights: ['observe', 'ask'] } });
  } else {
    s.advance(6000); const plan = object(s.request('alice', 'room-plan', { roomId: host.roomId, data: bound }).result);
    host = hostFields(object(s.request('alice', 'lease', { roomId: host.roomId, data: { binding: bound, snapshot: emptySnapshot,
      epoch: plan.epoch, aclRevision: plan.aclRevision, generation: plan.generation } }).result));
  }
  expect(() => s.request('alice', 'settle', { ...host, data: { acceptanceId: claimed.acceptanceId, outcome: 'completed' } })).toThrow(/stale/);
  expect(s.store.transaction(state => state.rooms[0]!.proposals[0])).toMatchObject({ status: 'unknown' });
});
it('enforces authenticated share ACL, expiry, revoke/delete and private state without link authority', () => {
  const s = setup(); const published = object(s.request('alice', 'publish', { data: { binding: bound, snapshot: emptySnapshot, acl: ['bob'], ttl: 60 } }).result);
  const data = { shareId: published.shareId };
  expect(s.request('bob', 'read-share', { data }).result).toBeTruthy(); expect(() => s.request('carol', 'read-share', { data })).toThrow();
  s.request('alice', 'revoke-share', { data }); expect(() => s.request('bob', 'read-share', { data })).toThrow();
  s.request('alice', 'delete-share', { data }); expect(s.store.transaction(state => state.shares[0]!.snapshot)).toBeUndefined();
  const expiring = object(s.request('alice', 'publish', { data: { binding: bound, snapshot: emptySnapshot, acl: ['bob'], ttl: 60 } }).result);
  s.advance(61000); expect(() => s.request('bob', 'read-share', { data: { shareId: expiring.shareId } })).toThrow();
  expect(fs.statSync(s.config.stateFile).mode & 0o077).toBe(0);
});
it('retains unknown intent across restart and refuses replay when receipt capacity is full', () => {
  const s = setup(); const requestId = randomUUID(); const request = { version: 1, principal: 'alice', operation: 'publish', requestId,
    data: { binding: bound, snapshot: emptySnapshot, acl: ['bob'], ttl: 60 } };
  s.store.transaction(state => state.receipts.push({ principal: 'alice', operation: 'publish', requestId, digest: digest(request), status: 'intent' }));
  const restarted = new ServiceStore(s.config.stateFile); const dispatcher = new ServiceDispatcher(restarted, s.config);
  expect(() => dispatcher.execute('alice', request)).toThrow(/unknown/);
  expect(restarted.transaction(state => state.shares.length)).toBe(0);
  restarted.transaction(state => { while (state.receipts.length < 1024) state.receipts.push({ principal: 'alice', operation: 'publish',
    requestId: randomUUID(), digest: 'f'.repeat(64), status: 'unknown' }); });
  expect(() => dispatcher.execute('alice', { ...request, requestId: randomUUID() })).toThrow(/capacity/);
});

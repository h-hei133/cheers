import { randomBytes, randomUUID } from 'node:crypto';
import type { Binding, Owner, Room, ServiceRequest, ServiceState, Right } from '../contract/model.js';
import { digest, hashText, identifier, integer, keys, object, requireValue, text } from '../contract/value.js';
import { decodeEvents, decodeSnapshot } from '../contract/snapshot.js';
import { assertOwner, assertRight, rights, type Tickets } from './auth.js';
import { proposalMetadata } from './proposals.js';
import { decodeAcl } from '../contract/acl.js';

export function binding(value: unknown): Binding {
  const selected = object(value); keys(selected, ['sessionId', 'sessionCreatedAt', 'projectId']);
  const projectId = text(selected.projectId, 64); requireValue(/^[a-f0-9]{64}$/.test(projectId));
  return { sessionId: identifier(selected.sessionId), sessionCreatedAt: text(selected.sessionCreatedAt, 64), projectId };
}
export function findRoom(state: ServiceState, request: ServiceRequest): Room {
  const room = state.rooms.find(item => item.id === identifier(request.roomId)); requireValue(room, 'denied'); return room;
}
export function decodeOwner(value: unknown): Owner | undefined {
  if (value === undefined) return undefined; const selected = object(value); keys(selected, ['generation', 'token']);
  return { generation: integer(selected.generation, 1), token: text(selected.token, 64) };
}
export function beginRoom(state: ServiceState, principal: string, data: unknown, now: number): unknown {
  const selected = object(data); keys(selected, ['binding', 'snapshot', 'acl']);
  const bound = binding(selected.binding); const snapshot = decodeSnapshot(selected.snapshot); requireValue(snapshot.cutover === 0);
  requireValue(state.rooms.length < 64, 'capacity');
  requireValue(!state.rooms.some(room => !room.closed && room.owner === principal && room.sessionId === bound.sessionId
    && room.sessionCreatedAt === bound.sessionCreatedAt && room.projectId === bound.projectId && room.lease && room.lease.expiresAt > now), 'busy');
  const room: Room = { ...bound, id: randomUUID(), owner: principal, epoch: state.epoch, aclRevision: 1,
    acl: decodeAcl(selected.acl), generation: 0, closed: false, sequence: 0, events: [], snapshot, proposals: [] };
  state.rooms.push(room); return takeLease(state, room, principal, bound, now);
}
export function takeLease(state: ServiceState, room: Room, principal: string, data: unknown, now: number): unknown {
  const bound = binding(data);
  requireValue(room.owner === principal && !room.closed && bound.sessionId === room.sessionId
    && bound.sessionCreatedAt === room.sessionCreatedAt && bound.projectId === room.projectId, 'denied');
  requireValue(!room.lease || room.lease.expiresAt <= now, 'busy');
  requireValue(!state.rooms.some(other => other.id !== room.id && !other.closed && other.owner === principal
    && other.sessionId === bound.sessionId && other.sessionCreatedAt === bound.sessionCreatedAt && other.projectId === bound.projectId
    && other.lease && other.lease.expiresAt > now), 'busy');
  room.generation++; room.aclRevision++;
  for (const proposal of room.proposals) if (proposal.status === 'accepted' || proposal.status === 'dispatched') proposal.status = 'unknown';
  const token = randomBytes(32).toString('base64url'); room.lease = { generation: room.generation, tokenHash: hashText(token), expiresAt: now + 5_000 };
  return { roomId: room.id, binding: { sessionId: room.sessionId, sessionCreatedAt: room.sessionCreatedAt, projectId: room.projectId },
    epoch: room.epoch, owner: { generation: room.generation, token }, expiresAt: room.lease.expiresAt, sequence: room.sequence };
}
export function roomPlan(room: Room, principal: string, data: unknown, now: number): unknown {
  const bound = binding(data);
  requireValue(room.owner === principal && !room.closed && bound.sessionId === room.sessionId
    && bound.sessionCreatedAt === room.sessionCreatedAt && bound.projectId === room.projectId, 'denied');
  return { roomId: room.id, epoch: room.epoch, acl: room.acl, aclRevision: room.aclRevision, generation: room.generation,
    sequence: room.sequence, hostActive: Boolean(room.lease && room.lease.expiresAt > now) };
}
export function hostFrame(room: Room, principal: string, request: ServiceRequest, now: number): unknown {
  assertOwner(room, principal, request.owner, now); const selected = object(request.data); keys(selected, ['events', 'snapshot', 'after']);
  const after = integer(selected.after); const events = decodeEvents(selected.events); const fingerprint = digest(selected);
  if (after < room.sequence) { requireValue(events.at(-1)?.sequence === room.sequence && room.frameDigest === fingerprint, 'stale'); return { sequence: room.sequence }; }
  requireValue(after === room.sequence && events.every((event, index) => event.sequence === after + index + 1), 'gap');
  room.events.push(...events); room.events = room.events.slice(-256); room.sequence = events.at(-1)?.sequence ?? after;
  if (selected.snapshot !== undefined) { const snapshot = decodeSnapshot(selected.snapshot); requireValue(snapshot.cutover === room.sequence, 'gap'); room.snapshot = snapshot; }
  room.frameDigest = fingerprint; return { sequence: room.sequence };
}
export function pollRoom(room: Room, principal: string, request: ServiceRequest, now: number, tickets: Tickets): unknown {
  tickets.check(request.ticket, room, principal, now); const selected = object(request.data); keys(selected, ['after']); const after = integer(selected.after);
  requireValue(after <= room.sequence, 'gap');
  const gap = after < (room.events[0]?.sequence ?? room.sequence + 1) - 1;
  const events = room.events.filter(event => event.sequence > after).slice(0, 64);
  return { roomId: room.id, epoch: room.epoch, sequence: room.sequence, cursor: events.at(-1)?.sequence ?? after, gap,
    generation: room.generation, aclRevision: room.aclRevision, rights: rights(room, principal), hostActive: Boolean(room.lease && room.lease.expiresAt > now),
    snapshot: gap || after === 0 || room.snapshot.cutover > after ? room.snapshot : undefined,
    proposals: (principal === room.owner ? room.proposals : room.proposals.filter(item => item.principal === principal)).map(proposalMetadata), events };
}
export function changeAcl(room: Room, principal: string, request: ServiceRequest, now: number): unknown {
  assertOwner(room, principal, request.owner, now); const selected = object(request.data); keys(selected, ['principal', 'rights']);
  const target = identifier(selected.principal); requireValue(target !== room.owner); const decoded = decodeAcl({ [target]: selected.rights });
  room.acl[target] = decoded[target]!; room.aclRevision++;
  for (const proposal of room.proposals) if (proposal.principal === target && proposal.status !== 'settled' && proposal.status !== 'rejected') {
    if (!rights(room, target).includes(proposal.kind === 'ask' ? 'ask' : 'control'))
      proposal.status = proposal.status === 'dispatched' || proposal.status === 'unknown' ? 'unknown' : 'rejected';
  }
  return { principal: target, rights: room.acl[target], aclRevision: room.aclRevision };
}
export function renewRoom(room: Room, principal: string, request: ServiceRequest, now: number): unknown {
  assertOwner(room, principal, request.owner, now); room.lease!.expiresAt = now + 5_000;
  return { expiresAt: room.lease!.expiresAt, sequence: room.sequence, aclRevision: room.aclRevision, generation: room.generation,
    proposals: room.proposals.map(proposalMetadata), acl: room.acl };
}
export function stopRoom(room: Room, principal: string, request: ServiceRequest, now: number): unknown {
  assertOwner(room, principal, request.owner, now); room.closed = true; room.aclRevision++; room.generation++; delete room.lease;
  for (const proposal of room.proposals) if (proposal.status === 'accepted' || proposal.status === 'dispatched') proposal.status = 'unknown';
  return { closed: true, generation: room.generation };
}

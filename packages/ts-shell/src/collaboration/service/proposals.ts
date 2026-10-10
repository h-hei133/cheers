import { randomUUID } from 'node:crypto';
import type { Proposal, Room, ServiceRequest } from '../contract/model.js';
import { digest, identifier, keys, object, requireValue, text, uuid } from '../contract/value.js';
import { assertOwner, assertRight, type Tickets } from './auth.js';

export function proposalMetadata(proposal: Proposal): Omit<Proposal, 'text'> {
  const { text: _text, ...metadata } = proposal; return metadata;
}
export function inspectProposal(room: Room, principal: string, request: ServiceRequest, now: number): Proposal {
  assertOwner(room, principal, request.owner, now); const selected = object(request.data); keys(selected, ['proposalId']);
  const proposal = room.proposals.find(item => item.id === identifier(selected.proposalId)); requireValue(proposal, 'denied');
  return structuredClone(proposal);
}

export function propose(room: Room, principal: string, request: ServiceRequest, now: number, tickets: Tickets): unknown {
  const selected = object(request.data); keys(selected, ['kind', 'text', 'target']);
  requireValue(selected.kind === 'ask' || selected.kind === 'cancel');
  tickets.check(request.ticket, room, principal, now, selected.kind === 'ask' ? 'ask' : 'control');
  requireValue(room.lease && room.lease.expiresAt > now, 'stale'); requireValue(room.proposals.length < 128, 'capacity');
  const content = selected.kind === 'ask' ? text(selected.text, 16 * 1024) : undefined;
  const target = selected.kind === 'cancel' ? uuid(selected.target) : undefined;
  requireValue(selected.kind === 'ask' ? selected.target === undefined : selected.text === undefined);
  if (target) requireValue(room.proposals.some(item => item.acceptanceId === target && item.status === 'dispatched'), 'stale');
  const proposal: Proposal = { id: randomUUID(), principal, kind: selected.kind, ...(content ? { text: content } : {}),
    ...(target ? { target } : {}), digest: digest({ kind: selected.kind, text: content, target }), status: 'proposed', createdAt: now };
  room.proposals.push(proposal); return { proposalId: proposal.id, status: proposal.status };
}
export function claim(room: Room, principal: string, request: ServiceRequest, now: number): unknown {
  assertOwner(room, principal, request.owner, now); const selected = object(request.data); keys(selected, ['proposalId']);
  const proposal = room.proposals.find(item => item.id === identifier(selected.proposalId)); requireValue(proposal?.status === 'proposed', 'stale');
  assertRight(room, proposal.principal, proposal.kind === 'ask' ? 'ask' : 'control');
  proposal.status = 'accepted'; proposal.acceptanceId = randomUUID(); proposal.acceptedBy = principal; proposal.generation = room.generation;
  return { ...proposal };
}
export function dispatchProposal(room: Room, principal: string, request: ServiceRequest, now: number): unknown {
  assertOwner(room, principal, request.owner, now); const selected = object(request.data); keys(selected, ['acceptanceId', 'digest']);
  const proposal = room.proposals.find(item => item.acceptanceId === uuid(selected.acceptanceId));
  requireValue(proposal?.status === 'accepted' && proposal.generation === room.generation && proposal.digest === selected.digest, 'stale');
  assertRight(room, proposal.principal, proposal.kind === 'ask' ? 'ask' : 'control');
  if (proposal.kind === 'cancel') requireValue(room.proposals.some(item => item.acceptanceId === proposal.target && item.status === 'dispatched'), 'stale');
  proposal.status = 'dispatched';
  return { acceptanceId: proposal.acceptanceId, principal: proposal.principal, kind: proposal.kind, target: proposal.target,
    generation: room.generation, expiresAt: room.lease!.expiresAt, status: proposal.status };
}
export function settleProposal(room: Room, principal: string, request: ServiceRequest, now: number): unknown {
  assertOwner(room, principal, request.owner, now); const selected = object(request.data); keys(selected, ['acceptanceId', 'outcome', 'sourceEntryId']);
  requireValue(['completed', 'failed', 'cancelled', 'unknown'].includes(String(selected.outcome)));
  const proposal = room.proposals.find(item => item.acceptanceId === uuid(selected.acceptanceId));
  requireValue(proposal && ['dispatched', 'unknown'].includes(proposal.status) && proposal.generation === room.generation, 'stale');
  if (selected.outcome === 'completed') {
    requireValue(proposal.status === 'dispatched', 'stale');
    assertRight(room, proposal.principal, proposal.kind === 'ask' ? 'ask' : 'control');
  }
  proposal.status = 'settled'; proposal.outcome = selected.outcome as Proposal['outcome'];
  if (selected.sourceEntryId !== undefined) proposal.sourceEntryId = identifier(selected.sourceEntryId);
  return { acceptanceId: proposal.acceptanceId, status: proposal.status, outcome: proposal.outcome };
}

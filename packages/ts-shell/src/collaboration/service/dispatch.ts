import type { ServiceConfig } from './config.js';
import type { ServiceRequest, ServiceResponse, ServiceState } from '../contract/model.js';
import { identifier, keys, object, requireValue } from '../contract/value.js';
import { decodeSnapshot } from '../contract/snapshot.js';
import { Tickets } from './auth.js';
import { decodeOwner, findRoom, beginRoom, takeLease, roomPlan, changeAcl, hostFrame, pollRoom, renewRoom, stopRoom } from './rooms.js';
import { claim, dispatchProposal, inspectProposal, propose, settleProposal } from './proposals.js';
import { publishShare, readShare, removeShare } from './shares.js';
import { mutate, readReceipt } from './receipt.js';
import type { ServiceStore } from './store.js';

const structural = ['begin', 'lease', 'acl', 'stop', 'propose', 'claim', 'dispatch', 'settle', 'publish', 'revoke-share', 'delete-share'];
export class ServiceDispatcher {
  private readonly tickets = new Tickets();
  constructor(private readonly store: ServiceStore, private readonly config: ServiceConfig, private readonly now = Date.now) {}
  execute(principal: string, value: unknown): ServiceResponse {
    const request = decodeRequest(value); const now = this.now();
    requireValue(request.principal === principal, 'denied');
    const action = (state: ServiceState) => this.route(state, principal, request, now);
    const result = structural.includes(request.operation) ? mutate(this.store, principal, request, action) : this.store.transaction(action);
    return { version: 1, epoch: this.store.epoch, principal, result };
  }
  private route(state: ServiceState, principal: string, request: ServiceRequest, now: number): unknown {
    if (request.operation === 'hello') return { principal, protocol: 1, capabilities: ['rooms', 'shares', 'proposals', 'receipts'], limits: { events: 256, proposals: 128, rooms: 64, shares: 128, receipts: 1024 } };
    if (request.operation === 'receipt') { const data = object(request.data); keys(data, ['requestId']); return readReceipt(state, principal, data.requestId); }
    if (request.operation === 'begin') { this.checkPrincipals(object(request.data).acl); return beginRoom(state, principal, request.data, now); }
    if (request.operation === 'publish') { const acl = object(request.data).acl; requireValue(Array.isArray(acl)); this.checkPrincipals(Object.fromEntries(acl.map(name => [identifier(name), []]))); return publishShare(state, principal, request.data, now); }
    if (request.operation === 'read-share') return readShare(state, principal, request.data, now);
    if (request.operation === 'revoke-share' || request.operation === 'delete-share') return removeShare(state, principal, request.data, request.operation === 'delete-share');
    const room = findRoom(state, request);
    if (request.operation === 'room-plan') return roomPlan(room, principal, request.data, now);
    if (request.operation === 'join') { keys(object(request.data), []); return { roomId: room.id, epoch: room.epoch, generation: room.generation,
      binding: { sessionId: room.sessionId, sessionCreatedAt: room.sessionCreatedAt, projectId: room.projectId }, ticket: this.tickets.issue(room, principal, now), expiresAt: now + 60_000 }; }
    if (request.operation === 'lease') {
      const selected = object(request.data); keys(selected, ['binding', 'snapshot', 'epoch', 'aclRevision', 'generation']);
      requireValue(selected.epoch === room.epoch && selected.aclRevision === room.aclRevision && selected.generation === room.generation, 'stale');
      const result = takeLease(state, room, principal, selected.binding, now);
      const snapshot = decodeSnapshot(selected.snapshot); room.snapshot = { ...snapshot, cutover: room.sequence }; return result;
    }
    if (request.operation === 'frame') return hostFrame(room, principal, request, now);
    if (request.operation === 'poll') return pollRoom(room, principal, request, now, this.tickets);
    if (request.operation === 'renew') return renewRoom(room, principal, request, now);
    if (request.operation === 'acl') { this.checkPrincipals({ [identifier(object(request.data).principal)]: [] }); return changeAcl(room, principal, request, now); }
    if (request.operation === 'stop') return stopRoom(room, principal, request, now);
    if (request.operation === 'propose') return propose(room, principal, request, now, this.tickets);
    if (request.operation === 'inspect-proposal') return inspectProposal(room, principal, request, now);
    if (request.operation === 'claim') return claim(room, principal, request, now);
    if (request.operation === 'dispatch') return dispatchProposal(room, principal, request, now);
    if (request.operation === 'settle') return settleProposal(room, principal, request, now);
    requireValue(false);
  }
  private checkPrincipals(value: unknown): void {
    for (const principal of Object.keys(object(value))) requireValue(this.config.accounts.some(account => account.enabled && account.principal === principal), 'denied');
  }
}
export function decodeRequest(value: unknown): ServiceRequest {
  const record = object(value); keys(record, ['version', 'principal', 'operation', 'requestId', 'roomId', 'ticket', 'owner', 'data']);
  requireValue(record.version === 1 && typeof record.operation === 'string' && record.operation.length <= 32);
  return { version: 1, principal: identifier(record.principal), operation: record.operation, requestId: record.requestId as string | undefined,
    roomId: record.roomId as string | undefined, ticket: record.ticket as string | undefined, owner: decodeOwner(record.owner), data: record.data };
}

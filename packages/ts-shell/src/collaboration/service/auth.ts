import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { ServiceConfig } from './config.js';
import type { Room, Owner, Ticket, Right } from '../contract/model.js';
import { hashText, object, parseJson, requireValue, text } from '../contract/value.js';

export function authenticate(config: ServiceConfig, authorization: string | undefined): string {
  requireValue(typeof authorization === 'string' && authorization.startsWith('Bearer ') && authorization.length <= 256, 'denied');
  const token = authorization.slice(7); requireValue(/^[a-zA-Z0-9_-]{32,192}$/.test(token), 'denied');
  const hash = Buffer.from(hashText(token), 'hex');
  const account = config.accounts.find(candidate => candidate.enabled && timingSafeEqual(hash, Buffer.from(candidate.tokenHash, 'hex')));
  requireValue(account, 'denied'); return account.principal;
}
export function rights(room: Room, principal: string): readonly Right[] {
  return principal === room.owner ? ['observe', 'ask', 'control'] : room.acl[principal] ?? [];
}
export function assertRight(room: Room, principal: string, right: Right): void {
  requireValue(!room.closed && rights(room, principal).includes(right), 'denied');
}
export function assertOwner(room: Room, principal: string, owner: Owner | undefined, now: number): void {
  requireValue(room.owner === principal && !room.closed && owner && room.lease && room.lease.expiresAt > now
    && room.lease.generation === owner.generation && hashText(owner.token) === room.lease.tokenHash, 'stale');
}
export class Tickets {
  private readonly key = randomBytes(32);
  issue(room: Room, principal: string, now: number): string {
    assertRight(room, principal, 'observe');
    const value: Ticket = { version: 1, epoch: room.epoch, roomId: room.id, principal, aclRevision: room.aclRevision,
      sessionId: room.sessionId, sessionCreatedAt: room.sessionCreatedAt, projectId: room.projectId, expiresAt: now + 60_000 };
    const encoded = Buffer.from(JSON.stringify(value)).toString('base64url');
    return encoded + '.' + createHmac('sha256', this.key).update(encoded).digest('base64url');
  }
  check(token: unknown, room: Room, principal: string, now: number, right: Right = 'observe'): void {
    assertRight(room, principal, right);
    const parts = text(token, 2048).split('.'); requireValue(parts.length === 2, 'denied');
    const expected = createHmac('sha256', this.key).update(parts[0]!).digest(); const actual = Buffer.from(parts[1]!, 'base64url');
    requireValue(actual.length === expected.length && timingSafeEqual(actual, expected), 'denied');
    const value = object(parseJson(Buffer.from(parts[0]!, 'base64url').toString('utf8'), 2048));
    requireValue(value.version === 1 && value.epoch === room.epoch && value.roomId === room.id && value.principal === principal
      && value.sessionId === room.sessionId && value.sessionCreatedAt === room.sessionCreatedAt && value.projectId === room.projectId
      && value.aclRevision === room.aclRevision && Number(value.expiresAt) > now, 'stale');
  }
}

import { randomUUID } from 'node:crypto';
import type { ServiceState, Share } from '../contract/model.js';
import { identifier, integer, keys, object, requireValue } from '../contract/value.js';
import { decodeSnapshot } from '../contract/snapshot.js';
import { binding } from './rooms.js';

export function publishShare(state: ServiceState, principal: string, data: unknown, now: number): unknown {
  const selected = object(data); keys(selected, ['binding', 'snapshot', 'acl', 'ttl']);
  requireValue(state.shares.length < 128, 'capacity'); requireValue(Array.isArray(selected.acl) && selected.acl.length > 0 && selected.acl.length <= 32);
  const share: Share = { ...binding(selected.binding), id: randomUUID(), owner: principal, acl: [...new Set(selected.acl.map(identifier))],
    expiresAt: now + integer(selected.ttl, 60, 86400) * 1000, revision: 1, status: 'published', snapshot: decodeSnapshot(selected.snapshot) };
  state.shares.push(share); return { shareId: share.id, expiresAt: share.expiresAt, revision: share.revision, acl: share.acl };
}
export function readShare(state: ServiceState, principal: string, data: unknown, now: number): unknown {
  const selected = object(data); keys(selected, ['shareId']); const share = state.shares.find(item => item.id === identifier(selected.shareId));
  requireValue(share && share.status === 'published' && share.expiresAt > now && (share.owner === principal || share.acl.includes(principal)), 'denied');
  return { shareId: share.id, revision: share.revision, expiresAt: share.expiresAt, snapshot: share.snapshot };
}
export function removeShare(state: ServiceState, principal: string, data: unknown, deletion: boolean): unknown {
  const selected = object(data); keys(selected, ['shareId']); const share = state.shares.find(item => item.id === identifier(selected.shareId));
  requireValue(share && share.owner === principal, 'denied');
  share.status = deletion ? 'deleted' : 'revoked'; share.revision++; delete share.snapshot;
  return { shareId: share.id, revision: share.revision, status: share.status };
}

export const PROTOCOL_VERSION = 1;
export const SNAPSHOT_BYTES = 512 * 1024;
export const WIRE_BYTES = 768 * 1024;
export const STATE_BYTES = 8 * 1024 * 1024;
export type Right = 'observe' | 'ask' | 'control';
export interface Binding { sessionId: string; sessionCreatedAt: string; projectId: string }
export interface Snapshot {
  version: 1; consistency: 'partial'; cutover: number;
  entries: { id: string; role: 'user' | 'assistant' | 'tool' | 'system' | 'command'; content: string }[];
  warnings: string[];
}
export type EventKind = 'query.started' | 'turn.started' | 'turn.completed' | 'tool.started' | 'tool.settled'
  | 'approval.requested' | 'approval.approved' | 'approval.denied' | 'query.completed' | 'query.failed'
  | 'lifecycle.cancelled' | 'lifecycle.error' | 'relay.gap';
export interface RelayEvent { sequence: number; kind: EventKind; timestamp: number }
export interface Owner { generation: number; token: string }
export interface Lease { generation: number; tokenHash: string; expiresAt: number }
export interface Proposal {
  id: string; principal: string; kind: 'ask' | 'cancel'; text?: string; target?: string; digest: string;
  status: 'proposed' | 'accepted' | 'dispatched' | 'settled' | 'rejected' | 'unknown';
  createdAt: number; acceptanceId?: string; acceptedBy?: string; generation?: number;
  outcome?: 'completed' | 'failed' | 'cancelled' | 'unknown'; sourceEntryId?: string;
}
export interface Room extends Binding {
  id: string; owner: string; epoch: string; aclRevision: number; acl: Record<string, Right[]>;
  lease?: Lease; generation: number; closed: boolean; sequence: number; events: RelayEvent[]; snapshot: Snapshot;
  frameDigest?: string; proposals: Proposal[];
}
export interface Share extends Binding {
  id: string; owner: string; acl: string[]; expiresAt: number; revision: number;
  status: 'published' | 'revoked' | 'deleted'; snapshot?: Snapshot;
}
export interface Receipt {
  principal: string; operation: string; requestId: string; digest: string;
  status: 'intent' | 'committed' | 'unknown'; result?: unknown;
}
export interface ServiceState { version: 1; epoch: string; rooms: Room[]; shares: Share[]; receipts: Receipt[] }
export interface Ticket extends Binding {
  version: 1; epoch: string; roomId: string; principal: string; aclRevision: number; expiresAt: number;
}
export interface Acceptance extends Binding {
  version: 1; origin: string; epoch: string; roomId: string; principal: string; generation: number;
  proposalId: string; acceptanceId: string; digest: string; acceptedBy: string;
}
export interface ServiceRequest { version: 1; principal: string; operation: string; requestId?: string; roomId?: string;
  ticket?: string; owner?: Owner; data?: unknown }
export interface ServiceResponse { version: 1; epoch: string; principal: string; result: unknown }

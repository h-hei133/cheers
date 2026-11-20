export type Right = 'observe' | 'ask' | 'control';
export interface Binding { sessionId: string; sessionCreatedAt: string; projectId: string }
export interface Snapshot {
  version: 1; consistency: 'partial'; cutover: number;
  entries: { id: string; role: 'user' | 'assistant' | 'tool' | 'system' | 'command'; content: string }[];
  warnings: string[];
}
export type EventKind = 'query.started' | 'turn.started' | 'turn.completed' | 'tool.started' | 'tool.settled'
  | 'approval.requested' | 'approval.approved' | 'approval.denied' | 'query.completed' | 'query.completed_unproven' | 'query.failed'
  | 'lifecycle.cancelled' | 'lifecycle.error' | 'relay.gap';
export interface RelayEvent { sequence: number; kind: EventKind; timestamp: number }
export interface Owner { generation: number; token: string }
export interface Lease { generation: number; tokenHash: string; expiresAt: number }
export interface Proposal {
  id: string; principal: string; kind: 'ask' | 'cancel'; text?: string; target?: string; digest: string;
  status: 'proposed' | 'accepted' | 'dispatched' | 'settled' | 'rejected' | 'unknown';
  createdAt: number; acceptanceId?: string; acceptedBy?: string; generation?: number;
  outcome?: 'completed' | 'completed_unproven' | 'failed' | 'cancelled' | 'unknown'; sourceEntryId?: string;
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

export interface RelayFrame {
  readonly after: number;
  readonly events: RelayEvent[];
  readonly snapshot?: Snapshot;
}

export interface SnapshotSource {
  readonly entries: readonly { readonly id: string; readonly role: string; readonly content: string }[];
  readonly warnings: readonly unknown[];
}

export type RedactText = (text: string) => string;
export type RoomStreamFrame =
  | { readonly type: 'page'; readonly response: ServiceResponse }
  | { readonly type: 'heartbeat' }
  | { readonly type: 'error'; readonly code: CollaborationError['code'] };

export class CollaborationError extends Error {
  readonly code: 'invalid' | 'denied' | 'stale' | 'busy' | 'capacity' | 'gap' | 'unknown' | 'unavailable';
  constructor(code: CollaborationError['code']);
}

export const STATE_BYTES: number;
export const WIRE_BYTES: number;
export const ROOM_STREAM_TYPE: 'application/x-ndjson';
export const ROOM_STREAM_WINDOW_MS: 25000;

export function decodeAcl(value: unknown): Record<string, Right[]>;
export function decodeFrame(value: unknown, redact: RedactText): RelayFrame;
export function frameCutover(frame: RelayFrame): number;
export function decodeEvents(value: unknown): RelayEvent[];
export function decodeSnapshot(value: unknown, redact: RedactText): Snapshot;
export function projectSnapshot(payload: SnapshotSource, cutover: number, redact: RedactText): Snapshot;
export function requireValue(condition: unknown, code?: CollaborationError['code']): asserts condition;
export function object(value: unknown): Record<string, unknown>;
export function text(value: unknown, max?: number): string;
export function integer(value: unknown, min?: number, max?: number): number;
export function identifier(value: unknown): string;
export function uuid(value: unknown): string;
export function keys(value: Record<string, unknown>, names: readonly string[]): void;
export function digest(value: unknown): string;
export function hashText(value: string): string;
export function parseJson(source: string, maxBytes: number, maxNodes?: number): unknown;

import type { ServiceResponse } from './model.js';
import type { CollaborationError } from './value.js';

export const ROOM_STREAM_TYPE = 'application/x-ndjson';
export const ROOM_STREAM_WINDOW_MS = 25_000;

export type RoomStreamFrame =
  | { readonly type: 'page'; readonly response: ServiceResponse }
  | { readonly type: 'heartbeat' }
  | { readonly type: 'error'; readonly code: CollaborationError['code'] };

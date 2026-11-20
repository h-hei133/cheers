import * as acl from './acl.js';
import * as frame from './frame.js';
import * as model from './model.js';
import * as snapshot from './snapshot.js';
import * as stream from './stream.js';
import * as value from './value.js';

const protocol = {
  ...acl, ...frame, STATE_BYTES: model.STATE_BYTES, WIRE_BYTES: model.WIRE_BYTES, ...snapshot, ...stream, ...value,
} satisfies typeof import('../api.d.ts');

export const {
  decodeAcl, decodeEvents, decodeFrame, decodeSnapshot, digest, frameCutover, hashText, identifier, integer,
  keys, object, parseJson, projectSnapshot, ROOM_STREAM_TYPE, ROOM_STREAM_WINDOW_MS, STATE_BYTES, text, uuid, WIRE_BYTES,
} = protocol;
export { CollaborationError, requireValue } from './value.js';
export type {
  Acceptance, Binding, EventKind, Owner, Proposal, Receipt, RedactText, RelayEvent, RelayFrame, Right, Room,
  RoomStreamFrame, ServiceRequest, ServiceResponse, ServiceState, Share, Snapshot, SnapshotSource, Ticket,
} from '../api.d.ts';

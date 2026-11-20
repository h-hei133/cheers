import path from 'node:path';
import { currentProfile } from '../../core/paths/profile/context.js';
import { userDataDir } from '../../core/paths/userHome.js';
import { frameCutover, type RelayFrame, type Binding, digest, integer, keys, object, requireValue } from '@cheers/collaboration';
import { decodeFrame } from '../snapshot.js';
import { readRelayRecord, saveRelayRecord } from '../storage/record.js';

interface OutboxIdentity {
  readonly origin: string;
  readonly principal: string;
  readonly roomId: string;
  readonly binding: Binding;
  readonly epoch: string;
  readonly generation: number;
}

interface OutboxRecord {
  readonly version: 1;
  readonly identity: OutboxIdentity;
  readonly sequence: number;
  readonly frame?: RelayFrame;
}

/** One immutable frame may wait for its acknowledgement. Lease tokens stay in memory. */
export class HostOutbox {
  private readonly profile = currentProfile();
  private readonly target: string;
  private baseline: unknown;
  private record: OutboxRecord;

  constructor(identity: OutboxIdentity, sequence: number) {
    const { origin, principal, roomId } = identity;
    this.target = path.resolve(userDataDir(), 'collaboration', 'outbox', digest([origin, principal, roomId]) + '.json');
    this.baseline = readRelayRecord(this.target, this.profile);
    this.record = { version: 1, identity, sequence };
    if (this.baseline === undefined) return;

    const saved = object(this.baseline); keys(saved, ['version', 'identity', 'sequence', 'frame']);
    requireValue(saved.version === 1);
    const prior = object(saved.identity);
    requireValue(digest(prior.binding) === digest(identity.binding) && prior.origin === origin
      && prior.principal === principal && prior.roomId === roomId, 'stale');
    const generation = integer(prior.generation, 1);
    if (prior.epoch !== identity.epoch || generation !== identity.generation) {
      requireValue(generation < identity.generation, 'stale');
      // Acquiring a new lease already supplies a fresh approved snapshot. Old pending bytes cannot follow it.
      this.publish(this.record);
      return;
    }

    const after = integer(saved.sequence);
    const frame = saved.frame === undefined ? undefined : decodeFrame(saved.frame);
    requireValue(!frame || (frame.after === after && (frame.events.length > 0 || frame.snapshot)), 'gap');
    requireValue(sequence === after || (frame && sequence === frameCutover(frame)), 'gap');
    this.record = { version: 1, identity, sequence: after, ...(frame ? { frame } : {}) };
  }

  get sequence(): number { return this.record.sequence; }

  pending(): RelayFrame | undefined {
    if (this.record.frame) requireValue(digest(readRelayRecord(this.target, this.profile)) === digest(this.baseline), 'stale');
    return this.record.frame;
  }

  stage(input: RelayFrame): RelayFrame {
    const frame = decodeFrame(input);
    requireValue(!this.record.frame && frame.after === this.sequence && (frame.events.length > 0 || frame.snapshot), 'gap');
    this.publish({ ...this.record, frame });
    return frame;
  }

  acknowledge(frame: RelayFrame, reply: unknown): void {
    const { sequence, frameDigest } = object(reply);
    requireValue(this.record.frame === frame && sequence === frameCutover(frame)
      && (frameDigest === undefined || frameDigest === digest(frame)), 'gap');
    this.publish({ version: 1, identity: this.record.identity, sequence });
  }

  private publish(record: OutboxRecord): void {
    saveRelayRecord(this.target, this.baseline, record, this.profile);
    this.baseline = this.record = record;
  }
}

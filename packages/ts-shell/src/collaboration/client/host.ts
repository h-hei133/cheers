import type { QueryEvent } from '../../core/query/runtime/events.js';
import { CollaborationError, frameCutover, integer, object, requireValue, text,
  type Binding, type Owner, type Proposal, type RelayEvent, type Snapshot } from '@cheers/collaboration';
import { CollaborationClient } from './service.js';
import { projectEvent } from './events.js';
import { HostOutbox } from './outbox.js';

export interface HostPorts {
  observe(callback: (event: QueryEvent) => void): () => void;
  snapshot(cutover: number): Snapshot;
  current(): boolean;
  invalid(): void;
  updated(proposals: readonly Omit<Proposal, 'text'>[], expiresAt: number): void;
}
/** A bounded local observer; network and snapshot work never run in the query callback. */
export class CollaborationHost {
  readonly roomId: string;
  readonly epoch: string;
  readonly owner: Owner;
  private readonly initialSequence: number;
  private outbox?: HostOutbox;
  private readonly queued: Omit<RelayEvent, 'sequence'>[] = [];
  private dirty = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;
  private closed = false;
  private failed = false;
  private busy = false;
  private leaseUntil: number;
  constructor(readonly client: CollaborationClient, readonly bound: Binding, result: unknown, private readonly ports: HostPorts) {
    const selected = object(result); this.roomId = text(selected.roomId, 128); this.epoch = text(selected.epoch, 36);
    const owner = object(selected.owner); this.owner = { generation: integer(owner.generation, 1), token: text(owner.token, 64) };
    this.initialSequence = integer(selected.sequence); this.leaseUntil = integer(selected.expiresAt);
  }
  start(): void {
    this.unsubscribe = this.ports.observe(event => {
      try {
        if (this.closed || this.failed || !this.ports.current()) return;
        if (event.type === 'query.completed' || event.type === 'query.completed_unproven' || event.type === 'query.failed' || event.type === 'lifecycle.cancelled') this.dirty++;
        const projected = projectEvent(event, Date.now()); if (!projected) return;
        if (this.queued.length >= 127) {
          if (this.queued.length === 127) this.queued.push({ ...projected, kind: 'relay.gap' });
          this.dirty++;
        } else this.queued.push(projected);
      } catch { this.fail(); }
    });
    this.timer = setTimeout(() => { void this.tick(); }, 250);
  }
  check(): void { requireValue(!this.closed && !this.failed && this.ports.current() && Date.now() < this.leaseUntil, 'stale'); this.client.profile.check(); }
  status(): string { return this.closed ? 'stopped' : this.failed || Date.now() >= this.leaseUntil ? 'disconnected' : 'hosting'; }
  async request(operation: string, data: unknown, mutation = true, signal?: AbortSignal) {
    this.check(); const response = await this.client.request(operation, { roomId: this.roomId, owner: this.owner, data }, mutation, signal);
    requireValue(!this.closed && !this.failed && response.epoch === this.epoch && this.ports.current(), 'stale'); return response;
  }
  async close(remote = true, signal?: AbortSignal): Promise<void> {
    let failure: unknown;
    try { if (remote && !this.closed) await this.request('stop', {}, true, signal); } catch (error) { failure = error; }
    finally { this.closed = true; clearTimeout(this.timer); this.unsubscribe?.(); this.ports.invalid(); }
    if (failure) throw failure;
  }
  private async tick(): Promise<void> {
    if (this.busy || this.closed || this.failed) return;
    this.busy = true;
    try {
      const renewed = await this.requestForTick('renew', {});
      if (!renewed) return;
      const renewal = object(renewed.result); const expiresAt = integer(renewal.expiresAt);
      requireValue(expiresAt > Date.now() && renewal.generation === this.owner.generation, 'stale');
      requireValue(Array.isArray(renewal.proposals));
      this.leaseUntil = expiresAt;
      this.ports.updated(renewal.proposals as Omit<Proposal, 'text'>[], this.leaseUntil);
      const sequence = integer(renewal.sequence, this.initialSequence);
      const outbox = this.outbox ??= new HostOutbox({ origin: this.client.profile.origin, principal: this.client.profile.principal,
        roomId: this.roomId, binding: this.bound, epoch: this.epoch, generation: this.owner.generation }, sequence);
      const pending = outbox.pending();
      requireValue(sequence === outbox.sequence || (pending && sequence === frameCutover(pending)), 'gap');
      const frame = pending ?? this.stage(outbox);
      if (!frame) return;
      const reply = await this.requestForTick('frame', frame);
      if (reply) outbox.acknowledge(frame, reply.result);
    } catch { this.fail(); }
    finally { this.busy = false; if (!this.closed && !this.failed) this.timer = setTimeout(() => { void this.tick(); }, 500); }
  }
  private async requestForTick(operation: 'renew' | 'frame', data: unknown) {
    try { return await this.request(operation, data, false); }
    catch (error) {
      if (!(error instanceof CollaborationError) || error.code !== 'unavailable') throw error;
      // The next tick may renew and resend the persisted frame only within this lease.
      this.check();
      return undefined;
    }
  }
  private stage(outbox: HostOutbox) {
    if (!this.queued.length && !this.dirty) return undefined;
    const after = outbox.sequence; const revision = this.dirty;
    const events = this.queued.map((event, index) => ({ ...event, sequence: after + index + 1 }));
    const cutover = events.at(-1)?.sequence ?? after;
    const source = revision ? this.ports.snapshot(cutover) : undefined;
    const snapshot = source && events.some(event => event.kind === 'relay.gap')
      ? { ...source, warnings: [...source.warnings.slice(0, 15), 'Some live events were omitted before this snapshot.'] }
      : source;
    this.check();
    const frame = outbox.stage({ after, events, ...(snapshot ? { snapshot } : {}) });
    this.queued.splice(0, events.length);
    if (this.dirty === revision) this.dirty = 0;
    return frame;
  }
  private fail(): void {
    if (this.closed || this.failed) return;
    this.failed = true; clearTimeout(this.timer);
    try { this.unsubscribe?.(); } catch { /* The failed observer cannot escape into the query path. */ }
    this.unsubscribe = undefined;
    try { this.ports.invalid(); } catch { /* Admission remains failed even if a local cancellation observer fails. */ }
  }
}

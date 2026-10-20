import type { QueryEvent } from '../../core/query/runtime/events.js';
import type { Binding, Owner, Proposal, RelayEvent, Snapshot } from '../contract/model.js';
import { integer, object, requireValue, text } from '../contract/value.js';
import { CollaborationClient } from './service.js';
import { projectEvent } from './events.js';

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
  private sequence: number;
  private queued: RelayEvent[] = [];
  private dirty = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private unsubscribe?: () => void;
  private closed = false;
  private failed = false;
  private busy = false;
  private leaseUntil: number;
  private dropped = false;
  constructor(readonly client: CollaborationClient, readonly bound: Binding, result: unknown, private readonly ports: HostPorts) {
    const selected = object(result); this.roomId = text(selected.roomId, 128); this.epoch = text(selected.epoch, 36);
    const owner = object(selected.owner); this.owner = { generation: integer(owner.generation, 1), token: text(owner.token, 64) };
    this.sequence = integer(selected.sequence); this.leaseUntil = integer(selected.expiresAt);
  }
  start(): void {
    this.unsubscribe = this.ports.observe(event => {
      try {
        if (this.closed || this.failed || !this.ports.current()) return;
        if (event.type === 'query.completed' || event.type === 'query.failed' || event.type === 'lifecycle.cancelled') this.dirty++;
        const projected = projectEvent(event, this.sequence + this.queued.length + 1, Date.now()); if (!projected) return;
        if (this.queued.length >= 127) {
          if (!this.dropped && this.queued.length === 127) { this.queued.push({ ...projected, kind: 'relay.gap' }); this.dropped = true; }
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
      this.check(); const renewal = object((await this.request('renew', {}, false)).result);
      this.leaseUntil = integer(renewal.expiresAt); requireValue(renewal.generation === this.owner.generation && Array.isArray(renewal.proposals));
      this.ports.updated(renewal.proposals as Omit<Proposal, 'text'>[], this.leaseUntil);
      const events = this.queued.slice(); const cutover = events.at(-1)?.sequence ?? this.sequence;
      if (events.length || this.dirty) {
        const revision = this.dirty; const snapshot = revision ? this.ports.snapshot(cutover) : undefined; const count = events.length;
        const published = object((await this.request('frame', { after: this.sequence, events, ...(snapshot ? { snapshot } : {}) }, false)).result);
        requireValue(published.sequence === cutover, 'gap'); this.sequence = cutover; this.queued.splice(0, count); this.dropped = false;
        if (snapshot && this.dirty === revision) this.dirty = 0;
      }
    } catch { this.fail(); }
    finally { this.busy = false; if (!this.closed && !this.failed) this.timer = setTimeout(() => { void this.tick(); }, 500); }
  }
  private fail(): void {
    if (this.closed || this.failed) return;
    this.failed = true; clearTimeout(this.timer);
    try { this.unsubscribe?.(); } catch { /* The failed observer cannot escape into the query path. */ }
    this.unsubscribe = undefined;
    try { this.ports.invalid(); } catch { /* Admission remains failed even if a local cancellation observer fails. */ }
  }
}

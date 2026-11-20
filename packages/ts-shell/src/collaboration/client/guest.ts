import { type Binding, type ServiceResponse, ROOM_STREAM_WINDOW_MS, CollaborationError, digest, integer, object, requireValue, text } from '@cheers/collaboration';
import { CollaborationClient } from './service.js';
import { currentProfile } from '../../core/paths/profile/context.js';
import { readRelayRecord, saveRelayRecord } from '../storage/record.js';
import { applyPage, cursorPath, restoreProjection, type CursorProjection } from './cursor.js';

interface CursorRecord extends CursorProjection { version: 1; origin: string; principal: string; roomId: string; epoch: string;
  binding: Binding; generation: number }
export class CollaborationGuest {
  private readonly profileContext = currentProfile();
  readonly roomId: string;
  readonly epoch: string;
  private readonly target: string;
  private readonly binding: Binding;
  private readonly streaming: boolean;
  private ticket: string;
  private expiresAt: number;
  private record: CursorRecord;
  private baseline: unknown;
  private pending = false;
  private closed = false;
  private failed = false;
  private started = false;
  private reconnecting = false;
  private retryDelay = 250;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly controller = new AbortController();
  constructor(readonly client: CollaborationClient, localIdentity: string, result: unknown, private readonly current: () => boolean) {
    const selected = object(result); this.roomId = text(selected.roomId, 128); this.epoch = text(selected.epoch, 36);
    this.streaming = selected.stream === 1;
    const bound = object(selected.binding); this.binding = { sessionId: text(bound.sessionId, 128), sessionCreatedAt: text(bound.sessionCreatedAt, 64), projectId: text(bound.projectId, 64) };
    this.ticket = text(selected.ticket, 2048); this.expiresAt = integer(selected.expiresAt);
    this.target = cursorPath(client.profile.origin, client.profile.principal, this.roomId, localIdentity);
    this.baseline = readRelayRecord(this.target, this.profileContext);
    const generation = integer(selected.generation, 1);
    this.record = { version: 1, origin: client.profile.origin, principal: client.profile.principal, roomId: this.roomId, epoch: this.epoch,
      binding: this.binding, generation, cursor: 0, events: [], gap: this.baseline !== undefined };
    if (this.baseline) {
      const saved = object(this.baseline);
      if (saved.version === 1 && saved.origin === this.record.origin && saved.principal === this.record.principal && saved.roomId === this.roomId
        && saved.epoch === this.epoch && saved.generation === generation && digest(saved.binding) === digest(this.binding)) {
        this.record = { ...this.record, ...restoreProjection(saved) };
      }
    }
  }
  start(): void {
    if (this.started || !this.active()) return;
    this.started = true; this.timer = setTimeout(() => { void this.tick(); }, 100);
  }
  close(): void { this.closed = true; this.controller.abort(); clearTimeout(this.timer); }
  status(): string { return this.closed ? 'left' : !this.active() ? 'disconnected' : this.reconnecting ? 'reconnecting' : 'observing'; }
  view(): unknown { return { status: this.status(), ...structuredClone(this.record) }; }
  async propose(kind: 'ask' | 'cancel', value: string, parent?: AbortSignal): Promise<unknown> {
    const signal = parent ? AbortSignal.any([this.controller.signal, parent]) : this.controller.signal;
    requireValue(this.active(), 'stale');
    await this.refreshTicket(signal);
    signal.throwIfAborted(); requireValue(this.active(), 'stale');
    const result = await this.client.request('propose', { roomId: this.roomId, ticket: this.ticket,
      data: kind === 'ask' ? { kind, text: value } : { kind, target: value } }, true, signal);
    requireValue(result.epoch === this.epoch && this.active(), 'stale'); return result.result;
  }
  async poll(parent?: AbortSignal): Promise<void> {
    requireValue(this.active() && !this.pending, 'busy'); this.pending = true;
    try {
      const signal = parent ? AbortSignal.any([this.controller.signal, parent]) : this.controller.signal;
      await this.refreshTicket(signal);
      signal.throwIfAborted(); requireValue(this.active(), 'stale');
      const response = await this.client.request('poll', { roomId: this.roomId, ticket: this.ticket, data: { after: this.record.cursor } }, false, signal);
      this.apply(response, signal);
    } finally { this.pending = false; }
  }
  private async refreshTicket(signal: AbortSignal, remainingMs = 2_000): Promise<void> {
    if (Date.now() < this.expiresAt - remainingMs) return;
    const response = await this.client.request('join', { roomId: this.roomId, data: {} }, false, signal);
    const selected = object(response.result);
    signal.throwIfAborted();
    requireValue(this.active() && response.epoch === this.epoch && selected.epoch === this.epoch && selected.roomId === this.roomId
      && selected.generation === this.record.generation && digest(selected.binding) === digest(this.binding), 'stale');
    this.ticket = text(selected.ticket, 2048); this.expiresAt = integer(selected.expiresAt);
  }
  private active(): boolean {
    try { return !this.closed && !this.failed && this.current(); } catch { return false; }
  }
  private apply(response: ServiceResponse, signal: AbortSignal): void {
    signal.throwIfAborted();
    requireValue(response.epoch === this.epoch && this.active(), 'stale');
    const page = object(response.result); requireValue(page.roomId === this.roomId && page.epoch === this.epoch);
    requireValue(integer(page.generation, 1) === this.record.generation, 'gap');
    const next: CursorRecord = { ...this.record, ...applyPage(this.record, page) };
    if (digest(next) !== digest(this.baseline)) saveRelayRecord(this.target, this.baseline, next, this.profileContext);
    this.baseline = next; this.record = next;
  }
  private async followStream(): Promise<void> {
    requireValue(this.active() && !this.pending, 'busy'); this.pending = true;
    const signal = this.controller.signal;
    try {
      await this.refreshTicket(signal, ROOM_STREAM_WINDOW_MS + 5_000);
      signal.throwIfAborted(); requireValue(this.active(), 'stale');
      for await (const response of this.client.stream({ roomId: this.roomId, ticket: this.ticket, epoch: this.epoch,
        generation: this.record.generation, after: this.record.cursor }, signal)) {
        requireValue(this.active(), 'stale');
        if (response) this.apply(response, signal);
        this.reconnecting = false;
      }
    } finally { this.pending = false; }
  }
  private async tick(): Promise<void> {
    if (!this.active()) return;
    const started = Date.now();
    try {
      if (this.streaming) await this.followStream(); else await this.poll();
    } catch (error) {
      if (!this.streaming || !(error instanceof CollaborationError) || error.code !== 'unavailable') this.failed = true;
    }
    if (!this.active()) return;
    if (this.streaming) {
      this.reconnecting = true;
      if (Date.now() - started >= 10_000) this.retryDelay = 250;
    }
    this.timer = setTimeout(() => { void this.tick(); }, this.streaming ? this.retryDelay : 500);
    if (this.streaming) this.retryDelay = Math.min(4_000, this.retryDelay * 2);
  }
}

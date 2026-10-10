import type { Binding, RelayEvent, Snapshot } from '../contract/model.js';
import { CollaborationClient } from './service.js';
import { cursorPath, readCursor, saveCursor } from './cursor.js';
import { digest, integer, object, requireValue, text } from '../contract/value.js';
import { decodeEvents, decodeSnapshot } from '../contract/snapshot.js';

interface CursorRecord { version: 1; origin: string; principal: string; roomId: string; epoch: string;
  binding: Binding; generation: number; cursor: number; events: RelayEvent[]; snapshot?: Snapshot; gap: boolean }
export class CollaborationGuest {
  readonly roomId: string;
  readonly epoch: string;
  private readonly target: string;
  private readonly binding: Binding;
  private ticket: string;
  private expiresAt: number;
  private record: CursorRecord;
  private baseline: unknown;
  private pending = false;
  private closed = false;
  private failed = false;
  private timer?: ReturnType<typeof setTimeout>;
  private readonly controller = new AbortController();
  constructor(readonly client: CollaborationClient, localIdentity: string, result: unknown, private readonly current: () => boolean) {
    const selected = object(result); this.roomId = text(selected.roomId, 128); this.epoch = text(selected.epoch, 36);
    const bound = object(selected.binding); this.binding = { sessionId: text(bound.sessionId, 128), sessionCreatedAt: text(bound.sessionCreatedAt, 64), projectId: text(bound.projectId, 64) };
    this.ticket = text(selected.ticket, 2048); this.expiresAt = integer(selected.expiresAt);
    this.target = cursorPath(client.profile.origin, client.profile.principal, this.roomId, localIdentity); this.baseline = readCursor(this.target);
    const generation = integer(selected.generation, 1);
    this.record = { version: 1, origin: client.profile.origin, principal: client.profile.principal, roomId: this.roomId, epoch: this.epoch,
      binding: this.binding, generation, cursor: 0, events: [], gap: this.baseline !== undefined };
    if (this.baseline) {
      const saved = object(this.baseline);
      if (saved.version === 1 && saved.origin === this.record.origin && saved.principal === this.record.principal && saved.roomId === this.roomId
        && saved.epoch === this.epoch && saved.generation === generation && digest(saved.binding) === digest(this.binding)) {
        this.record = { ...this.record, generation: integer(saved.generation), cursor: integer(saved.cursor), events: decodeEvents(saved.events),
          ...(saved.snapshot ? { snapshot: decodeSnapshot(saved.snapshot) } : {}), gap: saved.gap === true };
      }
    }
  }
  start(): void { this.timer = setTimeout(() => { void this.tick(); }, 100); }
  close(): void { this.closed = true; this.controller.abort(); clearTimeout(this.timer); }
  status(): string { return this.closed ? 'left' : this.failed || !this.current() ? 'disconnected' : 'observing'; }
  view(): unknown { return { status: this.status(), ...this.record }; }
  async propose(kind: 'ask' | 'cancel', value: string): Promise<unknown> {
    requireValue(!this.closed && !this.failed && this.current(), 'stale');
    await this.refreshTicket();
    const result = await this.client.request('propose', { roomId: this.roomId, ticket: this.ticket,
      data: kind === 'ask' ? { kind, text: value } : { kind, target: value } }, true, this.controller.signal);
    requireValue(result.epoch === this.epoch && this.current(), 'stale'); return result.result;
  }
  async poll(): Promise<void> {
    requireValue(!this.closed && !this.failed && this.current() && !this.pending, 'busy'); this.pending = true;
    try {
      await this.refreshTicket();
      const response = await this.client.request('poll', { roomId: this.roomId, ticket: this.ticket, data: { after: this.record.cursor } }, false, this.controller.signal);
      requireValue(response.epoch === this.epoch && this.current() && !this.closed, 'stale');
      const page = object(response.result); requireValue(page.roomId === this.roomId && page.epoch === this.epoch);
      const generation = integer(page.generation); requireValue(this.record.generation === 0 || generation === this.record.generation, 'gap');
      const events = decodeEvents(page.events); const cursor = integer(page.cursor); const sequence = integer(page.sequence);
      requireValue(cursor >= this.record.cursor && cursor <= sequence && (events.at(-1)?.sequence ?? this.record.cursor) === cursor);
      let previous = this.record.cursor; let gap = this.record.gap || page.gap === true;
      for (const event of events) { requireValue(event.sequence > previous && event.sequence <= sequence); if (event.sequence !== previous + 1) gap = true; previous = event.sequence; }
      const snapshot = page.snapshot === undefined ? this.record.snapshot : decodeSnapshot(page.snapshot);
      if (snapshot) requireValue(snapshot.cutover <= sequence);
      const next: CursorRecord = { ...this.record, generation, cursor, gap: gap || events.some(event => event.kind === 'relay.gap'),
        events: [...this.record.events, ...events].slice(-128), ...(snapshot ? { snapshot } : {}) };
      if (digest(next) !== digest(this.baseline)) saveCursor(this.target, this.baseline, next);
      this.baseline = next; this.record = next;
    } finally { this.pending = false; }
  }
  private async refreshTicket(): Promise<void> {
    if (Date.now() < this.expiresAt - 2_000) return;
    const response = await this.client.request('join', { roomId: this.roomId, data: {} }, false, this.controller.signal);
    const selected = object(response.result); requireValue(response.epoch === this.epoch && digest(selected.binding) === digest(this.binding), 'stale');
    this.ticket = text(selected.ticket, 2048); this.expiresAt = integer(selected.expiresAt);
  }
  private async tick(): Promise<void> {
    if (this.closed || this.failed) return;
    try { await this.poll(); } catch { this.failed = true; }
    if (!this.closed && !this.failed) this.timer = setTimeout(() => { void this.tick(); }, 500);
  }
}

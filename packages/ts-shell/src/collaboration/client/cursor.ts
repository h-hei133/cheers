import path from 'node:path';
import { resolveUserDataFile } from '../../core/paths/userHome.js';
import type { RelayEvent, Snapshot } from '../contract/model.js';
import { decodeEvents, decodeSnapshot } from '../contract/snapshot.js';
import { digest, integer, requireValue } from '../contract/value.js';

export function cursorPath(origin: string, principal: string, roomId: string, localIdentity: string): string {
  return resolveUserDataFile(path.join('collaboration', 'cursors', digest([origin, principal, roomId, localIdentity]) + '.json'));
}

export interface CursorProjection {
  readonly cursor: number;
  readonly events: RelayEvent[];
  readonly snapshot?: Snapshot;
  readonly gap: boolean;
}

/** Old receipts may contain deltas that their own snapshot already superseded. */
export function restoreProjection(saved: Record<string, unknown>): CursorProjection {
  const snapshot = saved.snapshot === undefined ? undefined : decodeSnapshot(saved.snapshot);
  const cursor = Math.max(integer(saved.cursor), snapshot?.cutover ?? 0);
  const events = decodeEvents(saved.events).filter(event => event.sequence > (snapshot?.cutover ?? 0));
  requireValue(events.every((event, index) => event.sequence <= cursor && (!index || event.sequence > events[index - 1]!.sequence)), 'gap');
  return { cursor, events, ...(snapshot ? { snapshot } : {}), gap: saved.gap === true };
}

/** Replace covered history and fold only the bounded suffix of a confirmed page. */
export function applyPage(previous: CursorProjection, page: Record<string, unknown>): CursorProjection {
  const limit = integer(page.sequence, previous.cursor);
  const events = decodeEvents(page.events);
  const cursor = integer(page.cursor, 0, limit);
  requireValue(cursor === (events.at(-1)?.sequence ?? previous.cursor), 'gap');
  requireValue(events.every((event, index) => !index || event.sequence > events[index - 1]!.sequence), 'gap');

  const snapshot = page.snapshot === undefined ? undefined : decodeSnapshot(page.snapshot);
  requireValue(!snapshot || snapshot.cutover <= limit, 'gap');
  const replacement = snapshot && snapshot.cutover >= previous.cursor && digest(snapshot) !== digest(previous.snapshot) ? snapshot : undefined;
  const base = replacement?.cutover ?? previous.cursor;
  let gap = replacement ? false : previous.gap || page.gap === true;
  let sequence = base;
  const suffix: RelayEvent[] = [];
  for (const event of events) {
    if (event.sequence <= base) {
      const seen = !replacement && previous.events.find(prior => prior.sequence === event.sequence);
      requireValue(!seen || (seen.kind === event.kind && seen.timestamp === event.timestamp), 'gap');
      continue;
    }
    gap ||= event.sequence !== sequence + 1 || event.kind === 'relay.gap';
    sequence = event.sequence;
    suffix.push(event);
  }
  const retained = replacement ?? previous.snapshot;
  return { cursor: sequence, gap, events: [...(replacement ? [] : previous.events), ...suffix].slice(-128),
    ...(retained ? { snapshot: retained } : {}) };
}

import type { RedactText, RelayFrame } from '../api.d.ts';
import { decodeEvents, decodeSnapshot } from './snapshot.js';
import { integer, keys, object, requireValue } from './value.js';

export function frameCutover(frame: RelayFrame): number {
  return frame.events.at(-1)?.sequence ?? frame.after;
}

export function decodeFrame(value: unknown, redact: RedactText): RelayFrame {
  const selected = object(value); keys(selected, ['after', 'events', 'snapshot']);
  const after = integer(selected.after); const events = decodeEvents(selected.events);
  requireValue(events.every((event, index) => event.sequence === after + index + 1), 'gap');
  if (selected.snapshot === undefined) return { after, events };
  const snapshot = decodeSnapshot(selected.snapshot, redact);
  requireValue(snapshot.cutover === (events.at(-1)?.sequence ?? after), 'gap');
  return { after, events, snapshot };
}

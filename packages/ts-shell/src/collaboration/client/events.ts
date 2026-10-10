import type { QueryEvent } from '../../core/query/runtime/events.js';
import type { EventKind, RelayEvent } from '../contract/model.js';

/** Deliberately omit all strings from the runtime except the fixed event discriminator. */
export function projectEvent(event: QueryEvent, sequence: number, timestamp: number): RelayEvent | undefined {
  let kind: EventKind | undefined;
  switch (event.type) {
    case 'query.started': case 'turn.started': case 'turn.completed': case 'tool.started': case 'tool.settled':
    case 'approval.requested': case 'query.completed': case 'query.failed': case 'lifecycle.cancelled': case 'lifecycle.error': kind = event.type; break;
    case 'approval.resolved': kind = event.outcome === 'approved' ? 'approval.approved' : 'approval.denied'; break;
  }
  return kind ? { sequence, kind, timestamp } : undefined;
}

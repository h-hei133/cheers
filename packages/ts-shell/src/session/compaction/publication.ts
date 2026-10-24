import type { TranscriptEvent, CompactionTranscriptEntry } from '../sessionEventCodec.js';
import { digest } from './state.js';

export function compactionPublicationDigest(event: CompactionTranscriptEntry): string {
  return digest(event);
}

/** New prepared summaries remain inert until a later matching durable verification marker. */
export function publishedCompactionEvents(events: readonly TranscriptEvent[], signal?: AbortSignal): readonly TranscriptEvent[] {
  signal?.throwIfAborted();
  const prepared = new Map<string, CompactionTranscriptEntry>();
  const proofs = new Map<string, Extract<TranscriptEvent, { type: 'compaction-commit' }>>();
  const ambiguous = new Set<string>();
  const seen = new Set<string>();
  for (let index = 0; index < events.length; index++) {
    if ((index & 255) === 0) signal?.throwIfAborted();
    const event = events[index]!;
    if (event.id) {
      if (seen.has(event.id)) ambiguous.add(event.id);
      seen.add(event.id);
    }
    if (event.type === 'compaction' && event.publication === 'prepared' && event.id) {
      prepared.set(event.id, event);
    }
    if (event.type === 'compaction-commit') {
      const original = prepared.get(event.compactionId);
      if (!original || proofs.has(event.compactionId) || compactionPublicationDigest(original) !== event.digest) {
        ambiguous.add(event.compactionId);
      }
      proofs.set(event.compactionId, event);
    }
  }
  signal?.throwIfAborted();
  return events.filter((event, index) => {
    if ((index & 255) === 0) signal?.throwIfAborted();
    return event.type !== 'compaction' || event.publication !== 'prepared'
      || (event.id !== undefined && !ambiguous.has(event.id) && prepared.get(event.id) === event
        && proofs.has(event.id) && !ambiguous.has(proofs.get(event.id)!.id));
  });
}

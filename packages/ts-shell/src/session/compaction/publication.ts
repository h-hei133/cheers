import type { TranscriptEvent, CompactionTranscriptEntry } from '../sessionEventCodec.js';
import { digest } from './state.js';

export function compactionPublicationDigest(event: CompactionTranscriptEntry): string {
  return digest(event);
}

/** New prepared summaries remain inert until a later matching durable verification marker. */
export function publishedCompactionEvents(events: readonly TranscriptEvent[]): readonly TranscriptEvent[] {
  const prepared = new Map<string, CompactionTranscriptEntry>();
  const proofs = new Map<string, Extract<TranscriptEvent, { type: 'compaction-commit' }>>();
  const ambiguous = new Set<string>();
  const seen = new Set<string>();
  for (const event of events) {
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
  return events.filter(event => event.type !== 'compaction' || event.publication !== 'prepared'
    || (event.id !== undefined && !ambiguous.has(event.id) && prepared.get(event.id) === event
      && proofs.has(event.id) && !ambiguous.has(proofs.get(event.id)!.id)));
}

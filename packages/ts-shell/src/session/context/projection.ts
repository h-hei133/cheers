import type { TranscriptEvent } from '../sessionEventCodec.js';
import type { Session } from '../schema/sessionRecord.js';
import type { SessionThreadEntry, SessionThreadSnapshot } from '../schema/sessionThread.js';
import type { SessionMessage } from '../schema/sessionMessage.js';
import { annotationTargetDigest, isAnnotationKind, isEditableMessage, type ModelContextEdit, type SessionLabel } from './annotations.js';
import { contextMessageHash } from './selection.js';

/** A standalone transcript event gains authority only through its real thread node. */
export function projectSessionAnnotations(events: readonly TranscriptEvent[], thread: SessionThreadSnapshot | undefined,
  path: readonly SessionThreadEntry[] | undefined, turns: readonly SessionMessage[], signal?: AbortSignal): Pick<Session, 'contextEdits' | 'labels'> {
  if (!path) {
    if (thread?.entries.some(entry => isAnnotationKind(entry.kind))) throw new Error('Saved annotation ancestry is unavailable.');
    return {};
  }
  if (!path.some(entry => isAnnotationKind(entry.kind))) return {};
  const indexed = new Map<string, { readonly index: number; readonly event: TranscriptEvent }>();
  const duplicates = new Set<string>();
  for (const [index, event] of events.entries()) {
    if ((index & 255) === 0) signal?.throwIfAborted();
    if (!event.id) continue;
    if (indexed.has(event.id)) duplicates.add(event.id);
    indexed.set(event.id, { index, event });
  }
  const preceding = new Set<string>();
  const edits = new Map<string, ModelContextEdit>(), labels = new Map<string, SessionLabel>();
  const retained = new Map(turns.map(message => [message.id, message]));
  for (const [index, node] of path.entries()) {
    if ((index & 255) === 0) signal?.throwIfAborted();
    if (isAnnotationKind(node.kind)) {
      const candidate = indexed.get(node.id), event = candidate?.event;
      if (!candidate || !event || (event.type !== 'context-edit' && event.type !== 'label') || event.type !== node.kind
        || event.parentId !== node.parentId || event.timestamp !== node.timestamp || duplicates.has(node.id)) {
        throw new Error('Saved annotation is unavailable.');
      }
      const source = indexed.get(event.targetId);
      if (!source || source.event.type !== 'message' || source.index >= candidate.index || duplicates.has(event.targetId)
        || !preceding.has(event.targetId) || annotationTargetDigest(source.event) !== event.targetDigest) throw new Error('Saved annotation target changed.');
      if (event.type === 'label') {
        if (event.label === null) labels.delete(event.targetId);
        else labels.set(event.targetId, { id: event.targetId, text: event.label });
      } else {
        if (!isEditableMessage(source.event)) throw new Error('Saved context edit targets protected content.');
        const message = retained.get(event.targetId);
        if (event.edit.kind === 'restore') edits.delete(event.targetId);
        else if (message) edits.set(event.targetId, { id: event.targetId, hash: contextMessageHash(message), edit: event.edit });
      }
    }
    preceding.add(node.id);
  }
  return { ...(edits.size ? { contextEdits: [...edits.values()] } : {}), ...(labels.size ? { labels: [...labels.values()] } : {}) };
}

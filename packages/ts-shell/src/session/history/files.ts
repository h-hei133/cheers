import { redactExportText } from '../../core/security/redaction.js';
import { createTranscriptHeader, encodeTranscriptEvent } from '../sessionEventCodec.js';
import { projectSessionMetadata } from '../schema/sessionMetadataCodec.js';
import { historyDigest, parseHistory, type HistoryDocument } from './model.js';
import { projectHistory } from './projection.js';

/** Complete native payloads, still inactive until metadata is published last. */
export function historyFiles(document: HistoryDocument, id: string, projectRoot: string, timestamp: string): readonly { readonly relative: string; readonly content: string; readonly metadata: boolean }[] {
  document = parseHistory(JSON.stringify(document));
  if (!Number.isFinite(Date.parse(timestamp))) throw new Error('History import timestamp is invalid.');
  const { thread, events } = projectHistory(document, id);
  const metadata = projectSessionMetadata({ id, projectRoot, rootMode: 'direct', requestedWorkspaceRoot: projectRoot, targetPathBase: projectRoot,
    title: redactExportText(document.title) || 'Imported conversation', createdAt: timestamp, updatedAt: timestamp, status: 'interrupted', turns: [] });
  const state = { status: 'interrupted', runPhase: 'idle', projectRoot, thread,
    historyImport: { version: 1, digest: historyDigest(document), status: 'complete', sourceId: document.sourceId } };
  const transcript = [JSON.stringify(createTranscriptHeader({ sessionId: id, timestamp, cwd: projectRoot })), ...events.map(encodeTranscriptEvent)].join('\n') + '\n';
  return [
    { relative: `sessions/${id}/state.json`, content: JSON.stringify(state, null, 2) + '\n', metadata: false },
    { relative: `sessions/${id}/transcript.jsonl`, content: transcript, metadata: false },
    { relative: `sessions/${id}/metadata.json`, content: JSON.stringify(metadata, null, 2) + '\n', metadata: true },
  ];
}

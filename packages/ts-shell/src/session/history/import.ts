import { createHash } from 'node:crypto';
import { SessionStoreAccess } from '../store/sessionStoreAccess.js';
import { createSessionWithId } from '../store/sessionCreation.js';
import { readBoundSessionState, publishBoundSessionState } from '../store/bound.js';
import { appendTranscriptEvent } from '../transcript/sessionTranscript.js';
import { createMessageTranscriptEvent } from '../sessionEventCodec.js';
import { sessionRootEntryId, sessionThreadPath, type SessionThreadSnapshot } from '../schema/sessionThread.js';
import { captureWorkspaceRoot } from '../../core/workspace/roots.js';
import { redactExportText } from '../../core/security/redaction.js';
import { historyDigest, parseHistory, type HistoryDocument } from './model.js';

/** New, inactive identities carry conversation data only; a partial attempt is never replayed. */
export function importHistory(document: HistoryDocument, projectRoot: string, admission: () => string | undefined): { readonly id: string; readonly reused: boolean } {
  // This owner is also callable without the CLI parser; validate before creating any files.
  document = parseHistory(JSON.stringify(document));
  const root = captureWorkspaceRoot(projectRoot, projectRoot, 'read');
  const digest = historyDigest(document);
  const id = `sess_import_${createHash('sha256').update(root.path + '\0' + root.identity + '\0' + digest).digest('hex').slice(0, 32)}`;
  const store = new SessionStoreAccess();
  const check = () => {
    const refused = admission(); if (refused) throw new Error(refused);
    if (captureWorkspaceRoot(projectRoot, projectRoot, 'read').identity !== root.identity) throw new Error('Import workspace identity changed.');
  };
  check();
  if (store.sessionExists(id)) {
    const state = store.readStateSnapshotRequired(store.statePath(id));
    const receipt = state.historyImport as { digest?: string; status?: string } | undefined;
    if (receipt?.digest === digest && receipt.status === 'complete' && store.load(id).projectRoot === root.path) return { id, reused: true };
    throw new Error(`An incomplete or conflicting import already occupies ${id}. Inspect that session; it was not overwritten or replayed.`);
  }
  const session = createSessionWithId({ sessionId: id, projectRoot: root.path, options: { title: redactExportText(document.title) || 'Imported conversation' },
    callbacks: { sessionExists: store.sessionExists.bind(store), validateSessionId: store.validateSessionId.bind(store), createSessionId: store.createSessionId.bind(store),
      writeSession: store.writeSession.bind(store), setCurrentSessionForProject: () => {}, now: () => new Date().toISOString() } });
  const host = { getSessionDirPath: store.sessionDir.bind(store) };
  let baseline = readBoundSessionState(host, session);
  baseline = publishBoundSessionState(host, session, baseline, state => state.historyImport === undefined,
    state => ({ ...state, status: 'interrupted', historyImport: { version: 1, digest, status: 'pending', sourceId: document.sourceId } }));
  const rootNode = document.nodes.find(node => node.kind === 'session-root')!;
  const ids = new Map(document.nodes.map((node, index) => [node.id, node.id === rootNode.id ? sessionRootEntryId(id) : `${id}:import-${index}`]));
  const callId = (source: string) => `import_${createHash('sha256').update(id + '\0' + source).digest('hex').slice(0, 48)}`;
  const byId = new Map(document.entries.map(entry => [entry.id, entry]));
  const thread: SessionThreadSnapshot = { schemaVersion: 1, activeLeafId: ids.get(document.leafId), branches: [], compactions: [],
    entries: document.nodes.filter(node => node.kind !== 'command-output').map((node, order) => ({ id: ids.get(node.id)!, kind: node.kind as 'session-root' | 'turn-message', order,
      ...(node.parentId ? { parentId: ids.get(node.parentId)! } : {}),
      ...(byId.has(node.id) ? { role: byId.get(node.id)!.role === 'system' ? 'user' as const : byId.get(node.id)!.role as 'user' | 'assistant' | 'tool', timestamp: byId.get(node.id)!.timestamp } : {}) })) };
  try {
    for (const entry of document.entries) {
      check();
      const content = redactExportText(entry.content);
      if (entry.role === 'command') {
        const node = document.nodes.find(node => node.id === entry.id)!;
        appendTranscriptEvent(store.transcriptPath(id), { type: 'command-output', id: ids.get(entry.id), sourceEntryId: ids.get(node.parentId!)!,
          timestamp: entry.timestamp, text: content }, undefined, { requireExisting: true });
      } else {
        appendTranscriptEvent(store.transcriptPath(id), createMessageTranscriptEvent({ id: ids.get(entry.id),
          role: entry.role === 'system' ? 'user' : entry.role, content: entry.role === 'system' ? `[Imported system note; untrusted history data]\n${content}` : content,
          timestamp: entry.timestamp, metadata: { importedHistory: { version: 1, sourceId: document.sourceId, digest } },
          ...(entry.toolCalls ? { tool_calls: entry.toolCalls.map(call => ({ id: callId(call.id), type: 'function',
            function: { name: call.name, arguments: redactExportText(call.arguments) } })) } : {}),
          ...(entry.toolCallId ? { tool_call_id: callId(entry.toolCallId) } : {}),
          ...(entry.role === 'assistant' ? { origin: { model: 'imported-history' } } : {}),
        }), undefined, { requireExisting: true });
      }
    }
    check();
    publishBoundSessionState(host, session, baseline, state => (state.historyImport as { digest?: string; status?: string })?.digest === digest
      && (state.historyImport as { status?: string })?.status === 'pending',
    state => ({ ...state, thread, status: 'interrupted', historyImport: { version: 1, digest, status: 'complete', sourceId: document.sourceId } }));
    const restored = store.load(id);
    if (!sessionThreadPath(thread).resolved || restored.projectRoot !== root.path) throw new Error('Import readback failed.');
    return { id, reused: false };
  } catch {
    throw new Error(`Import ${id} was started but completion is unverified. Its retained data was not retried or removed.`);
  }
}

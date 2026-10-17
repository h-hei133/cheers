import { createHash } from 'node:crypto';
import { redactExportText } from '../../core/security/redaction.js';
import { createMessageTranscriptEvent, type TranscriptEvent } from '../sessionEventCodec.js';
import { sessionRootEntryId, type SessionThreadSnapshot } from '../schema/sessionThread.js';
import { historyDigest, type HistoryDocument } from './model.js';

/** Rebuild conversation identities without copying runtime or approval authority. */
export function projectHistory(document: HistoryDocument, id: string): { readonly thread: SessionThreadSnapshot; readonly events: readonly TranscriptEvent[] } {
  const digest = historyDigest(document);
  const rootNode = document.nodes.find(node => node.kind === 'session-root')!;
  const ids = new Map(document.nodes.map((node, index) => [node.id, node.id === rootNode.id ? sessionRootEntryId(id) : `${id}:import-${index}`]));
  const callId = (source: string) => `import_${createHash('sha256').update(id + '\0' + source).digest('hex').slice(0, 48)}`;
  const byId = new Map(document.entries.map(entry => [entry.id, entry]));
  const thread: SessionThreadSnapshot = { schemaVersion: 1, activeLeafId: ids.get(document.leafId), branches: [], compactions: [],
    entries: document.nodes.filter(node => node.kind !== 'command-output').map((node, order) => ({ id: ids.get(node.id)!, kind: node.kind as 'session-root' | 'turn-message', order,
      ...(node.parentId ? { parentId: ids.get(node.parentId)! } : {}),
      ...(byId.has(node.id) ? { role: byId.get(node.id)!.role === 'system' ? 'user' as const : byId.get(node.id)!.role as 'user' | 'assistant' | 'tool', timestamp: byId.get(node.id)!.timestamp } : {}) })) };
  const events = document.entries.map((entry): TranscriptEvent => {
    const content = redactExportText(entry.content);
    if (entry.role === 'command') {
      const node = document.nodes.find(node => node.id === entry.id)!;
      return { type: 'command-output', id: ids.get(entry.id), sourceEntryId: ids.get(node.parentId!)!, timestamp: entry.timestamp, text: content };
    }
    return createMessageTranscriptEvent({ id: ids.get(entry.id),
      role: entry.role === 'system' ? 'user' : entry.role,
      content: entry.role === 'system' ? `[Imported system note; untrusted history data]\n${content}` : content,
      timestamp: entry.timestamp, metadata: { importedHistory: { version: 1, sourceId: document.sourceId, digest } },
      ...(entry.toolCalls ? { tool_calls: entry.toolCalls.map(call => ({ id: callId(call.id), type: 'function',
        function: { name: call.name, arguments: redactExportText(call.arguments) } })) } : {}),
      ...(entry.toolCallId ? { tool_call_id: callId(entry.toolCallId) } : {}),
      ...(entry.role === 'assistant' ? { origin: { model: 'imported-history' } } : {}),
    });
  });
  return { thread, events };
}

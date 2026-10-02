import { redactExportText } from "../../core/security/redaction.js";
import type { ExportPayload } from "./model.js";

/** Free text is scrubbed; opaque identity aliases preserve every association. */
export function sanitizeExport(payload: ExportPayload): ExportPayload {
  const ids = new Map<string, string>();
  const identity = (value: string): string => {
    let alias = ids.get(value);
    if (alias === undefined) {
      alias = `id-${ids.size + 1}`;
      ids.set(value, alias);
    }
    return alias;
  };
  const optionalText = (value: string | undefined): string | undefined => value === undefined ? undefined : redactExportText(value);
  return {
    header: {
      sessionId: redactExportText(payload.header.sessionId),
      exportedAt: redactExportText(payload.header.exportedAt),
      workspace: redactExportText(payload.header.workspace),
    },
    entries: payload.entries.map(entry => ({
      ...entry, id: identity(entry.id), timestamp: optionalText(entry.timestamp),
      toolCallId: entry.toolCallId === undefined ? undefined : identity(entry.toolCallId),
      toolCalls: entry.toolCalls?.map(call => ({ ...call, id: identity(call.id), name: redactExportText(call.name) })),
      origin: entry.origin === undefined ? undefined : { provider: optionalText(entry.origin.provider), model: redactExportText(entry.origin.model) },
    })),
    tree: payload.tree.map(node => ({
      ...node, id: identity(node.id), parentId: node.parentId === undefined ? undefined : identity(node.parentId),
      timestamp: optionalText(node.timestamp),
    })),
    leafId: payload.leafId === null ? null : identity(payload.leafId),
    warnings: payload.warnings,
  };
}

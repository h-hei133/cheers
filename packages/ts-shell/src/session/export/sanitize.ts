import { redactExportText } from "../../core/security/redaction.js";
import type { ExportPayload } from "./model.js";
import { renderMarkdownHtml } from './htmlRender.js';
import { projectExportImages } from './media.js';

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
  let omittedImages = 0;
  return {
    header: {
      sessionId: redactExportText(payload.header.sessionId),
      exportedAt: redactExportText(payload.header.exportedAt),
      workspace: redactExportText(payload.header.workspace),
    },
    entries: payload.entries.map(entry => {
      const content = redactExportText(entry.content);
      const images = projectExportImages(entry.images);
      omittedImages += images.omitted;
      return {
        ...entry, content, html: renderMarkdownHtml(content), images: images.images,
        id: identity(entry.id), timestamp: optionalText(entry.timestamp),
        ...(entry.reasoning === undefined ? {} : { reasoning: { ...entry.reasoning, text: redactExportText(entry.reasoning.text) } }),
        ...(entry.toolDiff === undefined ? {} : { toolDiff: redactExportText(entry.toolDiff) }),
        ...(entry.sourceEntryId === undefined ? {} : { sourceEntryId: identity(entry.sourceEntryId) }),
        toolCallId: entry.toolCallId === undefined ? undefined : identity(entry.toolCallId),
        toolCalls: entry.toolCalls?.map(call => ({ ...call, id: identity(call.id), name: redactExportText(call.name), arguments: redactExportText(call.arguments) })),
        origin: entry.origin === undefined ? undefined : { provider: optionalText(entry.origin.provider), model: redactExportText(entry.origin.model) },
      };
    }),
    tree: payload.tree.map(node => ({
      ...node, id: identity(node.id), parentId: node.parentId === undefined ? undefined : identity(node.parentId),
      timestamp: optionalText(node.timestamp), preview: redactExportText(node.preview),
    })),
    leafId: payload.leafId === null ? null : identity(payload.leafId),
    toolPairing: payload.toolPairing ?? (payload.warnings.length ? 'unavailable' : 'verified'),
    warnings: [...payload.warnings.map(redactExportText),
      ...(omittedImages ? [`${omittedImages} image${omittedImages === 1 ? ' was' : 's were'} omitted because their format or encoded data could not be verified.`] : [])],
    ...(payload.stats === undefined ? {} : {
      stats: { ...payload.stats, models: payload.stats.models.map(model => redactExportText(model)) },
    }),
  };
}

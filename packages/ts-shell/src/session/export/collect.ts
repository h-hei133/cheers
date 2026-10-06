import { readStateSnapshotRequired } from "../store/sessionStateStore.js";
import type { SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { redactExportText } from "../../core/security/redaction.js";
import { messageToText } from "../../model-adapters/multimodal.js";
import { renderMarkdownHtml } from "./htmlRender.js";
import { projectExportTree } from "./graph.js";
import { sanitizeExport } from "./sanitize.js";
import { readExportSource } from "./source.js";
import type { ExportEntry, ExportPayload } from "./model.js";
import { restoreReport } from '../reports/projection.js';
import type { ReportTranscriptEntry } from '../reports/model.js';
export type { ExportEntry, ExportPayload, ExportTreeNode } from "./model.js";

export type ExportGatherResult =
  | { readonly ok: true; readonly payload: ExportPayload }
  | { readonly ok: false; readonly reason: string };

/** Join transcript messages to durable branch edges, reporting incomplete data. */
export function gatherExport(input: {
  readonly sessionId: string;
  readonly workspace: string;
  readonly now?: () => Date;
}): ExportGatherResult {
  const source = readExportSource(input.sessionId);
  if (!source.ok) return source;
  const { transcript, statePath } = source;
  const messages = transcript.events.filter((event): event is Extract<TranscriptEvent, { type: "message" }> => event.type === "message");
  const reports = transcript.events.filter((event): event is ReportTranscriptEntry => event.type === 'command-output')
    .flatMap(event => {
      const saved = restoreReport(event);
      if (!saved) return [];
      const content = redactExportText(saved.text);
      return [{ id: saved.id, role: 'command', content, html: renderMarkdownHtml(content),
        timestamp: saved.timestamp, sourceEntryId: saved.sourceEntryId }];
    });
  if (messages.length === 0 && reports.length === 0) {
    return { ok: false, reason: transcript.unreadableLines > 0
      ? "The session has no readable conversation; its transcript contains damaged entries."
      : `Session \`${input.sessionId}\` has no conversation recorded yet.` };
  }
  const entries = [...messages.map(toExportEntry), ...reports];
  if (new Set(entries.map(entry => entry.id)).size !== entries.length) {
    return { ok: false, reason: "The transcript has duplicate message identities; branch associations are ambiguous." };
  }
  let snapshot: SessionThreadSnapshot | undefined;
  try {
    snapshot = readStateSnapshotRequired(statePath).thread;
  } catch {
    // A chronological view remains useful, but must identify its lost branch history.
  }
  const tree = projectExportTree(snapshot, entries);
  const warnings = [...tree.warnings, ...transcript.warnings];
  return {
    ok: true,
    payload: sanitizeExport({
      header: { sessionId: input.sessionId, exportedAt: (input.now ?? (() => new Date()))().toISOString(), workspace: input.workspace },
      tree: tree.nodes, entries, leafId: tree.leafId, warnings,
    }),
  };
}

function toExportEntry(event: Extract<TranscriptEvent, { type: "message" }>): ExportEntry {
  const toolCalls = event.tool_calls?.map(call => ({
    id: call.id, name: call.function.name, arguments: redactExportText(call.function.arguments),
  }));
  const content = redactExportText(messageToText(event.content, { placeholderForImages: true }));
  return {
    id: event.id ?? "", role: event.role, content, html: renderMarkdownHtml(content),
    ...(toolCalls?.length ? { toolCalls } : {}),
    ...(event.tool_call_id !== undefined ? { toolCallId: event.tool_call_id } : {}),
    ...(event.origin !== undefined ? { origin: event.origin } : {}),
    timestamp: event.timestamp,
  };
}

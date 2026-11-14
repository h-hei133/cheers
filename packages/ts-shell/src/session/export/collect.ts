import type { SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { redactExportText } from "../../core/security/redaction.js";
import { messageToText } from "../../model-adapters/multimodal.js";
import { renderMarkdownHtml } from "./htmlRender.js";
import { projectExportTree } from "./graph.js";
import { sanitizeExport } from "./sanitize.js";
import { readExportSource, readExportState } from "./source.js";
import type { ExportEntry, ExportImage, ExportPayload } from "./model.js";
import { computeExportStats } from "./stats.js";
import { projectExportAccounting } from './accounting.js';
import { restoreReport } from '../reports/projection.js';
import type { ReportTranscriptEntry } from '../reports/model.js';
import type { SessionStoreLayout } from '../store/sessionFileLayout.js';
import type { ReadTranscript } from '../transcript/sessionTranscript.js';
export type { ExportEntry, ExportPayload, ExportSessionStats, ExportTreeNode } from "./model.js";
export type ExportGatherResult =
  | { readonly ok: true; readonly payload: ExportPayload }
  | { readonly ok: false; readonly reason: string };

/** Join transcript messages to durable branch edges, reporting incomplete data. */
export function gatherExport(input: {
  readonly sessionId: string;
  readonly workspace: string;
  readonly now?: () => Date;
  readonly maxSourceBytes?: number;
  readonly layout?: SessionStoreLayout;
  /** Already bounded, revision-bound acquisition supplied by a migration owner. */
  readonly captured?: { readonly transcript: ReadTranscript; readonly thread?: SessionThreadSnapshot };
}): ExportGatherResult {
  const source = input.captured ? { ok: true as const, transcript: input.captured.transcript, statePath: undefined }
    : readExportSource(input.sessionId, input.maxSourceBytes, input.layout);
  if (!source.ok) return source;
  const { transcript } = source;
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
  const capturedState = 'metadataPath' in source ? readExportState(source, input.sessionId, input.maxSourceBytes) : undefined;
  const snapshot = input.captured?.thread ?? capturedState?.state.thread;
  const tree = projectExportTree(snapshot, entries);
  const warnings = [...tree.warnings, ...transcript.warnings];
  const sanitized = sanitizeExport({
    header: { sessionId: input.sessionId, exportedAt: (input.now ?? (() => new Date()))().toISOString(), workspace: input.workspace },
    tree: tree.nodes, entries, leafId: tree.leafId, warnings,
  });
  return {
    ok: true,
    payload: {
      ...sanitized,
      stats: computeExportStats(sanitized.entries, sanitized.tree, projectExportAccounting(capturedState?.state, capturedState?.binding)),
    },
  };
}

const ALLOWED_IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);
const BASE64_PATTERN = /^[A-Za-z0-9+/=]+$/;

function extractImages(content: Extract<TranscriptEvent, { type: "message" }>["content"]): readonly ExportImage[] | undefined {
  if (typeof content === "string") return undefined;
  const images: ExportImage[] = [];
  for (const block of content) {
    if (block.type !== "image") continue;
    const mimeType = block.mimeType.trim().toLowerCase();
    const data = block.data.trim();
    if (ALLOWED_IMAGE_MIMES.has(mimeType) && data.length > 0 && BASE64_PATTERN.test(data)) {
      images.push({ mediaType: mimeType, data });
    }
  }
  return images.length > 0 ? images : undefined;
}

function extractToolDiff(event: Extract<TranscriptEvent, { type: "message" }>, contentText: string): string | undefined {
  const metaDiff = event.metadata?.diff;
  if (typeof metaDiff === "string" && metaDiff.trim()) return redactExportText(metaDiff);
  if (event.role !== "tool") return undefined;
  const fenced = /```diff\r?\n([\s\S]*?)```/.exec(contentText);
  return fenced?.[1]?.trim() ? redactExportText(fenced[1].replace(/\r?\n$/, "")) : undefined;
}

function toExportEntry(event: Extract<TranscriptEvent, { type: "message" }>): ExportEntry {
  const toolCalls = event.tool_calls?.map(call => ({
    id: call.id, name: call.function.name, arguments: redactExportText(call.function.arguments),
  }));
  const content = redactExportText(messageToText(event.content, { placeholderForImages: true }));
  const images = extractImages(event.content);
  const toolDiff = extractToolDiff(event, content);
  const isError = event.metadata?.isError === true || event.failureClass !== undefined;
  const reasoning = event.reasoning?.text || event.reasoning?.redacted
    ? { text: redactExportText(event.reasoning.text ?? ""), ...(event.reasoning.redacted ? { redacted: true } : {}) }
    : undefined;
  return {
    id: event.id ?? "", role: event.role, content, html: renderMarkdownHtml(content),
    ...(reasoning !== undefined ? { reasoning } : {}),
    ...(images !== undefined ? { images } : {}),
    ...(toolCalls?.length ? { toolCalls } : {}),
    ...(event.tool_call_id !== undefined ? { toolCallId: event.tool_call_id } : {}),
    ...(toolDiff !== undefined ? { toolDiff } : {}),
    ...(isError ? { isError: true } : {}),
    ...(event.origin !== undefined ? { origin: event.origin } : {}),
    timestamp: event.timestamp,
  };
}

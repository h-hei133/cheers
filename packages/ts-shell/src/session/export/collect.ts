import { readStateSnapshotRequired } from "../store/sessionStateStore.js";
import type { SessionThreadSnapshot } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { redactExportText } from "../../core/security/redaction.js";
import { messageToText } from "../../model-adapters/multimodal.js";
import { renderMarkdownHtml } from "./htmlRender.js";
import { projectExportTree } from "./graph.js";
import { sanitizeExport } from "./sanitize.js";
import { readExportSource, readExportThread } from "./source.js";
import type { ExportEntry, ExportEntryUsage, ExportImage, ExportPayload } from "./model.js";
import { computeExportStats } from "./stats.js";
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
  let snapshot = input.captured?.thread;
  try {
    if (statePath !== undefined) snapshot = input.maxSourceBytes === undefined ? readStateSnapshotRequired(statePath).thread
      : readExportThread(statePath, input.maxSourceBytes);
  } catch {
    // A chronological view remains useful, but must identify its lost branch history.
  }
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
      stats: computeExportStats(sanitized.entries, sanitized.tree),
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

function extractUsage(event: Extract<TranscriptEvent, { type: "message" }>): ExportEntryUsage | undefined {
  const raw = event.metadata?.usage;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as Record<string, unknown>;
    const inputTokens = typeof rec.inputTokens === "number" ? rec.inputTokens : typeof rec.promptTokens === "number" ? rec.promptTokens : 0;
    const outputTokens = typeof rec.outputTokens === "number" ? rec.outputTokens : typeof rec.completionTokens === "number" ? rec.completionTokens : 0;
    const cacheReadTokens = typeof rec.cacheReadTokens === "number" ? rec.cacheReadTokens : undefined;
    const cacheWriteTokens = typeof rec.cacheWriteTokens === "number" ? rec.cacheWriteTokens : undefined;
    const costUsd = typeof rec.costUsd === "number" ? rec.costUsd : typeof rec.cost === "number" ? rec.cost : undefined;
    if (inputTokens > 0 || outputTokens > 0 || (cacheReadTokens ?? 0) > 0 || (cacheWriteTokens ?? 0) > 0 || costUsd !== undefined) {
      return { inputTokens, outputTokens, ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}), ...(cacheWriteTokens !== undefined ? { cacheWriteTokens } : {}), ...(costUsd !== undefined ? { costUsd } : {}) };
    }
  }
  if (event.promptMeasurement && event.promptMeasurement.tokens > 0) {
    return { inputTokens: event.promptMeasurement.tokens, outputTokens: 0 };
  }
  return undefined;
}

function toExportEntry(event: Extract<TranscriptEvent, { type: "message" }>): ExportEntry {
  const toolCalls = event.tool_calls?.map(call => ({
    id: call.id, name: call.function.name, arguments: redactExportText(call.function.arguments),
  }));
  const content = redactExportText(messageToText(event.content, { placeholderForImages: true }));
  const images = extractImages(event.content);
  const toolDiff = extractToolDiff(event, content);
  const usage = extractUsage(event);
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
    ...(usage !== undefined ? { usage } : {}),
    ...(event.origin !== undefined ? { origin: event.origin } : {}),
    timestamp: event.timestamp,
  };
}

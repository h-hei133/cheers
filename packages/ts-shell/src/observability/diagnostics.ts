import {
  LOG_DIRECTORY_ENTRIES,
  LOG_FILE_LIMIT,
  LOG_TOTAL_BYTES,
  LOG_TAIL_BYTES,
  orderedLogFiles,
  tailLines,
} from './logs/files.js';
import type { StructuredLogEntry } from './types.js';
import { redactReportText } from '../core/security/redaction.js';

export interface LogRead {
  readonly entries: readonly StructuredLogEntry[];
  readonly status: 'reported' | 'partial' | 'unavailable';
  readonly filesInspected: number;
  readonly unreadableFiles: number;
  readonly filesTruncated?: boolean;
  readonly limitReached?: boolean;
  readonly bytesRead?: number;
}

/** Read bounded, already-redacted structured records from all log shards. */
export function readStructuredLogs(directory: string, currentPath: string, limit = 200,
  accept?: (entry: StructuredLogEntry) => boolean): LogRead {
  let directoryUnavailable = false;
  let unreadableFiles = 0;
  let filesTruncated = false;
  let limitReached = false;
  const files = orderedLogFiles(directory, currentPath, {
    onUnavailable: target => { if (target === 'directory') directoryUnavailable = true; else unreadableFiles += 1; },
    maxEntries: LOG_DIRECTORY_ENTRIES, maxFiles: LOG_FILE_LIMIT,
    onTruncated: () => { filesTruncated = true; },
  }).reverse();
  if (directoryUnavailable) return { entries: [], status: 'unavailable', filesInspected: 0, unreadableFiles: 0 };
  const entries: StructuredLogEntry[] = [];
  let filesInspected = unreadableFiles;
  let bytesRead = 0;
  for (const file of files) {
    if (entries.length > limit) { limitReached = true; break; }
    const remaining = LOG_TOTAL_BYTES - bytesRead;
    if (remaining <= 0) { filesTruncated = true; break; }
    filesInspected += 1;
    let lines: string[];
    try {
      lines = tailLines(file, Math.min(LOG_TAIL_BYTES, remaining), {
        strict: true, onBytes: bytes => { bytesRead += bytes; },
        onTruncated: () => { filesTruncated = true; },
      });
    }
    catch { unreadableFiles += 1; continue; }
    for (let index = lines.length - 1; index >= 0 && entries.length <= limit; index -= 1) {
      const entry = parseEntry(lines[index]!);
      if (entry && (!accept || accept(entry))) entries.push(entry);
    }
    if (entries.length > limit) { limitReached = true; break; }
    if (entries.length === limit && !accept) break;
  }
  const status = unreadableFiles === 0 && !filesTruncated ? 'reported'
    : unreadableFiles === filesInspected && entries.length === 0 ? 'unavailable' : 'partial';
  const ordered = entries.reverse();
  if (ordered.length > limit) ordered.splice(0, ordered.length - limit);
  return { entries: ordered, status, filesInspected, unreadableFiles, filesTruncated, limitReached, bytesRead };
}

function parseEntry(line: string): StructuredLogEntry | undefined {
  try {
    const value = JSON.parse(line) as Partial<StructuredLogEntry>;
    if (typeof value.timestamp !== 'string' || typeof value.level !== 'string' || typeof value.component !== 'string' || typeof value.message !== 'string') return undefined;
    if (!['debug', 'info', 'warn', 'error'].includes(value.level)) return undefined;
    if (value.traceId !== undefined && typeof value.traceId !== 'string'
      || value.spanId !== undefined && typeof value.spanId !== 'string'
      || !value.fields || typeof value.fields !== 'object') return undefined;
    return value as StructuredLogEntry;
  } catch { return undefined; }
}

export function traceRows(logs: readonly StructuredLogEntry[], projectRoot = process.cwd()): readonly TraceRow[] {
  const text = (value: string): string => redactReportText(value, 240, { projectRoot });
  return logs.map(entry => {
    const fields = entry.fields;
    const requestId = stringField(fields, 'requestId') ?? stringField(fields, 'request_id');
    const toolId = stringField(fields, 'toolCallId') ?? stringField(fields, 'tool_call_id') ?? stringField(fields, 'taskId');
    const durationMs = typeof fields.durationMs === 'number' && Number.isFinite(fields.durationMs) ? fields.durationMs : undefined;
    return { timestamp: text(entry.timestamp), traceId: entry.traceId ? text(entry.traceId) : '[missing trace id]',
      spanId: entry.spanId ? text(entry.spanId) : '[missing span id]',
      requestId: requestId === undefined ? undefined : text(requestId), toolId: toolId === undefined ? undefined : text(toolId),
      durationMs, component: text(entry.component), message: text(entry.message) };
  });
}

export interface TraceRow {
  readonly timestamp: string;
  readonly traceId: string;
  readonly spanId: string;
  readonly requestId?: string;
  readonly toolId?: string;
  readonly durationMs?: number;
  readonly component: string;
  readonly message: string;
  readonly events?: readonly { readonly name: string; readonly timestamp: string; readonly endpoint?: string }[];
  readonly links?: readonly { readonly traceId: string; readonly spanId: string }[];
}

function stringField(fields: Record<string, unknown>, key: string): string | undefined {
  return typeof fields[key] === 'string' && fields[key] ? fields[key] as string : undefined;
}

export { LOG_TAIL_BYTES, LOG_DIRECTORY_ENTRIES, LOG_FILE_LIMIT, LOG_TOTAL_BYTES };

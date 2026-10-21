import { orderedLogFiles, tailLines, LOG_TAIL_BYTES } from './logs/files.js';
import type { StructuredLogEntry } from './types.js';
import { redactReportText } from '../core/security/redaction.js';

export interface LogRead {
  readonly entries: readonly StructuredLogEntry[];
  readonly status: 'reported' | 'partial' | 'unavailable';
  readonly filesInspected: number;
  readonly unreadableFiles: number;
}

/** Read bounded, already-redacted structured records from all log shards. */
export function readStructuredLogs(directory: string, currentPath: string, limit = 200): LogRead {
  let directoryUnavailable = false;
  let unreadableFiles = 0;
  const files = orderedLogFiles(directory, currentPath, {
    onUnavailable: target => { if (target === 'directory') directoryUnavailable = true; else unreadableFiles += 1; },
  }).reverse();
  if (directoryUnavailable) return { entries: [], status: 'unavailable', filesInspected: 0, unreadableFiles: 0 };
  const entries: StructuredLogEntry[] = [];
  let filesInspected = unreadableFiles;
  for (const file of files) {
    filesInspected += 1;
    let lines: string[];
    try { lines = tailLines(file, LOG_TAIL_BYTES, { strict: true }); }
    catch { unreadableFiles += 1; continue; }
    for (let index = lines.length - 1; index >= 0 && entries.length < limit; index -= 1) {
      const entry = parseEntry(lines[index]!);
      if (entry) entries.push(entry);
    }
    if (entries.length >= limit) break;
  }
  const status = unreadableFiles === 0 ? 'reported' : unreadableFiles === filesInspected ? 'unavailable' : 'partial';
  return { entries: entries.reverse(), status, filesInspected, unreadableFiles };
}

function parseEntry(line: string): StructuredLogEntry | undefined {
  try {
    const value = JSON.parse(line) as Partial<StructuredLogEntry>;
    if (typeof value.timestamp !== 'string' || typeof value.level !== 'string' || typeof value.component !== 'string' || typeof value.message !== 'string') return undefined;
    if (!['debug', 'info', 'warn', 'error'].includes(value.level)) return undefined;
    if (typeof value.traceId !== 'string' || typeof value.spanId !== 'string' || !value.fields || typeof value.fields !== 'object') return undefined;
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
    return { timestamp: text(entry.timestamp), traceId: text(entry.traceId), spanId: text(entry.spanId),
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
}

function stringField(fields: Record<string, unknown>, key: string): string | undefined {
  return typeof fields[key] === 'string' && fields[key] ? fields[key] as string : undefined;
}

export { LOG_TAIL_BYTES };

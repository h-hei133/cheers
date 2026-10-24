import { readReport, REPORT_BYTES } from '../../core/commands/report/codec.js';
import { plainReportText, reportText } from '../../core/commands/report/projection.js';
import { sessionRootEntryId, sessionThreadPath, type SessionThreadSnapshot } from '../schema/sessionThread.js';
import type { TranscriptEvent } from '../sessionEventCodec.js';
import type { ReportTranscriptEntry, SessionReport } from './model.js';

export function restoreReport(event: ReportTranscriptEntry): SessionReport | undefined {
  if (!event.id || Buffer.byteLength(event.text, 'utf8') > REPORT_BYTES) return undefined;
  const report = readReport(event.report);
  const text = report ? reportText(report) : plainReportText(event.text);
  if (Buffer.byteLength(text, 'utf8') > REPORT_BYTES) return undefined;
  const time = event.timestamp.length <= 128 ? Date.parse(event.timestamp) : NaN;
  return { id: event.id, sourceEntryId: event.sourceEntryId, timestamp: Number.isFinite(time) ? new Date(time).toISOString() : 'unknown time',
    text, ...(report ? { report } : {}) };
}

/** Display records follow ancestry, never the runtime-message/context projection. */
export function selectSessionReports(events: readonly TranscriptEvent[], sessionId: string,
  thread: SessionThreadSnapshot | undefined, signal?: AbortSignal): SessionReport[] {
  signal?.throwIfAborted();
  const selected = thread && sessionThreadPath(thread, undefined, signal);
  if (selected && !selected.resolved) return [];
  // Without an index only an unbranched transcript proves the visible ancestry.
  if (!thread && events.some((event, index) => {
    if ((index & 255) === 0) signal?.throwIfAborted();
    return event.type === 'branch_summary';
  })) return [];
  const sources = new Set(selected ? selected.path.map(entry => entry.id)
    : [sessionRootEntryId(sessionId), ...events.filter((event, index) => {
      if ((index & 255) === 0) signal?.throwIfAborted();
      return event.type === 'message';
    }).map(event => event.id)]);
  const reports: SessionReport[] = [];
  for (let index = 0; index < events.length; index++) {
    if ((index & 255) === 0) signal?.throwIfAborted();
    const event = events[index]!;
    if (event.type !== 'command-output' || !sources.has(event.sourceEntryId)) continue;
    const restored = restoreReport(event);
    if (restored) reports.push(restored);
  }
  return reports;
}

import { redactReportText } from '../../security/redaction.js';
import { traceRows, type LogRead, LOG_TAIL_BYTES } from '../../../observability/diagnostics.js';
import { MAX_CRASH_RECORDS, type CrashRead } from '../../../observability/crashLog.js';
import { createReport, span } from '../report/projection.js';
import type { CommandReport } from '../report/contract.js';

export function logsReport(read: LogRead, projectRoot: string): CommandReport {
  const rows = traceRows(read.entries, projectRoot).map((row, index) => ({ ...row, level: read.entries[index]!.level }));
  return createReport({
    title: 'Debug logs',
    columns: [{ label: 'Time', minWidth: 14 }, { label: 'Level', minWidth: 6 }, { label: 'Component', minWidth: 12 }, { label: 'Message', minWidth: 24 }],
    lines: [
      { kind: 'text', spans: [span(`Status: ${read.status}`, read.status === 'reported' ? 'text' : 'warning')] },
      ...rows.map(row => ({ kind: 'columns' as const, cells: [[span(row.timestamp)], [span(row.level)], [span(row.component)], [span(row.message)]] })),
      ...(!rows.length ? [{ kind: 'text' as const, spans: [span(read.status === 'unavailable'
        ? 'Structured logs could not be read.' : 'No structured records found in the inspected log tails.')] }] : []),
      { kind: 'text', spans: [span(`Recent records only: at most 200 records, ${LOG_TAIL_BYTES} bytes per file; ${read.filesInspected} files inspected, ${read.unreadableFiles} unreadable.`, 'muted')] },
    ],
    facts: { status: read.status, source: 'structured-log-tails', records: rows.map(row => ({ ...row,
      requestId: row.requestId ?? null, toolId: row.toolId ?? null, durationMs: row.durationMs ?? null })),
      filesInspected: read.filesInspected, unreadableFiles: read.unreadableFiles, recordLimit: 200, bytesPerFile: LOG_TAIL_BYTES },
  });
}

export function crashesReport(read: CrashRead, projectRoot: string): CommandReport {
  const records = read.records.slice(-MAX_CRASH_RECORDS).map(record => ({
    timestamp: redactReportText(record.timestamp, 80, { projectRoot }),
    kind: record.kind,
    message: redactReportText(record.message, 400, { projectRoot }),
  }));
  return createReport({
    title: 'Debug crashes',
    lines: [
      { kind: 'text', spans: [span(`Status: ${read.status}${read.reason ? ` (${read.reason})` : ''}`, read.status === 'reported' ? 'text' : 'warning')] },
      ...records.map(record => ({ kind: 'text' as const, spans: [span(`${record.timestamp} · ${record.kind} · ${record.message}`)] })),
      ...(!records.length ? [{ kind: 'text' as const, spans: [span(read.status === 'unavailable'
        ? 'Crash records could not be read; the count is unknown.' : 'No valid crash records found.')] }] : []),
      ...(read.status !== 'unavailable' ? [{ kind: 'text' as const, spans: [span(`Showing ${records.length} of ${read.records.length} valid retained records, oldest first. Invalid records: ${read.invalidRecords}.`, 'muted')] }] : []),
    ],
    facts: { status: read.status, reason: read.reason ?? null, observedRecords: read.status === 'unavailable' ? null : read.records.length,
      invalidRecords: read.invalidRecords, records },
  });
}

export function timingReport(timing: string): CommandReport {
  return createReport({ title: 'Debug startup timings', lines: timing.split('\n').map(text => ({ kind: 'text', spans: [span(text)] })), facts: { timing } });
}

export function unavailableToolsReport(): CommandReport {
  return createReport({ title: 'Debug tools', lines: [{ kind: 'text', spans: [span('The current tool catalog is unavailable; its count is unknown.', 'warning')] }],
    facts: { status: 'unavailable', count: null } });
}

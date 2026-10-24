import { span } from '../../core/commands/report/projection.js';
import { boundedReport } from '../../core/commands/report/window.js';
import type { CommandReport, ReportLine } from '../../core/commands/report/contract.js';
import { LOG_TAIL_BYTES } from '../logs/files.js';
import { aggregateMetrics, METRIC_TAGS } from './model.js';
import type { MetricRead } from './reader.js';
import { redactReportText } from '../../core/security/redaction.js';

export function metricsReport(read: MetricRead, projectRoot = process.cwd()): CommandReport {
  const safe = (value: string): string => redactReportText(value, 240, { projectRoot });
  // Aggregate by original identity before projecting labels; redaction must not merge groups.
  const candidates = aggregateMetrics(read.samples).map(entry => ({ ...entry,
    name: safe(entry.name), tags: Object.fromEntries(Object.entries(entry.tags).map(([key, value]) => [key, safe(value)])),
    count: finite(entry.count), total: finite(entry.total), max: finite(entry.max),
    average: entry.unit === 'ms' && entry.count > 0 ? finite(entry.total / entry.count) : null,
  }));
  return boundedReport(candidates, groups => {
    const omitted = candidates.length - groups.length;
    const lines: ReportLine[] = groups.map(entry => ({ kind: 'columns', cells: [
      [span(entry.name, 'code')], [span(METRIC_TAGS.filter(key => entry.tags[key]).map(key => `${key}=${entry.tags[key]}`).join(' ') || '—', 'muted')],
      [span(entry.count ?? 'unknown', 'number')], entry.unit === 'ms'
        ? [span('avg '), span(entry.average === null ? 'unknown' : Math.round(entry.average), 'number'), span('ms', 'unit'),
          span(' · max '), span(entry.max ?? 'unknown', 'number'), span('ms', 'unit')]
        : [span('total '), span(entry.total ?? 'unknown', 'number')],
    ] }));
    if (!candidates.length) lines.push({ kind: 'text', spans: [span(read.status === 'unavailable'
      ? 'Metrics unavailable; the structured logs could not be read.'
      : 'No metrics recorded yet in the inspected log tails. Counters and timings are written at the end of each turn.', read.status === 'unavailable' ? 'warning' : 'text')] });
    if (omitted > 0) lines.push({ kind: 'text', spans: [span(`${omitted} metric groups omitted from this bounded report.`, 'muted')] });
    if (read.unreadableFiles) lines.push({ kind: 'text', spans: [span(`${read.unreadableFiles} log file(s) could not be read; available samples only.`, 'warning')] });
    if (read.filesTruncated) lines.push({ kind: 'text', spans: [span('Metric inspection reached its file or byte budget; older samples were omitted.', 'warning')] });
    if (candidates.some(entry => entry.count === null || entry.total === null || entry.max === null)) lines.push({ kind: 'text', spans: [span('Some aggregate values exceed numeric range and are unknown.', 'warning')] });
    lines.push({ kind: 'space' }, { kind: 'text', spans: [span(`Source: structured log tails across processes and sessions; at most ${LOG_TAIL_BYTES} bytes per file and ${read.limit} metric samples.`, 'muted')] },
      { kind: 'text', spans: [span('/log tail', 'command'), span(' shows timestamp, level, component and message without metric values.')] });
    return { title: 'Metrics', columns: [{ label: 'Metric', minWidth: 14 }, { label: 'Tags', minWidth: 16 },
      { label: 'Count', minWidth: 6, align: 'right' }, { label: 'Measure', minWidth: 18 }], lines,
      facts: { source: 'structured-log-tails', scope: 'all-processes-and-sessions', status: read.status,
        groupsTotal: candidates.length, groupsShown: groups.length, groupsOmitted: omitted, coverage: omitted > 0 ? 'partial' : 'complete',
        bytesPerFile: LOG_TAIL_BYTES, sampleLimit: read.limit, samplesRead: read.samples.length,
        filesInspected: read.filesInspected, unreadableFiles: read.unreadableFiles,
        filesTruncated: read.filesTruncated === true, bytesRead: read.bytesRead ?? null,
        groups: groups.map(entry => ({ ...entry, tags: { ...entry.tags } })) },
    };
  });
}

function finite(value: number): number | null { return Number.isFinite(value) ? value : null; }

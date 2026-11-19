import { span } from '../../core/commands/report/projection.js';
import { boundedReport } from '../../core/commands/report/window.js';
import type { CommandReport, ReportLine } from '../../core/commands/report/contract.js';
import { LOG_TAIL_BYTES } from '../logs/files.js';
import { DURATION_BOUNDS_MS, histogramQuantile } from './histogram.js';
import { aggregateMetrics, METRIC_TAGS } from './model.js';
import type { MetricRead } from './reader.js';
import { redactReportText } from '../../core/security/redaction.js';

export function metricsReport(read: MetricRead, projectRoot = process.cwd()): CommandReport {
  const safe = (value: string): string => redactReportText(value, 240, { projectRoot });
  // Aggregate by original identity before projecting labels; redaction must not merge groups.
  const candidates = aggregateMetrics(read.samples).map(({ buckets, ...entry }) => ({ ...entry,
    name: safe(entry.name), tags: Object.fromEntries(Object.entries(entry.tags).map(([key, value]) => [key, safe(value)])),
    count: finite(entry.count), total: finite(entry.total), max: finite(entry.max),
    average: entry.unit === 'ms' && entry.count > 0 ? finite(entry.total / entry.count) : null,
    ...(entry.unit === 'ms' ? { histogram: histogram(buckets, entry.count) } : {}),
  }));
  const recentRun = read.samples.findLast(sample => sample.runId)?.runId;
  return boundedReport(candidates, groups => {
    const omitted = candidates.length - groups.length;
    const lines: ReportLine[] = groups.map(entry => ({ kind: 'columns', cells: [
      [span(entry.name, 'code')], [span(METRIC_TAGS.filter(key => entry.tags[key]).map(key => `${key}=${entry.tags[key]}`).join(' ') || '—', 'muted')],
      [span(entry.count ?? 'unknown', 'number')], entry.unit === 'ms'
        ? [span('avg '), span(entry.average === null ? 'unknown' : Math.round(entry.average), 'number'), span('ms', 'unit'),
          span(' · max '), span(entry.max ?? 'unknown', 'number'), span('ms', 'unit'),
          ...histogramLine(entry.histogram)]
        : [span('total '), span(entry.total ?? 'unknown', 'number')],
    ] }));
    if (!candidates.length) lines.push({ kind: 'text', spans: [span(read.status === 'unavailable'
      ? 'Metrics unavailable; the structured logs could not be read.'
      : read.runId ? 'No metrics found for this run in the inspected log tails.'
        : 'No metrics recorded yet in the inspected log tails. Counters and timings are written at the end of each turn.',
    read.status === 'unavailable' ? 'warning' : 'text')] });
    if (omitted > 0) lines.push({ kind: 'text', spans: [span(`${omitted} metric groups omitted from this bounded report.`, 'muted')] });
    if (read.unreadableFiles) lines.push({ kind: 'text', spans: [span(`${read.unreadableFiles} log file(s) could not be read; available samples only.`, 'warning')] });
    if (read.filesTruncated) lines.push({ kind: 'text', spans: [span('Metric inspection reached its file or byte budget; older samples were omitted.', 'warning')] });
    if (read.samples.some(sample => sample.name === 'metrics.dropped')) lines.push({ kind: 'text',
      spans: [span('Some measurements were dropped at recording. The displayed distributions cover retained samples.', 'warning')] });
    if (candidates.some(entry => entry.count === null || entry.total === null || entry.max === null)) lines.push({ kind: 'text', spans: [span('Some aggregate values exceed numeric range and are unknown.', 'warning')] });
    lines.push({ kind: 'space' }, { kind: 'text', spans: [span(read.runId
      ? `Run ${read.runId} in the inspected structured log tails. Retained up to ${read.limit} matching metric samples.`
      : `Structured log tails across processes and sessions. Inspected up to ${LOG_TAIL_BYTES} bytes per file and ${read.limit} metric samples.`, 'muted')] },
      { kind: 'text', spans: [span('/log tail', 'command'), span(' shows timestamp, level, component and message without metric values.')] });
    if (!read.runId && recentRun) lines.push({ kind: 'text', spans: [span('Inspect a recent captured run '),
      span(`/metrics --run ${recentRun}`, 'command')] });
    return { title: 'Metrics', columns: [{ label: 'Metric', minWidth: 14 }, { label: 'Tags', minWidth: 16 },
      { label: 'Count', minWidth: 6, align: 'right' }, { label: 'Measure', minWidth: 18 }], lines,
      facts: { source: 'structured-log-tails', scope: read.runId ? 'run' : 'all-processes-and-sessions', status: read.status,
        runId: read.runId ?? null, histogramBoundsMs: DURATION_BOUNDS_MS,
        groupsTotal: candidates.length, groupsShown: groups.length, groupsOmitted: omitted, coverage: omitted > 0 ? 'partial' : 'complete',
        bytesPerFile: LOG_TAIL_BYTES, sampleLimit: read.limit, samplesRead: read.samples.length,
        filesInspected: read.filesInspected, unreadableFiles: read.unreadableFiles,
        filesTruncated: read.filesTruncated === true, bytesRead: read.bytesRead ?? null,
        groups: groups.map(entry => ({ ...entry, tags: { ...entry.tags } })) },
    };
  });
}

type HistogramReport =
  | { readonly coverage: 'unavailable'; readonly samples: 0 }
  | { readonly coverage: 'partial'; readonly samples: number; readonly counts: readonly number[] }
  | { readonly coverage: 'complete'; readonly samples: number; readonly counts: readonly number[];
    readonly p50: ReturnType<typeof histogramQuantile>; readonly p95: ReturnType<typeof histogramQuantile> };

function histogram(buckets: readonly number[] | undefined, count: number): HistogramReport {
  if (!buckets) return { coverage: 'unavailable' as const, samples: 0 };
  const samples = buckets.reduce((sum, amount) => sum + amount, 0);
  if (!Number.isSafeInteger(samples)) return { coverage: 'unavailable' as const, samples: 0 };
  if (samples !== count || samples === 0) return { coverage: 'partial' as const, samples, counts: buckets };
  return { coverage: 'complete' as const, samples, counts: buckets,
    p50: histogramQuantile(buckets, samples, 0.5), p95: histogramQuantile(buckets, samples, 0.95) };
}

function histogramLine(value: HistogramReport | undefined) {
  if (value?.coverage === 'partial') return [span(` · histogram n=${value.samples} (partial)`, 'muted')];
  if (value?.coverage !== 'complete') return [];
  const boundary = (entry: typeof value.p50) => `${entry.exceeds ? '>' : '≤'}${entry.boundMs}ms`;
  return [span(` · p50 ${boundary(value.p50)} · p95 ${boundary(value.p95)}`)];
}

function finite(value: number): number | null { return Number.isFinite(value) ? value : null; }

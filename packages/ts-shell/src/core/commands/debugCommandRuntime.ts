import { debugSyntax } from './debug/syntax.js';
import { parseSyntax } from './syntax/parse.js';
import { syntaxHelp } from './syntax/projection.js';
import type { CommandContext, LocalCommandResult } from './types.js';
import { getGlobalRotatingFileSink } from '../../observability/rotatingFileSink.js';
import { readStructuredLogs } from '../../observability/diagnostics.js';
import { inspectCrashLog } from '../../observability/crashLog.js';
import { readMetrics } from '../../observability/metrics/reader.js';
import { formatTimingReport } from '../../observability/startupTiming.js';
import { reportText } from './report/projection.js';
import { createReport, span } from './report/projection.js';
import { crashesReport, logsReport, timingReport, unavailableToolsReport } from './debug/report.js';
import { runMetricsCommand } from './metricsCommandRuntime.js';
import { runToolsCommand } from './toolsCommandRuntime.js';
import { redactReportText } from '../security/redaction.js';

/** Read-only views of the existing diagnostic stores and current tool pool. */
export async function runDebugCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(debugSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /debug arguments: ${parsed.reason}\n${syntaxHelp(debugSyntax)}` };
  if (parsed.action.name === 'metrics') return runMetricsCommand([], context);
  if (parsed.action.name === 'timings') return result(timingReport(formatTimingReport()));
  if (parsed.action.name === 'crashes') return result(crashesReport(inspectCrashLog(), context.cwd));
  if (parsed.action.name === 'tools') {
    try { return context.getToolPool ? await runToolsCommand([], context) : result(unavailableToolsReport()); }
    catch { return result(unavailableToolsReport()); }
  }
  const sink = getGlobalRotatingFileSink();
  const logs = readStructuredLogs(sink.getLogDir(), sink.getCurrentFilePath());
  if (parsed.action.name === 'logs') return result(logsReport(logs, context.cwd));
  const metrics = readMetrics(sink.getLogDir(), sink.getCurrentFilePath(), 2000);
  const crashes = inspectCrashLog();
  let tools: readonly string[] = [];
  let toolsStatus: 'reported' | 'unavailable' = context.getToolPool ? 'reported' : 'unavailable';
  try { if (context.getToolPool) tools = [...(await context.getToolPool()).keys()].sort().map(name => redactReportText(name, 240, { projectRoot: context.cwd })); }
  catch { toolsStatus = 'unavailable'; }
  const report = createReport({
    title: 'Debug diagnostics',
    columns: [{ label: 'Source', minWidth: 18 }, { label: 'Observed', minWidth: 12 }, { label: 'Status', minWidth: 18 }],
    lines: [
      { kind: 'columns', cells: [[span('Structured logs')], [span(logs.status === 'unavailable' ? 'unknown' : logs.entries.length, 'number')], [span(logs.status, logs.status === 'reported' ? 'success' : 'warning')]] },
      { kind: 'columns', cells: [[span('Crash records')], [span(crashes.status === 'unavailable' ? 'unknown' : crashes.records.length, 'number')], [span(crashes.status, crashes.status === 'reported' ? 'success' : 'warning')]] },
      { kind: 'columns', cells: [[span('Metric samples')], [span(metrics.status === 'unavailable' ? 'unknown' : metrics.samples.length, 'number')], [span(metrics.status, metrics.status === 'reported' ? 'success' : 'warning')]] },
      { kind: 'columns', cells: [[span('Available tools')], [span(toolsStatus === 'unavailable' ? 'unknown' : tools.length, 'number')], [span(toolsStatus, toolsStatus === 'reported' ? 'success' : 'warning')]] },
      { kind: 'text', spans: [span(`Timing: ${formatTimingReport().split('\n')[0]}`, 'muted')] },
      ...(logs.unreadableFiles ? [{ kind: 'text' as const, spans: [span(`${logs.unreadableFiles} log file(s) could not be read; counts are partial.`, 'warning')] }] : []),
      ...(metrics.unreadableFiles ? [{ kind: 'text' as const, spans: [span(`${metrics.unreadableFiles} metric log file(s) could not be read; values are partial.`, 'warning')] }] : []),
      { kind: 'text', spans: [span('Log and metric counts cover recent file tails; they are not complete historical totals.', 'muted')] },
      ...(crashes.reason || crashes.invalidRecords ? [{ kind: 'text' as const, spans: [span(`Crash source: ${crashes.reason ?? 'partial'}; invalid records: ${crashes.invalidRecords}.`, 'warning')] }] : []),
    ],
    facts: {
      status: logs.status === 'reported' && crashes.status === 'reported' && metrics.status === 'reported' && toolsStatus === 'reported' ? 'reported' : 'partial',
      logs: { status: logs.status, entries: logs.status === 'unavailable' ? null : logs.entries.length, filesInspected: logs.filesInspected, unreadableFiles: logs.unreadableFiles },
      crashes: crashes.status === 'unavailable' ? null : crashes.records.length,
      crashSource: { status: crashes.status, reason: crashes.reason ?? null, invalidRecords: crashes.invalidRecords },
      metrics: { status: metrics.status, samples: metrics.status === 'unavailable' ? null : metrics.samples.length, filesInspected: metrics.filesInspected, unreadableFiles: metrics.unreadableFiles },
      tools: { status: toolsStatus, count: toolsStatus === 'unavailable' ? null : tools.length, names: tools },
      timing: formatTimingReport(),
    },
  });
  return { kind: 'local', output: reportText(report), report };
}

function result(report: import('./report/contract.js').CommandReport): LocalCommandResult {
  return { kind: 'local', output: reportText(report), report };
}

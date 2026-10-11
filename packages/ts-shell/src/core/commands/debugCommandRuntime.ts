import { debugSyntax } from './debug/syntax.js';
import { parseSyntax } from './syntax/parse.js';
import { syntaxHelp } from './syntax/projection.js';
import type { CommandContext, LocalCommandResult } from './types.js';
import { getGlobalRotatingFileSink } from '../../observability/rotatingFileSink.js';
import { readStructuredLogs } from '../../observability/diagnostics.js';
import { readCrashLog } from '../../observability/crashLog.js';
import { readMetrics } from '../../observability/metrics/reader.js';
import { formatTimingReport } from '../../observability/startupTiming.js';
import { reportText } from './report/projection.js';
import { createReport, span } from './report/projection.js';

/** Report actual diagnostic stores and the current tool pool in one bounded view. */
export async function runDebugCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(debugSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /debug arguments: ${parsed.reason}\n${syntaxHelp(debugSyntax)}` };
  const sink = getGlobalRotatingFileSink();
  const logs = readStructuredLogs(sink.getLogDir(), sink.getCurrentFilePath());
  const metrics = readMetrics(sink.getLogDir(), sink.getCurrentFilePath(), 2000);
  const crashes = readCrashLog();
  let tools: readonly string[] = [];
  let toolsStatus: 'reported' | 'unavailable' = 'reported';
  try { tools = [...(context.getToolPool ? await context.getToolPool() : new Map()).keys()].sort(); }
  catch { toolsStatus = 'unavailable'; }
  const report = createReport({
    title: 'Debug diagnostics',
    columns: [{ label: 'Source', minWidth: 18 }, { label: 'Observed', minWidth: 12 }, { label: 'Status', minWidth: 18 }],
    lines: [
      { kind: 'columns', cells: [[span('Structured logs')], [span(logs.entries.length, 'number')], [span(logs.status, logs.status === 'reported' ? 'success' : 'warning')]] },
      { kind: 'columns', cells: [[span('Crash records')], [span(crashes.length, 'number')], [span('reported', 'success')]] },
      { kind: 'columns', cells: [[span('Metric samples')], [span(metrics.samples.length, 'number')], [span(metrics.status, metrics.status === 'reported' ? 'success' : 'warning')]] },
      { kind: 'columns', cells: [[span('Available tools')], [span(tools.length, 'number')], [span(toolsStatus, toolsStatus === 'reported' ? 'success' : 'warning')]] },
      { kind: 'text', spans: [span(`Timing: ${formatTimingReport().split('\n')[0]}`, 'muted')] },
      ...(logs.unreadableFiles ? [{ kind: 'text' as const, spans: [span(`${logs.unreadableFiles} log file(s) could not be read; counts are partial.`, 'warning')] }] : []),
      ...(metrics.unreadableFiles ? [{ kind: 'text' as const, spans: [span(`${metrics.unreadableFiles} metric log file(s) could not be read; values are partial.`, 'warning')] }] : []),
    ],
    facts: {
      status: logs.status === 'reported' && metrics.status === 'reported' && toolsStatus === 'reported' ? 'reported' : 'partial',
      logs: { entries: logs.entries.length, filesInspected: logs.filesInspected, unreadableFiles: logs.unreadableFiles },
      crashes: crashes.length,
      metrics: { samples: metrics.samples.length, filesInspected: metrics.filesInspected, unreadableFiles: metrics.unreadableFiles },
      tools: { count: tools.length, names: tools },
      timing: formatTimingReport(),
    },
  });
  return { kind: 'local', output: reportText(report), report };
}

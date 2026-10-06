import { metricsSyntax } from "./metrics/syntax.js";
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getGlobalRotatingFileSink } from "../../observability/rotatingFileSink.js";
import { readMetrics } from '../../observability/metrics/reader.js';
import { metricsReport } from '../../observability/metrics/report.js';
import { reportText } from './report/projection.js';

/** Read the existing metric log; no parallel telemetry store or provider call. */
export async function runMetricsCommand(args: string[], _context: CommandContext): Promise<LocalCommandResult> {
  const syntax = parseSyntax(metricsSyntax, args);
  if (!syntax.ok) return { kind: "local", output: `Invalid /metrics arguments: ${syntax.reason}\n${syntaxHelp(metricsSyntax)}` };
  const sink = getGlobalRotatingFileSink();
  const read = readMetrics(sink.getLogDir(), sink.getCurrentFilePath(), Number(syntax.args[0] ?? 2000));
  const report = metricsReport(read);
  return { kind: 'local', output: reportText(report), report };
}

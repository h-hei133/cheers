import { traceSyntax } from './trace/syntax.js';
import { parseSyntax } from './syntax/parse.js';
import { syntaxHelp } from './syntax/projection.js';
import type { CommandContext, LocalCommandResult } from './types.js';
import { getGlobalRotatingFileSink } from '../../observability/rotatingFileSink.js';
import { closeTraceDashboard, openTraceDashboard, traceDashboardStatus } from '../../observability/traceDashboard.js';

/** Open and close the loopback dashboard explicitly; no network or fake spans. */
export async function runTraceCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseSyntax(traceSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /trace arguments: ${parsed.reason}\n${syntaxHelp(traceSyntax)}` };
  if (parsed.action.name === 'close') return { kind: 'local', output: await closeTraceDashboard() ? 'Trace dashboard closed.' : 'Trace dashboard was not running.' };
  const current = traceDashboardStatus();
  if (parsed.action.name === 'status') return { kind: 'local', output: current ? `Trace dashboard active at ${current.url} (loopback only). Close with /trace close.` : 'Trace dashboard is not running.' };
  if (current) return { kind: 'local', output: `Trace dashboard already active at ${current.url} (loopback only). Close with /trace close.` };
  const sink = getGlobalRotatingFileSink();
  try {
    const dashboard = await openTraceDashboard(sink.getLogDir(), sink.getCurrentFilePath());
    return { kind: 'local', output: [`Trace dashboard listening at ${dashboard.url}`, 'Source: bounded structured logs; request/tool IDs come from recorded fields.', 'Missing spans and IDs are labeled as missing.', 'Close explicitly with /trace close.'].join('\n') };
  } catch (error) {
    return { kind: 'local', output: `Trace dashboard unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
}

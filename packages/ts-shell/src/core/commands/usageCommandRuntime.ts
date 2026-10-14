import type { CommandContext, LocalCommandResult } from './types.js';
import { getSessionUsage } from '../../observability/usageTelemetry.js';
import { parseUsageArgs, usageSyntax } from './usage/syntax.js';
import { syntaxHelp } from './syntax/projection.js';

/** Usage is measured local activity; account quota is unknown until an auth owner reports it. */
export async function runUsageCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  const parsed = parseUsageArgs(args);
  if (!parsed.ok || parsed.flags.has('help')) return { kind: 'local', output: `${!parsed.ok ? `${parsed.reason}\n` : ''}${syntaxHelp(usageSyntax)}` };
  if (parsed.action.name !== 'show') return context.usageCommand ? context.usageCommand(args, context)
    : { kind: 'local', output: 'Account quota: unavailable in this host. Account inspection and reset consumption require a bound interactive runtime; no credit was consumed.' };
  const usage = getSessionUsage(context.sessionId ?? '');
  return { kind: 'local', output: [`Measured session usage`, `- Turns: ${usage.turnsCount}`, `- Tokens recorded: ${Object.values(usage.byModel).reduce((sum, bucket) => sum + bucket.totalTokens, 0)}`, `- Account quota: unknown (provider account owner did not publish a snapshot)`, `- Reset credit: unavailable; no local reset is claimed`].join('\n') };
}

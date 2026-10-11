import type { CommandContext, LocalCommandResult } from './types.js';
import { getSessionUsage } from '../../observability/usageTelemetry.js';

/** Usage is measured local activity; account quota is unknown until an auth owner reports it. */
export async function runUsageCommand(args: string[], context: CommandContext): Promise<LocalCommandResult> {
  if (args.length > 1 || args.length > 0 && args[0] !== 'show' && args[0] !== 'status') return { kind: 'local', output: 'Usage: /usage [show|status]' };
  const usage = getSessionUsage(context.sessionId ?? '');
  return { kind: 'local', output: [`Measured session usage`, `- Turns: ${usage.turnsCount}`, `- Tokens recorded: ${Object.values(usage.byModel).reduce((sum, bucket) => sum + bucket.totalTokens, 0)}`, `- Account quota: unknown (provider account owner did not publish a snapshot)`, `- Reset credit: unavailable; no local reset is claimed`].join('\n') };
}

import { parseSyntax } from './syntax/parse.js';
import { cleanseSyntax } from './cleanse/syntax.js';
import type { CommandContext, CommandExecutionResult } from './types.js';

/** Retained diagnosis, exact patch approval and native verification share one owner. */
export async function runCleanseCommand(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(cleanseSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: 'Invalid /cleanse arguments: ' + parsed.reason };
  if (!context.securityCommand) return { kind: 'local', output: 'Cleanse requires the retained native diagnostic owner. Configure an explicit /security plan and scan first.', state: { status: 'unavailable', verification: 'not-run' } };
  const values = parsed.args;
  const delegated = parsed.action.name === 'diagnose' ? (values[0] ? ['show', values[0]] : ['scans'])
    : parsed.action.name === 'repair' ? ['disposition', values[0]!, values[1]!, 'propose', values[2]!]
      : parsed.action.name === 'apply' ? ['disposition', values[0]!, values[1]!, 'apply', values[2]!]
        : ['validate', ...values];
  return context.securityCommand(delegated, context);
}

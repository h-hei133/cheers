import { textSyntax, parseTextArgs } from './syntax/text.js';
import { syntaxHelp } from './syntax/projection.js';
import type { CommandContext, CommandExecutionResult } from './types.js';
export const commitSyntax = textSyntax('commit', 'guidance');
/** Compatibility entry: CLI composition injects the shared Git owner. */
export async function runCommitCommand(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseTextArgs(commitSyntax, args, context.rawCommandArgs);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /commit arguments: ${parsed.reason}\n${syntaxHelp(commitSyntax)}` };
  return context.commitCommand ? context.commitCommand([parsed.text], context)
    : { kind: 'local', output: 'Commit requires a bound session runtime; no Git write was attempted.' };
}

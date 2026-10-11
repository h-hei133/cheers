import { parseSyntax } from './syntax/parse.js';
import { initSyntax } from './rules/syntax.js';
import type { CommandContext, CommandExecutionResult } from './types.js';

/**
 * `/init` inspects bounded local metadata and returns a real rule-file proposal.
 * It never writes directly: the host may pass the proposal through the ordinary
 * prepared patch, approval, stale-content receipt, and readback path.
 */
export async function runInitCommand(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseSyntax(initSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /init arguments: ${parsed.reason}` };
  if (context.ruleControlsCommand) return context.ruleControlsCommand('init', args, context);
  return { kind: 'local', output: 'Initialization requires a bound source-read and patch approval owner.' };
}

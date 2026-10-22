import { textSyntax, parseTextArgs } from './syntax/text.js';
import { syntaxHelp } from './syntax/projection.js';
import type { CommandContext, CommandExecutionResult } from './types.js';
export const reviewSyntax = textSyntax('review', 'focus');
/** Advisory review uses the same native Git snapshot as the workbench. */
export async function runReviewCommand(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseTextArgs(reviewSyntax, args, context.rawCommandArgs);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /review arguments: ${parsed.reason}\n${syntaxHelp(reviewSyntax)}` };
  // A bare review has no focus parameter. Forwarding an empty string makes the
  // native Git syntax parser reject the request before it can inspect changes.
  const forwarded = parsed.text ? ['review', parsed.text] : ['review'];
  return context.gitCommand ? context.gitCommand(forwarded, context)
    : { kind: 'local', output: 'Git review requires a bound session runtime; review was not started.' };
}

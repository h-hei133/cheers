import { textSyntax, parseTextArgs } from './syntax/text.js';
import { syntaxHelp } from './syntax/projection.js';
import type { CommandContext, CommandExecutionResult } from './types.js';
import { skillBlock } from '../prompts/skills.js';
import { escapeAttribute, neutraliseTagBoundaries } from '../text/safety.js';
export const reviewSyntax = textSyntax('review', 'focus');

/** Review owns the native Git snapshot and one final prompt; it is not a pure modifier. */
export function prepareReviewComposition() {
  return { args: [] as const };
}

function composedReviewFocus(composed: NonNullable<CommandContext['composedPrompt']>): string {
  const methods = composed.modifiers.map(method => [
    `<method name="${escapeAttribute(method.name)}">`,
    neutraliseTagBoundaries(method.instruction),
    '</method>',
  ].join('\n'));
  return [...composed.skills.map(skillBlock), ...methods, composed.prose.trim()].filter(Boolean).join('\n\n');
}

/** Advisory review uses the same native Git snapshot as the workbench. */
export async function runReviewCommand(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseTextArgs(reviewSyntax, args, context.rawCommandArgs);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /review arguments: ${parsed.reason}\n${syntaxHelp(reviewSyntax)}` };
  const composed = context.composedPrompt ? composedReviewFocus(context.composedPrompt) : '';
  const focus = [parsed.text, composed].filter(Boolean).join('\n\n');
  // A bare review has no focus parameter. Forwarding an empty string makes the
  // native Git syntax parser reject the request before it can inspect changes.
  const forwarded = focus ? ['review', focus] : ['review'];
  return context.gitCommand ? context.gitCommand(forwarded, context)
    : { kind: 'local', output: 'Git review requires a bound session runtime; review was not started.' };
}

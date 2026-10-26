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

/** Share argument and focus preparation between dispatch and the read-only preview. */
export function prepareReviewRequest(
  args: readonly string[],
  context: Pick<CommandContext, 'rawCommandArgs' | 'composedPrompt'>,
): { readonly ok: true; readonly focus: string } | { readonly ok: false; readonly reason: string } {
  const parsed = parseTextArgs(reviewSyntax, args, context.rawCommandArgs);
  if (!parsed.ok) return { ok: false, reason: parsed.reason };
  const composed = context.composedPrompt ? composedReviewFocus(context.composedPrompt) : '';
  return { ok: true, focus: [parsed.text, composed].filter(Boolean).join('\n\n') };
}

/** Advisory review uses the same native Git snapshot as the workbench. */
export async function runReviewCommand(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const request = prepareReviewRequest(args, context);
  if (!request.ok) return { kind: 'local', output: `Invalid /review arguments: ${request.reason}\n${syntaxHelp(reviewSyntax)}` };
  // A bare review has no focus parameter. Forwarding an empty string makes the
  // native Git syntax parser reject the request before it can inspect changes.
  const forwarded = request.focus ? ['review', request.focus] : ['review'];
  return context.gitCommand ? context.gitCommand(forwarded, context)
    : { kind: 'local', output: 'Git review requires a bound session runtime; review was not started.' };
}

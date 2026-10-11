import { parseSyntax } from './syntax/parse.js';
import { rulesSyntax } from './rules/syntax.js';
import type { CommandContext, CommandExecutionResult } from './types.js';
import { proposeRules } from '../../workflow/rules/proposal.js';

type RuleControlContext = CommandContext & {
  readonly ruleControlsCommand?: (name: 'init' | 'rules' | 'cleanse' | 'context', args: string[], context: CommandContext) => Promise<CommandExecutionResult>;
};

export async function runRulesCommand(args: string[], context: CommandContext): Promise<CommandExecutionResult> {
  const host = context as RuleControlContext;
  const parsed = parseSyntax(rulesSyntax, args);
  if (!parsed.ok) return { kind: 'local', output: `Invalid /rules arguments: ${parsed.reason}` };
  if (host.ruleControlsCommand) return host.ruleControlsCommand('rules', args, context);
  return { kind: 'local', output: 'Rule proposals require a bound source-read and patch approval owner.' };
}

export function renderRuleProposal(proposal: { readonly target: string; readonly preview: string; readonly write: string; readonly sourceDigest: string; readonly after: string }): string {
  return ['Rule proposal preview', `Target: ${proposal.target}`, `Write state: ${proposal.write}`, `Expected content SHA-256: ${proposal.sourceDigest}`,
    proposal.preview || '(No file content would change.)', '', 'No write was performed. Explicit ordinary tool approval and stale-content verification are required.'].join('\n');
}

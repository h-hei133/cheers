import type { CommandDefinition } from '../types.js';
import { syntaxCompletions, syntaxHint } from '../syntax/projection.js';
import { gitSyntax, worktreeSyntax } from './syntax.js';

export function gitCommandDefinitions(): CommandDefinition[] {
  return [{ name: 'git', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'inspect native Git files, split diffs and branches; separately approve exact staging, commits, merges and pushes',
    argumentHint: syntaxHint(gitSyntax), getArgumentCompletions: prefix => syntaxCompletions(gitSyntax, prefix),
    execute: (args, context) => context.gitCommand ? context.gitCommand(args, context) : Promise.resolve({ kind: 'local', output: 'Git workbench requires a bound session runtime.' }) },
  { name: 'wt', aliases: ['worktree'], kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workspace',
    summary: 'create, switch, preserve dirty changes and migrate the same session, or remove an owned clean worktree',
    argumentHint: syntaxHint(worktreeSyntax), getArgumentCompletions: prefix => syntaxCompletions(worktreeSyntax, prefix),
    execute: (args, context) => context.worktreeCommand ? context.worktreeCommand(args, context) : Promise.resolve({ kind: 'local', output: 'Worktree operation requires a bound session runtime.' }) }];
}

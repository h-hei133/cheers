import type { CommandDefinition } from '../types.js';

export function gitCommandDefinitions(): CommandDefinition[] {
  return [{ name: 'git', kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workflow',
    summary: 'inspect native Git files, split diffs and branches; separately approve exact staging, commits, merges and pushes',
    argumentHint: '[status|diff|stage|unstage|commit|branch|merge|push|reconcile|review|goal]',
    execute: (args, context) => context.gitCommand ? context.gitCommand(args, context) : Promise.resolve({ kind: 'local', output: 'Git workbench requires a bound session runtime.' }) },
  { name: 'wt', aliases: ['worktree'], kind: 'local', supportsNonInteractive: true, availability: 'available', enabled: true, group: 'workspace',
    summary: 'create, switch, preserve dirty changes and migrate the same session, or remove an owned clean worktree',
    argumentHint: '[list|create <path> <branch>|migrate <path> <branch>|switch <path>|delete <path>]',
    execute: (args, context) => context.worktreeCommand ? context.worktreeCommand(args, context) : Promise.resolve({ kind: 'local', output: 'Worktree operation requires a bound session runtime.' }) }];
}

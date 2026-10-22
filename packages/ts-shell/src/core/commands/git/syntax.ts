import type { CommandSyntax } from '../syntax/model.js';

const path = { name: 'path', kind: 'text', required: true } as const;
const branch = { name: 'branch', kind: 'text', required: true } as const;
const optionalPath = { name: 'path', kind: 'text', required: true } as const;
const hunk = { name: 'hunk-id', kind: 'text' } as const;
const message = { name: 'message', kind: 'text', required: true, rest: true } as const;
const scope = { name: 'staged|unstaged|untracked', kind: 'text', required: true, values: ['staged', 'unstaged', 'untracked'] } as const;
const branchAction = { name: 'create|switch|delete', kind: 'text', required: true, values: ['create', 'switch', 'delete'] } as const;

export const gitSyntax: CommandSyntax = {
  name: 'git',
  defaultAction: 'status',
  actions: [
    { name: 'status', summary: 'show the working tree and branch state' },
    { name: 'diff', summary: 'inspect the native diff', parameters: [scope, optionalPath] },
    { name: 'stage', summary: 'approve exact paths for staging', parameters: [optionalPath, hunk] },
    { name: 'unstage', summary: 'approve exact paths for unstaging', parameters: [optionalPath, hunk] },
    { name: 'commit', summary: 'approve an exact commit', parameters: [message] },
    { name: 'branch', summary: 'inspect or create a branch', parameters: [branchAction, branch] },
    { name: 'merge', summary: 'approve a merge', parameters: [branch] },
    { name: 'push', summary: 'approve an exact push', parameters: [
      { name: 'remote', kind: 'text', required: true },
      { name: 'ref', kind: 'text', required: true },
    ] },
    { name: 'reconcile', summary: 'reconcile a previous Git operation', parameters: [
      { name: 'id', kind: 'text', required: true },
    ] },
    { name: 'review', summary: 'review the current changes', parameters: [
      { name: 'focus', kind: 'text', rest: true },
    ] },
    { name: 'goal', summary: 'work on the current Git goal' },
  ],
};

export const worktreeSyntax: CommandSyntax = {
  name: 'wt',
  defaultAction: 'list',
  actions: [
    { name: 'list', summary: 'list owned and available worktrees' },
    { name: 'create', summary: 'create a worktree', parameters: [path, branch] },
    { name: 'migrate', summary: 'migrate this session into a worktree', parameters: [path, branch] },
    { name: 'switch', summary: 'switch to an existing worktree', parameters: [path] },
    { name: 'delete', summary: 'remove an owned clean worktree', parameters: [path] },
  ],
};

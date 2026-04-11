#!/usr/bin/env node

import { getGitWorkflowContext } from './git-workflow.mjs'

const context = getGitWorkflowContext(process.cwd())

if (!context.insideGit) {
  console.log('Not inside a git worktree/repository.')
  process.exit(0)
}

console.log('🔀 Daily Workflow Status\n')
console.log(`Branch: ${context.branch ?? 'unknown'}`)
console.log(`Repo root: ${context.root ?? 'unknown'}`)
console.log(`Workspace clean: ${context.isClean ? 'yes' : 'no'}`)
console.log(`Worktree mode: ${context.currentWorktree ? 'yes' : 'main worktree'}`)

if (context.currentWorktree) {
  console.log(`Current worktree: ${context.currentWorktree.path}`)
}

if (context.statusLines.length > 0) {
  console.log('\nChanges:')
  for (const line of context.statusLines) {
    console.log(`- ${line}`)
  }
}

if (context.worktrees.length > 0) {
  console.log('\nKnown worktrees:')
  for (const item of context.worktrees) {
    console.log(`- ${item.path}${item.branch ? ` [${item.branch}]` : ''}`)
  }
}

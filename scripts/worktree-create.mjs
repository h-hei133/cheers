#!/usr/bin/env node

import path from 'node:path'
import { createWorktree, getGitWorkflowContext } from './git-workflow.mjs'

const branchName = process.argv[2]
const targetArg = process.argv[3]

if (!branchName || !targetArg) {
  console.error('Usage: node scripts/worktree-create.mjs <branch-name> <target-path>')
  process.exit(1)
}

const context = getGitWorkflowContext(process.cwd())
if (!context.insideGit) {
  console.error('Cannot create worktree outside a git repository.')
  process.exit(1)
}

const targetPath = path.resolve(targetArg)
const result = createWorktree(branchName, targetPath, process.cwd())

if (!result.ok) {
  console.error(result.stderr || `Failed to create worktree for ${branchName}`)
  process.exit(1)
}

console.log(`✓ Created worktree: ${targetPath}`)
console.log(`✓ Branch: ${branchName}`)
console.log('Tip: enter the new worktree and run `npm run setup` before starting work.')

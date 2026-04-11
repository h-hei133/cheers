#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'

function runGit(args, cwd = process.cwd()) {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    shell: false,
  })

  return {
    ok: !result.error && result.status === 0,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
  }
}

export function getGitWorkflowContext(cwd = process.cwd()) {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], cwd)
  if (!inside.ok || inside.stdout !== 'true') {
    return {
      insideGit: false,
      branch: null,
      isClean: null,
      isWorktree: null,
      root: null,
      currentWorktree: null,
      worktrees: [],
      statusLines: [],
    }
  }

  const root = runGit(['rev-parse', '--show-toplevel'], cwd)
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  const status = runGit(['status', '--short'], cwd)
  const worktreeList = runGit(['worktree', 'list', '--porcelain'], cwd)

  const parsedWorktrees = parseWorktrees(worktreeList.stdout)
  const normalizedCwd = path.resolve(cwd)
  const currentWorktree = parsedWorktrees.find(item => path.resolve(item.path) === normalizedCwd) ?? null

  return {
    insideGit: true,
    branch: branch.ok ? branch.stdout : null,
    isClean: status.ok ? status.stdout.length === 0 : null,
    isWorktree: parsedWorktrees.length > 1 || currentWorktree !== null,
    root: root.ok ? root.stdout : null,
    currentWorktree,
    worktrees: parsedWorktrees,
    statusLines: status.ok && status.stdout ? status.stdout.split('\n') : [],
  }
}

function parseWorktrees(raw) {
  if (!raw) {
    return []
  }

  const blocks = raw.split('\n\n').filter(Boolean)
  return blocks.map(block => {
    const lines = block.split('\n')
    const item = { path: '', branch: null, head: null }
    for (const line of lines) {
      if (line.startsWith('worktree ')) {
        item.path = line.slice('worktree '.length)
      } else if (line.startsWith('branch ')) {
        item.branch = line.slice('branch refs/heads/'.length)
      } else if (line.startsWith('HEAD ')) {
        item.head = line.slice('HEAD '.length)
      }
    }
    return item
  })
}

export function createWorktree(branchName, targetPath, cwd = process.cwd()) {
  return runGit(['worktree', 'add', targetPath, '-b', branchName], cwd)
}

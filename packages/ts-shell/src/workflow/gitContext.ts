import { inspectGitDiscovery } from '../runtime/execution/discovery.js'

export interface WorkflowGitContext {
  readonly insideGit: boolean
  readonly branch: string | null
  readonly isClean: boolean | null
  readonly root: string | null
}

export interface WorkflowGitFileChange {
  readonly path: string
  readonly indexStatus: string
  readonly workTreeStatus: string
  readonly staged: boolean
  readonly unstaged: boolean
  readonly untracked: boolean
  readonly conflicted: boolean
}

export interface WorkflowGitDiagnostics {
  readonly statusAvailable: boolean
  readonly insideGit: boolean
  readonly branch: string | null
  readonly root: string | null
  readonly ahead: number
  readonly behind: number
  readonly stagedCount: number
  readonly unstagedCount: number
  readonly untrackedCount: number
  readonly conflictedCount: number
  readonly entries: readonly WorkflowGitFileChange[]
}

function runGit(args: string[], cwd: string) {
  return inspectGitDiscovery(args, cwd)
}

export function getWorkflowGitDiagnostics(
  cwd: string = process.cwd(),
  options?: { readonly limit?: number },
): WorkflowGitDiagnostics {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], cwd)
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return {
      statusAvailable: false,
      insideGit: false,
      branch: null,
      root: null,
      ahead: 0,
      behind: 0,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      entries: [],
    }
  }

  const status = runGit(['status', '--porcelain=v1', '-z', '--branch', '--untracked-files=all'], cwd)
  const root = runGit(['rev-parse', '--show-toplevel'], cwd)
  if (!status.ok) {
    return {
      statusAvailable: false,
      insideGit: true,
      branch: null,
      root: root.ok ? root.stdout.trim() : null,
      ahead: 0,
      behind: 0,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      entries: [],
    }
  }

  const lines = status.stdout.split('\0').filter(Boolean)
  const header = lines[0]?.startsWith('## ') ? lines[0] : undefined
  const body = header ? lines.slice(1) : lines
  const parsedHeader = parseBranchHeader(header)
  const limit = Math.max(1, options?.limit ?? 30)
  const entries: WorkflowGitFileChange[] = []
  for (let index = 0; index < body.length; index++) {
    const entry = parsePorcelainEntry(body[index]!)
    if (entry) entries.push(entry)
    // In -z output the destination is first; rename/copy has a second source field.
    if (/^[RC]|^.[RC]/.test(body[index]!)) index++
  }

  const stagedCount = entries.filter(entry => entry.staged).length
  const unstagedCount = entries.filter(entry => entry.unstaged).length
  const untrackedCount = entries.filter(entry => entry.untracked).length
  const conflictedCount = entries.filter(entry => entry.conflicted).length

  return {
    statusAvailable: true,
    insideGit: true,
    branch: parsedHeader.branch,
    root: root.ok ? root.stdout.trim() : null,
    ahead: parsedHeader.ahead,
    behind: parsedHeader.behind,
    stagedCount,
    unstagedCount,
    untrackedCount,
    conflictedCount,
    entries: entries.slice(0, limit),
  }
}

function parseBranchHeader(
  line: string | undefined,
): {
  branch: string | null
  ahead: number
  behind: number
} {
  if (!line) {
    return { branch: null, ahead: 0, behind: 0 }
  }

  const trimmed = line.replace(/^##\s*/, '').trim()
  const branch = trimmed
    .split('...')
    .at(0)
    ?.split(' [')
    .at(0)
    ?.trim() || null
  const aheadMatch = trimmed.match(/ahead\s+(\d+)/)
  const behindMatch = trimmed.match(/behind\s+(\d+)/)

  return {
    branch,
    ahead: aheadMatch ? Number(aheadMatch[1]) : 0,
    behind: behindMatch ? Number(behindMatch[1]) : 0,
  }
}

function parsePorcelainEntry(line: string): WorkflowGitFileChange | null {
  if (line.length < 3) {
    return null
  }

  const indexStatus = line.slice(0, 1)
  const workTreeStatus = line.slice(1, 2)
  const rawPath = line.slice(3)
  if (!rawPath) {
    return null
  }
  const path = rawPath
  const untracked = indexStatus === '?' && workTreeStatus === '?'
  const conflicted =
    indexStatus === 'U' ||
    workTreeStatus === 'U' ||
    (indexStatus === 'A' && workTreeStatus === 'A') ||
    (indexStatus === 'D' && workTreeStatus === 'D')
  const staged = indexStatus !== ' ' && indexStatus !== '?'
  const unstaged = workTreeStatus !== ' ' && workTreeStatus !== '?'

  return {
    path,
    indexStatus,
    workTreeStatus,
    staged,
    unstaged,
    untracked,
    conflicted,
  }
}

export function getWorkflowGitContext(cwd: string = process.cwd()): WorkflowGitContext {
  const inside = runGit(['rev-parse', '--is-inside-work-tree'], cwd)
  if (!inside.ok || inside.stdout.trim() !== 'true') {
    return {
      insideGit: false,
      branch: null,
      isClean: null,
      root: null,
    }
  }

  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd)
  const status = runGit(['status', '--short'], cwd)
  const root = runGit(['rev-parse', '--show-toplevel'], cwd)

  return {
    insideGit: true,
    branch: branch.ok ? branch.stdout.trim() : null,
    isClean: status.ok ? status.stdout.length === 0 : null,
    root: root.ok ? root.stdout.trim() : null,
  }
}

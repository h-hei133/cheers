import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { getWorkflowGitContext, getWorkflowGitDiagnostics } from '../../workflow/gitContext.js'
import type { CommandContext, LocalCommandResult } from './types.js'

export async function runDoctorCommand(context: CommandContext): Promise<LocalCommandResult> {
  const runtimeConfig = getRuntimeConfig(context.cwd)
  const gitContext = getWorkflowGitContext(context.cwd)

  const lines = [
    'Private Coding Agents CLI Doctor',
    `Execution path: ${runtimeConfig.daemonEnabled ? 'rust-daemon' : 'ts-local'}`,
    `Provider: ${runtimeConfig.provider}`,
    `Max turns: ${runtimeConfig.maxTurns}`,
    `Config sources: ${runtimeConfig.configSources.join(', ') || 'none'}`,
    `Workspace: ${context.cwd}`,
  ]

  if (gitContext.insideGit) {
    lines.push(`Git branch: ${gitContext.branch ?? 'unknown'}`)
    lines.push(`Workspace clean: ${gitContext.isClean ? 'yes' : 'no'}`)
    lines.push(`Git root: ${gitContext.root ?? 'unknown'}`)
  }

  return {
    kind: 'local',
    output: lines.join('\n'),
  }
}

export async function runWorkflowStatusCommand(context: CommandContext): Promise<LocalCommandResult> {
  const diagnostics = getWorkflowGitDiagnostics(context.cwd, { limit: 12 })
  if (!diagnostics.insideGit) {
    return { kind: 'local', output: 'Not inside a git workspace.' }
  }

  return {
    kind: 'local',
    output: [
      `Branch: ${diagnostics.branch ?? 'unknown'}`,
      `Ahead/behind: +${diagnostics.ahead} / -${diagnostics.behind}`,
      `Changes: staged ${diagnostics.stagedCount}, unstaged ${diagnostics.unstagedCount}, untracked ${diagnostics.untrackedCount}, conflicted ${diagnostics.conflictedCount}`,
      `Workspace clean: ${
        diagnostics.stagedCount +
          diagnostics.unstagedCount +
          diagnostics.untrackedCount +
          diagnostics.conflictedCount ===
        0
          ? 'yes'
          : 'no'
      }`,
      `Git root: ${diagnostics.root ?? 'unknown'}`,
    ].join('\n'),
  }
}

export async function runDiagnoseCommand(context: CommandContext): Promise<LocalCommandResult> {
  const runtimeConfig = getRuntimeConfig(context.cwd)
  const diagnostics = getWorkflowGitDiagnostics(context.cwd, { limit: 12 })
  const lines = [
    'Repository diagnosis',
    `Execution path: ${runtimeConfig.daemonEnabled ? 'rust-daemon' : 'ts-local'}`,
    `Provider: ${runtimeConfig.provider}`,
    `Workspace: ${context.cwd}`,
  ]

  if (!diagnostics.insideGit) {
    lines.push('Git: not a repository')
    lines.push('Next: /workspace attach <git-project-path> and rerun /diagnose.')
    return {
      kind: 'local',
      output: lines.join('\n'),
    }
  }

  lines.push(`Branch: ${diagnostics.branch ?? 'unknown'} (+${diagnostics.ahead}/-${diagnostics.behind})`)
  lines.push(
    `Change inventory: staged ${diagnostics.stagedCount} | unstaged ${diagnostics.unstagedCount} | untracked ${diagnostics.untrackedCount} | conflicted ${diagnostics.conflictedCount}`,
  )
  lines.push(`Git root: ${diagnostics.root ?? 'unknown'}`)

  if (diagnostics.entries.length === 0) {
    lines.push('Working tree is clean.')
    lines.push('Next: start a task directly (for example: "Implement ... and verify with ...").')
    return {
      kind: 'local',
      output: lines.join('\n'),
    }
  }

  lines.push('Changed files (top 12):')
  for (const entry of diagnostics.entries) {
    lines.push(
      `- [${entry.indexStatus}${entry.workTreeStatus}] ${entry.path}`,
    )
  }

  const hotspotDirs = summarizeHotspotDirs(diagnostics.entries.map(entry => entry.path), 3)
  if (hotspotDirs.length > 0) {
    lines.push(`Hotspot directories: ${hotspotDirs.join(', ')}`)
  }

  if (diagnostics.conflictedCount > 0) {
    lines.push('Next: resolve merge conflicts first, then rerun /diagnose.')
  } else if (diagnostics.stagedCount > 0 && diagnostics.unstagedCount === 0) {
    lines.push('Next: staged changes detected; run targeted verification before commit.')
  } else {
    lines.push('Next: ask for focused edit+verify on listed files (example: "Fix failing flow in <file> and run verification").')
  }

  return {
    kind: 'local',
    output: lines.join('\n'),
  }
}

function summarizeHotspotDirs(paths: readonly string[], limit: number): string[] {
  const weights = new Map<string, number>()
  for (const filePath of paths) {
    const normalized = filePath.replace(/\\/g, '/')
    const segments = normalized.split('/').filter(Boolean)
    const key = segments.length > 1 ? segments.slice(0, -1).join('/') : '.'
    weights.set(key, (weights.get(key) ?? 0) + 1)
  }

  return Array.from(weights.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([dir]) => dir)
}

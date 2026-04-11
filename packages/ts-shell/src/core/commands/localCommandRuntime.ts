import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { getWorkflowGitContext } from '../../workflow/gitContext.js'
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
  const gitContext = getWorkflowGitContext(context.cwd)
  if (!gitContext.insideGit) {
    return { kind: 'local', output: 'Not inside a git workspace.' }
  }

  return {
    kind: 'local',
    output: [
      `Branch: ${gitContext.branch ?? 'unknown'}`,
      `Workspace clean: ${gitContext.isClean ? 'yes' : 'no'}`,
      `Git root: ${gitContext.root ?? 'unknown'}`,
    ].join('\n'),
  }
}

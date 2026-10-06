import { rejectArguments } from "./syntax/empty.js";
import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { getWorkflowGitContext, getWorkflowGitDiagnostics } from '../../workflow/gitContext.js'
import type { CommandContext, LocalCommandResult } from './types.js'
import { diagnoseReport } from '../../workflow/diagnose/report.js'
import { reportText } from './report/projection.js'

export async function runDoctorCommand(context: CommandContext): Promise<LocalCommandResult> {
  const runtimeConfig = context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd)
  const gitContext = getWorkflowGitContext(context.cwd)

  const lines = [
    'Cheers CLI Doctor',
    'Execution path: ts-local',
    `Provider: ${runtimeConfig.provider}`,
    `Max turns: ${runtimeConfig.maxTurns}`,
    `Config sources: ${runtimeConfig.configSources.join(', ') || 'none'}`,
    `Workspace: ${context.cwd}`,
  ]

  // Reported here because this is where someone looks when the product is not
  // behaving as their configuration says it should. A skipped file explains
  // that in one line, and without it the only symptom is a setting that seems
  // to have been ignored.
  for (const diagnostic of runtimeConfig.configDiagnostics) {
    lines.push(`Config problem: ${diagnostic}`)
  }

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
  if (!diagnostics.statusAvailable) {
    return { kind: 'local', output: 'Git status unavailable; the working tree has not been verified.' }
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

export async function runDiagnoseCommand(context: CommandContext, args: string[] = []): Promise<LocalCommandResult> {
  const invalid = rejectArguments("diagnose", args);
  if (invalid) return invalid;
  const runtimeConfig = context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd)
  const diagnostics = getWorkflowGitDiagnostics(context.cwd, { limit: 12 })
  const report = diagnoseReport(runtimeConfig, diagnostics, context.cwd)
  return { kind: 'local', output: reportText(report), report }
}

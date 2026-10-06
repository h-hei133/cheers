import { rejectArguments } from "./syntax/empty.js";
import { getRuntimeConfig } from '../../config/runtimeConfig.js'
import { getWorkflowGitContext, getWorkflowGitDiagnostics } from '../../workflow/gitContext.js'
import type { CommandContext, LocalCommandResult } from './types.js'
import { needsUserEndpoint } from "../providers/facts.js";

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

export async function runDiagnoseCommand(context: CommandContext, args: string[] = []): Promise<LocalCommandResult> {
  const invalid = rejectArguments("diagnose", args);
  if (invalid) return invalid;
  const runtimeConfig = context.runtimeConfig ?? getRuntimeConfig(context.projectRoot ?? context.cwd)
  const diagnostics = getWorkflowGitDiagnostics(context.cwd, { limit: 12 })
  const lines = [
    'Repository diagnosis',
    'Execution path: ts-local',
    `Provider: ${runtimeConfig.provider}`,
    `Active connection: ${runtimeConfig.activeProviderConnectionId ?? 'none'}`,
    `Provider config: ${summarizeProviderConfig(runtimeConfig)}`,
    'Provider readiness: not checked by /diagnose.',
    'Provider next: /connect status for saved config; npm run verify:provider-readiness for live endpoint readiness.',
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

function summarizeProviderConfig(runtimeConfig: ReturnType<typeof getRuntimeConfig>): string {
  const activeId = runtimeConfig.activeProviderConnectionId
  if (!activeId) {
    return 'no active connection; run /connect login or /connect use'
  }

  const activeConnection = runtimeConfig.providerConnections.find(
    connection => connection.id === activeId,
  )
  if (!activeConnection) {
    return 'active connection not found; run /connect status then /connect use <connection-id>'
  }

  if (activeConnection.status === 'pending') {
    return 'connection setup pending; finish login/browser flow or rerun /connect login'
  }

  if (activeConnection.status === 'error') {
    return 'connection setup error; rerun /connect login for this provider'
  }

  if (activeConnection.authType !== 'account-auth' && !activeConnection.apiKey?.trim()) {
    return 'credential missing; run /connect login <provider> --api-key <key>'
  }

  if (needsUserEndpoint(activeConnection.provider) && !activeConnection.baseUrl?.trim()) {
    return 'base URL missing; rerun /connect login with --base-url <url>'
  }

  if (needsUserEndpoint(activeConnection.provider) && !activeConnection.model?.trim()) {
    return 'model missing; run /model use <model-id> or rerun /connect login with --model <model>'
  }

  return 'configured; live endpoint readiness not checked'
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

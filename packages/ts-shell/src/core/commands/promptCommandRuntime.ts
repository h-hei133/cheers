import type { CommandContext, ShellActionResult } from './types.js'

function isSessionIdCandidate(token: string | undefined): boolean {
  if (!token) {
    return false
  }
  return /^sess_[a-z0-9_]+$/i.test(token)
}

export async function runContinuePromptCommand(
  args: string[],
  _context: CommandContext,
): Promise<ShellActionResult> {
  const firstArg = args[0]
  const hasExplicitSession = isSessionIdCandidate(firstArg)
  const sessionId = hasExplicitSession ? firstArg : undefined
  const continuationPrompt = hasExplicitSession ? args.slice(1).join(' ').trim() : args.join(' ').trim()

  return {
    kind: 'shell-action',
    action: 'continue-session',
    sessionId,
    continuationPrompt: continuationPrompt.length > 0 ? continuationPrompt : undefined,
  }
}

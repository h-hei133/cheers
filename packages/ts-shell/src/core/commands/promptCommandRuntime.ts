import type { CommandContext, ShellActionResult } from './types.js'

export async function runResumePromptCommand(
  args: string[],
  _context: CommandContext,
): Promise<ShellActionResult> {
  const sessionId = args[0]
  return {
    kind: 'shell-action',
    action: 'resume-session',
    sessionId,
  }
}

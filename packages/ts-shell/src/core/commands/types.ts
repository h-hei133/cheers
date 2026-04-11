export type CommandKind = 'local' | 'prompt' | 'shell-action'

export interface CommandContext {
  readonly cwd: string
}

export interface LocalCommandResult {
  readonly kind: 'local'
  readonly output: string
}

export interface PromptCommandResult {
  readonly kind: 'prompt'
  readonly prompt: string
}

export interface ShellActionResult {
  readonly kind: 'shell-action'
  readonly action: 'resume-session' | 'cancel-run' | 'list-sessions' | 'show-mcp' | 'show-help'
  readonly sessionId?: string
}

export type CommandExecutionResult = LocalCommandResult | PromptCommandResult | ShellActionResult

export interface CommandDefinition {
  readonly name: string
  readonly aliases?: readonly string[]
  readonly kind: CommandKind
  readonly availability?: 'available' | 'hidden'
  readonly enabled?: boolean
  readonly bridgeSafe?: boolean
  execute(args: string[], context: CommandContext): Promise<CommandExecutionResult>
}

import type { CompactLiveCheckpointStore } from '../context/compactLiveCheckpoint.js'
import type { CompactInjectionStateStore } from '../context/compactInjectionState.js'
import type { ProjectMemoryReviewStateStore } from '../context/projectMemoryReviewState.js'
import type { ProjectMemoryInjectionStateStore } from '../context/projectMemoryInjectionState.js'
import type { ProjectMemoryStore } from '../context/projectMemoryStoreContract.js'
import type { StartupWarmContextCacheStore } from '../context/startupWarmContextHealth.js'

export type CommandKind = 'local' | 'prompt' | 'shell-action'

export interface CommandContext {
  readonly cwd: string
  readonly sessionId?: string
  readonly rawCommandName?: string
  readonly compactCheckpointStore?: CompactLiveCheckpointStore
  readonly compactInjectionStateStore?: CompactInjectionStateStore
  readonly projectMemoryReviewStateStore?: ProjectMemoryReviewStateStore
  readonly projectMemoryInjectionStateStore?: ProjectMemoryInjectionStateStore
  readonly projectMemoryStore?: ProjectMemoryStore
  readonly startupWarmContextCacheStore?: StartupWarmContextCacheStore
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
  readonly action:
    | 'continue-session'
    | 'resume-session'
    | 'cancel-run'
    | 'list-sessions'
    | 'show-workspace'
    | 'show-mcp'
    | 'show-help'
    | 'set-view'
    | 'show-view'
    | 'manage-permissions'
    | 'set-agent-mode'
    | 'show-agent-mode'
  readonly sessionId?: string
  readonly viewMode?: 'compact' | 'verbose'
  readonly agentMode?: 'plan' | 'build'
  readonly sessionAction?: 'panel' | 'list' | 'switch' | 'current' | 'help'
  readonly permissionAction?: 'list' | 'explain' | 'revoke' | 'reset'
  readonly permissionSelector?: string
  readonly mcpAction?: 'status' | 'tools' | 'doctor' | 'refresh'
  readonly mcpTarget?: string
  readonly workspaceAction?: 'status' | 'attach' | 'recent'
  readonly workspaceTarget?: string
  readonly continuationPrompt?: string
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

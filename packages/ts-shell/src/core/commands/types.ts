import type { CompactLiveCheckpointStore } from '../../context/compact/checkpoint/compactLiveCheckpoint.js'
import type { CompactInjectionStateStore } from '../../context/compact/injection/compactInjectionState.js'
import type { ProjectMemoryReviewStateStore } from '../../memory/projectMemoryReviewState.js'
import type { ProjectMemoryInjectionStateStore } from '../../memory/projectMemoryInjectionState.js'
import type { ProjectMemoryStore } from '../../memory/projectMemoryStoreContract.js'
import type { StartupWarmContextCacheStore } from '../../context/startup/startupWarmContextHealth.js'
import type { BrowserExecutor } from '../context/browserExecutor.js'
import type { BrowserExecutionConfirmationRecord } from '../context/browserExecutionConfirmation.js'
import type { BrowserNetworkAllowlist } from '../context/browserNetworkAllowlist.js'
import type { BrowserSandboxAuthority } from '../context/browserSandboxAuthority.js'
import type { BrowserCliExecutionBridgeSummary } from '../context/browserCliExecutionBridge.js'
import type { BrowserExternalNetworkRunnerManifestLoadResult } from '../context/browserExternalNetworkRunnerManifest.js'
import type { BrowserControlledNetworkRunnerManifestLoadResult } from '../context/browserControlledNetworkRunnerManifest.js'
import type { BrowserPublicReadOnlyWebManifestLoadResult } from '../context/browserPublicReadOnlyWebManifest.js'
import type { BrowserPublicReadOnlyHttpClient } from '../context/browserPublicReadOnlyWebExecutor.js'
import type { BrowserRuntimeManifestLoadResult } from '../context/browser/runtime/core/manifest.js'
import type { BrowserRuntimeExecutor } from '../context/browser/runtime/core/executor.js'
import type { BrowserExternalRuntimeManifestLoadResult } from '../context/browser/runtime/external/runtimeManifest.js'
import type { BrowserSkillRuntimeBinding } from '../context/browser/skill/runtime/binding.js'
import type { BrowserActionCache } from '../context/browserActionCache.js'
import type { BrowserReceiptCacheStore } from '../context/browser/receipt/browserReceiptCacheStore.js'
import type { BrowserPublicReadOnlyWebSmokeConfig } from '../harness/browserPublicReadOnlyWebSmokeConfig.js'
import type { SidebarEventSink } from '../../presentation/sidebar/sidebarEventSink.js'
import type { SidebarLiveEventStore } from '../../presentation/sidebar/sidebarLiveEventStore.js'

export type CommandKind = 'local' | 'prompt' | 'shell-action'

export interface CommandContext {
  readonly cwd: string
  readonly sessionId?: string
  /** True when the terminal agreed to report modified keys, so chords arrive. */
  readonly modifierKeysReported?: boolean
  readonly rawCommandName?: string
  readonly compactCheckpointStore?: CompactLiveCheckpointStore
  readonly compactInjectionStateStore?: CompactInjectionStateStore
  readonly projectMemoryReviewStateStore?: ProjectMemoryReviewStateStore
  readonly projectMemoryInjectionStateStore?: ProjectMemoryInjectionStateStore
  readonly projectMemoryStore?: ProjectMemoryStore
  readonly startupWarmContextCacheStore?: StartupWarmContextCacheStore
  readonly browserExecutor?: BrowserExecutor
  readonly browserSandboxAuthority?: BrowserSandboxAuthority
  readonly browserNetworkAllowlist?: BrowserNetworkAllowlist
  readonly browserExecutionConfirmations?: readonly BrowserExecutionConfirmationRecord[]
  readonly browserCliExecutionBridgeSummary?: BrowserCliExecutionBridgeSummary
  readonly browserExternalNetworkRunnerManifest?: BrowserExternalNetworkRunnerManifestLoadResult
  readonly browserControlledNetworkRunnerManifest?: BrowserControlledNetworkRunnerManifestLoadResult
  readonly browserPublicReadOnlyWebManifest?: BrowserPublicReadOnlyWebManifestLoadResult
  readonly browserPublicReadOnlyHttpClient?: BrowserPublicReadOnlyHttpClient
  readonly browserRuntimeManifest?: BrowserRuntimeManifestLoadResult
  readonly browserRuntimeExecutor?: BrowserRuntimeExecutor
  readonly browserExternalRuntimeManifest?: BrowserExternalRuntimeManifestLoadResult
  readonly browserSkillRuntimeBinding?: BrowserSkillRuntimeBinding
  readonly browserPublicReadOnlyWebSmokeConfig?: BrowserPublicReadOnlyWebSmokeConfig
  readonly browserActionCache?: BrowserActionCache
  readonly browserReceiptCacheStore?: BrowserReceiptCacheStore
  readonly sidebarEventSink?: SidebarEventSink
  readonly sidebarLiveEventStore?: SidebarLiveEventStore
}

export interface LocalCommandResult {
  readonly kind: 'local'
  readonly output: string
}

export interface PromptCommandResult {
  readonly kind: 'prompt'
  readonly prompt: string
  /**
   * What to show the user in place of the prompt.
   *
   * A command that hands the user's own pending text back (`/resume`,
   * `/continue`) is worth echoing in full — that is what is being resumed. A
   * command that expands a template is not: `/commit` would print the entire
   * staged diff, `/loop` the whole failure, `/brainstorm` twenty lines of
   * instructions, all of it above the answer they asked for. Those say what they
   * are doing in a line instead.
   */
  readonly notice?: string
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
    | 'exit-session'
    | 'retry-turn'
    | 'clear-session'
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

export interface CommandArgumentCompletion {
  readonly value: string
  readonly label: string
  readonly detail?: string
}

export interface CommandDefinition {
  readonly name: string
  readonly aliases?: readonly string[]
  readonly kind: CommandKind
  readonly availability?: 'available' | 'hidden'
  readonly enabled?: boolean
  readonly bridgeSafe?: boolean
  /** One-line summary shown in the command guide and completion list. */
  readonly summary: string
  /** Guide grouping. */
  readonly group: 'session' | 'context' | 'workspace' | 'workflow' | 'diagnostics'
  /** Argument grammar shown next to the summary, e.g. `use <provider/model>`. */
  readonly argumentHint?: string
  /**
   * Argument candidates once the command name is typed in full and a space
   * follows. Returning null means no candidates; an empty array the same.
   * Synchronous so the completion list never waits on I/O.
   */
  readonly getArgumentCompletions?: (
    argumentPrefix: string,
  ) => readonly CommandArgumentCompletion[] | null
  execute(args: string[], context: CommandContext): Promise<CommandExecutionResult>
}

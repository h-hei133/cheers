import type { CompactLiveCheckpointStore } from '../../context/compact/checkpoint/compactLiveCheckpoint.js'
import type { CompactInjectionStateStore } from '../../context/compact/injection/compactInjectionState.js'
import type { ProjectMemoryReviewStateStore } from '../../memory/projectMemoryReviewState.js'
import type { ProjectMemoryInjectionStateStore } from '../../memory/projectMemoryInjectionState.js'
import type { ProjectMemoryStore } from '../../memory/projectMemoryStoreContract.js'
import type { StartupWarmContextCacheStore } from '../../context/startup/startupWarmContextHealth.js'
import type { BrowserExecutor } from '../../browser/executor.js'
import type { BrowserExecutionConfirmationRecord } from '../../browser/executionConfirmation.js'
import type { BrowserNetworkAllowlist } from '../../browser/networkAllowlist.js'
import type { BrowserSandboxAuthority } from '../../browser/sandboxAuthority.js'
import type { BrowserCliExecutionBridgeSummary } from '../../browser/cliExecutionBridge.js'
import type { BrowserExternalNetworkRunnerManifestLoadResult } from '../../browser/externalNetworkRunnerManifest.js'
import type { BrowserControlledNetworkRunnerManifestLoadResult } from '../../browser/controlledNetworkRunnerManifest.js'
import type { BrowserPublicReadOnlyWebManifestLoadResult } from '../../browser/publicReadOnlyWebManifest.js'
import type { BrowserPublicReadOnlyHttpClient } from '../../browser/publicReadOnlyWebExecutor.js'
import type { BrowserRuntimeManifestLoadResult } from '../../browser/runtime/core/manifest.js'
import type { BrowserRuntimeExecutor } from '../../browser/runtime/core/executor.js'
import type { BrowserExternalRuntimeManifestLoadResult } from '../../browser/runtime/external/runtimeManifest.js'
import type { BrowserSkillRuntimeBinding } from '../../browser/skill/runtime/binding.js'
import type { BrowserActionCache } from '../../browser/actionCache.js'
import type { BrowserReceiptCacheStore } from '../../browser/receipt/store.js'
import type { BrowserPublicReadOnlyWebSmokeConfig } from '../harness/browserPublicReadOnlyWebSmokeConfig.js'
import type { RuntimeConfig } from "../../config/runtimeConfig.js"
import type { SidebarEventSink } from '../../presentation/sidebar/sidebarEventSink.js'
import type { SidebarLiveEventStore } from '../../presentation/sidebar/sidebarLiveEventStore.js'

export type CommandKind = 'local' | 'prompt' | 'shell-action'

export interface CommandContext {
  readonly cwd: string
  readonly sessionId?: string
  /**
   * How this run was asked to load skills.
   *
   * The same options the prompt path uses, so a skill named on the command line
   * is loadable by name here too — and an untrusted project's skills stay out of
   * both. Absent means plain discovery.
   */
  readonly skillOptions?: {
    readonly skillPaths?: readonly string[]
    readonly noSkills?: boolean
  }
  /**
   * Theme files or directories this run was started with.
   *
   * The same paths `--theme` named, so a theme loaded at startup can still be
   * selected by `/theme` afterwards. Without them the flag would load a theme
   * the session could never switch back to.
   */
  readonly themePaths?: readonly string[]
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
  /**
   * Re-read the configuration this session started with, returning what changed.
   *
   * Injected rather than reaching for the runtime context directly: a command is
   * handed the narrow view it needs, and only the surface that owns the session
   * knows how to replace the settings in place. Absent means the caller has no
   * session to refresh, and `/reload` says so instead of pretending.
   */
  readonly refreshRuntimeConfig?: () => { readonly before: RuntimeConfig; readonly after: RuntimeConfig }
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
    | 'exit-session'
    | 'retry-turn'
    | 'clear-session'
    | 'fork-session'
  readonly sessionId?: string
  readonly viewMode?: 'compact' | 'verbose'
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

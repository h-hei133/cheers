import type { CompactLiveCheckpointStore } from '../context/compact/checkpoint/compactLiveCheckpoint.js'
import type { CompactInjectionStateStore } from '../context/compact/injection/compactInjectionState.js'
import type { ProjectMemoryReviewStateStore } from '../context/memory/projectMemoryReviewState.js'
import type { ProjectMemoryInjectionStateStore } from '../context/memory/projectMemoryInjectionState.js'
import type { ProjectMemoryStore } from '../context/memory/projectMemoryStoreContract.js'
import type { StartupWarmContextCacheStore } from '../context/startup/startupWarmContextHealth.js'
import type { BrowserExecutor } from '../context/browserExecutor.js'
import type { BrowserExecutionConfirmationRecord } from '../context/browserExecutionConfirmation.js'
import type { BrowserNetworkAllowlist } from '../context/browserNetworkAllowlist.js'
import type { BrowserSandboxAuthority } from '../context/browserSandboxAuthority.js'
import type { BrowserCliExecutionBridgeSummary } from '../context/browserCliExecutionBridge.js'
import type { BrowserExternalNetworkRunnerManifestLoadResult } from '../context/browserExternalNetworkRunnerManifest.js'
import type { BrowserControlledNetworkRunnerManifestLoadResult } from '../context/browserControlledNetworkRunnerManifest.js'
import type { BrowserPublicReadOnlyWebManifestLoadResult } from '../context/browserPublicReadOnlyWebManifest.js'
import type { BrowserPublicReadOnlyHttpClient } from '../context/browserPublicReadOnlyWebExecutor.js'
import type { BrowserRuntimeManifestLoadResult } from '../context/browserRuntimeManifest.js'
import type { BrowserRuntimeExecutor } from '../context/browserRuntimeExecutor.js'
import type { BrowserExternalRuntimeManifestLoadResult } from '../context/browserExternalRuntimeManifest.js'
import type { BrowserSkillRuntimeBinding } from '../context/browserSkillRuntimeBinding.js'
import type { BrowserActionCache } from '../context/browserActionCache.js'
import type { BrowserReceiptCacheStore } from '../context/browser/receipt/browserReceiptCacheStore.js'
import type { BrowserPublicReadOnlyWebSmokeConfig } from '../harness/browserPublicReadOnlyWebSmokeConfig.js'
import type { SidebarEventSink } from '../context/sidebar/sidebarEventSink.js'
import type { SidebarLiveEventStore } from '../context/sidebar/sidebarLiveEventStore.js'

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

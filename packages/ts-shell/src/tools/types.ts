import type { InteractiveAsk } from '../core/tools/ask/contract.js'
import type { SubagentRunner } from '../core/subagents/runner.js'
import type { WorkspaceRoot } from '../core/workspace/model.js'
import type { ImageContent } from '../model-adapters/multimodal.js'

export interface ToolExecutionContext {
  readonly background?: import('../workflow/jobs/local/model.js').BackgroundRunner;
  readonly commandProof?: import('../runtime/execution/proof.js').CommandProofObserver;
  readonly assertSourceAccess?: (absolute: string) => void;
  readonly taskId: string
  readonly workspaceRoot: string
  readonly workspaceRoots?: readonly WorkspaceRoot[]
  /** Session artifact storage stays bound to the primary root while file tools select a grant. */
  readonly artifactRoot?: string
  readonly sessionId?: string
  readonly correlationId?: string
  readonly abortSignal?: AbortSignal
  /** Revalidate the captured turn before publishing an asynchronously approved report. */
  readonly admission?: () => string | undefined
  /** Recheck path-specific denial for each actual file, including scan results. */
  readonly assertFileAccess?: (absolutePath: string) => void
  /** Persist native operation correlation before the approved patch can write its intent. */
  readonly onEditOperationPrepared?: (operationId: string) => void
  /**
   * What a command this tool runs should know about the session it runs in.
   *
   * Supplied by the turn rather than read here, because the values name the
   * model that is answering and only the layer that resolved it knows.
   */
  readonly commandEnv?: Readonly<Record<string, string>>
  /**
   * Called with output as a command produces it.
   *
   * A long command that reports nothing until it exits is indistinguishable from
   * one that has hung. Chunks arrive as they are written, not at the end.
   */
  readonly onOutput?: (chunk: string) => void
  /**
   * How to run a subagent, for the tool that delegates to one.
   *
   * Supplied by the turn because running one needs the model side — the
   * provider, the transport, the step function — and this layer has none of it.
   * Absent means delegation is not available, which the tool reports rather than
   * faking a completion.
   */
  readonly runSubagent?: SubagentRunner
  readonly interactiveAsk?: InteractiveAsk
}

export interface ToolExecutionResult {
  readonly success: boolean
  readonly output?: string
  readonly error?: string
  /** outputNotice reserves essential page/recovery facts when model text is shortened. */
  readonly metadata?: Record<string, unknown>
  readonly content?: string
  /** Validated media kept separate from display text and structured metadata. */
  readonly images?: readonly ImageContent[]
}

export interface ToolDefinition<Preparation = ToolPreparation | Promise<ToolPreparation>> {
  /** Captured native authority may be revoked by ordinary after-call hooks. */
  readonly resultAdmission?: () => string | undefined;
  /** Native observation of a refused call; must not perform target effects. */
  readonly onRefusal?: (args: Record<string, unknown>, context: ToolExecutionContext,
    outcome: 'blocked' | 'denied' | 'cancelled' | 'failed') => void;
  readonly name: string
  readonly description: string
  readonly argsSchema: Record<string, unknown>
  /** Server-declared capability hints; these never replace permission checks. */
  readonly mcpAnnotations?: { readonly readOnlyHint: boolean }
  /** A complete immutable request prepared before permission hooks, with no target effects. */
  readonly prepare?: (args: Record<string, unknown>, context: ToolExecutionContext) => Preparation
  execute(
    args: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult>
}

export interface ToolPreparation {
  /** A native execution adapter may retain ordinary bash command policy. */
  readonly permissionToolName?: 'bash' | 'task'
  /** Execution tools may bind a complete non-file request to the same approval lifecycle. */
  readonly permissionArgs?: Readonly<Record<string, unknown>>
  readonly previewKind?: 'file-plan' | 'execution'
  readonly targets: readonly { readonly path: string; readonly operation: 'write' | 'delete' }[]
  readonly preview: string
  /**
   * Independently selectable groups. A host that can present them collects a
   * selection; a host that cannot must not assume the whole plan was chosen.
   */
  readonly selections?: readonly { readonly id: string; readonly label: string; readonly files?: readonly string[] }[]
  /** Exact full-plan revision shown before a host collects a subset. */
  readonly selectionRevision?: string
  /** Build the exact preview and revision for a host-collected group selection. */
  readonly selectionPreview?: (selection: readonly string[]) => {
    readonly preview: string;
    readonly revision: string;
  }
  readonly execute: (
    context: ToolExecutionContext,
    selection?: readonly string[],
    approval?: { readonly revision?: string },
  ) => Promise<ToolExecutionResult>
}

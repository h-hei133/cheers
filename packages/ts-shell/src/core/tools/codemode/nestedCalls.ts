import type { ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js'
import type { ImageContent } from '../../../model-adapters/multimodal.js'
import { boundToolMedia, createToolMediaBudget } from '../../agent/media.js'
import { snapshotData } from '../../values/data.js'
import { redactExportText } from '../../security/redaction.js'
import { redactSecretsFromObject } from '../../../observability/structuredLogger.js'

export const NESTED_CALL_LIMITS = {
  maxCalls: 256,
  maxArgumentBytesPerCall: 8 * 1024,
  maxArgumentBytesTotal: 32 * 1024,
  maxErrorChars: 500,
  maxMetadataBytesPerCall: 2 * 1024,
  maxMetadataBytesTotal: 8 * 1024,
} as const

export interface NestedToolCallRecord {
  readonly id: string
  readonly name: string
  status: 'unfinished' | 'ok' | 'error'
  arguments?: Record<string, unknown>
  argumentsBytes?: number
  durationMs?: number
  error?: string
  metadata?: Record<string, unknown>
  terminate?: boolean
  denial?: ToolExecutionResult['denial']
}

export interface NestedToolCallsSnapshot {
  readonly calls: readonly NestedToolCallRecord[]
  readonly complete: boolean
}

const encoder = new TextEncoder()

/**
 * Collects nested tool invocations executed inside a single parent `codemode` call.
 * Enforces per-call and total argument byte caps as well as a maximum call count.
 */
export class NestedCallRecorder {
  private readonly calls: NestedToolCallRecord[] = []
  private readonly startedAt = new Map<NestedToolCallRecord, number>()
  private complete = true
  private argumentBytes = 0
  private metadataBytes = 0

  start(toolCall: {
    readonly id: string
    readonly name: string
    readonly arguments?: Record<string, unknown>
  }): NestedToolCallRecord | undefined {
    if (this.calls.length >= NESTED_CALL_LIMITS.maxCalls) {
      this.complete = false
      return undefined
    }
    const record: NestedToolCallRecord = {
      id: toolCall.id,
      name: toolCall.name,
      status: 'unfinished',
    }
    const json = JSON.stringify(redactSecretsFromObject(toolCall.arguments ?? {}),
      (_key, value: unknown) => typeof value === 'string' ? redactExportText(value) : value)
    const bytes = encoder.encode(json).length
    if (
      bytes > NESTED_CALL_LIMITS.maxArgumentBytesPerCall ||
      this.argumentBytes + bytes > NESTED_CALL_LIMITS.maxArgumentBytesTotal
    ) {
      record.argumentsBytes = bytes
      this.complete = false
    } else {
      record.arguments = JSON.parse(json) as Record<string, unknown>
      this.argumentBytes += bytes
    }
    this.calls.push(record)
    this.startedAt.set(record, performance.now())
    return record
  }

  finish(record: NestedToolCallRecord | undefined, isError: boolean, errorText: string, result?: ToolExecutionResult): void {
    if (!record) return
    record.status = isError ? 'error' : 'ok'
    record.durationMs = Math.round(
      performance.now() - (this.startedAt.get(record) ?? performance.now()),
    )
    this.startedAt.delete(record)
    if (result?.metadata) {
      const selected: Record<string, unknown> = {}
      for (const key of ['approval', 'status', 'operationId', 'outputNotice', 'media', 'diff']) {
        const descriptor = Object.getOwnPropertyDescriptor(result.metadata, key)
        if (descriptor && 'value' in descriptor) selected[key] = descriptor.value
      }
      try {
        const captured = snapshotData(selected, { bytes: NESTED_CALL_LIMITS.maxMetadataBytesPerCall,
          nodes: 200, depth: 6 }) as Record<string, unknown>
        const bytes = Buffer.byteLength(JSON.stringify(captured))
        if (bytes > NESTED_CALL_LIMITS.maxMetadataBytesTotal - this.metadataBytes) this.complete = false
        else if (Object.keys(captured).length) { this.metadataBytes += bytes; record.metadata = captured }
      } catch { this.complete = false }
    }
    if (result?.terminate) record.terminate = true
    if (result?.denial) record.denial = result.denial
    if (isError && errorText) {
      record.error = redactExportText(errorText).slice(0, NESTED_CALL_LIMITS.maxErrorChars)
    }
  }

  snapshot(): NestedToolCallsSnapshot | undefined {
    if (this.calls.length === 0 && this.complete) return undefined
    const calls = this.calls.map(call => ({ ...call }))
    return {
      calls,
      complete: this.complete && calls.every(call => call.status !== 'unfinished'),
    }
  }
}

export class NestedToolCallRunner {
  private sequence = 0
  terminate = false
  stop: ToolExecutionResult['stop']
  readonly recorder: NestedCallRecorder
  private readonly parentToolCallId: string
  private readonly context: ToolExecutionContext

  constructor(options: {
    readonly parentToolCallId: string
    readonly context: ToolExecutionContext
    readonly recorder?: NestedCallRecorder
  }) {
    this.parentToolCallId = options.parentToolCallId
    this.context = options.context
    this.recorder = options.recorder ?? new NestedCallRecorder()
  }

  async call(name: string, rawArgs: unknown, beginApprovalWait?: () => () => void):
    Promise<string | { readonly output: string; readonly images: readonly ImageContent[] }> {
    const result = await this.execute(name, rawArgs, beginApprovalWait)
    if (!result.success) throw new Error(result.error)
    return nestedValue(result)
  }

  /** The shell tag uses ordinary bash job promotion for commands that outlive the foreground wait. */
  async shell(command: string, beginApprovalWait?: () => () => void) {
    const result = await this.execute('bash', { command }, beginApprovalWait)
    const metadata = result.metadata
    const exited = !result.denial && !result.stop && !result.terminate && metadata?.status === 'failed'
      && metadata.failureKind === 'execution_failure' && typeof metadata.executionPath === 'string'
      && !metadata.terminationFailed && !metadata.spawnErrorCode && typeof metadata.exitCode === 'number'
      && Number.isSafeInteger(metadata.exitCode) && metadata.exitCode !== 0 ? metadata.exitCode : undefined
    if (!result.success && exited === undefined) throw new Error(result.error)
    const output = result.output ?? result.error ?? ''
    // The bash output owner appends an independently captured display notice.
    const tail = typeof metadata?.outputNotice === 'string' ? '\n\n' + metadata.outputNotice : undefined
    const backgroundJobId = typeof metadata?.backgroundJobId === 'string' ? metadata.backgroundJobId : undefined
    const complete = !backgroundJobId && metadata?.truncated !== true && metadata?.outputComplete !== false
    const text = complete && tail && output.endsWith(tail) ? output.slice(0, -tail.length) : output
    return { text, complete, ...(backgroundJobId ? { backgroundJobId } : {}), ...(exited === undefined ? {} : { exitCode: exited }) }
  }

  private async execute(name: string, rawArgs: unknown, beginApprovalWait?: () => () => void): Promise<ToolExecutionResult> {
    this.context.abortSignal?.throwIfAborted()
    if (name === 'codemode') {
      throw new Error('Recursive codemode calls are not allowed.')
    }
    const args: Record<string, unknown> = typeof rawArgs === 'object' && rawArgs !== null && !Array.isArray(rawArgs)
      ? { ...rawArgs } : {}
    const id = `${this.parentToolCallId}/${++this.sequence}`
    const record = this.recorder.start({ id, name, arguments: args })
    let result: ToolExecutionResult
    try {
      if (!this.context.executeNestedTool) throw new Error('Nested tools require a host permission gate.')
      result = await this.context.executeNestedTool(name, args, id, this.context.abortSignal, beginApprovalWait)
    } catch (error) {
      const errText = error instanceof Error ? error.message : String(error)
      this.recorder.finish(record, true, errText)
      throw error instanceof Error ? error : new Error(errText)
    }
    this.terminate ||= result.terminate === true
    this.stop ??= result.stop
    if (!result.success) {
      const errText = result.error || result.output || `Tool '${name}' failed.`
      this.recorder.finish(record, true, errText, result)
      return { ...result, error: errText }
    }
    this.recorder.finish(record, false, '', result)
    return result
  }
}

function nestedValue(result: ToolExecutionResult): string | { readonly output: string; readonly images: readonly ImageContent[] } {
  const bounded = boundToolMedia({ output: result.output ?? result.content ?? '', images: result.images }, createToolMediaBudget())
  return bounded.images?.length ? { output: bounded.output, images: bounded.images } : bounded.output
}

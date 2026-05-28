import type { RuntimeExecutionReceiptProjection } from '../runtime/execution/executionReceipt.js'

export interface ToolResultDetails {
  readonly executionReceipt?: RuntimeExecutionReceiptProjection
  readonly runtimeFacts?: Record<string, unknown>
}

export interface ToolReportSafeProjection {
  readonly executionReceipt?: RuntimeExecutionReceiptProjection
  readonly redactionStatus: 'report-safe' | 'redacted'
  readonly notProvenClaims: readonly string[]
}

export interface SplitToolExecutionResult {
  readonly content?: string
  readonly details?: ToolResultDetails
  readonly reportSafe?: ToolReportSafeProjection
}

export function createCommandToolResultSplit(input: {
  readonly content?: string
  readonly receipt: RuntimeExecutionReceiptProjection
  readonly runtimeFacts?: Record<string, unknown>
}): SplitToolExecutionResult {
  return {
    content: input.content,
    details: {
      executionReceipt: input.receipt,
      ...(input.runtimeFacts ? { runtimeFacts: input.runtimeFacts } : {}),
    },
    reportSafe: {
      executionReceipt: input.receipt,
      redactionStatus: input.receipt.redaction.status,
      notProvenClaims: input.receipt.notProvenClaims,
    },
  }
}

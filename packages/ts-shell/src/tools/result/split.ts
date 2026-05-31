import type { RuntimeExecutionReceiptProjection } from '../../runtime/execution/receipt.js'
import type {
  ToolAfterObservationAnnotation,
  ToolBeforePolicyDecision,
} from '../policy/interception.js'

export interface ToolResultDetails {
  readonly executionReceipt?: RuntimeExecutionReceiptProjection
  readonly runtimeFacts?: Record<string, unknown>
  readonly toolInterception?: {
    readonly beforeDecision?: ToolBeforePolicyDecision
    readonly afterAnnotation?: ToolAfterObservationAnnotation
  }
}

export interface ToolReportSafeProjection {
  readonly executionReceipt?: RuntimeExecutionReceiptProjection
  readonly redactionStatus: 'report-safe' | 'redacted'
  readonly notProvenClaims: readonly string[]
  readonly toolInterception?: {
    readonly beforeDecision?: ToolBeforePolicyDecision
    readonly afterAnnotation?: ToolAfterObservationAnnotation
  }
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
  readonly toolInterception?: {
    readonly beforeDecision?: ToolBeforePolicyDecision
    readonly afterAnnotation?: ToolAfterObservationAnnotation
  }
}): SplitToolExecutionResult {
  return {
    content: input.content,
    details: {
      executionReceipt: input.receipt,
      ...(input.runtimeFacts ? { runtimeFacts: input.runtimeFacts } : {}),
      ...(input.toolInterception
        ? { toolInterception: input.toolInterception }
        : {}),
    },
    reportSafe: {
      executionReceipt: input.receipt,
      redactionStatus: input.receipt.redaction.status === 'redacted' ||
        input.toolInterception?.beforeDecision?.redactionStatus === 'redacted' ||
        input.toolInterception?.afterAnnotation?.redactionStatus === 'redacted'
        ? 'redacted'
        : 'report-safe',
      notProvenClaims: [
        ...input.receipt.notProvenClaims,
        ...(input.toolInterception?.beforeDecision?.notProvenClaims ?? []),
        ...(input.toolInterception?.afterAnnotation?.notProvenClaims ?? []),
      ],
      ...(input.toolInterception
        ? { toolInterception: input.toolInterception }
        : {}),
    },
  }
}

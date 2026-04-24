import type {
  CodingResultSummary,
  OrchestrationResult,
  TerminalClassification,
  TerminalReason,
} from '../../orchestration/types.js'
import type { QueryRuntimeState } from './runtimeState.js'
import type { QueryTerminal } from './transitions.js'

export function mapTerminalToOrchestrationResult(
  state: QueryRuntimeState,
  terminal: QueryTerminal,
): OrchestrationResult {
  const latestCodingResult =
    state.transcript[state.transcript.length - 1]?.codingResult
  const codingResult = latestCodingResult
    ? {
      ...latestCodingResult,
      ...(terminal.terminalReason === 'completed' || latestCodingResult.failureBoundary
        ? {}
        : { failureBoundary: terminal.stopReason ?? terminal.terminalReason }),
    }
    : undefined

  const truthfulTerminal = deriveTruthfulTerminal({
    terminal,
    codingResult,
    lastContinuationReason: state.lastContinuationReason,
  })

  return {
    status: truthfulTerminal.terminalReason,
    terminalReason: truthfulTerminal.terminalReason,
    terminalClassification: truthfulTerminal.terminalClassification,
    lastContinuationReason: state.lastContinuationReason,
    stopReason: truthfulTerminal.stopReason,
    transcript: state.transcript,
    sharedContext: state.sharedContext,
    finalOutput: state.transcript[state.transcript.length - 1]?.content ?? '',
    codingResult,
  }
}

function deriveTruthfulTerminal(input: {
  terminal: QueryTerminal
  codingResult?: CodingResultSummary
  lastContinuationReason?: QueryRuntimeState['lastContinuationReason']
}): {
  terminalReason: TerminalReason
  terminalClassification: TerminalClassification
  stopReason?: string
} {
  const baseClassification =
    input.terminal.terminalClassification ??
    classifyTerminalReason(
      input.terminal.terminalReason,
      input.lastContinuationReason,
    )
  const base = {
    terminalReason: input.terminal.terminalReason,
    terminalClassification: baseClassification,
    stopReason: input.terminal.stopReason,
  }

  if (
    input.terminal.terminalReason !== 'completed' ||
    !input.codingResult
  ) {
    return base
  }

  const codingResult = input.codingResult
  const taskVerdict = codingResult.taskSatisfaction.verdict
  const verification = codingResult.verification
  const taskReason = firstTruthy(codingResult.taskSatisfaction.reasons)
  const verificationReason = verification.reason?.trim()
  const failedReason = firstTruthy(
    codingResult.failedFiles.map(entry => entry.reason),
  )

  if (verification.status === 'failed') {
    return {
      terminalReason: 'stopped_error',
      terminalClassification: 'error',
      stopReason:
        verificationReason ??
        taskReason ??
        failedReason ??
        'Verification failed',
    }
  }

  if (verification.status === 'blocked') {
    if (hasSuccessfulMutationWithVerificationCaveat(codingResult)) {
      return base
    }

    return {
      terminalReason: 'stopped_error',
      terminalClassification: 'stopped',
      stopReason:
        verification.nextAction ??
        verificationReason ??
        taskReason ??
        `Verification blocked (${verification.blockerKind ?? 'unknown'})`,
    }
  }

  if (hasHardFailureSignal(codingResult)) {
    return {
      terminalReason: 'stopped_error',
      terminalClassification: 'error',
      stopReason: failedReason ?? taskReason ?? 'Task failed',
    }
  }

  if (
    taskVerdict === 'insufficient-evidence' ||
    taskVerdict === 'completed-with-caveats'
  ) {
    if (hasSuccessfulMutationWithVerificationCaveat(codingResult)) {
      return base
    }

    return {
      terminalReason: 'stopped_error',
      terminalClassification: 'stopped',
      stopReason:
        taskReason ??
        verificationReason ??
        'Task completed with insufficient evidence',
    }
  }

  return base
}

function hasSuccessfulMutationWithVerificationCaveat(
  codingResult: CodingResultSummary,
): boolean {
  return (
    codingResult.changedFiles.length > 0 &&
    codingResult.failedFiles.length === 0 &&
    codingResult.verification.status === 'blocked'
  )
}

function hasHardFailureSignal(codingResult: CodingResultSummary): boolean {
  if (codingResult.failedFiles.length === 0) {
    return false
  }

  return codingResult.failedFiles.some(entry => {
    const normalized = entry.reason.toLowerCase()
    return /(failed|error|exception|timeout|denied|write failed|read failed|mutation failed)/.test(
      normalized,
    )
  })
}

function firstTruthy(values: readonly string[]): string | undefined {
  return values.find(value => value.trim().length > 0)
}

export function classifyTerminalReason(
  reason: TerminalReason,
  lastContinuationReason?: QueryRuntimeState['lastContinuationReason'],
): OrchestrationResult['terminalClassification'] {
  if (reason === 'stopped_error') {
    return lastContinuationReason === 'retryable-error' ? 'stopped' : 'error'
  }

  return reason === 'completed' ? 'success' : 'stopped'
}

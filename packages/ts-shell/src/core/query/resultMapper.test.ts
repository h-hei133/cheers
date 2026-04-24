import { describe, expect, it } from 'vitest'
import { mapTerminalToOrchestrationResult } from './resultMapper.js'

describe('mapTerminalToOrchestrationResult', () => {
  it('preserves explicit terminalClassification when provided', () => {
    const fakeState = {
      transcript: [],
      sharedContext: { sessionId: 'sess_mapper', initialPrompt: 'prompt', notes: [], handoffs: [] },
      lastContinuationReason: undefined,
    } as never

    const terminal = {
      terminalReason: 'stopped_error',
      terminalClassification: 'error',
      stopReason: 'Transport exploded',
    } as never

    const result = mapTerminalToOrchestrationResult(fakeState, terminal)
    expect(result.terminalClassification).toBe('error')
    expect(result.status).toBe('stopped_error')
    expect(result.stopReason).toBe('Transport exploded')
  })

  it('falls back to reason-based classification when terminalClassification is missing', () => {
    const fakeState = {
      transcript: [],
      sharedContext: { sessionId: 'sess_mapper', initialPrompt: 'prompt', notes: [], handoffs: [] },
      lastContinuationReason: undefined,
    } as never

    const terminal = {
      terminalReason: 'completed',
      terminalClassification: undefined,
      stopReason: undefined,
    } as never

    const result = mapTerminalToOrchestrationResult(fakeState, terminal)
    expect(result.terminalClassification).toBe('success')
  })

  it('keeps successful edits successful when verification is blocked', () => {
    const fakeState = {
      transcript: [
        {
          role: 'assistant',
          content:
            'Edit completed for plan.txt. Verification blocked (no-verify-strategy).',
          codingResult: buildCodingResult({
            changedFiles: ['plan.txt'],
            verification: {
              status: 'blocked',
              reason: 'Verify intent was detected, but no verify strategy could be resolved from the prompt.',
              blockerKind: 'no-verify-strategy',
              nextAction:
                'Specify verify intent explicitly with test/build/check keywords so a concrete verify command can be selected.',
            },
            verdict: 'completed-with-caveats',
            reasons: [
              'Edit applied but verify was blocked (no-verify-strategy); follow next action before continuing.',
            ],
          }),
        },
      ],
      sharedContext: { sessionId: 'sess_mapper', initialPrompt: 'prompt', notes: [], handoffs: [] },
      lastContinuationReason: undefined,
    } as never

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: 'completed',
      terminalClassification: 'success',
      stopReason: undefined,
    } as never)

    expect(result.terminalClassification).toBe('success')
    expect(result.status).toBe('completed')
    expect(result.stopReason).toBeUndefined()
    expect(result.codingResult?.verification.status).toBe('blocked')
    expect(result.codingResult?.verification.blockerKind).toBe('no-verify-strategy')
  })

  it('still stops when verification is blocked without an applied edit', () => {
    const fakeState = {
      transcript: [
        {
          role: 'assistant',
          content: 'Verification blocked.',
          codingResult: buildCodingResult({
            changedFiles: [],
            verification: {
              status: 'blocked',
              reason: 'Verification command requires approval.',
              blockerKind: 'approval-denied',
              nextAction: 'Re-run and approve escalation for verify command execution.',
            },
            verdict: 'completed-with-caveats',
            reasons: ['Verification command requires approval.'],
          }),
        },
      ],
      sharedContext: { sessionId: 'sess_mapper', initialPrompt: 'prompt', notes: [], handoffs: [] },
      lastContinuationReason: undefined,
    } as never

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: 'completed',
      terminalClassification: 'success',
      stopReason: undefined,
    } as never)

    expect(result.terminalClassification).toBe('stopped')
    expect(result.status).toBe('stopped_error')
    expect(result.stopReason).toBe(
      'Re-run and approve escalation for verify command execution.',
    )
  })

  it('maps verification failure to an error terminal result', () => {
    const fakeState = {
      transcript: [
        {
          role: 'assistant',
          content: 'Verification failed.',
          codingResult: buildCodingResult({
            changedFiles: ['plan.txt'],
            verification: {
              status: 'failed',
              reason: 'Unit tests failed after the edit.',
            },
            verdict: 'completed-with-caveats',
            reasons: ['Verification failed after the edit.'],
          }),
        },
      ],
      sharedContext: { sessionId: 'sess_mapper', initialPrompt: 'prompt', notes: [], handoffs: [] },
      lastContinuationReason: undefined,
    } as never

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: 'completed',
      terminalClassification: 'success',
      stopReason: undefined,
    } as never)

    expect(result.terminalClassification).toBe('error')
    expect(result.status).toBe('stopped_error')
    expect(result.stopReason).toBe('Unit tests failed after the edit.')
    expect(result.codingResult?.verification.status).toBe('failed')
  })

  it('maps hard tool failures to an error terminal result', () => {
    const fakeState = {
      transcript: [
        {
          role: 'assistant',
          content: 'Edit failed.',
          codingResult: buildCodingResult({
            changedFiles: [],
            failedFiles: [{ path: 'src/app.ts', reason: 'write failed: permission denied' }],
            verification: {
              status: 'not-run',
              reason: 'Edit failed before verification could run.',
            },
            verdict: 'failed',
            reasons: ['write failed: permission denied'],
          }),
        },
      ],
      sharedContext: { sessionId: 'sess_mapper', initialPrompt: 'prompt', notes: [], handoffs: [] },
      lastContinuationReason: undefined,
    } as never

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: 'completed',
      terminalClassification: 'success',
      stopReason: undefined,
    } as never)

    expect(result.terminalClassification).toBe('error')
    expect(result.status).toBe('stopped_error')
    expect(result.stopReason).toBe('write failed: permission denied')
    expect(result.codingResult?.failedFiles).toHaveLength(1)
  })

  it('maps insufficient evidence without mutation to a stopped terminal result', () => {
    const fakeState = {
      transcript: [
        {
          role: 'assistant',
          content: 'Insufficient evidence.',
          codingResult: buildCodingResult({
            changedFiles: [],
            verification: {
              status: 'not-run',
              reason: 'No verification evidence was produced.',
            },
            verdict: 'insufficient-evidence',
            reasons: ['Missing required verification evidence.'],
          }),
        },
      ],
      sharedContext: { sessionId: 'sess_mapper', initialPrompt: 'prompt', notes: [], handoffs: [] },
      lastContinuationReason: undefined,
    } as never

    const result = mapTerminalToOrchestrationResult(fakeState, {
      terminalReason: 'completed',
      terminalClassification: 'success',
      stopReason: undefined,
    } as never)

    expect(result.terminalClassification).toBe('stopped')
    expect(result.status).toBe('stopped_error')
    expect(result.stopReason).toBe('Missing required verification evidence.')
    expect(result.codingResult?.taskSatisfaction.verdict).toBe('insufficient-evidence')
  })
})

function buildCodingResult(input: {
  changedFiles: string[]
  failedFiles?: { path: string; reason: string }[]
  verification: {
    status: 'blocked' | 'failed' | 'not-run'
    reason: string
    blockerKind?: 'approval-denied' | 'no-verify-strategy'
    nextAction?: string
  }
  verdict: 'completed-with-caveats' | 'failed' | 'insufficient-evidence'
  reasons: string[]
}) {
  return {
    taskKind: 'edit-file',
    changedFiles: input.changedFiles,
    failedFiles: input.failedFiles ?? [],
    patches: [],
    repair: {
      status: 'not-needed',
      attempts: 1,
      recoveredItems: [],
      failedItems: [],
      notes: [],
    },
    continuation: {
      status: 'first-pass-success',
      attempts: 1,
      evidence: [],
    },
    changeSet: {
      gitAware: false,
      preExistingDirtyFiles: [],
      postRunDirtyFiles: input.changedFiles,
      attemptedFiles: [...input.changedFiles, ...(input.failedFiles ?? []).map(file => file.path)],
      changedFiles: input.changedFiles,
      unchangedAttemptedFiles: [],
    },
    taskSatisfaction: {
      verdict: input.verdict,
      reasons: input.reasons,
      requiredEvidence: ['inspect->edit->verify contract execution'],
      observedEvidence: [],
    },
    verifiedFiles: [],
    unverifiedFiles: input.changedFiles.map(path => ({
      path,
      reason: input.verification.reason,
    })),
    verification: input.verification,
    evidence: [],
  }
}

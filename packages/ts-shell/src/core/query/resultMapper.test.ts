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
})

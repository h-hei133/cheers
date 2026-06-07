import { describe, expect, it } from 'vitest'
import { classifyRepairHypothesis, rejectRepairHypothesis } from './hypothesis.js'

describe('repair hypothesis classification', () => {
  it('classifies command assertion output into a source discovery hypothesis', () => {
    const hypothesis = classifyRepairHypothesis({
      failureClass: 'command-failed',
      failureSummary: 'Error: expected 4 received 2',
      targetFiles: ['src/rate.mjs'],
    })

    expect(hypothesis.confidence).toBe('high')
    expect(hypothesis.contextNeed).toBe('src/rate.mjs')
    expect(hypothesis.sourceFactIds).toEqual([])
  })

  it('creates a distinct next hypothesis after rejection', () => {
    const first = classifyRepairHypothesis({
      failureClass: 'command-failed',
      failureSummary: 'Error: expected 4 received 2',
      targetFiles: ['src/rate.mjs'],
      sourceFactIds: ['source:rate'],
    })
    const rejected = rejectRepairHypothesis({
      hypothesis: first,
      cause: 'Error: expected 4 received 3',
    })
    const next = classifyRepairHypothesis({
      failureClass: 'command-failed',
      failureSummary: 'Error: expected 4 received 3',
      targetFiles: ['src/rate.mjs'],
      sourceFactIds: ['source:rate'],
      rejected: [rejected],
    })

    expect(next.summary).not.toBe(first.summary)
    expect(next.rejectedCause).toContain('expected 4 received 3')
  })
})

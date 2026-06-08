import { describe, expect, it } from 'vitest'
import type { QueryRuntimeTrajectoryEntry } from './harness.js'
import { summarizeQueryRuntimeTrajectory } from './trajectory.js'

describe('query runtime trajectory diagnostics', () => {
  it('reduces append-only trajectory coverage without settling terminal success', () => {
    const trajectory: QueryRuntimeTrajectoryEntry[] = [
      entry(1, 'tool:planned', ['src/limit/rule.mjs'], 'repair planned'),
      entry(2, 'tool:started', ['src/limit/rule.mjs'], 'repair started'),
      entry(3, 'output:completion-claim-unproven', ['src/limit/rule.mjs'], 'completion claim lacks required proof'),
      entry(4, 'output:verification-claim-unsettled', ['src/limit/rule.mjs'], 'verification claim did not settle target'),
      entry(5, 'output:artifact-claim-incomplete', ['artifact/limit.json'], 'artifact claim lacks source or verification evidence'),
      entry(6, 'verification:failed', ['src/limit/rule.mjs'], 'exit:1 expected LIMIT:10 got limit:5'),
      entry(7, 'context:source-fact-recorded', ['src/limit/rule.mjs'], 'source:limit'),
      entry(8, 'repair:attempt', ['src/limit/rule.mjs'], 'bad repair'),
      entry(9, 'repair:rerun', ['src/limit/rule.mjs'], 'exit:1 expected LIMIT:10 got limit:5'),
      entry(10, 'repair:next-hypothesis', ['src/limit/rule.mjs'], 'uppercase numeric limit'),
      entry(11, 'verification:wrong-target-ignored', ['package.json'], 'generic command passed'),
      entry(12, 'artifact:pending', ['artifact/limit.json'], 'claim evidence missing'),
      entry(13, 'artifact:completed', ['artifact/limit.json'], 'source and verification receipt'),
      entry(14, 'verification:passed', ['src/limit/rule.mjs', 'test/limit.mjs'], 'targeted pass'),
    ]

    const summary = summarizeQueryRuntimeTrajectory({
      trajectory,
      restored: true,
      terminalStatus: 'stopped_not_proven',
      missingProof: ['artifact claim evidence missing'],
    })

    expect(summary.phaseCount).toBe(14)
    expect(summary.wrongOrIncompleteActions).toBeGreaterThanOrEqual(2)
    expect(summary.textClaimMistakes).toBe(3)
    expect(summary.falseCompletionClaimRejected).toBe(true)
    expect(summary.genericVerificationClaimRejected).toBe(true)
    expect(summary.incompleteArtifactClaimRejected).toBe(true)
    expect(summary.sourceDiscoveryBeforeRepair).toBe(true)
    expect(summary.badRepairFailedRerunNextHypothesis).toBe(true)
    expect(summary.genericGreenRejected).toBe(true)
    expect(summary.artifactPendingThenCompleted).toBe(true)
    expect(summary.durableRestore).toBe(true)
    expect(summary.notProvenMissingProof).toEqual(['artifact claim evidence missing'])
    expect(summary.settlesSuccess).toBe(false)
  })
})

function entry(
  sequence: number,
  phase: QueryRuntimeTrajectoryEntry['phase'],
  targetFiles: readonly string[],
  detail: string,
): QueryRuntimeTrajectoryEntry {
  return {
    sequence,
    turn: sequence,
    role: 'coder',
    phase,
    targetFiles,
    detail,
  }
}

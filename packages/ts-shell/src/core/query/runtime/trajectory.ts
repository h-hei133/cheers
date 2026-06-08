import type { QueryRuntimeTrajectoryEntry } from './harness.js'
import type { QueryTerminal } from './transitions.js'

export interface QueryRuntimeTrajectorySummary {
  readonly phaseCount: number
  readonly wrongOrIncompleteActions: number
  readonly sourceDiscoveryBeforeRepair: boolean
  readonly badRepairFailedRerunNextHypothesis: boolean
  readonly genericGreenRejected: boolean
  readonly artifactPendingThenCompleted: boolean
  readonly durableRestore: boolean
  readonly notProvenMissingProof: readonly string[]
  readonly settlesSuccess: false
}

export function summarizeQueryRuntimeTrajectory(input: {
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
  readonly restored?: boolean
  readonly terminalStatus?: QueryTerminal['terminalReason']
  readonly missingProof?: readonly string[]
}): QueryRuntimeTrajectorySummary {
  const ordered = [...input.trajectory].sort((left, right) => left.sequence - right.sequence)
  const phases = ordered.map((entry) => entry.phase)
  const firstRepairIndex = firstIndex(phases, (phase) => phase.startsWith('repair:'))
  const firstSourceIndex = firstIndex(phases, (phase) => phase === 'context:source-fact-recorded')
  const pendingArtifactIndex = firstIndex(phases, (phase) => phase === 'artifact:pending')
  const completedArtifactIndex = firstIndex(phases, (phase) => phase === 'artifact:completed')
  return Object.freeze({
    phaseCount: ordered.length,
    wrongOrIncompleteActions: countWrongOrIncompleteActions(phases),
    sourceDiscoveryBeforeRepair: firstSourceIndex >= 0 && firstRepairIndex >= 0 && firstSourceIndex < firstRepairIndex,
    badRepairFailedRerunNextHypothesis: hasOrderedPhases(phases, [
      'repair:attempt',
      'repair:rerun',
      'repair:next-hypothesis',
    ]),
    genericGreenRejected: phases.includes('verification:wrong-target-ignored'),
    artifactPendingThenCompleted: pendingArtifactIndex >= 0 &&
      completedArtifactIndex > pendingArtifactIndex,
    durableRestore: input.restored === true,
    notProvenMissingProof: input.terminalStatus === 'stopped_not_proven'
      ? uniqueStrings(input.missingProof ?? [])
      : [],
    settlesSuccess: false,
  })
}

function countWrongOrIncompleteActions(phases: readonly QueryRuntimeTrajectoryEntry['phase'][]): number {
  return phases.filter((phase) =>
    phase === 'tool:failed' ||
    phase === 'verification:failed' ||
    phase === 'verification:wrong-target-ignored' ||
    phase === 'repair:hypothesis-rejected' ||
    phase === 'repair:repeat-blocked' ||
    phase === 'artifact:pending' ||
    phase === 'artifact:source-missing' ||
    phase === 'artifact:verification-missing'
  ).length
}

function hasOrderedPhases(
  phases: readonly QueryRuntimeTrajectoryEntry['phase'][],
  expected: readonly QueryRuntimeTrajectoryEntry['phase'][],
): boolean {
  let cursor = 0
  for (const phase of phases) {
    if (phase === expected[cursor]) {
      cursor += 1
      if (cursor === expected.length) return true
    }
  }
  return false
}

function firstIndex<T>(values: readonly T[], predicate: (value: T) => boolean): number {
  for (const [index, value] of values.entries()) {
    if (predicate(value)) return index
  }
  return -1
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return Object.freeze([...new Set(values.map((value) => value.trim()).filter(Boolean))])
}

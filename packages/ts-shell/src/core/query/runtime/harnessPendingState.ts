import { safeText, uniqueStrings } from "./harnessSupport.js";
import type {
  QueryRuntimePendingArtifact,
  QueryRuntimePendingRepair,
  QueryRuntimePendingVerification,
  QueryRuntimePendingWrite,
  QueryRuntimeTrajectoryEntry,
  QueryRuntimeTrajectoryPhase,
} from "./harnessState.js";

/**
 * Pending-state mutations on the harness.
 *
 * Applies and retracts the pending write, verification, repair, and artifact
 * entries that a classified output produces. These mutate harness state; the
 * classification in `./harnessClaims.js` only reads.
 */

export function upsertPendingWrite(
  queue: readonly QueryRuntimePendingWrite[],
  next: QueryRuntimePendingWrite,
): QueryRuntimePendingWrite[] {
  return [...queue.filter((item) => item.queueId !== next.queueId), Object.freeze(next)]
}

export function upsertPendingVerification(
  queue: readonly QueryRuntimePendingVerification[],
  next: QueryRuntimePendingVerification,
): QueryRuntimePendingVerification[] {
  return [
    ...queue.filter((item) => !sameTargets(item.targetFiles, next.targetFiles)),
    Object.freeze(next),
  ]
}

export function upsertPendingRepair(
  queue: readonly QueryRuntimePendingRepair[],
  next: QueryRuntimePendingRepair,
): QueryRuntimePendingRepair[] {
  return [
    ...queue.filter((item) => item.queueId !== next.queueId && !overlapsTargets(item.targetFiles, next.targetFiles)),
    Object.freeze(next),
  ]
}

export function upsertPendingArtifact(
  queue: readonly QueryRuntimePendingArtifact[],
  next: QueryRuntimePendingArtifact,
): QueryRuntimePendingArtifact[] {
  const current = queue.find((item) => sameTargets(item.claims, next.claims))
  const merged = current
    ? {
        ...next,
        evidenceIds: uniqueStrings([...current.evidenceIds, ...next.evidenceIds]),
        targetFiles: uniqueStrings([...current.targetFiles, ...next.targetFiles]),
      }
    : next
  return [
    ...queue.filter((item) => !sameTargets(item.claims, next.claims)),
    Object.freeze(merged),
  ]
}

export function removeSatisfiedArtifact(
  queue: readonly QueryRuntimePendingArtifact[],
  claims: readonly string[],
): QueryRuntimePendingArtifact[] {
  return queue.filter((item) => !sameTargets(item.claims, claims))
}

export function settleArtifactVerification(
  queue: readonly QueryRuntimePendingArtifact[],
  covered: readonly string[],
): QueryRuntimePendingArtifact[] {
  const coveredSet = new Set(covered)
  return queue.map((item) => {
    if (item.targetFiles.length === 0 || !item.targetFiles.every((path) => coveredSet.has(path))) {
      return item
    }
    return Object.freeze({
      ...item,
      evidenceIds: uniqueStrings([...item.evidenceIds, ...covered]),
    })
  })
}

export function settleRepairContext(
  queue: readonly QueryRuntimePendingRepair[],
  covered: readonly string[],
  sourceFactIds: readonly string[] = [],
): QueryRuntimePendingRepair[] {
  const coveredSet = new Set(covered)
  return queue.map((item) => {
    if (!item.contextNeed || !coveredSet.has(item.contextNeed)) {
      return item
    }
    const { contextNeed: _contextNeed, ...rest } = item
    return Object.freeze({
      ...rest,
      sourceFactIds: uniqueStrings([...(rest.sourceFactIds ?? []), ...sourceFactIds]),
    })
  })
}

export function removeCoveredVerification(
  queue: readonly QueryRuntimePendingVerification[],
  covered: readonly string[],
): QueryRuntimePendingVerification[] {
  const coveredSet = new Set(covered)
  return queue.filter((item) => !item.targetFiles.every((path) => coveredSet.has(path)))
}

export function removeCoveredRepair(
  queue: readonly QueryRuntimePendingRepair[],
  covered: readonly string[],
): QueryRuntimePendingRepair[] {
  const coveredSet = new Set(covered)
  return queue.filter((item) => !item.targetFiles.every((path) => coveredSet.has(path)))
}

export function sameTargets(left: readonly string[], right: readonly string[]): boolean {
  const normalizedLeft = uniqueStrings(left)
  const normalizedRight = uniqueStrings(right)
  return normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value) => normalizedRight.includes(value))
}

export function overlapsTargets(left: readonly string[], right: readonly string[]): boolean {
  const normalizedRight = new Set(uniqueStrings(right))
  return uniqueStrings(left).some((value) => normalizedRight.has(value))
}

export function coversTargets(targets: readonly string[], covered: readonly string[]): boolean {
  const coveredSet = new Set(covered)
  return targets.length > 0 && targets.every((path) => coveredSet.has(path))
}

export function pendingTrajectoryTargets(
  trajectory: readonly QueryRuntimeTrajectoryEntry[],
  openPhases: readonly QueryRuntimeTrajectoryPhase[],
  closePhases: readonly QueryRuntimeTrajectoryPhase[],
): string[] {
  const pending = new Set<string>()
  for (const entry of trajectory) {
    if (openPhases.includes(entry.phase)) {
      for (const target of entry.targetFiles) pending.add(target)
    }
    if (closePhases.includes(entry.phase)) {
      for (const target of entry.targetFiles) pending.delete(target)
    }
  }
  return [...pending]
}


import {
  normalizeRuntimeSourceFacts,
  type RuntimeSourceFact,
} from "../../../context/acquisition/code/source.js";
import type {
  QueryRuntimeHarnessState,
  QueryRuntimeLedgerEntry,
  QueryRuntimePendingArtifact,
  QueryRuntimePendingRepair,
  QueryRuntimePendingVerification,
  QueryRuntimePendingWrite,
  QueryRuntimeSavePoint,
  QueryRuntimeTrajectoryEntry,
  QueryRuntimeTurnSnapshot,
} from "./harness.js";

/**
 * Harness text and immutability helpers.
 *
 * The lowest layer of the query runtime harness: string normalisation, redaction,
 * and the frozen append used by both the classification and pending-state layers.
 */

export function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

export function safeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, 180)
}

export function appendTrajectory(
  trajectory: readonly QueryRuntimeTrajectoryEntry[],
  entry: Omit<QueryRuntimeTrajectoryEntry, 'sequence'>,
): QueryRuntimeTrajectoryEntry[] {
  return [
    ...trajectory,
    Object.freeze({
      sequence: trajectory.length + 1,
      turn: entry.turn,
      role: entry.role,
      phase: entry.phase,
      ...(entry.actionKind ? { actionKind: entry.actionKind } : {}),
      ...(entry.toolId ? { toolId: entry.toolId } : {}),
      targetFiles: uniqueStrings(entry.targetFiles),
      ...(entry.detail ? { detail: safeText(entry.detail) } : {}),
    }),
  ]
}

export function freezeHarness(state: {
  readonly taskStateVersion: number
  readonly snapshots: readonly QueryRuntimeTurnSnapshot[]
  readonly savePoints: readonly QueryRuntimeSavePoint[]
  readonly ledger: readonly QueryRuntimeLedgerEntry[]
  readonly pendingWrite: readonly QueryRuntimePendingWrite[]
  readonly pendingVerification: readonly QueryRuntimePendingVerification[]
  readonly pendingRepair: readonly QueryRuntimePendingRepair[]
  readonly pendingArtifact: readonly QueryRuntimePendingArtifact[]
  readonly sourceFacts: readonly RuntimeSourceFact[]
  readonly trajectory: readonly QueryRuntimeTrajectoryEntry[]
}): QueryRuntimeHarnessState {
  return Object.freeze({
    taskStateVersion: state.taskStateVersion,
    snapshots: Object.freeze([...state.snapshots]),
    savePoints: Object.freeze([...state.savePoints]),
    ledger: Object.freeze([...state.ledger]),
    pendingWrite: Object.freeze([...state.pendingWrite]),
    pendingVerification: Object.freeze([...state.pendingVerification]),
    pendingRepair: Object.freeze([...state.pendingRepair]),
    pendingArtifact: Object.freeze([...state.pendingArtifact]),
    sourceFacts: normalizeRuntimeSourceFacts(state.sourceFacts),
    trajectory: Object.freeze([...state.trajectory]),
  })
}

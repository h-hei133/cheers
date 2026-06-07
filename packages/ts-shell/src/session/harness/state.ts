import {
  createQueryRuntimeHarnessState,
  type QueryRuntimeHarnessState,
  type QueryRuntimeLedgerEntry,
  type QueryRuntimePendingRepair,
  type QueryRuntimePendingVerification,
  type QueryRuntimePendingWrite,
  type QueryRuntimeSavePoint,
  type QueryRuntimeTurnSnapshot,
} from "../../core/query/runtime/harness.js";

export interface SessionHarnessState {
  readonly version: 1;
  readonly taskStateVersion: number;
  readonly snapshots: readonly QueryRuntimeTurnSnapshot[];
  readonly savePoints: readonly QueryRuntimeSavePoint[];
  readonly ledger: readonly QueryRuntimeLedgerEntry[];
  readonly pendingWrite: readonly QueryRuntimePendingWrite[];
  readonly pendingVerification: readonly QueryRuntimePendingVerification[];
  readonly pendingRepair: readonly QueryRuntimePendingRepair[];
}

export type SessionHarnessDecodeResult =
  | {
      readonly status: "accepted";
      readonly harness: QueryRuntimeHarnessState;
      readonly reasons: readonly string[];
    }
  | {
      readonly status: "rejected";
      readonly reasons: readonly string[];
    };

export function encodeSessionHarnessState(
  harness: QueryRuntimeHarnessState,
): SessionHarnessState {
  return {
    version: 1,
    taskStateVersion: harness.taskStateVersion,
    snapshots: harness.snapshots,
    savePoints: harness.savePoints,
    ledger: harness.ledger,
    pendingWrite: harness.pendingWrite,
    pendingVerification: harness.pendingVerification,
    pendingRepair: harness.pendingRepair,
  };
}

export function decodeSessionHarnessState(value: unknown): SessionHarnessDecodeResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { status: "rejected", reasons: ["harness state missing"] };
  }

  const state = value as Partial<SessionHarnessState>;
  const reasons = validateSessionHarnessState(state);
  if (reasons.length > 0) {
    return { status: "rejected", reasons };
  }

  return {
    status: "accepted",
    reasons: ["harness state accepted"],
    harness: createQueryRuntimeHarnessState({
      taskStateVersion: state.taskStateVersion,
      snapshots: state.snapshots,
      savePoints: state.savePoints,
      ledger: state.ledger,
      pendingWrite: state.pendingWrite,
      pendingVerification: state.pendingVerification,
      pendingRepair: state.pendingRepair,
    }),
  };
}

export function decodeCompactSessionHarnessState(
  workingMemory: unknown,
): SessionHarnessDecodeResult {
  if (!workingMemory || typeof workingMemory !== "object" || Array.isArray(workingMemory)) {
    return { status: "rejected", reasons: ["compact memory missing"] };
  }
  const root = workingMemory as Record<string, unknown>;
  const continuity = root.continuity;
  if (!continuity || typeof continuity !== "object" || Array.isArray(continuity)) {
    return { status: "rejected", reasons: ["compact continuity missing"] };
  }
  return decodeSessionHarnessState((continuity as Record<string, unknown>).harnessState);
}

function validateSessionHarnessState(
  state: Partial<SessionHarnessState>,
): readonly string[] {
  const reasons: string[] = [];
  if (state.version !== 1) reasons.push("unsupported harness state version");
  if (!Number.isInteger(state.taskStateVersion) || (state.taskStateVersion ?? 0) < 1) {
    reasons.push("invalid harness task state version");
  }
  validateArray(state.snapshots, "snapshots", reasons);
  validateArray(state.savePoints, "save points", reasons);
  validateArray(state.ledger, "ledger", reasons);
  validateArray(state.pendingWrite, "pending write", reasons);
  validateArray(state.pendingVerification, "pending verification", reasons);
  validateArray(state.pendingRepair, "pending repair", reasons);

  const ledger = state.ledger ?? [];
  for (const [index, entry] of ledger.entries()) {
    if (entry.sequence !== index + 1) {
      reasons.push("ledger sequence is not ordered");
    }
    if (entry.redactionStatus !== "redacted") {
      reasons.push("ledger entry is not redacted");
    }
    if (entry.exitStatusClass === "success" && entry.failureClass !== "none") {
      reasons.push("ledger success has failure class");
    }
  }

  for (const savePoint of state.savePoints ?? []) {
    if (savePoint.ledgerLength > ledger.length) {
      reasons.push("save point refers past ledger");
      break;
    }
    if (savePoint.turn < 0) {
      reasons.push("save point turn is invalid");
      break;
    }
  }

  for (const pending of state.pendingWrite ?? []) {
    if (pending.targetFiles.length === 0 || pending.status === "accounted") {
      reasons.push("pending write is not restorable");
      break;
    }
  }
  for (const pending of state.pendingVerification ?? []) {
    if (pending.targetFiles.length === 0) {
      reasons.push("pending verification target missing");
      break;
    }
  }
  for (const pending of state.pendingRepair ?? []) {
    if (pending.targetFiles.length === 0 || pending.failureClass.trim().length === 0) {
      reasons.push("pending repair target missing");
      break;
    }
  }

  return [...new Set(reasons)];
}

function validateArray(
  value: unknown,
  label: string,
  reasons: string[],
): void {
  if (!Array.isArray(value)) {
    reasons.push(`${label} is not an array`);
  }
}

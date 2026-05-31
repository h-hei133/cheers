import {
  createEmptyLifecycleIndex,
  type DurableLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type {
  ContinuationReason,
  TerminalClassification,
  TerminalReason,
} from "../../orchestration/types.js";
import { projectDurableStatus } from "../lifecycle/durableStatusProjection.js";
import type { Session } from "./sessionRecord.js";

export interface SessionStateSnapshot {
  status: Session["status"];
  projectRoot?: string;
  pendingPrompt?: string;
  lastError?: string;
  workingMemory?: unknown;
  durableStatus?: "success" | "stopped" | "error";
  runPhase?: "idle" | "prompt-persisted" | "turn-active";
  interruptedKind?: "prompt" | "turn";
  terminalReason?: TerminalReason;
  terminalClassification?: TerminalClassification;
  lastContinuationReason?: ContinuationReason;
  pendingLifecycle?: DurableLifecycleIndex;
}

export interface TerminalPersistence {
  readonly terminalReason?: TerminalReason;
  readonly terminalClassification?: TerminalClassification;
  readonly lastContinuationReason?: ContinuationReason;
}

export type SessionStateSnapshotOverrides = Partial<
  Pick<
    SessionStateSnapshot,
    | "runPhase"
    | "interruptedKind"
    | "terminalReason"
    | "terminalClassification"
    | "lastContinuationReason"
    | "pendingLifecycle"
  >
>;

export function buildSessionStateSnapshot(
  session: Session,
  current: SessionStateSnapshot | undefined,
  overrides?: SessionStateSnapshotOverrides,
): SessionStateSnapshot {
  return {
    status: session.status,
    projectRoot: session.projectRoot,
    pendingPrompt: session.pendingPrompt,
    lastError: session.lastError,
    runPhase:
      overrides && Object.prototype.hasOwnProperty.call(overrides, "runPhase")
        ? overrides.runPhase
        : (current?.runPhase ?? "idle"),
    interruptedKind:
      overrides &&
      Object.prototype.hasOwnProperty.call(overrides, "interruptedKind")
        ? overrides.interruptedKind
        : current?.interruptedKind,
    terminalReason:
      overrides &&
      Object.prototype.hasOwnProperty.call(overrides, "terminalReason")
        ? overrides.terminalReason
        : current?.terminalReason,
    terminalClassification:
      overrides &&
      Object.prototype.hasOwnProperty.call(
        overrides,
        "terminalClassification",
      )
        ? overrides.terminalClassification
        : current?.terminalClassification,
    durableStatus: projectDurableStatus(
      overrides &&
        Object.prototype.hasOwnProperty.call(
          overrides,
          "terminalClassification",
        )
        ? overrides.terminalClassification
        : current?.terminalClassification,
      session.status,
    ),
    lastContinuationReason:
      overrides &&
      Object.prototype.hasOwnProperty.call(overrides, "lastContinuationReason")
        ? overrides.lastContinuationReason
        : current?.lastContinuationReason,
    pendingLifecycle:
      overrides &&
      Object.prototype.hasOwnProperty.call(overrides, "pendingLifecycle")
        ? overrides.pendingLifecycle
        : (current?.pendingLifecycle ?? createEmptyLifecycleIndex()),
    workingMemory: current?.workingMemory,
  };
}

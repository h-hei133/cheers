import {
  createEmptyLifecycleIndex,
  type DurableLifecycleIndex,
} from "../../core/tools/toolResultLifecycle.js";
import type {
  ContinuationReason,
  TerminalClassification,
  TerminalReason,
} from "../../result/types.js";
import { projectDurableStatus } from "../lifecycle/durableStatusProjection.js";
import type { SessionHarnessState } from "../harness/state.js";
import type { Session } from "./sessionRecord.js";
import type { SessionUsageSnapshot } from "../../observability/usage/model.js";
import type { SessionModelSelection } from "../model/contract.js";
import type { WorkspaceRoot } from '../../core/workspace/model.js';
import {
  buildLinearSessionThreadSnapshot,
  catchUpSessionThread,
  type SessionThreadSnapshot,
} from "./sessionThread.js";

export interface SessionStateSnapshot {
  /** The goal owner validates this versioned payload and its session/workspace binding. */
  goal?: unknown;
  /** Draft/review owners validate exact versions; ordinary saves only preserve their payloads. */
  plan?: unknown;
  goalDraft?: unknown;
  goalAcceptance?: unknown;
  advisor?: unknown;
  research?: unknown;
  /** The jobs owner validates remote binding, provenance and immutable dispatch fences. */
  jobs?: unknown;
  /** The handoff owner validates selection, turn ownership and permanent run identities. */
  handoffs?: unknown;
  /** The director owner binds live selection and permanent agent-job membership. */
  directors?: unknown;
  gitWorkflow?: unknown;
  security?: unknown;
  /** The request owner validates durable reservations, metering and replay protection. */
  requestLedger?: unknown;
  workspaceRoots?: readonly WorkspaceRoot[];
  modelSelection?: SessionModelSelection;
  modelRevision?: string;
  usage?: SessionUsageSnapshot;
  status: Session["status"];
  projectRoot?: string;
  pendingPrompt?: string;
  pendingPromptEntryId?: string;
  lastError?: string;
  workingMemory?: unknown;
  durableStatus?: "success" | "stopped" | "error";
  runPhase?: "idle" | "prompt-persisted" | "turn-active";
  interruptedKind?: "prompt" | "turn";
  terminalReason?: TerminalReason;
  terminalClassification?: TerminalClassification;
  lastContinuationReason?: ContinuationReason;
  pendingLifecycle?: DurableLifecycleIndex;
  harness?: SessionHarnessState;
  thread?: SessionThreadSnapshot;
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
    | "pendingPromptEntryId"
    | "interruptedKind"
    | "terminalReason"
    | "terminalClassification"
    | "lastContinuationReason"
    | "pendingLifecycle"
    | "harness"
    | "thread"
  >
>;

export function buildSessionStateSnapshot(
  session: Session,
  current: SessionStateSnapshot | undefined,
  overrides?: SessionStateSnapshotOverrides,
): SessionStateSnapshot {
  return {
    goal: current?.goal,
    plan: current?.plan,
    goalDraft: current?.goalDraft,
    goalAcceptance: current?.goalAcceptance,
    advisor: current?.advisor,
    research: current?.research,
    jobs: current?.jobs,
    handoffs: current?.handoffs,
    directors: current?.directors,
    gitWorkflow: current?.gitWorkflow,
    security: current?.security,
    requestLedger: current?.requestLedger,
    workspaceRoots: current?.workspaceRoots ?? session.workspaceRoots,
    usage: current?.usage,
    modelSelection: current?.modelSelection,
    modelRevision: current?.modelRevision,
    status: session.status,
    projectRoot: session.projectRoot,
    pendingPrompt: session.pendingPrompt,
    pendingPromptEntryId: session.pendingPrompt === undefined ? undefined
      : overrides && Object.prototype.hasOwnProperty.call(overrides, "pendingPromptEntryId")
        ? overrides.pendingPromptEntryId : current?.pendingPromptEntryId,
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
    harness:
      overrides && Object.prototype.hasOwnProperty.call(overrides, "harness")
        ? overrides.harness
        : current?.harness,
    thread:
      overrides && Object.prototype.hasOwnProperty.call(overrides, "thread")
        ? overrides.thread
        : catchUpSessionThread(
            current?.thread ?? buildLinearSessionThreadSnapshot(session),
            session,
          ),
    workingMemory: current?.workingMemory,
  };
}

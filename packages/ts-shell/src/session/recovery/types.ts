import type { QueryRuntimeRepairSummary } from "../../core/query/runtime/state.js";
import type { QueryRuntimeTaskState } from "../../core/query/runtime/taskState.js";
import type { QueryRuntimeHarnessState } from "../../core/query/runtime/harness.js";
import type { DurableLifecycleIndex } from "../../core/tools/toolResultLifecycle.js";
import type {
  ContinuationReason,
  TerminalClassification,
  TerminalReason,
} from "../../result/types.js";
import type { SessionMessage } from "../schema/sessionMessage.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";

export interface RecoverySnapshot {
  readonly pendingPrompt?: string;
  readonly runPhase?: "idle" | "prompt-persisted" | "turn-active";
  readonly interruptedKind?: "prompt" | "turn";
  readonly durableStatus?: "success" | "stopped" | "error";
  readonly terminalReason?: TerminalReason;
  readonly terminalClassification?: TerminalClassification;
  readonly lastContinuationReason?: ContinuationReason;
  readonly pendingLifecycle: DurableLifecycleIndex;
  readonly repairSummary: QueryRuntimeRepairSummary;
  readonly harness?: QueryRuntimeHarnessState;
  readonly taskState?: QueryRuntimeTaskState;
  readonly lastUserMessage?: SessionMessage;
  readonly lastAssistantMessage?: SessionMessage;
  readonly lastLifecycleEvent?: Extract<TranscriptEvent, { type: "lifecycle" }>;
  readonly transcriptEvents: TranscriptEvent[];
}

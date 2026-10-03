import { isRecord } from "../../core/values/record.js";
import type { CodingTaskKind } from "../../result/types.js";
import type { ContinuityTerminalFacts } from "../../result/terminal/truth.js";
import { hasResultSummary } from "./summaryFormatter.js";

export const RESULT_FIELDS = [
  "lastTaskKind", "lastTerminalClassification", "lastTerminalReason", "lastFailure",
  "lastActionHandoffSummary", "lastWriterStarted", "lastWriteEffect", "lastWriteRequiresUserInspection",
  "lastWriteEffectTarget", "lastSeedInfluence", "lastSeedInfluenceHandoffSummary",
  "lastFailureHandoffDiagnostic", "lastSuccessHandoffDiagnostic", "taskState",
] as const;

export interface StoredResultSource {
  readonly taskKind?: CodingTaskKind;
  readonly terminal: ContinuityTerminalFacts;
}

export function readStoredResultSource(workingMemory: unknown): StoredResultSource | undefined {
  if (!isRecord(workingMemory)) return undefined;
  const continuity = isRecord(workingMemory.continuity) ? workingMemory.continuity : {};
  if (!RESULT_FIELDS.some((key) => continuity[key] !== undefined) && !hasResultSummary(workingMemory.summary)) {
    return undefined;
  }
  return {
    taskKind: member(continuity.lastTaskKind, ["chat", "inspect-files", "repo-explain", "read-file", "write-file", "edit-file", "run-command", "browser"]),
    terminal: {
      terminalClassification: member(continuity.lastTerminalClassification, ["success", "stopped", "error"]),
      terminalReason: member(continuity.lastTerminalReason, ["completed", "stopped_cycle", "stopped_max_turns", "stopped_invalid_handoff", "stopped_not_proven", "stopped_error"]),
      stopReason: typeof continuity.lastFailure === "string" ? continuity.lastFailure.trim() || undefined : undefined,
    },
  };
}

/** Unknown legacy result kinds may hold unresolved writes; chat cannot replace them. */
export function shouldReplaceStoredResult(stored: StoredResultSource | undefined, nextKind: CodingTaskKind): boolean {
  return !stored || nextKind !== "chat" || stored.taskKind === "chat";
}

function member<T extends string>(value: unknown, values: readonly T[]): T | undefined {
  return values.find((candidate) => candidate === value);
}

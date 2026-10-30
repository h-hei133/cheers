import { messageHasContent, messageToText } from "../../model-adapters/multimodal.js";
import { isRecord } from "../../core/values/record.js";
import { continuityBranchScope, selectBranchResultMemory } from "../continuation/branch.js";
import type { Session } from "../schema/sessionRecord.js";
import type { SessionStateSnapshot } from "../schema/sessionStateSnapshot.js";
import { sessionThreadPath } from "../schema/sessionThread.js";
import type { TranscriptEvent } from "../sessionEventCodec.js";
import { latestTranscriptRunStart } from "../transcript/scope.js";

/** Operational recovery admits state before it can synthesize missing events. */
export function selectRecoveryScope(input: {
  readonly session: Session;
  readonly state: SessionStateSnapshot;
  readonly transcriptEvents: readonly TranscriptEvent[];
}) {
  const scope = continuityBranchScope(input.state.thread, input.transcriptEvents);
  const memory = selectBranchResultMemory(input.state.workingMemory, input.state.thread, input.transcriptEvents);
  const legacyState = scope.allowGlobalFallback && memory === input.state.workingMemory;
  const source = input.state.pendingPromptEntryId;
  const legacyPrompt = input.state.pendingPrompt ?? input.session.pendingPrompt;
  const pendingPrompt = source === undefined && legacyState
    ? legacyPrompt?.trim() ? legacyPrompt : undefined
    : readPendingPrompt(input.state, input.transcriptEvents, scope.admitsEntry);
  const allowInterruptionRepair = source === undefined ? legacyState : pendingPrompt !== undefined;
  const transcriptEvents = input.transcriptEvents.filter(event => {
    if (event.type === "message") return scope.allowUnindexedMessages || scope.admitsEntry(event.id);
    if (event.type === "query-event") return scope.admitsEntry(event.sourceEntryId);
    if (event.type === "lifecycle") return event.sourceEntryId === undefined
      ? legacyState : scope.admitsEntry(event.sourceEntryId);
    return event.type !== "branch_summary" && scope.allowLegacy;
  });
  return {
    pendingPrompt,
    allowInterruptionRepair,
    useLegacyState: legacyState && (source === undefined || allowInterruptionRepair),
    transcriptEvents,
    state: { ...input.state, pendingPrompt,
      runPhase: allowInterruptionRepair ? input.state.runPhase : undefined,
      interruptedKind: allowInterruptionRepair ? input.state.interruptedKind : undefined,
      workingMemory: memory,
    },
  };
}

function readPendingPrompt(
  state: SessionStateSnapshot,
  events: readonly TranscriptEvent[],
  admitsEntry: (entryId: unknown) => boolean,
): string | undefined {
  if (!admitsEntry(state.pendingPromptEntryId) || typeof state.pendingPrompt !== "string") return undefined;
  const entry = state.thread?.entries.find(candidate => candidate.id === state.pendingPromptEntryId);
  if (entry?.kind !== "turn-message" || entry.role !== "user") return undefined;
  const selected = state.thread ? sessionThreadPath(state.thread).path : [];
  if ([...selected].reverse().find(candidate => candidate.role === "user")?.id !== entry.id) return undefined;
  const messages = events.filter(
    (event): event is Extract<TranscriptEvent, { type: "message" }> =>
      event.type === "message" && event.id === state.pendingPromptEntryId,
  );
  if (messages.length > 1 || messages.some(event => event.role !== "user" || messageToText(event.content) !== state.pendingPrompt)) return undefined;
  // Empty text is recoverable only through the exact retained image message;
  // legacy missing-text repair cannot manufacture an absent picture.
  if (!state.pendingPrompt.trim() && (messages.length !== 1 || !messageHasContent(messages[0]!.content))) return undefined;
  return state.pendingPrompt;
}

/** A missing prompt must be repaired after its ancestors, never before them. */
export function recoveryPendingRunStart(state: SessionStateSnapshot, events: readonly TranscriptEvent[]): number | undefined {
  const source = state.pendingPromptEntryId;
  if (state.pendingPrompt === undefined || typeof source !== "string") return undefined;
  const selected = state.thread ? sessionThreadPath(state.thread).path : [];
  const order = new Map(selected.map((entry, index) => [entry.id, index]));
  const pendingOrder = order.get(source)!;
  const start = events.findIndex(event => {
    const id = event.type === "message" ? event.id
      : event.type === "query-event" || event.type === "lifecycle" ? event.sourceEntryId : undefined;
    return id !== undefined && (order.get(id) ?? -1) >= pendingOrder;
  });
  return start < 0 ? events.length : start;
}

/** A pending-prompt stamp does not authenticate an older harness checkpoint. */
export function recoveryTaskMemory(memory: unknown, allowHarness: boolean): unknown {
  if (allowHarness || !isRecord(memory) || !isRecord(memory.continuity)) return memory;
  const continuity = { ...memory.continuity };
  delete continuity.harnessState;
  return { ...memory, continuity };
}

export function selectedRecoveryTerminal(events: readonly TranscriptEvent[]): Partial<SessionStateSnapshot> {
  const current = events.slice(latestTranscriptRunStart(events));
  for (let index = current.length - 1; index >= 0; index -= 1) {
    const entry = current[index]!;
    if (entry.type !== "query-event") continue;
    if (entry.event.type === "query.failed" || entry.event.type === "lifecycle.error") return {
      durableStatus: "error", terminalClassification: "error", terminalReason: "stopped_error", lastError: entry.event.error,
    };
    if (entry.event.type === "query.completed") return {
      durableStatus: entry.event.result.terminalClassification,
      terminalClassification: entry.event.result.terminalClassification,
      terminalReason: entry.event.result.terminalReason,
      lastError: entry.event.result.terminalClassification === "success" ? undefined : entry.event.result.stopReason,
    };
  }
  return {};
}

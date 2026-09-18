import type { HostSessionRecord } from "../../store/host/state.js";
import type { ReplaySafeLoopStateSummary } from "../state.js";

export interface HostReplayFacts {
  readonly factsId: string;
  readonly sessionId: string;
  readonly activeLeafId: string;
  readonly retainedFactIds: readonly string[];
  readonly providerRequestFacts?: ReplaySafeLoopStateSummary["providerRequestFacts"];
  readonly excluded: readonly string[];
  readonly replayReady: boolean;
  readonly terminalSuccessClaim: false;
  readonly notProvenClaims: readonly string[];
}

export function projectHostReplayFacts(input: {
  readonly record: HostSessionRecord;
  readonly replay?: ReplaySafeLoopStateSummary;
}): HostReplayFacts {
  const replay = input.replay;
  return freeze({
    factsId: `${input.record.session.id}:host-replay-facts`,
    sessionId: input.record.session.id,
    activeLeafId: input.record.thread.activeLeafId ?? input.record.session.id,
    retainedFactIds: replay
      ? [
          replay.summaryId,
          ...replay.retainedContextFactIds,
          ...replay.toolResultMessageIds,
          ...(replay.toolSchedulingPlanId ? [replay.toolSchedulingPlanId] : []),
          ...(replay.toolSchedulingParallelGroupIds ?? []),
          ...(replay.toolSchedulingSequentialGroupIds ?? []),
          ...replay.verificationHandoffIds,
          ...replay.repairHandoffIds,
        ]
      : [input.record.thread.activeLeafId ?? input.record.session.id],
    ...(replay?.providerRequestFacts
      ? { providerRequestFacts: replay.providerRequestFacts }
      : {}),
    excluded: [
      "raw-transcript",
      "raw-provider-output",
      "raw-command-output",
      "raw-edit-text",
      "patch-bodies",
      "hidden-reasoning",
      "secrets",
      ...(replay?.redaction.excluded ?? []),
    ],
    replayReady: input.record.lifecycle !== "cancelled",
    terminalSuccessClaim: false,
    notProvenClaims: unique([
      "terminal-success",
      "replay-restored-is-not-success",
      ...(replay?.notProvenClaims ?? []),
    ]),
  });
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values)).sort();
}

function freeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) {
      freeze(child);
    }
  }
  return value;
}

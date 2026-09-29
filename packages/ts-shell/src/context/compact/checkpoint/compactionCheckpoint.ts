import { runCompactCommand } from "../command/compactCommandRunner.js";
import {
  DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
  updateLatestCompactCheckpoint,
  type CompactCheckpointSourceCommand,
  type CompactLiveCheckpoint,
  type CompactLiveCheckpointStore,
} from "./compactLiveCheckpoint.js";
import {
  DEFAULT_COMPACT_INJECTION_STATE_STORE,
  markCompactCheckpointPendingInjection,
  type CompactInjectionState,
  type CompactInjectionStateStore,
} from "../injection/compactInjectionState.js";

/**
 * The one place a live checkpoint is produced.
 *
 * It used to be produced by the `/compact` command, which had two consequences.
 * Only a hand-typed `/compact` created one, so the automatic path condensed the
 * history and left nothing behind while `/sidebar`, the memory candidate
 * extraction and the next-turn injection all read that value. And every
 * hand-typed form created one, including the read-only handoff forms — so
 * `/compact --preview`, which the help advertises as preview-only, staged an
 * injection that changed what the next turn received.
 *
 * A checkpoint is now what a completed compaction produces. Both paths call this
 * after the history has actually been condensed; no read-only form calls it.
 *
 * The packet itself is unchanged: it is built by the same projection from the
 * project, and here it describes the condensation that just happened rather than
 * a preview of one that may never.
 */
export function recordCompactionCheckpoint(input: {
  readonly sessionScopeId: string;
  readonly sourceCommand: CompactCheckpointSourceCommand;
  readonly projectRoot: string;
  readonly checkpointStore?: CompactLiveCheckpointStore;
  readonly injectionStateStore?: CompactInjectionStateStore;
}): { readonly checkpoint: CompactLiveCheckpoint; readonly injectionState: CompactInjectionState } {
  const result = runCompactCommand({
    mode: "render",
    projectInfo: { projectRoot: input.projectRoot, safeToPersistProjectRoot: true },
    taskGoal: {
      nextAction: "Use the compact handoff to continue the session explicitly.",
    },
  });
  const checkpoint = updateLatestCompactCheckpoint(
    input.checkpointStore ?? DEFAULT_COMPACT_LIVE_CHECKPOINT_STORE,
    {
      sessionScopeId: input.sessionScopeId,
      sourceCommand: input.sourceCommand,
      result,
    },
  );
  const injectionState = markCompactCheckpointPendingInjection(
    input.injectionStateStore ?? DEFAULT_COMPACT_INJECTION_STATE_STORE,
    {
      sessionScopeId: input.sessionScopeId,
      checkpointId: checkpoint.checkpointId,
      sourceCommand: checkpoint.sourceCommand,
      createdAt: checkpoint.createdAt,
    },
  );
  return { checkpoint, injectionState };
}

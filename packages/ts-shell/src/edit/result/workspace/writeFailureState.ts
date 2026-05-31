export type WorkspaceWriteEffect = "none" | "unknown" | "unverified" | "verified";

export type WorkspaceWriteFailurePhase =
  | "before-writer"
  | "writer-failed"
  | "post-write-verification-failed"
  | "verified-write";

export interface WorkspaceWriteFailureState {
  readonly writeEffect: WorkspaceWriteEffect;
  readonly failurePhase: WorkspaceWriteFailurePhase;
  readonly writerStarted: boolean;
  readonly requiresUserInspection: boolean;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function buildWorkspaceWriteFailureState(input: {
  readonly phase: WorkspaceWriteFailurePhase;
  readonly targetPath?: string;
}): WorkspaceWriteFailureState {
  const target = input.targetPath ?? "the target file";

  switch (input.phase) {
    case "verified-write":
      return {
        writeEffect: "verified",
        failurePhase: input.phase,
        writerStarted: true,
        requiresUserInspection: false,
        nextAction:
          "Review the selected workspace change; default apply_patch remains rejected outside this explicit write entrypoint.",
        evidence: [
          "apply-patch-write-failure-state:verified",
          "apply-patch-write-failure-state:writer-started",
        ],
      };
    case "writer-failed":
      return {
        writeEffect: "unknown",
        failurePhase: input.phase,
        writerStarted: true,
        requiresUserInspection: true,
        nextAction: `Stop: the workspace writer started for ${target} but failed before the route could verify the final file content. Re-read ${target}, compare it with the approved patch, then retry only after the current content is known.`,
        evidence: [
          "apply-patch-write-failure-state:writer-started",
          "apply-patch-write-failure-state:write-effect-unknown",
          "apply-patch-write-failure-state:user-inspection-required",
        ],
      };
    case "post-write-verification-failed":
      return {
        writeEffect: "unverified",
        failurePhase: input.phase,
        writerStarted: true,
        requiresUserInspection: true,
        nextAction: `Stop: the workspace writer returned for ${target}, but post-write verification did not match the approved content. Re-read ${target}, inspect the actual file contents, then retry or repair from that current state.`,
        evidence: [
          "apply-patch-write-failure-state:writer-started",
          "apply-patch-write-failure-state:write-effect-unverified",
          "apply-patch-write-failure-state:user-inspection-required",
        ],
      };
    case "before-writer":
      return {
        writeEffect: "none",
        failurePhase: input.phase,
        writerStarted: false,
        requiresUserInspection: false,
        nextAction:
          "No workspace writer ran. Fix the blocker and retry the explicit workspace write route if still needed.",
        evidence: [
          "apply-patch-write-failure-state:before-writer",
          "apply-patch-write-failure-state:write-effect-none",
        ],
      };
  }
}

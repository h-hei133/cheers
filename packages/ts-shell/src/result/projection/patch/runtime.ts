import type { SingleFileApplyPatchTerminalSurface } from "./terminal.js";

export type SingleFileApplyPatchRuntimeBridgeStatus =
  | "dry-run-ready"
  | "blocked"
  | "permission-pending";

export type SingleFileApplyPatchRuntimeBridgeBlocker =
  | "dry-run-preview"
  | "permission-pending"
  | "stale-read"
  | "target-missing"
  | "unsupported-patch-shape";

export interface SingleFileApplyPatchRuntimeBridge {
  readonly source: "single-file-apply-patch-terminal-surface";
  readonly status: SingleFileApplyPatchRuntimeBridgeStatus;
  readonly mapperSafe: true;
  readonly sessionSafe: true;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly wouldChangeFiles: readonly string[];
  readonly previewChangedFiles: readonly string[];
  readonly approval: {
    readonly decision: "pending" | "blocked" | "denied";
    readonly writeIntent: {
      readonly authorized: false;
      readonly count: 0;
    };
  };
  readonly codingResultProjection: SingleFileApplyPatchRuntimeCodingResultProjection;
  readonly terminalSafetyProof: {
    readonly noMutationSuccess: true;
    readonly noWriteSuccess: true;
    readonly noAppliedPatchRecord: true;
    readonly noApprovedDecision: true;
    readonly noChangedFiles: true;
    readonly previewFilesOnlyInWouldChangeFiles: true;
  };
  readonly nextAction: string;
  readonly doNext: string;
}

export interface SingleFileApplyPatchRuntimeCodingResultProjection {
  readonly taskKind: "edit-file";
  readonly changedFiles: readonly [];
  readonly failedFiles: readonly SingleFileApplyPatchRuntimeFailedFile[];
  readonly patches: readonly SingleFileApplyPatchRuntimePatchRecord[];
  readonly verification: {
    readonly status: "blocked" | "not-requested";
    readonly blockerKind: SingleFileApplyPatchRuntimeBridgeBlocker;
    readonly reason: string;
    readonly nextAction: string;
  };
  readonly taskSatisfaction: {
    readonly verdict: "insufficient-evidence" | "completed-with-caveats";
    readonly reasons: readonly string[];
    readonly requiredEvidence: readonly string[];
    readonly observedEvidence: readonly string[];
  };
  readonly evidence: readonly string[];
}

export interface SingleFileApplyPatchRuntimeFailedFile {
  readonly path: string;
  readonly reason: string;
}

export interface SingleFileApplyPatchRuntimePatchRecord {
  readonly path: string;
  readonly operation: "replace";
  readonly status: "failed";
  readonly reason: string;
  readonly failureCode:
    | "stale-read"
    | "patch-target-missing"
    | "patch-generation-failed";
  readonly continuationStrategy: string;
}

export function buildSingleFileApplyPatchRuntimeBridge(input: {
  readonly terminalSurface: SingleFileApplyPatchTerminalSurface;
}): SingleFileApplyPatchRuntimeBridge {
  const surface = input.terminalSurface;
  const blocker = runtimeBlocker(surface);
  const targetPath = primaryTargetPath(surface);
  const reason = runtimeReason(surface, blocker);
  const patches = runtimePatches({ surface, targetPath, blocker, reason });
  const failedFiles = runtimeFailedFiles({ surface, targetPath, reason });

  return {
    source: "single-file-apply-patch-terminal-surface",
    status: surface.status,
    mapperSafe: true,
    sessionSafe: true,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    wouldChangeFiles: surface.wouldChangeFiles,
    previewChangedFiles: surface.previewChangedFiles,
    approval: {
      decision: surface.approval.decision,
      writeIntent: {
        authorized: false,
        count: 0,
      },
    },
    codingResultProjection: {
      taskKind: "edit-file",
      changedFiles: [],
      failedFiles,
      patches,
      verification: {
        status: surface.status === "dry-run-ready" ? "not-requested" : "blocked",
        blockerKind: blocker,
        reason,
        nextAction: surface.nextAction,
      },
      taskSatisfaction: {
        verdict:
          surface.status === "blocked"
            ? "insufficient-evidence"
            : "completed-with-caveats",
        reasons: [reason],
        requiredEvidence: [
          "actual writer invocation",
          "explicit approval",
          "final stale-read revalidation",
        ],
        observedEvidence: surface.evidence,
      },
      evidence: [
        ...surface.evidence,
        "apply-patch-runtime-bridge:mapper-safe",
        "apply-patch-runtime-bridge:session-safe",
        "apply-patch-runtime-bridge:will-write-false",
        "apply-patch-runtime-bridge:changed-files-empty",
        "apply-patch-runtime-bridge:write-intents-empty",
        "apply-patch-runtime-bridge:no-mutation-success",
        "apply-patch-runtime-bridge:no-write-success",
        "apply-patch-runtime-bridge:no-applied-patch-record",
      ],
    },
    terminalSafetyProof: {
      noMutationSuccess: true,
      noWriteSuccess: true,
      noAppliedPatchRecord: true,
      noApprovedDecision: true,
      noChangedFiles: true,
      previewFilesOnlyInWouldChangeFiles: true,
    },
    nextAction: surface.nextAction,
    doNext: surface.doNext,
  };
}

function runtimeBlocker(
  surface: SingleFileApplyPatchTerminalSurface,
): SingleFileApplyPatchRuntimeBridgeBlocker {
  if (surface.status === "permission-pending") {
    return "permission-pending";
  }
  if (surface.status === "dry-run-ready") {
    return "dry-run-preview";
  }

  const markerText = [surface.nextAction, surface.doNext, ...surface.evidence]
    .join(" ")
    .toLowerCase();

  if (markerText.includes("target-missing")) {
    return "target-missing";
  }
  if (markerText.includes("stale-read")) {
    return "stale-read";
  }
  return "unsupported-patch-shape";
}

function primaryTargetPath(surface: SingleFileApplyPatchTerminalSurface): string {
  return (
    surface.baseEvidence?.targetPath ??
    surface.previewChangedFiles[0] ??
    surface.wouldChangeFiles[0] ??
    "(apply_patch)"
  );
}

function runtimeReason(
  surface: SingleFileApplyPatchTerminalSurface,
  blocker: SingleFileApplyPatchRuntimeBridgeBlocker,
): string {
  switch (blocker) {
    case "dry-run-preview":
      return "Single-file apply_patch is available only as a dry-run preview; no file was modified.";
    case "permission-pending":
      return "Single-file apply_patch preview is waiting for explicit permission and final stale-read revalidation; no file was modified.";
    case "stale-read":
      return "Single-file apply_patch write decision is blocked because the target changed after preview.";
    case "target-missing":
      return "Single-file apply_patch write decision is blocked because the target is missing after preview.";
    case "unsupported-patch-shape":
      return surface.nextAction;
  }
}

function runtimeFailedFiles(input: {
  readonly surface: SingleFileApplyPatchTerminalSurface;
  readonly targetPath: string;
  readonly reason: string;
}): readonly SingleFileApplyPatchRuntimeFailedFile[] {
  if (input.surface.status !== "blocked") {
    return [];
  }
  return [{ path: input.targetPath, reason: input.reason }];
}

function runtimePatches(input: {
  readonly surface: SingleFileApplyPatchTerminalSurface;
  readonly targetPath: string;
  readonly blocker: SingleFileApplyPatchRuntimeBridgeBlocker;
  readonly reason: string;
}): readonly SingleFileApplyPatchRuntimePatchRecord[] {
  if (input.surface.status !== "blocked") {
    return [];
  }

  return [
    {
      path: input.targetPath,
      operation: "replace",
      status: "failed",
      reason: input.reason,
      failureCode: failureCodeForBlocker(input.blocker),
      continuationStrategy: input.surface.doNext,
    },
  ];
}

function failureCodeForBlocker(
  blocker: SingleFileApplyPatchRuntimeBridgeBlocker,
): SingleFileApplyPatchRuntimePatchRecord["failureCode"] {
  switch (blocker) {
    case "stale-read":
      return "stale-read";
    case "target-missing":
      return "patch-target-missing";
    default:
      return "patch-generation-failed";
  }
}

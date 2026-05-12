import type { ParsedPatch, PatchFailure } from "../patchParsing/types.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import { buildPatchPreview } from "./preview.js";

export type MultiFileUpdatePlanningBlockedReason =
  | "multi-file-update-write-not-enabled"
  | "three-file-update-planning-no-write"
  | "too-many-update-files"
  | "mixed-operations-not-enabled"
  | "workspace-boundary"
  | "missing-target"
  | "verification-failed";

export interface MultiFileUpdatePlanningClassification {
  readonly capability: "multi-file-update-candidate-no-write";
  readonly operation: "update";
  readonly tier: "candidate";
  readonly classificationMode: "synthetic-no-write";
  readonly targetPaths: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly wouldChangeFiles: readonly string[];
  readonly blockedReason: MultiFileUpdatePlanningBlockedReason;
  readonly expectedCapability:
    | "selected-workspace two-file existing-file update planning/preflight"
    | "selected-workspace exactly-three existing-file update planning/no-write";
  readonly currentSupportedCapability:
    | "planning/preflight only; writer remains single-file"
    | "exactly-three planning/no-write only; 3-file writes remain unsupported";
  readonly drivesApplyPatchExpansion: false;
  readonly willWrite: false;
  readonly writerReachable: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly failedFiles: readonly PatchFailure[];
  readonly explanation: string;
  readonly nextAction: string;
}

export function patchIsExactlyThreeUpdateFiles(rawPatchText: string): boolean {
  const parsed = parseApplyPatchText(rawPatchText);
  return (
    parsed.ok === true &&
    parsed.patch.operations.length === 3 &&
    parsed.patch.operations.every((operation) => operation.kind === "update")
  );
}

export function classifyMultiFileUpdatePlanningNoWrite(
  patch: ParsedPatch,
  options: {
    readonly workspaceRoot: string;
    readonly readFile: (absolutePath: string) => string | undefined;
    readonly directoryExists?: (absolutePath: string) => boolean;
  },
): MultiFileUpdatePlanningClassification | undefined {
  if (patch.operations.length === 1) {
    return undefined;
  }

  const updateOperations = patch.operations.filter(
    (operation) => operation.kind === "update",
  );
  if (updateOperations.length === 0) {
    return undefined;
  }

  const targetPaths = patch.operations.map((operation) => operation.path);
  if (updateOperations.length !== patch.operations.length) {
    return buildClassification({
      targetPaths,
      plannedFiles: [],
      wouldChangeFiles: [],
      blockedReason: "mixed-operations-not-enabled",
      failedFiles: [
        {
          code: "patch-verify-operation-unsupported",
          path: firstUnsupportedOperationPath(patch),
          message:
            "Multi-file update planning only accepts Update File operations.",
          nextAction:
            "Use exactly two existing-file Update File operations; keep add, delete, move, and mixed patches out of this candidate planner.",
        },
      ],
      explanation:
        "Patch mixes Update File with unsupported operations; multi-file planning is no-write and update-only.",
      nextAction:
        "Regenerate the patch with exactly two Update File operations against existing selected-workspace files.",
    });
  }

  if (updateOperations.length > 3) {
    return buildClassification({
      targetPaths,
      plannedFiles: [],
      wouldChangeFiles: [],
      blockedReason: "too-many-update-files",
      failedFiles: [
        {
          code: "patch-apply-plan-not-verified",
          message:
            "Multi-file update planning accepts exactly two Update File operations.",
          nextAction:
            "Reduce the patch to exactly two existing-file Update File operations, or use the exactly-three planning/no-write verifier without expecting writes.",
        },
      ],
      explanation:
        "Multi-file update planning is intentionally capped before any 3+ file write support.",
      nextAction:
        "Reduce the patch to exactly two selected-workspace existing-file Update File targets; 4+ file writes remain unsupported.",
    });
  }

  const verification = verifyParsedPatch(patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    ...(options.directoryExists
      ? { directoryExists: options.directoryExists }
      : {}),
    supportedOperations: ["update"],
  });
  if (verification.ok === false) {
    return buildClassification({
      targetPaths,
      plannedFiles: [],
      wouldChangeFiles: [],
      blockedReason: blockedReasonForFailures(verification.failures),
      failedFiles: verification.failures,
      explanation:
        "Multi-file update planning preflight failed before any writer was reachable.",
      nextAction:
        verification.failures[0]?.nextAction ??
        "Re-read the selected workspace files and regenerate the two-file Update File patch.",
    });
  }

  const preview = buildPatchPreview(verification);
  if (updateOperations.length === 3) {
    return buildClassification({
      targetPaths,
      plannedFiles: targetPaths,
      wouldChangeFiles: preview.changedFiles,
      blockedReason: "three-file-update-planning-no-write",
      failedFiles: [],
      explanation:
        "Exactly-three Update File patch passed selected-workspace planning/preflight, but 3-file writes are unsupported and no writer was reachable.",
      nextAction:
        "No files were changed. Split this into supported smaller operations or wait for a dedicated 3-file write route before writing three files.",
    });
  }

  return buildClassification({
    targetPaths,
    plannedFiles: targetPaths,
    wouldChangeFiles: preview.changedFiles,
    blockedReason: "multi-file-update-write-not-enabled",
    failedFiles: [],
    explanation:
      "Two-file Update File patch passed selected-workspace planning/preflight, but multi-file writing is not enabled.",
    nextAction:
      "Keep this as candidate no-write evidence; split into single-file updates or implement a dedicated multi-file write route before writing multiple files.",
  });
}

function buildClassification(input: {
  readonly targetPaths: readonly string[];
  readonly plannedFiles: readonly string[];
  readonly wouldChangeFiles: readonly string[];
  readonly blockedReason: MultiFileUpdatePlanningBlockedReason;
  readonly failedFiles: readonly PatchFailure[];
  readonly explanation: string;
  readonly nextAction: string;
}): MultiFileUpdatePlanningClassification {
  return {
    capability: "multi-file-update-candidate-no-write",
    operation: "update",
    tier: "candidate",
    classificationMode: "synthetic-no-write",
    targetPaths: input.targetPaths,
    plannedFiles: input.plannedFiles,
    wouldChangeFiles: input.wouldChangeFiles,
    blockedReason: input.blockedReason,
    expectedCapability:
      input.blockedReason === "three-file-update-planning-no-write"
        ? "selected-workspace exactly-three existing-file update planning/no-write"
        : "selected-workspace two-file existing-file update planning/preflight",
    currentSupportedCapability:
      input.blockedReason === "three-file-update-planning-no-write"
        ? "exactly-three planning/no-write only; 3-file writes remain unsupported"
        : "planning/preflight only; writer remains single-file",
    drivesApplyPatchExpansion: false,
    willWrite: false,
    writerReachable: false,
    changedFiles: [],
    writeIntents: [],
    failedFiles: input.failedFiles,
    explanation: input.explanation,
    nextAction: input.nextAction,
  };
}

function firstUnsupportedOperationPath(patch: ParsedPatch): string | undefined {
  return patch.operations.find((operation) => operation.kind !== "update")?.path;
}

function blockedReasonForFailures(
  failures: readonly PatchFailure[],
): MultiFileUpdatePlanningBlockedReason {
  if (
    failures.some((failure) => failure.code === "patch-verify-path-outside-workspace")
  ) {
    return "workspace-boundary";
  }
  if (failures.some((failure) => failure.code === "patch-verify-file-missing")) {
    return "missing-target";
  }
  return "verification-failed";
}

import {
  digestSingleFileApplyPatchContent,
  type SingleFileApplyPatchBaseEvidence,
} from "../../../evidence/projection/patch/base.js";
import type { SingleFileApplyPatchPermissionUxContract } from "../../authority/approval/permission.js";

export type SingleFileApplyPatchFinalStaleReadPhase = "final-write-preflight";

export type SingleFileApplyPatchFinalRevalidation = "passed" | "blocked";

export type SingleFileApplyPatchFinalStaleReadBlocker =
  | "stale-read"
  | "target-missing"
  | "permission-not-ready";

export interface SingleFileApplyPatchFinalStaleReadOptions {
  readonly permissionUx: SingleFileApplyPatchPermissionUxContract;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly currentContent: string | undefined;
  readonly currentDigest?: string;
  readonly phase: SingleFileApplyPatchFinalStaleReadPhase;
  readonly writerCandidatePresent: true;
}

export interface SingleFileApplyPatchFinalStaleReadResult {
  readonly source: "single-file-apply-patch-final-stale-read";
  readonly phase: SingleFileApplyPatchFinalStaleReadPhase;
  readonly finalRevalidation: SingleFileApplyPatchFinalRevalidation;
  readonly blocker?: SingleFileApplyPatchFinalStaleReadBlocker;
  readonly targetPath?: string;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly writerCandidatePresent: true;
  readonly writerReachable: false;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly doesNotClaimProductionWriteReady: true;
  readonly reason: string;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchFinalStaleReadContract(
  options: SingleFileApplyPatchFinalStaleReadOptions,
): SingleFileApplyPatchFinalStaleReadResult {
  const baseEvidence = options.baseEvidence ?? options.permissionUx.baseEvidence;

  if (!permissionReadyForFinalRevalidation(options.permissionUx) || !baseEvidence) {
    return blocked({
      options,
      baseEvidence,
      blocker: "permission-not-ready",
      reason:
        "Final stale-read revalidation requires digest-bound explicit permission UX evidence before any writer candidate can be considered.",
      nextAction:
        "Return to the explicit permission UX path and bind base evidence plus stale-read precondition before final write preflight.",
      evidence: [
        "apply-patch-final-stale-read:permission-not-ready",
        "apply-patch-final-stale-read:writer-unreachable",
      ],
    });
  }

  if (options.currentContent === undefined) {
    return blocked({
      options,
      baseEvidence,
      blocker: "target-missing",
      reason: "Patch target is missing during final write preflight.",
      nextAction:
        "Re-read the workspace and regenerate the single-file apply_patch dry-run preview before requesting permission again.",
      evidence: [
        "apply-patch-final-stale-read:target-missing",
        "apply-patch-final-stale-read:writer-unreachable",
      ],
    });
  }

  const currentDigest =
    options.currentDigest ??
    digestSingleFileApplyPatchContent(options.currentContent);

  if (currentDigest !== baseEvidence.baseDigest) {
    return blocked({
      options,
      baseEvidence,
      blocker: "stale-read",
      reason:
        "Patch target changed between the approved preview evidence and final write preflight.",
      nextAction:
        "Re-read the target file and rerun the single-file apply_patch dry-run preview before any future write decision.",
      evidence: [
        "apply-patch-final-stale-read:stale-read",
        "apply-patch-final-stale-read:writer-unreachable",
      ],
    });
  }

  const nextAction =
    "Final stale-read revalidation passed, but production write is still not ready until writer boundary wiring is separately approved and proven.";

  return {
    source: "single-file-apply-patch-final-stale-read",
    phase: options.phase,
    finalRevalidation: "passed",
    targetPath: baseEvidence.targetPath,
    baseEvidence,
    writerCandidatePresent: options.writerCandidatePresent,
    writerReachable: false,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    doesNotClaimProductionWriteReady: true,
    reason:
      "Current target digest matches the approval-bound dry-run preview base evidence.",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-final-stale-read:passed",
      "apply-patch-final-stale-read:base-evidence-matches-current-content",
      "apply-patch-final-stale-read:writer-unreachable",
      "apply-patch-final-stale-read:will-write-false",
      "apply-patch-final-stale-read:changed-files-empty",
      "apply-patch-final-stale-read:write-intents-empty",
      "apply-patch-final-stale-read:no-writer-invoked",
      "apply-patch-final-stale-read:not-production-write-ready",
    ],
  };
}

function permissionReadyForFinalRevalidation(
  permissionUx: SingleFileApplyPatchPermissionUxContract,
): boolean {
  return (
    permissionUx.permissionDecision === "pending" &&
    permissionUx.approvalTokenPrepared &&
    permissionUx.baseEvidenceDigestBound &&
    permissionUx.staleReadPreconditionRequired
  );
}

function blocked(input: {
  readonly options: SingleFileApplyPatchFinalStaleReadOptions;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly blocker: SingleFileApplyPatchFinalStaleReadBlocker;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): SingleFileApplyPatchFinalStaleReadResult {
  return {
    source: "single-file-apply-patch-final-stale-read",
    phase: input.options.phase,
    finalRevalidation: "blocked",
    blocker: input.blocker,
    ...(input.baseEvidence
      ? {
          targetPath: input.baseEvidence.targetPath,
          baseEvidence: input.baseEvidence,
        }
      : {}),
    writerCandidatePresent: input.options.writerCandidatePresent,
    writerReachable: false,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    doesNotClaimProductionWriteReady: true,
    reason: input.reason,
    nextAction: input.nextAction,
    doNext: input.nextAction,
    evidence: [
      ...input.evidence,
      "apply-patch-final-stale-read:blocked",
      `apply-patch-final-stale-read:blocker:${input.blocker}`,
      "apply-patch-final-stale-read:will-write-false",
      "apply-patch-final-stale-read:changed-files-empty",
      "apply-patch-final-stale-read:write-intents-empty",
      "apply-patch-final-stale-read:no-writer-invoked",
      "apply-patch-final-stale-read:not-production-write-ready",
    ],
  };
}

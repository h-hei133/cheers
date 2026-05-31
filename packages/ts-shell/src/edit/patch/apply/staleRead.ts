import {
  buildSingleFileApplyPatchBaseEvidence,
  digestSingleFileApplyPatchContent,
  type SingleFileApplyPatchBaseEvidence,
} from "../../../evidence/projection/patch/base.js";

export type SingleFileApplyPatchStaleReadPhase = "write-decision-dry-run";

export type SingleFileApplyPatchStaleReadStatus = "contract-ready" | "blocked";

export type SingleFileApplyPatchStaleReadBlocker =
  | "stale-read"
  | "target-missing";

export interface SingleFileApplyPatchStaleReadOptions {
  readonly targetPath?: string;
  readonly baseContent?: string;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly currentContent: string | undefined;
  readonly currentDigest?: string;
  readonly phase: SingleFileApplyPatchStaleReadPhase;
  readonly dryRun: true;
}

export interface SingleFileApplyPatchStaleReadResult {
  readonly status: SingleFileApplyPatchStaleReadStatus;
  readonly targetPath: string;
  readonly baseEvidence: SingleFileApplyPatchBaseEvidence;
  readonly phase: SingleFileApplyPatchStaleReadPhase;
  readonly staleReadDetected: boolean;
  readonly writeDecisionBlocked: boolean;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly doesNotClaimProductionWriteReady: true;
  readonly blocker?: SingleFileApplyPatchStaleReadBlocker;
  readonly reason: string;
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export function buildSingleFileApplyPatchStaleReadContract(
  options: SingleFileApplyPatchStaleReadOptions,
): SingleFileApplyPatchStaleReadResult {
  const baseEvidence = resolveBaseEvidence(options);
  const targetPath = options.targetPath ?? baseEvidence.targetPath;

  if (options.currentContent === undefined) {
    return blocked({
      options,
      targetPath,
      baseEvidence,
      blocker: "target-missing",
      staleReadDetected: true,
      reason: "Patch target is missing before the write decision.",
      nextAction:
        "Re-read the workspace and regenerate the single-file Update File dry-run preview before any write decision is considered.",
      evidence: [
        "apply-patch-stale-read:target-missing",
        "apply-patch-stale-read:write-decision-blocked",
      ],
    });
  }

  const currentDigest =
    options.currentDigest ??
    digestSingleFileApplyPatchContent(options.currentContent);

  if (baseEvidence.baseDigest !== currentDigest) {
    return blocked({
      options,
      targetPath,
      baseEvidence,
      blocker: "stale-read",
      staleReadDetected: true,
      reason:
        "Patch target changed after the dry-run preview base content was captured.",
      nextAction:
        "Re-read the target file and rerun the single-file Update File dry-run preview before requesting write approval.",
      evidence: [
        "apply-patch-stale-read:stale-read-detected",
        "apply-patch-stale-read:write-decision-blocked",
      ],
    });
  }

  const nextAction =
    "Stale-read revalidation contract is ready; this is not production-write-ready until approval and writer wiring are separately proven.";

  return {
    status: "contract-ready",
    targetPath,
    baseEvidence,
    phase: options.phase,
    staleReadDetected: false,
    writeDecisionBlocked: false,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    doesNotClaimProductionWriteReady: true,
    reason: "Current target content matches the dry-run preview base content.",
    nextAction,
    doNext: nextAction,
    evidence: [
      "apply-patch-stale-read:contract-ready",
      "apply-patch-stale-read:base-evidence-matches-current-content",
      "apply-patch-stale-read:will-write-false",
      "apply-patch-stale-read:no-writer-invoked",
      "apply-patch-stale-read:not-production-write-ready",
    ],
  };
}

function resolveBaseEvidence(
  options: SingleFileApplyPatchStaleReadOptions,
): SingleFileApplyPatchBaseEvidence {
  if (options.baseEvidence) {
    return options.baseEvidence;
  }
  if (options.targetPath === undefined || options.baseContent === undefined) {
    throw new Error(
      "Stale-read revalidation requires baseEvidence or targetPath plus baseContent.",
    );
  }
  return buildSingleFileApplyPatchBaseEvidence({
    targetPath: options.targetPath,
    baseContent: options.baseContent,
  });
}

function blocked(input: {
  readonly options: SingleFileApplyPatchStaleReadOptions;
  readonly targetPath: string;
  readonly baseEvidence: SingleFileApplyPatchBaseEvidence;
  readonly blocker: SingleFileApplyPatchStaleReadBlocker;
  readonly staleReadDetected: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): SingleFileApplyPatchStaleReadResult {
  return {
    status: "blocked",
    targetPath: input.targetPath,
    baseEvidence: input.baseEvidence,
    phase: input.options.phase,
    staleReadDetected: input.staleReadDetected,
    writeDecisionBlocked: true,
    willWrite: false,
    changedFiles: [],
    writeIntents: [],
    noWriterInvoked: true,
    doesNotClaimProductionWriteReady: true,
    blocker: input.blocker,
    reason: input.reason,
    nextAction: input.nextAction,
    doNext: input.nextAction,
    evidence: [
      ...input.evidence,
      "apply-patch-stale-read:will-write-false",
      "apply-patch-stale-read:no-writer-invoked",
      "apply-patch-stale-read:not-production-write-ready",
    ],
  };
}

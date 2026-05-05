import type { SingleFileApplyPatchBaseEvidence } from "./baseEvidence.js";
import type { SingleFileApplyPatchDryRunResult } from "./singleFileApplyPatchDryRun.js";
import type { SingleFileApplyPatchStaleReadResult } from "./singleFileApplyPatchStaleRead.js";
import type { SingleFileUpdatePatchApprovalContract } from "./productionGate.js";

export type SingleFileApplyPatchTerminalSurfaceStatus =
  | "dry-run-ready"
  | "blocked"
  | "permission-pending";

export type SingleFileApplyPatchTerminalApprovalDecision =
  | "pending"
  | "blocked"
  | "denied";

export interface SingleFileApplyPatchTerminalStaleReadPrecondition {
  readonly required: true;
  readonly phase: "write-decision-dry-run";
  readonly requiredBefore: "write-decision";
  readonly blocksWriteOn: readonly ["stale-read", "target-missing"];
}

export interface SingleFileApplyPatchTerminalSurface {
  readonly status: SingleFileApplyPatchTerminalSurfaceStatus;
  readonly terminalResultVisible: true;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly wouldChangeFiles: readonly string[];
  readonly previewChangedFiles: readonly string[];
  readonly writeIntents: readonly [];
  readonly approval: {
    readonly decision: SingleFileApplyPatchTerminalApprovalDecision;
    readonly writeIntent: {
      readonly authorized: false;
      readonly count: 0;
    };
  };
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
  readonly staleReadPrecondition?: SingleFileApplyPatchTerminalStaleReadPrecondition;
  readonly noWriteProof: {
    readonly willWrite: false;
    readonly changedFiles: readonly [];
    readonly writeIntents: readonly [];
    readonly noWriterInvoked: true;
    readonly doesNotClaimWriteSuccess: true;
  };
  readonly nextAction: string;
  readonly doNext: string;
  readonly evidence: readonly string[];
}

export interface SingleFileApplyPatchTerminalSurfaceOptions {
  readonly dryRun: SingleFileApplyPatchDryRunResult;
  readonly staleRead?: SingleFileApplyPatchStaleReadResult;
  readonly approval?: SingleFileUpdatePatchApprovalContract;
}

type TerminalSurfaceApprovalInput =
  | SingleFileUpdatePatchApprovalContract
  | SingleFileApplyPatchDryRunResult["approval"];

const staleReadPrecondition: SingleFileApplyPatchTerminalStaleReadPrecondition = {
  required: true,
  phase: "write-decision-dry-run",
  requiredBefore: "write-decision",
  blocksWriteOn: ["stale-read", "target-missing"],
};

export function buildSingleFileApplyPatchTerminalSurface(
  options: SingleFileApplyPatchTerminalSurfaceOptions,
): SingleFileApplyPatchTerminalSurface {
  const approval = options.approval ?? options.dryRun.approval;
  const baseEvidence =
    approvalBaseEvidence(approval) ??
    options.staleRead?.baseEvidence ??
    options.dryRun.baseEvidence;
  const decision = terminalApprovalDecision(approval.decision);
  const status = terminalStatus({
    dryRunStatus: options.dryRun.status,
    staleReadStatus: options.staleRead?.status,
    decision,
  });
  const nextAction = terminalNextAction({
    status,
    staleRead: options.staleRead,
    approvalNextAction: approval.nextAction,
    dryRunNextAction: options.dryRun.nextAction,
  });

  return {
    status,
    terminalResultVisible: true,
    willWrite: false,
    changedFiles: [],
    wouldChangeFiles: options.dryRun.wouldChangeFiles,
    previewChangedFiles: options.dryRun.previewChangedFiles,
    writeIntents: [],
    approval: {
      decision,
      writeIntent: {
        authorized: false,
        count: 0,
      },
    },
    ...(baseEvidence ? { baseEvidence } : {}),
    ...(baseEvidence
      ? {
          staleReadPrecondition:
            approvalStaleReadPrecondition(approval) ?? staleReadPrecondition,
        }
      : {}),
    noWriteProof: {
      willWrite: false,
      changedFiles: [],
      writeIntents: [],
      noWriterInvoked: true,
      doesNotClaimWriteSuccess: true,
    },
    nextAction,
    doNext: nextAction,
    evidence: terminalEvidence({
      status,
      dryRunEvidence: options.dryRun.evidence,
      staleReadEvidence: options.staleRead?.evidence ?? [],
      hasBaseEvidence: baseEvidence !== undefined,
    }),
  };
}

function approvalBaseEvidence(
  approval: TerminalSurfaceApprovalInput,
): SingleFileApplyPatchBaseEvidence | undefined {
  return "baseEvidence" in approval.metadata
    ? approval.metadata.baseEvidence
    : undefined;
}

function approvalStaleReadPrecondition(
  approval: TerminalSurfaceApprovalInput,
): SingleFileApplyPatchTerminalStaleReadPrecondition | undefined {
  return "staleReadPrecondition" in approval.metadata
    ? approval.metadata.staleReadPrecondition
    : undefined;
}

function terminalApprovalDecision(
  decision: SingleFileUpdatePatchApprovalContract["decision"],
): SingleFileApplyPatchTerminalApprovalDecision {
  if (decision === "approved") {
    return "pending";
  }
  return decision;
}

function terminalStatus(input: {
  readonly dryRunStatus: SingleFileApplyPatchDryRunResult["status"];
  readonly staleReadStatus?: SingleFileApplyPatchStaleReadResult["status"];
  readonly decision: SingleFileApplyPatchTerminalApprovalDecision;
}): SingleFileApplyPatchTerminalSurfaceStatus {
  if (input.dryRunStatus === "blocked" || input.staleReadStatus === "blocked") {
    return "blocked";
  }
  if (input.decision === "blocked" || input.decision === "denied") {
    return "blocked";
  }
  if (input.staleReadStatus === "contract-ready" && input.decision === "pending") {
    return "permission-pending";
  }
  return "dry-run-ready";
}

function terminalNextAction(input: {
  readonly status: SingleFileApplyPatchTerminalSurfaceStatus;
  readonly staleRead?: SingleFileApplyPatchStaleReadResult;
  readonly approvalNextAction: string;
  readonly dryRunNextAction: string;
}): string {
  if (input.status === "blocked") {
    return input.staleRead?.nextAction ?? input.approvalNextAction;
  }
  if (input.status === "permission-pending") {
    return "Surface the dry-run preview for explicit permission, then revalidate stale-read before any future write decision; do not claim the patch was applied.";
  }
  return "Show this as a dry-run preview only; do not claim a file was modified or authorize a write intent.";
}

function terminalEvidence(input: {
  readonly status: SingleFileApplyPatchTerminalSurfaceStatus;
  readonly dryRunEvidence: readonly string[];
  readonly staleReadEvidence: readonly string[];
  readonly hasBaseEvidence: boolean;
}): readonly string[] {
  return [
    ...input.dryRunEvidence,
    ...input.staleReadEvidence,
    `apply-patch-terminal-surface:status:${input.status}`,
    "apply-patch-terminal-surface:will-write-false",
    "apply-patch-terminal-surface:changed-files-empty",
    "apply-patch-terminal-surface:write-intents-empty",
    "apply-patch-terminal-surface:no-writer-invoked",
    "apply-patch-terminal-surface:no-write-success-claim",
    ...(input.hasBaseEvidence
      ? ["apply-patch-terminal-surface:base-evidence-digest-only"]
      : []),
  ];
}

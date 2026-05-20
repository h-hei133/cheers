import {
  buildReadAuthorityFact,
  buildStaleReadFact,
  buildWorkspaceTargetFact,
  buildWriteAuthorityFact,
  safeTargetLabel,
  type StaleReadFact,
  type WorkspaceAuthorityFact,
  type WorkspaceTargetFact,
} from "./workspaceFileContract.js";

export interface WorkspaceTargetStoppedSummary {
  readonly result: "stopped";
  readonly reasonCode:
    | "missing-target"
    | "ambiguous-target"
    | "out-of-workspace-target"
    | "stale-read";
  readonly reason: string;
  readonly doNext: string;
  readonly target: WorkspaceTargetFact;
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export interface WorkspaceTargetSafeSummary {
  readonly targetLabel: string;
  readonly authority: WorkspaceAuthorityFact;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export interface ContinuationSafeTargetSummary {
  readonly targetLabel: string;
  readonly status: "available" | "relocated" | "missing" | "ambiguous";
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export interface FutureDiscoveryCandidateSummary {
  readonly candidateLabels: readonly string[];
  readonly mutationAuthority: "not-granted";
  readonly confirmationRequired: boolean;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export function projectMissingTargetStoppedSummary(input: {
  readonly targetHint?: string;
  readonly reason?: string;
  readonly doNext?: string;
}): WorkspaceTargetStoppedSummary {
  const target = buildWorkspaceTargetFact({
    kind: "missing-target",
    targetHint: input.targetHint,
  });
  const reason =
    input.reason ??
    "A concrete in-workspace file target is required before this route can continue.";
  const doNext =
    input.doNext ?? "Provide an explicit in-workspace file path for the target.";
  return stoppedSummary({
    reasonCode: "missing-target",
    reason,
    doNext,
    target,
  });
}

export function projectAmbiguousTargetStoppedSummary(input: {
  readonly candidates: readonly string[];
  readonly reason?: string;
  readonly doNext?: string;
}): WorkspaceTargetStoppedSummary {
  const target = buildWorkspaceTargetFact({
    kind: "ambiguous-target",
    candidates: input.candidates,
  });
  const reason =
    input.reason ??
    "Multiple workspace targets matched; one explicit target is required.";
  const doNext =
    input.doNext ?? "Choose one explicit in-workspace file path before continuing.";
  return stoppedSummary({
    reasonCode: "ambiguous-target",
    reason,
    doNext,
    target,
  });
}

export function projectOutOfWorkspaceTargetStoppedSummary(input: {
  readonly targetPath?: string;
  readonly reason?: string;
  readonly doNext?: string;
}): WorkspaceTargetStoppedSummary {
  const target = buildWorkspaceTargetFact({
    kind: "out-of-workspace-target",
    targetPath: input.targetPath,
  });
  const reason =
    input.reason ??
    "The selected file target resolves outside the current workspace.";
  const doNext =
    input.doNext ?? "Attach or switch project, or provide an in-workspace path.";
  return stoppedSummary({
    reasonCode: "out-of-workspace-target",
    reason,
    doNext,
    target,
  });
}

export function projectStaleReadBlockedSummary(input: {
  readonly targetPath?: string;
  readonly reason?: string;
  readonly doNext?: string;
}): WorkspaceTargetStoppedSummary & { readonly staleRead: StaleReadFact } {
  const staleRead = buildStaleReadFact({
    targetPath: input.targetPath,
    status: "blocked",
    reasonCode: "stale-read",
  });
  const target = buildWorkspaceTargetFact({
    kind: "explicit-target",
    targetPath: input.targetPath,
    evidence: staleRead.evidence,
  });
  const reason =
    input.reason ?? "stale-read: Target file changed since it was read.";
  const doNext =
    input.doNext ?? "Re-read the latest file content and rerun the mutation.";
  return {
    ...stoppedSummary({
      reasonCode: "stale-read",
      reason,
      doNext,
      target,
      evidence: staleRead.evidence,
    }),
    staleRead,
  };
}

export function projectReadOnlyTargetSummary(input: {
  readonly targetPath?: string;
  readonly reasonCode?: string;
}): WorkspaceTargetSafeSummary {
  const authority = buildReadAuthorityFact({
    targetPath: input.targetPath,
    decision: "available",
    reasonCode: input.reasonCode ?? "read-only",
  });
  return {
    targetLabel: authority.targetLabel,
    authority,
    transcriptSummary: `workspace target ${authority.targetLabel}; read-only; mutation:not-run`,
    evidence: [...authority.evidence, "workspace-target:read-only"],
  };
}

export function projectWriteAuthorityTargetSummary(input: {
  readonly targetPath?: string;
  readonly decision: WorkspaceAuthorityFact["decision"];
  readonly reasonCode?: string;
  readonly evidence?: readonly string[];
}): WorkspaceTargetSafeSummary {
  const authority = buildWriteAuthorityFact({
    targetPath: input.targetPath,
    decision: input.decision,
    reasonCode: input.reasonCode,
    evidence: input.evidence,
  });
  return {
    targetLabel: authority.targetLabel,
    authority,
    transcriptSummary: `workspace target ${authority.targetLabel}; write-authority:${authority.decision}; mutation:not-run`,
    evidence: [...authority.evidence, `workspace-target:write-authority:${authority.decision}`],
  };
}

export function projectContinuationSafeTargetSummary(input: {
  readonly targetPath?: string;
  readonly status: ContinuationSafeTargetSummary["status"];
  readonly relocatedFrom?: string;
  readonly candidates?: readonly string[];
}): ContinuationSafeTargetSummary {
  const targetLabel = safeTargetLabel(input.targetPath ?? input.relocatedFrom ?? "");
  const candidateLabels = (input.candidates ?? []).map(safeTargetLabel);
  const relocation =
    input.status === "relocated" && input.relocatedFrom
      ? `; relocated-from:${safeTargetLabel(input.relocatedFrom)}`
      : "";
  const candidates =
    candidateLabels.length > 0 ? `; candidates:${candidateLabels.join(", ")}` : "";
  return {
    targetLabel,
    status: input.status,
    transcriptSummary: `continuation target ${targetLabel || "(missing-target)"}; status:${input.status}${relocation}${candidates}`,
    evidence: [`workspace-continuation-target:${input.status}`],
  };
}

export function projectFutureDiscoveryCandidateSummary(input: {
  readonly candidates?: readonly string[];
  readonly confirmationRequired?: boolean;
}): FutureDiscoveryCandidateSummary {
  const candidateLabels = (input.candidates ?? []).map(safeTargetLabel);
  return {
    candidateLabels,
    mutationAuthority: "not-granted",
    confirmationRequired: input.confirmationRequired ?? true,
    transcriptSummary:
      candidateLabels.length > 0
        ? `future discovery candidates:${candidateLabels.join(", ")}; mutation:not-authorized`
        : "future discovery candidates:not-selected; mutation:not-authorized",
    evidence: [
      "workspace-future-discovery:mutation-not-authorized",
      ...(candidateLabels.length > 0
        ? ["workspace-future-discovery:candidates-projected"]
        : ["workspace-future-discovery:no-candidates"]),
    ],
  };
}

function stoppedSummary(input: {
  readonly reasonCode: WorkspaceTargetStoppedSummary["reasonCode"];
  readonly reason: string;
  readonly doNext: string;
  readonly target: WorkspaceTargetFact;
  readonly evidence?: readonly string[];
}): WorkspaceTargetStoppedSummary {
  const evidence = input.evidence ?? [
    `workspace-target:${input.reasonCode}`,
    ...input.target.evidence,
  ];
  return {
    result: "stopped",
    reasonCode: input.reasonCode,
    reason: input.reason,
    doNext: input.doNext,
    target: input.target,
    evidence,
    transcriptSummary: `stopped:${input.reasonCode}; target:${input.target.safeLabel}; next:${input.doNext}`,
  };
}

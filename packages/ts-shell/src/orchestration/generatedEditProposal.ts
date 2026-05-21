import crypto from "node:crypto";
import { safeTargetLabel } from "./workspaceFileContract.js";

export type GeneratedEditTargetScope =
  | "explicit-target"
  | "candidate-set"
  | "unknown";
export type GeneratedEditOperationKind =
  | "exact-fenced-replacement"
  | "generated-replacement"
  | "broad-refactor"
  | "fuzzy-replacement"
  | "discovery";
export type GeneratedEditProposedContentStatus =
  | "missing-generated-content"
  | "safe-summary-only"
  | "explicit-new-content"
  | "provider-generated-unsupported";
export type GeneratedEditExactMappingStatus =
  | "missing-old-block"
  | "missing-new-content"
  | "exact-single-target"
  | "exact-target-set"
  | "not-exact";
export type GeneratedEditConfirmationStatus =
  | "not-confirmed"
  | "review-required"
  | "confirmed-proposal-no-mutation"
  | "confirmed-exact-single-target"
  | "confirmed-exact-target-set"
  | "invalid-confirmation"
  | "unsupported-confirmation";
export type GeneratedEditMutationReadiness =
  | "proposal-only-no-write"
  | "review-required-no-write"
  | "ready-for-exact-handoff"
  | "blocked-no-write";

export interface GeneratedEditProposalTarget {
  readonly path: string;
  readonly pathLabel: string;
}

export interface GeneratedEditProposalManifest {
  readonly proposalId: string;
  readonly requestedMode: "generated-edit";
  readonly targetScope: GeneratedEditTargetScope;
  readonly targetLabels: readonly string[];
  readonly requestedOperationKind: GeneratedEditOperationKind;
  readonly proposedContentStatus: GeneratedEditProposedContentStatus;
  readonly exactMappingStatus: GeneratedEditExactMappingStatus;
  readonly confirmationStatus: GeneratedEditConfirmationStatus;
  readonly mutationReadiness: GeneratedEditMutationReadiness;
  readonly verificationRequirement: "required-before-write";
  readonly snapshotRequirement: "required-before-write";
  readonly redactionStatus: "raw-content-excluded";
  readonly mutationAuthority: "not-granted";
  readonly safeSummary: string;
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export function buildGeneratedEditProposalManifest(input: {
  readonly targets?: readonly string[];
  readonly requestedOperationKind: GeneratedEditOperationKind;
  readonly proposedContentStatus: GeneratedEditProposedContentStatus;
  readonly exactMappingStatus: GeneratedEditExactMappingStatus;
  readonly confirmationStatus?: GeneratedEditConfirmationStatus;
  readonly mutationReadiness?: GeneratedEditMutationReadiness;
  readonly safeSummary?: string;
  readonly evidence?: readonly string[];
}): GeneratedEditProposalManifest {
  const targets = (input.targets ?? []).map((target) => ({
    path: target,
    pathLabel: safeTargetLabel(target),
  }));
  const targetLabels = targets.map((target) => target.pathLabel);
  const targetScope = inferTargetScope(targets.length);
  const confirmationStatus = input.confirmationStatus ?? "review-required";
  const mutationReadiness =
    input.mutationReadiness ??
    readinessFromState({
      exactMappingStatus: input.exactMappingStatus,
      confirmationStatus,
    });
  const safeSummary =
    input.safeSummary ??
    defaultSafeSummary({
      requestedOperationKind: input.requestedOperationKind,
      targetScope,
      targetLabels,
      proposedContentStatus: input.proposedContentStatus,
      exactMappingStatus: input.exactMappingStatus,
      confirmationStatus,
      mutationReadiness,
    });
  const proposalId = buildGeneratedEditProposalId({
    targetLabels,
    requestedOperationKind: input.requestedOperationKind,
    proposedContentStatus: input.proposedContentStatus,
    exactMappingStatus: input.exactMappingStatus,
    confirmationStatus,
  });
  const evidence = [
    "generated-edit-proposal:manifest-created",
    `generated-edit-proposal:scope:${targetScope}`,
    `generated-edit-proposal:operation:${input.requestedOperationKind}`,
    `generated-edit-proposal:content:${input.proposedContentStatus}`,
    `generated-edit-proposal:mapping:${input.exactMappingStatus}`,
    `generated-edit-proposal:confirmation:${confirmationStatus}`,
    `generated-edit-proposal:readiness:${mutationReadiness}`,
    "generated-edit-proposal:mutation-authority:not-granted",
    "generated-edit-proposal:verification:required-before-write",
    "generated-edit-proposal:snapshot:required-before-write",
    "generated-edit-proposal:raw-content-excluded",
    ...(input.evidence ?? []),
  ];

  return {
    proposalId,
    requestedMode: "generated-edit",
    targetScope,
    targetLabels,
    requestedOperationKind: input.requestedOperationKind,
    proposedContentStatus: input.proposedContentStatus,
    exactMappingStatus: input.exactMappingStatus,
    confirmationStatus,
    mutationReadiness,
    verificationRequirement: "required-before-write",
    snapshotRequirement: "required-before-write",
    redactionStatus: "raw-content-excluded",
    mutationAuthority: "not-granted",
    safeSummary,
    evidence,
    transcriptSummary: buildTranscriptSummary({
      proposalId,
      targetLabels,
      confirmationStatus,
      mutationReadiness,
      exactMappingStatus: input.exactMappingStatus,
    }),
  };
}

function inferTargetScope(targetCount: number): GeneratedEditTargetScope {
  if (targetCount === 0) {
    return "unknown";
  }
  if (targetCount === 1) {
    return "explicit-target";
  }
  return "candidate-set";
}

function readinessFromState(input: {
  readonly exactMappingStatus: GeneratedEditExactMappingStatus;
  readonly confirmationStatus: GeneratedEditConfirmationStatus;
}): GeneratedEditMutationReadiness {
  if (
    (input.exactMappingStatus === "exact-single-target" &&
      input.confirmationStatus === "confirmed-exact-single-target") ||
    (input.exactMappingStatus === "exact-target-set" &&
      input.confirmationStatus === "confirmed-exact-target-set")
  ) {
    return "ready-for-exact-handoff";
  }
  if (input.confirmationStatus === "review-required") {
    return "review-required-no-write";
  }
  if (
    input.confirmationStatus === "invalid-confirmation" ||
    input.confirmationStatus === "unsupported-confirmation"
  ) {
    return "blocked-no-write";
  }
  return "proposal-only-no-write";
}

function defaultSafeSummary(input: {
  readonly requestedOperationKind: GeneratedEditOperationKind;
  readonly targetScope: GeneratedEditTargetScope;
  readonly targetLabels: readonly string[];
  readonly proposedContentStatus: GeneratedEditProposedContentStatus;
  readonly exactMappingStatus: GeneratedEditExactMappingStatus;
  readonly confirmationStatus: GeneratedEditConfirmationStatus;
  readonly mutationReadiness: GeneratedEditMutationReadiness;
}): string {
  const targets = input.targetLabels.length ? input.targetLabels.join(", ") : "(no target)";
  return [
    `generated edit proposal for ${targets}`,
    `operation=${input.requestedOperationKind}`,
    `scope=${input.targetScope}`,
    `content=${input.proposedContentStatus}`,
    `mapping=${input.exactMappingStatus}`,
    `confirmation=${input.confirmationStatus}`,
    `readiness=${input.mutationReadiness}`,
    "raw-content-excluded",
  ].join("; ");
}

function buildTranscriptSummary(input: {
  readonly proposalId: string;
  readonly targetLabels: readonly string[];
  readonly confirmationStatus: GeneratedEditConfirmationStatus;
  readonly mutationReadiness: GeneratedEditMutationReadiness;
  readonly exactMappingStatus: GeneratedEditExactMappingStatus;
}): string {
  const targets = input.targetLabels.length ? input.targetLabels.join(", ") : "(none)";
  return [
    `generated-edit proposal=${input.proposalId}`,
    `targets=${targets}`,
    `mapping=${input.exactMappingStatus}`,
    `confirmation=${input.confirmationStatus}`,
    `readiness=${input.mutationReadiness}`,
    "mutation:not-run",
    "mutationAuthority:not-granted",
    "raw-content-excluded",
  ].join("; ");
}

function buildGeneratedEditProposalId(input: {
  readonly targetLabels: readonly string[];
  readonly requestedOperationKind: GeneratedEditOperationKind;
  readonly proposedContentStatus: GeneratedEditProposedContentStatus;
  readonly exactMappingStatus: GeneratedEditExactMappingStatus;
  readonly confirmationStatus: GeneratedEditConfirmationStatus;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `generated-edit-${hash}`;
}

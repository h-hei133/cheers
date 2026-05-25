import crypto from "node:crypto";
import { safeTargetLabel } from "./workspaceFileContract.js";
import { redactProviderEditText } from "./providerEditContext.js";

export type ProviderEditOperationKind =
  | "exact-fenced-replacement"
  | "generated-replacement"
  | "broad-refactor"
  | "fuzzy-replacement";
export type ProviderEditHandoffReadiness =
  | "review-only"
  | "exact-single-target"
  | "exact-target-set"
  | "unsupported";
export type ProviderEditConfirmationStatus =
  | "review-required"
  | "confirmed-proposal-no-mutation"
  | "confirmed-exact-single-target"
  | "confirmed-exact-target-set"
  | "invalid-confirmation"
  | "provider-output-not-executable";
export type ProviderEditProposalInvalidReasonCode =
  | "missing-target"
  | "missing-old-new-mapping"
  | "ambiguous-target"
  | "unsupported-broad-or-fuzzy"
  | "unsafe-content";

export interface ProviderEditProposalTarget {
  readonly pathLabel: string;
  readonly proposedSummary: string;
  readonly exactOldNewReady: boolean;
}

export interface ProviderEditProposalManifest {
  readonly proposalId: string;
  readonly providerKindLabel: string;
  readonly contextPacketId?: string;
  readonly agentPlanId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly planQualityId?: string;
  readonly taskExecutionPlanId?: string;
  readonly dryRunId?: string;
  readonly promptAuditId?: string;
  readonly outputValidationId?: string;
  readonly anchorQualityId?: string;
  readonly targetScope: "explicit-target" | "confirmed-target-set" | "unknown";
  readonly proposedOperationKind: ProviderEditOperationKind;
  readonly targets: readonly ProviderEditProposalTarget[];
  readonly exactReadiness: ProviderEditHandoffReadiness;
  readonly confidence: "low" | "medium" | "high";
  readonly contextConfidence?: "low" | "medium" | "high";
  readonly contextReadiness?: "ready" | "needs-more-context";
  readonly riskSummary: string;
  readonly verificationPlan: readonly string[];
  readonly reviewRequired: boolean;
  readonly confirmationStatus: ProviderEditConfirmationStatus;
  readonly mutationAuthority: "not-granted";
  readonly handoffReadiness: ProviderEditHandoffReadiness;
  readonly redactionStatus: "raw-content-excluded";
  readonly safeSummary: string;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export interface ProviderEditRawProposal {
  readonly operationKind: ProviderEditOperationKind;
  readonly targets?: readonly {
    readonly path: string;
    readonly summary?: string;
    readonly oldText?: string;
    readonly newText?: string;
  }[];
  readonly confidence?: "low" | "medium" | "high";
  readonly riskSummary?: string;
  readonly verificationPlan?: readonly string[];
  readonly diagnostics?: readonly string[];
}

export type ProviderEditProposalNormalization =
  | {
      readonly ok: true;
      readonly manifest: ProviderEditProposalManifest;
    }
  | {
      readonly ok: false;
      readonly reasonCode: ProviderEditProposalInvalidReasonCode;
      readonly reason: string;
      readonly evidence: readonly string[];
    };

export function normalizeProviderEditProposal(input: {
  readonly providerKindLabel: string;
  readonly rawProposal: ProviderEditRawProposal;
  readonly explicitTargetLabels: readonly string[];
  readonly contextPacketId?: string;
  readonly agentPlanId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly planQualityId?: string;
  readonly taskExecutionPlanId?: string;
  readonly dryRunId?: string;
  readonly promptAuditId?: string;
  readonly outputValidationId?: string;
  readonly anchorQualityId?: string;
  readonly contextConfidence?: "low" | "medium" | "high";
  readonly contextReadiness?: "ready" | "needs-more-context";
}): ProviderEditProposalNormalization {
  const operationKind = input.rawProposal.operationKind;
  if (operationKind === "broad-refactor" || operationKind === "fuzzy-replacement") {
    return invalidProposal({
      reasonCode: "unsupported-broad-or-fuzzy",
      reason:
        "Provider proposal requested broad or fuzzy replacement, which is not executable in this route.",
      evidence: [`provider-edit-proposal:unsupported:${operationKind}`],
    });
  }

  const rawTargets = input.rawProposal.targets ?? [];
  if (rawTargets.length === 0) {
    return invalidProposal({
      reasonCode: "missing-target",
      reason: "Provider proposal did not include a target tied to explicit context.",
      evidence: ["provider-edit-proposal:missing-target"],
    });
  }
  if (rawTargets.length > 3) {
    return invalidProposal({
      reasonCode: "ambiguous-target",
      reason: "Provider proposal exceeded the bounded target-set guard.",
      evidence: ["provider-edit-proposal:target-count-over-guard"],
    });
  }

  const targetLabels = new Set(input.explicitTargetLabels);
  const targets = rawTargets.map((target) => {
    const pathLabel = safeTargetLabel(target.path);
    return {
      pathLabel,
      proposedSummary: redactProviderEditText(
        target.summary ?? "provider proposed an edit summary",
      ),
      exactOldNewReady: Boolean(target.oldText && target.newText),
    };
  });
  if (targets.some((target) => !targetLabels.has(target.pathLabel))) {
    return invalidProposal({
      reasonCode: "ambiguous-target",
      reason: "Provider proposal referenced a target outside explicit context.",
      evidence: ["provider-edit-proposal:target-not-explicit"],
    });
  }

  const allExact = targets.every((target) => target.exactOldNewReady);
  const exactReadiness: ProviderEditHandoffReadiness = allExact
    ? targets.length === 1
      ? "exact-single-target"
      : "exact-target-set"
    : "review-only";
  const manifest = buildProviderEditProposalManifest({
    providerKindLabel: input.providerKindLabel,
    contextPacketId: input.contextPacketId,
    agentPlanId: input.agentPlanId,
    taskLifecycleId: input.taskLifecycleId,
    analysisBriefId: input.analysisBriefId,
    planQualityId: input.planQualityId,
    taskExecutionPlanId: input.taskExecutionPlanId,
    dryRunId: input.dryRunId,
    promptAuditId: input.promptAuditId,
    outputValidationId: input.outputValidationId,
    anchorQualityId: input.anchorQualityId,
    targetLabels: targets.map((target) => target.pathLabel),
    proposedOperationKind: operationKind,
    targetSummaries: targets.map((target) => target.proposedSummary),
    exactReadiness,
    confidence: input.rawProposal.confidence ?? "medium",
    contextConfidence: input.contextConfidence,
    contextReadiness: input.contextReadiness,
    riskSummary: input.rawProposal.riskSummary ?? "provider proposal requires review",
    verificationPlan: input.rawProposal.verificationPlan ?? [
      "review provider proposal",
      "confirm exact old/new mapping",
      "run existing edit route verification",
    ],
  });
  return { ok: true, manifest };
}

export function buildProviderEditProposalManifest(input: {
  readonly providerKindLabel: string;
  readonly contextPacketId?: string;
  readonly agentPlanId?: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly planQualityId?: string;
  readonly taskExecutionPlanId?: string;
  readonly dryRunId?: string;
  readonly promptAuditId?: string;
  readonly outputValidationId?: string;
  readonly anchorQualityId?: string;
  readonly targetLabels: readonly string[];
  readonly proposedOperationKind: ProviderEditOperationKind;
  readonly targetSummaries: readonly string[];
  readonly exactReadiness: ProviderEditHandoffReadiness;
  readonly confidence?: "low" | "medium" | "high";
  readonly contextConfidence?: "low" | "medium" | "high";
  readonly contextReadiness?: "ready" | "needs-more-context";
  readonly riskSummary?: string;
  readonly verificationPlan?: readonly string[];
  readonly confirmationStatus?: ProviderEditConfirmationStatus;
}): ProviderEditProposalManifest {
  const targetScope =
    input.targetLabels.length === 0
      ? "unknown"
      : input.targetLabels.length === 1
        ? "explicit-target"
        : "confirmed-target-set";
  const confirmationStatus = input.confirmationStatus ?? "review-required";
  const handoffReadiness =
    confirmationStatus === "confirmed-exact-single-target"
      ? "exact-single-target"
      : confirmationStatus === "confirmed-exact-target-set"
        ? "exact-target-set"
        : input.exactReadiness === "exact-single-target" ||
            input.exactReadiness === "exact-target-set"
          ? input.exactReadiness
          : input.exactReadiness === "unsupported"
            ? "unsupported"
            : "review-only";
  const proposalId = buildProviderEditProposalId({
    providerKindLabel: input.providerKindLabel,
    targetLabels: input.targetLabels,
    operationKind: input.proposedOperationKind,
    exactReadiness: input.exactReadiness,
  });
  const targets = input.targetLabels.map((pathLabel, index) => ({
    pathLabel,
    proposedSummary: redactProviderEditText(
      input.targetSummaries[index] ?? "provider proposed edit summary",
    ),
    exactOldNewReady:
      input.exactReadiness === "exact-single-target" ||
      input.exactReadiness === "exact-target-set",
  }));
  const safeSummary = [
    `provider edit proposal for ${input.targetLabels.join(", ") || "(no target)"}`,
    `provider=${input.providerKindLabel}`,
    ...(input.contextPacketId ? [`contextPacket=${input.contextPacketId}`] : []),
    ...(input.agentPlanId ? [`agentPlan=${input.agentPlanId}`] : []),
    ...(input.taskLifecycleId ? [`taskLifecycle=${input.taskLifecycleId}`] : []),
    ...(input.analysisBriefId ? [`analysisBrief=${input.analysisBriefId}`] : []),
    ...(input.planQualityId ? [`planQuality=${input.planQualityId}`] : []),
    ...(input.taskExecutionPlanId ? [`executionPlan=${input.taskExecutionPlanId}`] : []),
    ...(input.dryRunId ? [`dryRun=${input.dryRunId}`] : []),
    ...(input.promptAuditId ? [`promptAudit=${input.promptAuditId}`] : []),
    ...(input.outputValidationId ? [`outputValidation=${input.outputValidationId}`] : []),
    ...(input.anchorQualityId ? [`anchorQuality=${input.anchorQualityId}`] : []),
    `operation=${input.proposedOperationKind}`,
    `readiness=${handoffReadiness}`,
    `confirmation=${confirmationStatus}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");
  const transcriptSummary = [
    `provider-edit proposal=${proposalId}`,
    `provider=${input.providerKindLabel}`,
    ...(input.contextPacketId ? [`contextPacket=${input.contextPacketId}`] : []),
    ...(input.agentPlanId ? [`agentPlan=${input.agentPlanId}`] : []),
    ...(input.taskLifecycleId ? [`taskLifecycle=${input.taskLifecycleId}`] : []),
    ...(input.analysisBriefId ? [`analysisBrief=${input.analysisBriefId}`] : []),
    ...(input.planQualityId ? [`planQuality=${input.planQualityId}`] : []),
    ...(input.taskExecutionPlanId ? [`executionPlan=${input.taskExecutionPlanId}`] : []),
    ...(input.dryRunId ? [`dryRun=${input.dryRunId}`] : []),
    ...(input.promptAuditId ? [`promptAudit=${input.promptAuditId}`] : []),
    ...(input.outputValidationId ? [`outputValidation=${input.outputValidationId}`] : []),
    ...(input.anchorQualityId ? [`anchorQuality=${input.anchorQualityId}`] : []),
    `targets=${input.targetLabels.join(", ") || "(none)"}`,
    `readiness=${handoffReadiness}`,
    `confirmation=${confirmationStatus}`,
    "mutation:not-run",
    "mutationAuthority:not-granted",
    "raw-content-excluded",
  ].join("; ");
  return {
    proposalId,
    providerKindLabel: input.providerKindLabel,
    ...(input.contextPacketId ? { contextPacketId: input.contextPacketId } : {}),
    ...(input.agentPlanId ? { agentPlanId: input.agentPlanId } : {}),
    ...(input.taskLifecycleId ? { taskLifecycleId: input.taskLifecycleId } : {}),
    ...(input.analysisBriefId ? { analysisBriefId: input.analysisBriefId } : {}),
    ...(input.planQualityId ? { planQualityId: input.planQualityId } : {}),
    ...(input.taskExecutionPlanId ? { taskExecutionPlanId: input.taskExecutionPlanId } : {}),
    ...(input.dryRunId ? { dryRunId: input.dryRunId } : {}),
    ...(input.promptAuditId ? { promptAuditId: input.promptAuditId } : {}),
    ...(input.outputValidationId ? { outputValidationId: input.outputValidationId } : {}),
    ...(input.anchorQualityId ? { anchorQualityId: input.anchorQualityId } : {}),
    targetScope,
    proposedOperationKind: input.proposedOperationKind,
    targets,
    exactReadiness: input.exactReadiness,
    confidence: input.confidence ?? "medium",
    ...(input.contextConfidence
      ? { contextConfidence: input.contextConfidence }
      : {}),
    ...(input.contextReadiness ? { contextReadiness: input.contextReadiness } : {}),
    riskSummary: redactProviderEditText(input.riskSummary ?? "review required"),
    verificationPlan: (input.verificationPlan ?? []).map(redactProviderEditText),
    reviewRequired: confirmationStatus === "review-required",
    confirmationStatus,
    mutationAuthority: "not-granted",
    handoffReadiness,
    redactionStatus: "raw-content-excluded",
    safeSummary,
    transcriptSummary,
    evidence: [
      "provider-edit-proposal:manifest-created",
      `provider-edit-proposal:provider:${input.providerKindLabel}`,
      ...(input.contextPacketId
        ? [`provider-edit-proposal:context-packet:${input.contextPacketId}`]
        : []),
      ...(input.agentPlanId
        ? [`provider-edit-proposal:agent-plan:${input.agentPlanId}`]
        : []),
      ...(input.taskLifecycleId
        ? [`provider-edit-proposal:task-lifecycle:${input.taskLifecycleId}`]
        : []),
      ...(input.analysisBriefId
        ? [`provider-edit-proposal:analysis-brief:${input.analysisBriefId}`]
        : []),
      ...(input.planQualityId
        ? [`provider-edit-proposal:plan-quality:${input.planQualityId}`]
        : []),
      ...(input.taskExecutionPlanId
        ? [`provider-edit-proposal:execution-plan:${input.taskExecutionPlanId}`]
        : []),
      ...(input.dryRunId ? [`provider-edit-proposal:dry-run:${input.dryRunId}`] : []),
      ...(input.promptAuditId
        ? [`provider-edit-proposal:prompt-audit:${input.promptAuditId}`]
        : []),
      ...(input.outputValidationId
        ? [`provider-edit-proposal:output-validation:${input.outputValidationId}`]
        : []),
      ...(input.anchorQualityId
        ? [`provider-edit-proposal:anchor-quality:${input.anchorQualityId}`]
        : []),
      `provider-edit-proposal:operation:${input.proposedOperationKind}`,
      `provider-edit-proposal:readiness:${handoffReadiness}`,
      `provider-edit-proposal:confirmation:${confirmationStatus}`,
      "provider-edit-proposal:mutation-authority:not-granted",
      "provider-edit-proposal:raw-content-excluded",
    ],
  };
}

function invalidProposal(input: {
  readonly reasonCode: ProviderEditProposalInvalidReasonCode;
  readonly reason: string;
  readonly evidence: readonly string[];
}): ProviderEditProposalNormalization {
  return {
    ok: false,
    reasonCode: input.reasonCode,
    reason: input.reason,
    evidence: [
      ...input.evidence,
      "provider-edit-proposal:invalid",
      "provider-edit-proposal:mutation:not-run",
      "provider-edit-proposal:raw-content-excluded",
    ],
  };
}

function buildProviderEditProposalId(input: {
  readonly providerKindLabel: string;
  readonly targetLabels: readonly string[];
  readonly operationKind: ProviderEditOperationKind;
  readonly exactReadiness: ProviderEditHandoffReadiness;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `provider-edit-${hash}`;
}

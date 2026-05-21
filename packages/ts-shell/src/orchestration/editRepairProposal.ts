import crypto from "node:crypto";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import { redactProviderEditText } from "./providerEditContext.js";
import type { EditRepairContext } from "./editRepairContext.js";
import { safeTargetLabel } from "./workspaceFileContract.js";

export type EditRepairHandoffReadiness =
  | "review-only"
  | "exact-single-target"
  | "exact-hunk-set"
  | "unsupported";
export type EditRepairConfirmationState =
  | "review-required"
  | "confirmed-proposal-no-mutation"
  | "confirmed-exact-hunk-set"
  | "invalid-confirmation";

export interface EditRepairProposalHunk {
  readonly hunkId: string;
  readonly targetLabel: string;
  readonly operationSummary: string;
  readonly exactMappingReady: boolean;
  readonly oldTextHash?: string;
  readonly newTextHash?: string;
  readonly unsupportedReason?: string;
  readonly redactionStatus: "raw-content-excluded";
}

export interface EditRepairProposalManifest {
  readonly repairProposalId: string;
  readonly sourceRepairContextId: string;
  readonly proposedTargetScope: "single" | "target-set" | "unknown";
  readonly proposedHunks: readonly EditRepairProposalHunk[];
  readonly exactMappingReadiness: EditRepairHandoffReadiness;
  readonly confidence: "low" | "medium" | "high";
  readonly riskSummary: string;
  readonly verificationRetryPlan: readonly string[];
  readonly reviewRequired: boolean;
  readonly confirmationState: EditRepairConfirmationState;
  readonly mutationAuthority: "not-granted";
  readonly handoffReadiness: EditRepairHandoffReadiness;
  readonly redactionStatus: "raw-content-excluded";
  readonly safeSummary: string;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export interface EditRepairRawProposal {
  readonly hunks?: readonly {
    readonly hunkId?: string;
    readonly targetPath: string;
    readonly summary?: string;
    readonly oldText?: string;
    readonly newText?: string;
  }[];
  readonly confidence?: "low" | "medium" | "high";
  readonly riskSummary?: string;
  readonly verificationRetryPlan?: readonly string[];
}

export type EditRepairProposalNormalization =
  | {
      readonly ok: true;
      readonly manifest: EditRepairProposalManifest;
      readonly mappingByHunkId: ReadonlyMap<string, FencedEditMapping>;
    }
  | {
      readonly ok: false;
      readonly reasonCode:
        | EditRepairProposalInvalidReasonCode;
      readonly reason: string;
      readonly evidence: readonly string[];
    };

export type EditRepairProposalInvalidReasonCode =
  | "missing-repair-context"
  | "missing-target"
  | "target-outside-context"
  | "non-exact-repair"
  | "over-max-hunks";

export function normalizeEditRepairProposal(input: {
  readonly context: EditRepairContext;
  readonly rawProposal: EditRepairRawProposal;
  readonly maxHunks?: number;
}): EditRepairProposalNormalization {
  const maxHunks = input.maxHunks ?? 6;
  if (input.context.status !== "repair-context-created") {
    return invalidRepairProposal({
      reasonCode: "missing-repair-context",
      reason: "Repair proposal requires a created repair context from a failed verification.",
      evidence: [`edit-repair-proposal:context-status:${input.context.status}`],
    });
  }
  const rawHunks = input.rawProposal.hunks ?? [];
  if (rawHunks.length === 0) {
    return invalidRepairProposal({
      reasonCode: "missing-target",
      reason: "Repair proposal did not include any target-bound hunks.",
      evidence: ["edit-repair-proposal:missing-hunks"],
    });
  }
  if (rawHunks.length > maxHunks) {
    return invalidRepairProposal({
      reasonCode: "over-max-hunks",
      reason: `Repair proposal included ${rawHunks.length} hunks; max is ${maxHunks}.`,
      evidence: ["edit-repair-proposal:over-max-hunks"],
    });
  }
  const contextLabels = new Set([
    ...input.context.failedFileLabels,
    ...input.context.changedFileLabels,
    ...input.context.failedHunkSummaries.map((hunk) => hunk.targetLabel),
  ]);
  const proposedHunks: EditRepairProposalHunk[] = [];
  const mappingByHunkId = new Map<string, FencedEditMapping>();
  for (const [index, rawHunk] of rawHunks.entries()) {
    const targetLabel = safeTargetLabel(rawHunk.targetPath);
    if (!contextLabels.has(targetLabel)) {
      return invalidRepairProposal({
        reasonCode: "target-outside-context",
        reason: "Repair proposal referenced a target outside the failed verification context.",
        evidence: ["edit-repair-proposal:target-outside-context"],
      });
    }
    const exactMappingReady = Boolean(rawHunk.oldText && rawHunk.newText);
    const hunkId = rawHunk.hunkId ?? `repair-hunk-${index + 1}`;
    proposedHunks.push({
      hunkId,
      targetLabel,
      operationSummary: redactRepairText(rawHunk.summary ?? "repair proposed exact replacement"),
      exactMappingReady,
      ...(rawHunk.oldText ? { oldTextHash: hashText(rawHunk.oldText) } : {}),
      ...(rawHunk.newText ? { newTextHash: hashText(rawHunk.newText) } : {}),
      ...(exactMappingReady ? {} : { unsupportedReason: "repair hunk is not exact old/new mapping" }),
      redactionStatus: "raw-content-excluded",
    });
    if (exactMappingReady) {
      mappingByHunkId.set(hunkId, {
        oldText: rawHunk.oldText!,
        newText: rawHunk.newText!,
        source: "old-new-fenced-blocks",
      });
    }
  }

  const exactHunks = proposedHunks.filter((hunk) => hunk.exactMappingReady);
  const distinctTargets = new Set(proposedHunks.map((hunk) => hunk.targetLabel));
  const exactMappingReadiness: EditRepairHandoffReadiness =
    exactHunks.length !== proposedHunks.length
      ? "review-only"
      : proposedHunks.length === 1 && distinctTargets.size === 1
        ? "exact-single-target"
        : "exact-hunk-set";
  const manifest = buildEditRepairProposalManifest({
    context: input.context,
    proposedHunks,
    exactMappingReadiness,
    confidence: input.rawProposal.confidence,
    riskSummary: input.rawProposal.riskSummary,
    verificationRetryPlan: input.rawProposal.verificationRetryPlan,
  });
  return {
    ok: true,
    manifest,
    mappingByHunkId,
  };
}

export function buildEditRepairProposalManifest(input: {
  readonly context: EditRepairContext;
  readonly proposedHunks: readonly EditRepairProposalHunk[];
  readonly exactMappingReadiness: EditRepairHandoffReadiness;
  readonly confidence?: "low" | "medium" | "high";
  readonly riskSummary?: string;
  readonly verificationRetryPlan?: readonly string[];
  readonly confirmationState?: EditRepairConfirmationState;
}): EditRepairProposalManifest {
  const targetLabels = Array.from(new Set(input.proposedHunks.map((hunk) => hunk.targetLabel)));
  const proposedTargetScope =
    targetLabels.length === 0 ? "unknown" : targetLabels.length === 1 ? "single" : "target-set";
  const confirmationState = input.confirmationState ?? "review-required";
  const handoffReadiness =
    confirmationState === "confirmed-exact-hunk-set"
      ? input.exactMappingReadiness
      : input.exactMappingReadiness;
  const repairProposalId = buildRepairProposalId({
    contextId: input.context.repairContextId,
    hunks: input.proposedHunks.map((hunk) => ({
      hunkId: hunk.hunkId,
      targetLabel: hunk.targetLabel,
      oldTextHash: hunk.oldTextHash,
      newTextHash: hunk.newTextHash,
    })),
    readiness: input.exactMappingReadiness,
  });
  const riskSummary = redactRepairText(
    input.riskSummary ?? "verification repair proposal requires review",
  );
  const verificationRetryPlan = (input.verificationRetryPlan ?? [
    "review repair proposal",
    "confirm exact repair hunks",
    "apply through existing hunk-set route",
    "rerun existing verification",
  ]).map(redactRepairText);
  const safeSummary = [
    `repair proposal for context ${input.context.repairContextId}`,
    `targets=${targetLabels.join(", ") || "(none)"}`,
    `hunks=${input.proposedHunks.length}`,
    `readiness=${handoffReadiness}`,
    "mutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");
  const transcriptSummary = [
    `edit-repair-proposal id=${repairProposalId}`,
    `context=${input.context.repairContextId}`,
    `targets=${targetLabels.join(", ") || "(none)"}`,
    `hunks=${input.proposedHunks.map((hunk) => hunk.hunkId).join(", ") || "(none)"}`,
    `readiness=${handoffReadiness}`,
    `confirmation=${confirmationState}`,
    "mutation:not-run",
    "mutationAuthority:not-granted",
    "raw-content-excluded",
  ].join("; ");
  return {
    repairProposalId,
    sourceRepairContextId: input.context.repairContextId,
    proposedTargetScope,
    proposedHunks: input.proposedHunks,
    exactMappingReadiness: input.exactMappingReadiness,
    confidence: input.confidence ?? "medium",
    riskSummary,
    verificationRetryPlan,
    reviewRequired: confirmationState === "review-required",
    confirmationState,
    mutationAuthority: "not-granted",
    handoffReadiness,
    redactionStatus: "raw-content-excluded",
    safeSummary,
    transcriptSummary,
    evidence: [
      "edit-repair-proposal:manifest-created",
      `edit-repair-proposal:id:${repairProposalId}`,
      `edit-repair-proposal:context:${input.context.repairContextId}`,
      `edit-repair-proposal:readiness:${handoffReadiness}`,
      `edit-repair-proposal:confirmation:${confirmationState}`,
      "edit-repair-proposal:review-required",
      "edit-repair-proposal:mutation:not-run",
      "edit-repair-proposal:mutation-authority:not-granted",
      "edit-repair-proposal:raw-content-excluded",
    ],
  };
}

function invalidRepairProposal(input: {
  readonly reasonCode: EditRepairProposalInvalidReasonCode;
  readonly reason: string;
  readonly evidence: readonly string[];
}): EditRepairProposalNormalization {
  return {
    ok: false,
    reasonCode: input.reasonCode,
    reason: input.reason,
    evidence: [
      ...input.evidence,
      "edit-repair-proposal:invalid",
      "edit-repair-proposal:mutation:not-run",
      "edit-repair-proposal:raw-content-excluded",
    ],
  };
}

function redactRepairText(value: string): string {
  return redactProviderEditText(value).replace(/\s+/g, " ").trim().slice(0, 500);
}

function hashText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 12);
}

function buildRepairProposalId(input: {
  readonly contextId: string;
  readonly hunks: readonly {
    readonly hunkId: string;
    readonly targetLabel: string;
    readonly oldTextHash?: string;
    readonly newTextHash?: string;
  }[];
  readonly readiness: string;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `edit-repair-proposal-${hash}`;
}

import { buildAgentPlan } from "./agentPlan.js";
import { buildTargetedContextPacket } from "./contextPacket.js";
import { buildEditRepairProposalReview } from "./editProposalReview.js";
import { selectEditProposalHunks, type EditProposalSelection } from "./editProposalSelection.js";
import { applyEditProposalSelection, type EditProposalApplyResult } from "./editProposalApply.js";
import { createWorkspaceWriteAuthority } from "../edit/authority/workspace.js";
import type { ClaimLedgerEvidenceSource } from "../evidence/projection/claim/ledger.js";
import {
  realTaskLoopExactNewText,
  realTaskLoopRepairableFailedText,
  verifyRealTaskLoopReadback,
  type RealTaskLoopFixture,
} from "./realTaskLoopFixture.js";
import {
  runVerificationRepairLoop,
  type VerificationRepairLoopRun,
} from "./verificationRepairLoop.js";
import { planVerificationRepairHunkSetHandoff } from "./verificationRepairPlanner.js";

export type RealTaskLoopRepairProofStatus =
  | "repair-not-run"
  | "repair-proposed"
  | "repair-confirmation-required"
  | "repair-applied"
  | "repair-verification-succeeded"
  | "repair-invalid"
  | "repair-failed";

export interface RealTaskLoopRepairProof {
  readonly status: RealTaskLoopRepairProofStatus;
  readonly originalVerificationStatus: "failed";
  readonly originalFailurePreserved: boolean;
  readonly originalFailureRuntimeDerived: boolean;
  readonly proposalStatus: "not-run" | "created" | "invalid";
  readonly anchorStatus: "not-run" | "exact-ready" | "unsupported";
  readonly confirmationStatus:
    | "not-requested"
    | "required"
    | "trusted-confirmed"
    | "invalid";
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly verificationRuntimeDerived: boolean;
  readonly verificationEvidenceCount: number;
  readonly mutationScope: "none" | "controlled-temp-workspace";
  readonly providerCallDuringApply: boolean;
  readonly evidenceSource: ClaimLedgerEvidenceSource;
  readonly changedFiles: readonly string[];
  readonly repairProposalId?: string;
  readonly evidence: readonly string[];
}

export interface RealTaskLoopRepairChainOutput {
  readonly loop: VerificationRepairLoopRun;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
  readonly readback?: ReturnType<typeof verifyRealTaskLoopReadback>;
  readonly proof: RealTaskLoopRepairProof;
  readonly evidence: readonly string[];
}

export async function runRealTaskLoopRepairChain(input: {
  readonly requestId: string;
  readonly fixture: RealTaskLoopFixture;
  readonly initialChangedFiles: readonly string[];
  readonly originalReadback: ReturnType<typeof verifyRealTaskLoopReadback>;
  readonly confirmRepairApply?: boolean;
}): Promise<RealTaskLoopRepairChainOutput> {
  const repairEvidenceSource: ClaimLedgerEvidenceSource = "fake-provider";
  const originalFailurePreserved = input.originalReadback.status === "failed";
  const originalFailureRuntimeDerived =
    input.originalReadback.evidence.some((entry) => entry === "real-task-loop-readback:status:failed");
  const contextPacket = await buildTargetedContextPacket({
    workspaceRoot: input.fixture.workspaceRoot,
    targetPath: input.fixture.targetPath,
  });
  const agentPlan = buildAgentPlan({
    ownerCapability: "edit-patch",
    taskKind: "edit-file",
    requestedActionKind: "edit",
    targetSummary: input.fixture.targetPath,
    contextPacketIds: [contextPacket.packetId],
    contextCompleteness: contextPacket.completenessStatus,
    confidence: "high",
    executionReadiness: "ready",
    missingFacts: [],
    suggestedReads: [],
    suggestedVerification: ["real-task-loop-readback"],
    safeEvidenceMarkers: [
      "runtime-receipt-result:failed",
      "real-task-loop-readback:status:failed",
    ],
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    doNext: "review exact repair proposal and confirm before apply",
  });
  const loop = await runVerificationRepairLoop({
    sessionId: `${input.requestId}-repair-session`,
    prompt: `Repair failed readback verification for ${input.fixture.targetPath}.`,
    sourceEditTransactionId: `${input.requestId}-initial-apply`,
    sourceProposalId: `${input.requestId}-initial-proposal`,
    contextPacket,
    agentPlan,
    verification: {
      status: input.originalReadback.status === "failed" ? "failed" : "blocked",
      reason: input.originalReadback.summary,
      nextAction: "Review the exact repair proposal, confirm it, apply through the existing lane, and re-run readback verification.",
    },
    failedFiles: [
      {
        path: input.fixture.targetPath,
        reason: "Readback still contained the old call site after the first controlled apply.",
      },
    ],
    changedFiles: input.initialChangedFiles,
    runtimeReceiptMarkers: [
      "runtime-receipt-result:failed",
      "runtime-receipt-readback:failed",
      `runtime-receipt-readback-evidence:${input.originalReadback.status}`,
    ],
    availability: { kind: "available", providerKindLabel: "fake-provider" },
    rawProposal: {
      hunks: [
        {
          hunkId: "repair-h1",
          targetPath: input.fixture.targetPath,
          summary: "replace the remaining old call site with the verified new call site",
          oldText: realTaskLoopRepairableFailedText,
          newText: realTaskLoopExactNewText,
        },
      ],
      confidence: "high",
      riskSummary: "controlled temp fixture repair; no production workspace mutation",
      verificationRetryPlan: ["rerun real task loop readback verification"],
    },
  });

  const plan = loop.plan;
  const editPlan = plan.editRepairPlan;
  const proposalId =
    editPlan && "manifest" in editPlan && editPlan.manifest
      ? editPlan.manifest.repairProposalId
      : undefined;
  const anchorStatus = repairAnchorStatus(editPlan);
  const proposalStatus = proposalId
    ? "created"
    : plan.status === "repair-loop-proposal-invalid"
      ? "invalid"
      : "not-run";

  let selection: EditProposalSelection | undefined;
  let applyResult: EditProposalApplyResult | undefined;
  let readback: ReturnType<typeof verifyRealTaskLoopReadback> | undefined;
  let confirmationStatus: RealTaskLoopRepairProof["confirmationStatus"] =
    anchorStatus === "exact-ready" ? "required" : "not-requested";

  if (editPlan && "manifest" in editPlan && editPlan.manifest && "mappingByHunkId" in editPlan) {
    const review = buildEditRepairProposalReview(editPlan.manifest);
    selection = selectEditProposalHunks({
      review,
      action: "select-all-exact",
      explicitConfirmation: Boolean(input.confirmRepairApply),
    });
    if (
      selection.state === "confirmed-exact-single-target" ||
      selection.state === "confirmed-exact-target-set"
    ) {
      confirmationStatus = "trusted-confirmed";
      const handoff = planVerificationRepairHunkSetHandoff({ plan, selection });
      if (handoff.status === "repair-loop-ready-for-hunk-set-handoff") {
        const authority = createWorkspaceWriteAuthority(input.fixture.workspaceRoot);
        applyResult = await applyEditProposalSelection({
          selection,
          mappingByHunkId: editPlan.mappingByHunkId,
          targetPathByLabel: new Map([[input.fixture.targetPath, input.fixture.targetPath]]),
          fencedOptions: {
            workspaceRoot: input.fixture.workspaceRoot,
            explicitRuntimeOptIn: true,
            explicitWorkspaceWriteOptIn: true,
            requestedUserDecision: "approved",
            defaultProductionRejectionUnchanged: true,
            readFile: authority.readFile,
            readVerifiedFile: authority.readVerifiedFile,
            validateWriteTarget: authority.validateWriteTarget,
            writeFile: authority.writeFile,
          },
          targetSetOptions: {
            workspaceRoot: input.fixture.workspaceRoot,
            explicitRuntimeOptIn: true,
            explicitWorkspaceWriteOptIn: true,
            requestedUserDecision: "approved",
            defaultProductionRejectionUnchanged: true,
            readFile: authority.readFile,
            readVerifiedFile: authority.readVerifiedFile,
            validateWriteTarget: authority.validateWriteTarget,
            writeFile: authority.writeFile,
          },
        });
        if (classifyRepairApplyStatus(applyResult) === "succeeded") {
          readback = verifyRealTaskLoopReadback({ fixture: input.fixture });
        }
      }
    } else if (input.confirmRepairApply) {
      confirmationStatus = "invalid";
    }
  }

  const applyStatus = classifyRepairApplyStatus(applyResult);
  const verificationStatus = classifyRepairVerificationStatus(readback);
  const verificationRuntimeDerived =
    readback?.evidence.some((entry) => entry === "real-task-loop-readback:status:passed") ?? false;
  const verificationEvidenceCount = readback?.evidence.length ?? 0;
  const changedFiles = applyResult?.changedFiles ?? [];
  const mutationScope = changedFiles.length > 0 ? "controlled-temp-workspace" : "none";
  const status = classifyRepairProofStatus({
    proposalStatus,
    anchorStatus,
    confirmationStatus,
    applyStatus,
    verificationStatus,
  });
  const proof: RealTaskLoopRepairProof = {
    status,
    originalVerificationStatus: "failed",
    originalFailurePreserved,
    originalFailureRuntimeDerived,
    proposalStatus,
    anchorStatus,
    confirmationStatus,
    applyStatus,
    verificationStatus,
    verificationRuntimeDerived,
    verificationEvidenceCount,
    mutationScope,
    providerCallDuringApply: false,
    evidenceSource: repairEvidenceSource,
    changedFiles,
    ...(proposalId ? { repairProposalId: proposalId } : {}),
    evidence: [
      ...input.originalReadback.evidence,
      ...loop.evidence,
      ...(selection?.evidence ?? []),
      ...(applyResult?.evidence ?? []),
      ...(readback?.evidence ?? []),
      `real-task-loop-repair:status:${status}`,
      `real-task-loop-repair:original-verification:${input.originalReadback.status}`,
      `real-task-loop-repair:original-readback:${input.originalReadback.status}`,
      `real-task-loop-repair:original-failure-preserved:${originalFailurePreserved}`,
      `real-task-loop-repair:original-failure-runtime-derived:${originalFailureRuntimeDerived}`,
      `real-task-loop-repair:proposal-source:${repairEvidenceSource}`,
      `real-task-loop-repair:proposal:${proposalStatus}`,
      `real-task-loop-repair:anchor:${anchorStatus}`,
      `real-task-loop-repair:confirmation:${confirmationStatus}`,
      `real-task-loop-repair:apply:${applyStatus}`,
      `real-task-loop-repair:verification:${verificationStatus}`,
      `real-task-loop-repair:verification-runtime-derived:${verificationRuntimeDerived}`,
      `real-task-loop-repair:verification-evidence-count:${verificationEvidenceCount}`,
      `real-task-loop-repair:mutation-scope:${mutationScope}`,
      "real-task-loop-repair:provider-call-during-apply:false",
      "real-task-loop-repair:existing-exact-apply-lane",
      ...(applyResult ? ["real-task-loop-repair:apply-route:existing-exact-lane"] : []),
      ...(readback
        ? [
            `real-task-loop-repair:readback:status:${readback.status}`,
            "real-task-loop-repair:readback:runtime-derived",
          ]
        : []),
      "real-task-loop-repair:no-production-workspace",
      "real-task-loop-repair:no-new-writer",
      "real-task-loop-repair:no-fuzzy-apply",
      "real-task-loop-repair:raw-content-excluded",
    ],
  };

  return {
    loop,
    ...(selection ? { selection } : {}),
    ...(applyResult ? { applyResult } : {}),
    ...(readback ? { readback } : {}),
    proof,
    evidence: proof.evidence,
  };
}

function repairAnchorStatus(
  editPlan: VerificationRepairLoopRun["plan"]["editRepairPlan"] | undefined,
): RealTaskLoopRepairProof["anchorStatus"] {
  if (!editPlan || !("manifest" in editPlan) || !editPlan.manifest) {
    return "not-run";
  }
  if (
    editPlan.manifest.handoffReadiness === "exact-single-target" ||
    editPlan.manifest.handoffReadiness === "exact-hunk-set"
  ) {
    return "exact-ready";
  }
  if (editPlan.manifest.handoffReadiness === "unsupported") {
    return "unsupported";
  }
  return "not-run";
}

function classifyRepairApplyStatus(
  applyResult: EditProposalApplyResult | undefined,
): RealTaskLoopRepairProof["applyStatus"] {
  if (!applyResult) return "not-run";
  if (
    applyResult.status === "single-target-applied" ||
    applyResult.status === "target-set-applied" ||
    applyResult.status === "hunk-set-applied"
  ) {
    return "succeeded";
  }
  if (applyResult.status.includes("failed") || applyResult.status.includes("partial-failure")) {
    return "failed";
  }
  return "stopped";
}

function classifyRepairVerificationStatus(
  readback: ReturnType<typeof verifyRealTaskLoopReadback> | undefined,
): RealTaskLoopRepairProof["verificationStatus"] {
  if (!readback) return "not-run";
  return readback.status === "passed" ? "succeeded" : "failed";
}

function classifyRepairProofStatus(input: {
  readonly proposalStatus: RealTaskLoopRepairProof["proposalStatus"];
  readonly anchorStatus: RealTaskLoopRepairProof["anchorStatus"];
  readonly confirmationStatus: RealTaskLoopRepairProof["confirmationStatus"];
  readonly applyStatus: RealTaskLoopRepairProof["applyStatus"];
  readonly verificationStatus: RealTaskLoopRepairProof["verificationStatus"];
}): RealTaskLoopRepairProofStatus {
  if (input.proposalStatus !== "created" || input.anchorStatus === "unsupported") {
    return input.proposalStatus === "invalid" || input.anchorStatus === "unsupported"
      ? "repair-invalid"
      : "repair-not-run";
  }
  if (input.anchorStatus === "exact-ready" && input.confirmationStatus !== "trusted-confirmed") {
    return input.confirmationStatus === "invalid"
      ? "repair-invalid"
      : "repair-confirmation-required";
  }
  if (input.applyStatus === "not-run") return "repair-proposed";
  if (input.applyStatus !== "succeeded") return "repair-failed";
  if (input.verificationStatus === "succeeded") return "repair-verification-succeeded";
  if (input.verificationStatus === "failed") return "repair-failed";
  return "repair-applied";
}

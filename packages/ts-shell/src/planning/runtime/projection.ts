import type { CodingVerificationSummary } from "../../orchestration/types.js";
import type { ClaimLedgerEvidenceSource } from "../../evidence/projection/claim/ledger.js";
import type { PlanningRuntimeResult } from "./engine.js";
import {
  runPlanningMutationProofRoute,
  type PlanningMutationProofRoute,
} from "../../orchestration/planningMutationProofRoute.js";
import { projectPlanningRuntimeSurface } from "../../orchestration/planningRuntimeSurface.js";
import {
  projectRuntimeCodingOutcome,
  type RuntimeOutcomeProjection,
} from "../../orchestration/runtimeOutcomeProjection.js";
import type { PlanningRuntimeProductTaskKind } from "../../orchestration/planningRuntimeProductRoute.js";
import {
  buildPlanningRuntimeProductProofInputs,
  type PlanningRuntimeProductExecutionOptions,
  type PlanningRuntimeProductProofInputs,
} from "../../orchestration/planningRuntimeProductExecution.js";
import { preparePlanningRuntimeProductProposal } from "./proposal.js";
import {
  runPlanningRuntimeProductRepairContinuation,
  type PlanningRuntimeProductRepairContinuation,
} from "../../orchestration/planningRuntimeProductRepair.js";
import {
  runPlanningRuntimeProductVerificationCommand,
  type PlanningRuntimeProductVerificationCommandRun,
  type PlanningRuntimeProductVerificationRuntime,
} from "../../orchestration/planningRuntimeProductVerification.js";

export async function projectPlanningRuntimeProductOutcome(input: {
  readonly result: PlanningRuntimeResult;
  readonly taskKind: PlanningRuntimeProductTaskKind;
  readonly routeReason: string;
  readonly routeEvidence?: readonly string[];
  readonly productPath: "runMvpIntegratedFlow";
  readonly workspaceRoot: string;
  readonly sessionId: string;
  readonly prompt: string;
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly verificationRuntime?: PlanningRuntimeProductVerificationRuntime;
}): Promise<RuntimeOutcomeProjection> {
  const surface = projectPlanningRuntimeSurface(input.result);
  const proposalPreparation = await preparePlanningRuntimeProductProposal({
    workspaceRoot: input.workspaceRoot,
    handoff: surface.mutationHandoff,
    planningResult: input.result,
    rawProposal: input.execution?.rawProposal,
    liveProvider: input.execution?.liveProviderProposal,
  });
  const proofInputs = buildPlanningRuntimeProductProofInputs({
    workspaceRoot: input.workspaceRoot,
    handoff: surface.mutationHandoff,
    execution: input.execution,
    proposalPreparation,
  });
  const proofRoute = await runPlanningMutationProofRoute({
    requestId: `${input.productPath}:${input.result.runtimeId}`,
    handoff: surface.mutationHandoff,
    taskKind: input.taskKind,
    ...(proofInputs.rawProposal ? { rawProposal: proofInputs.rawProposal } : {}),
    ...(proofInputs.currentContentByTargetPath
      ? { currentContentByTargetPath: proofInputs.currentContentByTargetPath }
      : {}),
    ...(proofInputs.confirmation ? { confirmation: proofInputs.confirmation } : {}),
    ...(proofInputs.workspace ? { workspace: proofInputs.workspace } : {}),
    ...(proofInputs.readVerifiedFile ? { readVerifiedFile: proofInputs.readVerifiedFile } : {}),
    ...(proofInputs.expectedContentByTargetPath
      ? { expectedContentByTargetPath: proofInputs.expectedContentByTargetPath }
      : {}),
    proposalEvidenceSource: proofInputs.exactProposalSource === "none"
      ? undefined
      : proofInputs.exactProposalSource,
    evidenceSource: proofInputs.exactProposalSource === "live-provider-proposal"
      ? claimLedgerEvidenceSourceForLiveProvider(proofInputs.liveProviderEvidenceSource)
      : undefined,
    providerCalled: proofInputs.providerCalled,
    liveOptIn: proofInputs.liveOptIn,
  });
  const commandVerification = await runPlanningRuntimeProductVerificationCommand({
    workspaceRoot: input.workspaceRoot,
    proofRoute,
    verificationCommand: input.execution?.verificationCommand,
    runtime: input.verificationRuntime,
  });
  const repairContinuation = await runPlanningRuntimeProductRepairContinuation({
    sessionId: input.sessionId,
    prompt: input.prompt,
    proofRoute,
    commandRun: commandVerification,
  });
  const targetPaths = surface.editTargets.map((target) => target.path);
  const reviewOnlyReason = buildReviewOnlyReason({
    routeReason: input.routeReason,
    handoffState: surface.mutationHandoff.handoffState,
    targetPaths,
  });
  const verificationReason =
    "Planning runtime produced verification intent only; command-dispatch=not-run.";
  const productEvidence = buildProductEvidence(
    input.result,
    input.productPath,
    input.routeEvidence ?? [],
    surface,
    proofRoute,
    proofInputs,
    commandVerification,
    repairContinuation,
  );
  const nextAction = selectNextAction(surface.enoughContext, targetPaths);
  if (shouldUseProofRuntimeOutcome(proofRoute, proofInputs)) {
    const verification = mergeProductVerification({
      proofVerification: proofRoute.runtimeOutcome.codingResult.verification,
      commandVerification,
    });
    const commandFailure = commandFailureFile(commandVerification);
    return projectRuntimeCodingOutcome({
      taskKind: input.taskKind,
      changedFiles: [...proofRoute.runtimeOutcome.codingResult.changedFiles],
      failedFiles: [
        ...proofRoute.runtimeOutcome.codingResult.failedFiles,
        ...(commandFailure ? [commandFailure] : []),
      ],
      patches: [...(proofRoute.runtimeOutcome.codingResult.patches ?? [])],
      verifiedFiles: [
        ...proofRoute.runtimeOutcome.codingResult.verifiedFiles,
        ...(commandVerification.status === "passed" ? ["(verification-command)"] : []),
      ],
      unverifiedFiles: [
        ...proofRoute.runtimeOutcome.codingResult.unverifiedFiles,
        ...(commandFailure
          ? [{ path: commandFailure.path, reason: commandFailure.reason }]
          : []),
      ],
      verification,
      repairNotes: [
        input.routeReason,
        ...proofRoute.runtimeOutcome.codingResult.repair.notes,
        `planning-runtime-product:verification-command:${commandVerification.status}`,
        `planning-runtime-product:repair:${repairContinuation.status}`,
      ],
      evidence: productEvidence,
      taskVerdict: commandFailure
        ? "insufficient-evidence"
        : proofRoute.runtimeOutcome.codingResult.taskSatisfaction.verdict,
      taskReasons: [
        ...proofRoute.runtimeOutcome.codingResult.taskSatisfaction.reasons,
        `verification-command=${commandVerification.status}`,
        `repair-continuation=${repairContinuation.status}`,
      ],
      userFacingOutput: formatPlanningRuntimeProductOutput({
        surface,
        proofRoute,
        proofInputs,
        commandVerification,
        repairContinuation,
        routeReason: input.routeReason,
        evidence: productEvidence,
      }),
    });
  }

  return projectRuntimeCodingOutcome({
    taskKind: input.taskKind,
    changedFiles: [],
    failedFiles: [
      {
        path: targetPaths[0] ?? "(planning-runtime)",
        reason: reviewOnlyReason,
      },
    ],
    patches: [],
    verifiedFiles: [],
    unverifiedFiles: targetPaths.map((path) => ({
      path,
      reason: "planned edit target; not mutated in review-only path",
    })),
    verification: {
      status: "skipped",
      reason: verificationReason,
      selectionScope: "none",
      selectionSource: "not-requested",
      nextAction,
    },
    repairNotes: [
      input.routeReason,
      "planning-runtime-product:review-only-no-write-handoff",
      `planning-runtime-product:verification-command:${commandVerification.status}`,
      `planning-runtime-product:repair:${repairContinuation.status}`,
      "context-memory-scope:product-turn-only; session-continuation persistence not wired",
    ],
    evidence: productEvidence,
    taskVerdict: "insufficient-evidence",
    taskReasons: [
      reviewOnlyReason,
      ...surface.missingFacts.slice(0, 4),
    ],
    userFacingOutput: formatPlanningRuntimeProductOutput({
      surface,
      proofRoute,
      proofInputs,
      commandVerification,
      repairContinuation,
      routeReason: input.routeReason,
      evidence: productEvidence,
    }),
  });
}

function buildReviewOnlyReason(input: {
  readonly routeReason: string;
  readonly handoffState: ReturnType<typeof projectPlanningRuntimeSurface>["mutationHandoff"]["handoffState"];
  readonly targetPaths: readonly string[];
}): string {
  if (input.handoffState === "handoff-ready" && input.targetPaths.length > 0) {
    return [
      "Planning Runtime resolved a review-ready target.",
      "Exact proposal mapping, explicit confirmation, and workspace authority are still required before mutation.",
      "mutationAuthority=not-granted.",
    ].join(" ");
  }
  return [
    input.routeReason,
    "Review-only planning runtime stopped before mutation; mutationAuthority=not-granted.",
  ].join(" ");
}

function buildProductEvidence(
  result: PlanningRuntimeResult,
  productPath: "runMvpIntegratedFlow",
  routeEvidence: readonly string[],
  surface: ReturnType<typeof projectPlanningRuntimeSurface>,
  proofRoute: PlanningMutationProofRoute,
  proofInputs: PlanningRuntimeProductProofInputs,
  commandVerification: PlanningRuntimeProductVerificationCommandRun,
  repairContinuation: PlanningRuntimeProductRepairContinuation,
): string[] {
  return [
    `planning-runtime-product:path:${productPath}`,
    "planning-runtime-product:demo-success-alone:not-product-path-success",
    "planning-runtime-product:context-memory-scope:product-turn",
    "planning-runtime-product:review-surface:structured-handoff",
    "session-print:stopped-final-output:include",
    "mutationAuthority=not-granted",
    `planning-runtime-product:proposal-preparation:${proofInputs.proposalPreparation?.status ?? "not-run"}`,
    `planning-runtime-product:proposal-source:${proofInputs.exactProposalSource}`,
    proofInputs.providerCalled ? "provider-called=true" : "provider-called=false",
    proofRoute.proofHandoff.applyState === "not-run"
      ? "apply=not-run"
      : `apply=${proofRoute.proofHandoff.applyState}`,
    commandVerification.commandDispatch === "existing-tool-runtime"
      ? "command-dispatch=existing-tool-runtime"
      : "command-dispatch=not-run",
    ...routeEvidence,
    ...result.context.filesRead.map((file) => `inspect: read ${file.path}`),
    ...result.context.repo.candidates
      .slice(0, 5)
      .map((candidate) =>
        `planning-runtime-product:candidate:${candidate.safeLabel}`,
      ),
    ...result.context.filesRead.map(
      (file) =>
        `planning-runtime-product:read-reason:${file.path}:${file.reason}`,
    ),
    ...surface.contextAcquisition.evidence,
    ...result.evidence,
    ...proofInputs.executionEvidence,
    `planning-runtime-product:proof-route-state:${proofRoute.state}`,
    `planning-runtime-product:backend-consumption:${proofRoute.proofHandoff.backendLane}`,
    `planning-runtime-product:proof-apply:${proofRoute.proofHandoff.applyState}`,
    `planning-runtime-product:proof-verification:${proofRoute.verification.verificationState}`,
    `planning-runtime-product:proof-terminal:${proofRoute.terminalState}`,
    `planning-runtime-product:proof-result:${proofRoute.terminalResult}`,
    `planning-runtime-product:verification-command:${commandVerification.status}`,
    `planning-runtime-product:verification-command-dispatch:${commandVerification.commandDispatch}`,
    `planning-runtime-product:repair:${repairContinuation.status}`,
    ...proofRoute.evidence,
    ...commandVerification.evidence,
    ...repairContinuation.evidence,
  ];
}

function formatPlanningRuntimeProductOutput(input: {
  readonly surface: ReturnType<typeof projectPlanningRuntimeSurface>;
  readonly proofRoute: PlanningMutationProofRoute;
  readonly proofInputs: PlanningRuntimeProductProofInputs;
  readonly commandVerification: PlanningRuntimeProductVerificationCommandRun;
  readonly repairContinuation: PlanningRuntimeProductRepairContinuation;
  readonly routeReason: string;
  readonly evidence: readonly string[];
}): string {
  const surface = input.surface;
  const proposalBridge = input.proofRoute.bridge;
  const proofRoute = input.proofRoute;
  return [
    "Planning runtime: product-path review-only handoff",
    `Runtime id: ${surface.runtimeId}`,
    `Status: ${surface.status}`,
    `Context engine: ${surface.contextStatus}`,
    `Product route reason: ${input.routeReason}`,
    "",
    "Candidates:",
    ...formatCandidates(surface.candidates),
    "",
    "Read/staged context:",
    ...formatContextAcquisition(surface.contextAcquisition),
    "",
    "Route227B planning evidence:",
    `candidateFiles=${surface.planningEvidence.candidateFiles.join(", ") || "none"}`,
    `filesRead=${surface.planningEvidence.filesRead.join(", ") || "none"}`,
    `readReasons=${surface.planningEvidence.readReasons.join("; ") || "none"}`,
    `missingFacts=${surface.planningEvidence.missingFacts.join("; ") || "none"}`,
    `editTargets=${surface.planningEvidence.editTargets.join(", ") || "none"}`,
    `verificationIntent=${surface.planningEvidence.verificationIntent || "none"}`,
    `contextBudget=candidateFiles:${surface.planningEvidence.contextBudget.candidateFiles};filesRead:${surface.planningEvidence.contextBudget.filesRead};bytesUsed:${surface.planningEvidence.contextBudget.bytesUsed};cache:${surface.planningEvidence.contextBudget.cacheStatus}`,
    `memoryReuseStatus=${surface.planningEvidence.memoryReuseStatus}`,
    "",
    `Enough context: ${surface.enoughContext}`,
    `Missing facts: ${surface.missingFacts.join("; ") || "none"}`,
    `Planning warnings: ${surface.planningWarnings.join("; ") || "none"}`,
    "",
    "Grounded analysis:",
    `Confidence: ${surface.groundedAnalysis.confidence}`,
    surface.groundedAnalysis.summary,
    "",
    "Executable plan:",
    `Summary: ${surface.executablePlan.summary}`,
    ...surface.executablePlan.steps.map(
      (step, index) => `${index + 1}. ${step}`,
    ),
    "",
    "Edit targets:",
    ...formatEditTargets(surface.editTargets),
    "",
    "Verification intent:",
    formatVerificationIntent(surface.verificationIntent),
    "",
    "Review-only handoff:",
    `Handoff id: ${surface.mutationHandoff.handoffId}`,
    `Handoff state: ${surface.mutationHandoff.handoffState}`,
    `Readiness: ${surface.mutationHandoff.readiness}`,
    `Review state: ${surface.mutationHandoff.reviewState}`,
    `Permission state: ${surface.mutationHandoff.permissionState}`,
    `Backend lane: ${surface.mutationHandoff.backendLane}`,
    `Backend consumption: ${surface.mutationHandoff.backendConsumption}`,
    `Execution lane after inputs: ${surface.mutationHandoff.executionLane}`,
    `Target paths: ${surface.mutationHandoff.targetPaths.join(", ") || "none"}`,
    `Context receipt ids: ${surface.mutationHandoff.contextReceiptIds.join(", ") || "none"}`,
    `Read evidence ids: ${surface.mutationHandoff.readEvidenceIds.join(", ") || "none"}`,
    `Expected change: ${surface.mutationHandoff.expectedChangeSummary}`,
    `Handoff verification intent: ${surface.mutationHandoff.verificationIntent.summary}`,
    `Unsupported reasons: ${surface.mutationHandoff.unsupportedReasons.join("; ") || "none"}`,
    `Proposal: ${surface.mutationHandoff.proposalId ?? "none"}`,
    `Proposal review: ${surface.mutationHandoff.proposalReview?.reviewStatus ?? "none"}`,
    `Exact mapping readiness: ${surface.mutationHandoff.proposalReview?.exactMappingReadiness ?? "none"}`,
    `Reason: ${surface.mutationHandoff.reason}`,
    `Blocked reasons: ${surface.mutationHandoff.blockedReasons.join("; ") || "none"}`,
    "Requirements:",
    ...formatHandoffRequirements(surface.mutationHandoff.requirements),
    `Next: ${surface.mutationHandoff.nextAction}`,
    "mutationAuthority=not-granted",
    `provider-called=${input.proofInputs.providerCalled ? "true" : "false"}`,
    "apply=not-run",
    "command-dispatch=not-run",
    "",
    "Review-confirm-execute loop:",
    `Loop verdict: ${formatLoopVerdict(proofRoute)}`,
    `Review surface: structured-handoff`,
    `Product proposal preparation: ${input.proofInputs.proposalPreparation?.status ?? "not-run"}`,
    `Product proposal source: ${input.proofInputs.exactProposalSource}`,
    `Product proposal reason: ${input.proofInputs.proposalPreparation?.reason ?? "none"}`,
    `Provider called for proposal: ${input.proofInputs.providerCalled ? "true" : "false"}`,
    `Live provider opt-in: ${input.proofInputs.liveOptIn ? "true" : "false"}`,
    `Live provider evidence source: ${input.proofInputs.liveProviderEvidenceSource}`,
    `Live provider status: ${liveProviderStatus(input.proofInputs)}`,
    `Live provider fallback: ${liveProviderFallback(input.proofInputs)}`,
    `Explicit confirmation: ${input.proofInputs.confirmationState}`,
    `Exact proposal input: ${input.proofInputs.exactProposalState}`,
    `Controlled workspace: ${input.proofInputs.controlledWorkspaceState}`,
    `Controlled workspace reason: ${input.proofInputs.controlledWorkspaceReason}`,
    `Selected workspace: ${input.proofInputs.selectedWorkspaceState}`,
    `Selected workspace reason: ${input.proofInputs.selectedWorkspaceReason}`,
    `Backend consumption: ${proofRoute.proofHandoff.backendLane}`,
    `Apply state: ${proofRoute.proofHandoff.applyState}`,
    `Readback verification: ${proofRoute.verification.verificationState}`,
    `Verification command: ${input.commandVerification.status}`,
    `Verification command dispatch: ${input.commandVerification.commandDispatch}`,
    `Verification command reason: ${input.commandVerification.reason}`,
    `Repair continuation: ${input.repairContinuation.status}`,
    `Repair reason: ${input.repairContinuation.reason}`,
    `Terminal verdict: ${proofRoute.terminalState}`,
    `Terminal result: ${proofRoute.terminalResult}`,
    `Next action: ${formatLoopNextAction({ proofRoute, proofInputs: input.proofInputs })}`,
    "confirmation-from-prompt=false",
    "provider-call-during-confirmation=false",
    "command-dispatch-during-confirmation=false",
    "",
    "Proposal/anchoring bridge:",
    `Bridge id: ${proposalBridge.bridgeId}`,
    `State: ${proposalBridge.state}`,
    `Proposal state: ${proposalBridge.proposalState}`,
    `Proposal: ${proposalBridge.proposalId ?? "none"}`,
    `Proposal review: ${proposalBridge.proposalReviewStatus ?? "none"}`,
    `Anchor state: ${proposalBridge.anchorState}`,
    `Anchor quality: ${proposalBridge.orchestration.anchorQuality}`,
    `Anchored proposal: ${proposalBridge.anchoredProposalId ?? "none"}`,
    `Confirmation state: ${proposalBridge.confirmationState}`,
    `Evidence source: ${proposalBridge.evidenceSource}`,
    `Proposal source: ${proposalBridge.orchestration.proposalSource}`,
    `Operation type: ${proposalBridge.orchestration.operationType}`,
    `Handoff readiness: ${proposalBridge.orchestration.handoffReadiness}`,
    `Authority required: ${proposalBridge.orchestration.authorityRequired ? "yes" : "no"}`,
    `Not proven: ${proposalBridge.orchestration.notProvenClaims.join("; ") || "none"}`,
    `Provider call: ${proposalBridge.providerCall}`,
    `Apply state: ${proposalBridge.applyState}`,
    `Verification state: ${proposalBridge.verificationState}`,
    `Reason: ${proposalBridge.reason}`,
    `Next: ${proposalBridge.nextAction}`,
    "mutationAuthority=not-granted",
    "",
    "Proof backend route:",
    `Route id: ${proofRoute.routeId}`,
    `State: ${proofRoute.state}`,
    `Proof handoff: ${proofRoute.proofHandoff.state}`,
    `Backend: ${proofRoute.proofHandoff.backendLane}`,
    `Apply state: ${proofRoute.proofHandoff.applyState}`,
    `Verification state: ${proofRoute.verification.verificationState}`,
    `Claim ledger: ${proofRoute.verification.claimLedger.ledgerId}`,
    `Claim terminal: ${proofRoute.terminalState}`,
    `Claim result: ${proofRoute.terminalResult}`,
    `Claim live success: ${proofRoute.liveSuccess ? "yes" : "no"}`,
    `Changed files: ${proofRoute.changedFiles.join(", ") || "none"}`,
    `Verified files: ${proofRoute.verifiedFiles.join(", ") || "none"}`,
    `Unverified files: ${proofRoute.unverifiedFiles.join(", ") || "none"}`,
    "Provider call during apply: false",
    `Reason: ${proofRoute.verification.reason}`,
    `Next: ${proofRoute.verification.nextAction}`,
    "",
    "Authorized verification command:",
    `State: ${input.commandVerification.status}`,
    `Dispatch: ${input.commandVerification.commandDispatch}`,
    `Plan: ${input.commandVerification.plan?.verificationPlanId ?? "none"}`,
    `Command: ${input.commandVerification.plan?.commandSafeLabel ?? "none"}`,
    `Outcome: ${input.commandVerification.result?.outcome ?? "none"}`,
    `Repair eligible: ${input.commandVerification.repairEligible ? "yes" : "no"}`,
    `Reason: ${input.commandVerification.reason}`,
    `Next: ${input.commandVerification.nextAction}`,
    "",
    "Repair continuation:",
    `State: ${input.repairContinuation.status}`,
    `Plan: ${input.repairContinuation.run?.plan.status ?? "none"}`,
    `Mutation: not-run`,
    `Original failure preserved: ${input.repairContinuation.status === "repair-continuation-created" ? "yes" : "not-needed"}`,
    `Reason: ${input.repairContinuation.reason}`,
    `Next: ${input.repairContinuation.nextAction}`,
    "",
    "Context memory scope:",
    `memory=${surface.memory.id}; scope=product-turn; session-continuation=not-wired`,
    "",
    `Evidence markers: ${selectEvidenceMarkers(input.evidence).join(" | ")}`,
  ].join("\n");
}

function liveProviderStatus(proofInputs: PlanningRuntimeProductProofInputs): string {
  if (!proofInputs.liveOptIn) return "not-run";
  return proofInputs.proposalPreparation?.evidence
    .find((entry) => entry.startsWith("planning-runtime-product-proposal:live-provider-status:"))
    ?.split(":")
    .at(-1) ?? proofInputs.proposalPreparation?.status ?? "unknown";
}

function liveProviderFallback(proofInputs: PlanningRuntimeProductProofInputs): string {
  if (!proofInputs.liveOptIn) return "not-run";
  return proofInputs.proposalPreparation?.evidence
    .find((entry) => entry.startsWith("planning-runtime-product-proposal:live-provider-fallback-policy:"))
    ?.split(":")
    .at(-1) ?? "unknown";
}

function claimLedgerEvidenceSourceForLiveProvider(
  source: PlanningRuntimeProductProofInputs["liveProviderEvidenceSource"],
): ClaimLedgerEvidenceSource {
  switch (source) {
    case "live-provider":
      return "live-provider";
    case "fake-provider":
      return "fake-provider";
    case "default-safe":
      return "default-safe";
    case "not-proven":
      return "unknown";
  }
}

function selectNextAction(
  enoughContext: "yes" | "missing-facts",
  targetPaths: readonly string[],
): string {
  if (enoughContext === "yes" && targetPaths.length > 0) {
    return "Review the planning runtime output, then rerun with one explicit target and an exact approved edit.";
  }
  if (enoughContext === "yes") {
    return "Review the planning runtime analysis and plan; provide an explicit target only if mutation is intended.";
  }
  return "Provide missing facts or one explicit in-workspace target before requesting mutation.";
}

function formatCandidates(
  candidates: ReturnType<typeof projectPlanningRuntimeSurface>["candidates"],
): string[] {
  if (candidates.length === 0) {
    return ["- none"];
  }
  return candidates.map((candidate) =>
    [
      `- ${candidate.path}`,
      `score=${candidate.score}`,
      `reasons=${candidate.reasons.join(", ") || "none"}`,
    ].join(" "),
  );
}

function formatContextAcquisition(
  acquisition: ReturnType<typeof projectPlanningRuntimeSurface>["contextAcquisition"],
): string[] {
  const ids = [
    `mode=${acquisition.mode}`,
    acquisition.packetId ? `packet=${acquisition.packetId}` : undefined,
    acquisition.acquisitionId ? `acquisition=${acquisition.acquisitionId}` : undefined,
    acquisition.sufficiencyState ? `sufficiency=${acquisition.sufficiencyState}` : undefined,
  ].filter(Boolean).join("; ");
  return [
    `- Acquisition: ${ids}`,
    [
      "- Budget:",
      `candidateFiles=${acquisition.budget.candidateFiles}`,
      `filesRead=${acquisition.budget.filesRead}`,
      `bytesUsed=${acquisition.budget.bytesUsed}`,
      acquisition.budget.maxFilesRead !== undefined ? `maxFiles=${acquisition.budget.maxFilesRead}` : undefined,
      acquisition.budget.maxTotalBytes !== undefined ? `maxBytes=${acquisition.budget.maxTotalBytes}` : undefined,
      `cache=${acquisition.budget.cacheStatus}`,
    ].filter(Boolean).join(" "),
    ...acquisition.stages.map((stage) =>
      `- Stage ${stage.name}: status=${stage.status}; ${stage.summary}`,
    ),
    ...formatContextReads(acquisition.reads),
    ...formatOmittedContext(acquisition.omitted),
    ...formatNextReads(acquisition.nextReads),
  ];
}

function formatContextReads(
  reads: ReturnType<typeof projectPlanningRuntimeSurface>["contextAcquisition"]["reads"],
): string[] {
  if (reads.length === 0) {
    return ["- Reads: none"];
  }
  return reads.map((read) =>
    [
      `- Read ${read.path}`,
      `stage=${read.stage}`,
      `source=${read.source}`,
      `why-read=${read.whyRead}`,
      read.byteLength !== undefined ? `bytes=${read.byteLength}` : undefined,
    ].filter(Boolean).join(" "),
  );
}

function formatOmittedContext(
  omitted: ReturnType<typeof projectPlanningRuntimeSurface>["contextAcquisition"]["omitted"],
): string[] {
  if (omitted.length === 0) {
    return ["- Omitted context: none"];
  }
  return [
    "- Omitted context:",
    ...omitted.slice(0, 8).map((item) =>
      [
        `  - ${item.path}`,
        `stage=${item.stage}`,
        `source=${item.source}`,
        `reason=${item.reason}`,
        item.byteLength !== undefined ? `bytes=${item.byteLength}` : undefined,
      ].filter(Boolean).join(" "),
    ),
  ];
}

function formatNextReads(
  nextReads: ReturnType<typeof projectPlanningRuntimeSurface>["contextAcquisition"]["nextReads"],
): string[] {
  if (nextReads.length === 0) {
    return ["- Next reads: none required"];
  }
  return [
    "- Next reads:",
    ...nextReads.slice(0, 8).map((read) => `  - ${read}`),
  ];
}

function formatEditTargets(
  editTargets: ReturnType<typeof projectPlanningRuntimeSurface>["editTargets"],
): string[] {
  if (editTargets.length === 0) {
    return ["- none; unsupported or missing facts must be resolved before mutation"];
  }
  return editTargets.map((target) =>
    [
      `- ${target.path}`,
      `readiness=${target.readiness}`,
      `route=${target.handoffRoute}`,
      `rationale=${target.rationale}`,
    ].join(" "),
  );
}

function formatVerificationIntent(
  verificationIntent: ReturnType<
    typeof projectPlanningRuntimeSurface
  >["verificationIntent"],
): string {
  return [
    `state=${verificationIntent.state}`,
    verificationIntent.command ? `command=${verificationIntent.command}` : undefined,
    verificationIntent.commandKind ? `kind=${verificationIntent.commandKind}` : undefined,
    verificationIntent.readiness ? `readiness=${verificationIntent.readiness}` : undefined,
  ].filter(Boolean).join("; ");
}

function formatHandoffRequirements(
  requirements: ReturnType<
    typeof projectPlanningRuntimeSurface
  >["mutationHandoff"]["requirements"],
): string[] {
  if (requirements.length === 0) {
    return ["- none"];
  }
  return requirements.map((requirement) =>
    [
      `- ${requirement.id}`,
      `status=${requirement.status}`,
      `owner=${requirement.owner}`,
      `detail=${requirement.detail}`,
    ].join(" "),
  );
}

function selectEvidenceMarkers(evidence: readonly string[]): readonly string[] {
  const selected = evidence.filter((entry) =>
    entry.startsWith("context-engine:") ||
    entry.startsWith("context-acquisition:") ||
    entry.startsWith("planning-runtime:") ||
    entry.startsWith("planning-mutation-handoff:") ||
    entry.startsWith("planning-proposal-bridge:") ||
    entry.startsWith("planning-mutation-proof-route:") ||
    entry.startsWith("planning-mutation-proof-handoff:") ||
    entry.startsWith("planning-mutation-proof-verification:") ||
    entry.startsWith("claim-ledger:") ||
    entry.startsWith("generated-edit-proposal:") ||
    entry.startsWith("edit-proposal-review:") ||
    entry.startsWith("planning-runtime-product:") ||
    entry.startsWith("planning-runtime-product-proposal:") ||
    entry.startsWith("planning-runtime-product-verification-command:") ||
    entry.startsWith("planning-runtime-product-repair:") ||
    entry.startsWith("verification-command-") ||
    entry.startsWith("verification-repair-") ||
    entry === "mutationAuthority=not-granted" ||
    entry === "provider-called=false" ||
    entry.startsWith("provider-called=") ||
    entry === "apply=not-run" ||
    entry === "command-dispatch=not-run"
  );
  return Array.from(new Set(selected)).slice(0, 24);
}

function mergeProductVerification(input: {
  readonly proofVerification: CodingVerificationSummary;
  readonly commandVerification: PlanningRuntimeProductVerificationCommandRun;
}): CodingVerificationSummary {
  if (
    input.commandVerification.status === "not-requested" ||
    input.commandVerification.status === "not-run"
  ) {
    return input.proofVerification;
  }
  if (input.commandVerification.status === "passed") {
    return {
      ...input.proofVerification,
      status: input.proofVerification.status === "passed" ? "passed" : input.proofVerification.status,
      command: input.commandVerification.plan?.command,
      reason: [
        input.proofVerification.reason,
        "verification command succeeded",
      ].filter(Boolean).join("; "),
      nextAction: input.proofVerification.nextAction,
    };
  }
  return {
    status: input.commandVerification.status === "blocked" ? "blocked" : "failed",
    ...(input.commandVerification.plan?.command
      ? { command: input.commandVerification.plan.command }
      : {}),
    reason: input.commandVerification.reason,
    selectionScope: "focused",
    selectionSource: "explicit-user",
    ...(input.commandVerification.status === "blocked"
      ? { blockerKind: "environment-not-ready" as const }
      : {}),
    nextAction: input.commandVerification.nextAction,
  };
}

function commandFailureFile(
  commandVerification: PlanningRuntimeProductVerificationCommandRun,
): { path: string; reason: string } | undefined {
  if (
    commandVerification.status !== "failed" &&
    commandVerification.status !== "blocked"
  ) {
    return undefined;
  }
  return {
    path: "(verification-command)",
    reason: commandVerification.reason,
  };
}

function shouldUseProofRuntimeOutcome(
  proofRoute: PlanningMutationProofRoute,
  proofInputs: PlanningRuntimeProductProofInputs,
): boolean {
  return (
    proofInputs.confirmationState === "trusted-confirmed" ||
    proofInputs.exactProposalState === "provided" ||
    proofInputs.controlledWorkspaceState === "trusted-controlled-temp-workspace" ||
    proofInputs.selectedWorkspaceState === "trusted-selected-workspace" ||
    proofRoute.proofHandoff.backendLane === "existing-proof-carrying-mutation-backend" ||
    proofRoute.changedFiles.length > 0 ||
    proofRoute.verification.verificationState !== "not-run"
  );
}

function formatLoopVerdict(proofRoute: PlanningMutationProofRoute): string {
  if (proofRoute.state === "verified") return "verified";
  if (proofRoute.state === "repair-ready") return "repair-ready";
  if (proofRoute.state === "applied-unverified") return "applied-unverified";
  if (proofRoute.state === "confirmation-required") return "confirmation-required";
  if (proofRoute.state === "stopped") return "failed";
  return "review-only";
}

function formatLoopNextAction(input: {
  readonly proofRoute: PlanningMutationProofRoute;
  readonly proofInputs: PlanningRuntimeProductProofInputs;
}): string {
  if (input.proofRoute.state === "verified") {
    return "Review the Claim Ledger verdict; focused verification is not live provider success.";
  }
  if (input.proofRoute.state === "repair-ready") {
    return "Use the failed readback evidence to prepare a separate repair review.";
  }
  if (input.proofRoute.state === "applied-unverified") {
    return "Run readback verification before claiming task success.";
  }
  if (input.proofInputs.exactProposalState === "missing") {
    return "Provide an explicit exact proposal input before confirmation can execute.";
  }
  if (input.proofInputs.confirmationState !== "trusted-confirmed") {
    return "Review the exact proposal and provide explicit trusted confirmation for an authorized workspace.";
  }
  if (
    input.proofInputs.controlledWorkspaceState !== "trusted-controlled-temp-workspace" &&
    input.proofInputs.selectedWorkspaceState !== "trusted-selected-workspace"
  ) {
    return "Provide controlled temp or explicit selected workspace authority; production workspace writes remain disabled by default.";
  }
  return input.proofRoute.verification.nextAction;
}

import type { PlanningRuntimeResult } from "./planningRuntime.js";
import {
  runPlanningMutationProofRoute,
  type PlanningMutationProofRoute,
} from "./planningMutationProofRoute.js";
import { projectPlanningRuntimeSurface } from "./planningRuntimeSurface.js";
import {
  projectRuntimeCodingOutcome,
  type RuntimeOutcomeProjection,
} from "./runtimeOutcomeProjection.js";
import type { PlanningRuntimeProductTaskKind } from "./planningRuntimeProductRoute.js";
import {
  buildPlanningRuntimeProductProofInputs,
  type PlanningRuntimeProductExecutionOptions,
  type PlanningRuntimeProductProofInputs,
} from "./planningRuntimeProductExecution.js";

export async function projectPlanningRuntimeProductOutcome(input: {
  readonly result: PlanningRuntimeResult;
  readonly taskKind: PlanningRuntimeProductTaskKind;
  readonly routeReason: string;
  readonly routeEvidence?: readonly string[];
  readonly productPath: "runMvpIntegratedFlow";
  readonly workspaceRoot: string;
  readonly execution?: PlanningRuntimeProductExecutionOptions;
}): Promise<RuntimeOutcomeProjection> {
  const surface = projectPlanningRuntimeSurface(input.result);
  const proofInputs = buildPlanningRuntimeProductProofInputs({
    workspaceRoot: input.workspaceRoot,
    handoff: surface.mutationHandoff,
    execution: input.execution,
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
    providerCalled: proofInputs.exactProposalState === "provided",
    liveOptIn: false,
  });
  const proposalBridge = proofRoute.bridge;
  const targetPaths = surface.editTargets.map((target) => target.path);
  const reviewOnlyReason = [
    input.routeReason,
    "Review-only planning runtime stopped before mutation; mutationAuthority=not-granted.",
  ].join(" ");
  const verificationReason =
    "Planning runtime produced verification intent only; command-dispatch=not-run.";
  const productEvidence = buildProductEvidence(
    input.result,
    input.productPath,
    input.routeEvidence ?? [],
    surface,
    proofRoute,
    proofInputs,
  );
  const nextAction = selectNextAction(surface.enoughContext, targetPaths);
  if (shouldUseProofRuntimeOutcome(proofRoute, proofInputs)) {
    return projectRuntimeCodingOutcome({
      taskKind: input.taskKind,
      changedFiles: [...proofRoute.runtimeOutcome.codingResult.changedFiles],
      failedFiles: [...proofRoute.runtimeOutcome.codingResult.failedFiles],
      patches: [...(proofRoute.runtimeOutcome.codingResult.patches ?? [])],
      verifiedFiles: [...proofRoute.runtimeOutcome.codingResult.verifiedFiles],
      unverifiedFiles: [...proofRoute.runtimeOutcome.codingResult.unverifiedFiles],
      verification: proofRoute.runtimeOutcome.codingResult.verification,
      repairNotes: [
        input.routeReason,
        ...proofRoute.runtimeOutcome.codingResult.repair.notes,
      ],
      evidence: productEvidence,
      taskVerdict: proofRoute.runtimeOutcome.codingResult.taskSatisfaction.verdict,
      taskReasons: [
        ...proofRoute.runtimeOutcome.codingResult.taskSatisfaction.reasons,
      ],
      userFacingOutput: formatPlanningRuntimeProductOutput({
        surface,
        proofRoute,
        proofInputs,
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
      routeReason: input.routeReason,
      evidence: productEvidence,
    }),
  });
}

function buildProductEvidence(
  result: PlanningRuntimeResult,
  productPath: "runMvpIntegratedFlow",
  routeEvidence: readonly string[],
  surface: ReturnType<typeof projectPlanningRuntimeSurface>,
  proofRoute: PlanningMutationProofRoute,
  proofInputs: PlanningRuntimeProductProofInputs,
): string[] {
  return [
    `planning-runtime-product:path:${productPath}`,
    "planning-runtime-product:demo-success-alone:not-product-path-success",
    "planning-runtime-product:context-memory-scope:product-turn",
    "planning-runtime-product:review-surface:structured-handoff",
    "session-print:stopped-final-output:include",
    "mutationAuthority=not-granted",
    proofInputs.exactProposalState === "provided"
      ? "provider-called=explicit-proposal-input"
      : "provider-called=false",
    proofRoute.proofHandoff.applyState === "not-run"
      ? "apply=not-run"
      : `apply=${proofRoute.proofHandoff.applyState}`,
    "command-dispatch=not-run",
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
    ...proofRoute.evidence,
  ];
}

function formatPlanningRuntimeProductOutput(input: {
  readonly surface: ReturnType<typeof projectPlanningRuntimeSurface>;
  readonly proofRoute: PlanningMutationProofRoute;
  readonly proofInputs: PlanningRuntimeProductProofInputs;
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
    "provider-called=false",
    "apply=not-run",
    "command-dispatch=not-run",
    "",
    "Review-confirm-execute loop:",
    `Loop verdict: ${formatLoopVerdict(proofRoute)}`,
    `Review surface: structured-handoff`,
    `Explicit confirmation: ${input.proofInputs.confirmationState}`,
    `Exact proposal input: ${input.proofInputs.exactProposalState}`,
    `Controlled workspace: ${input.proofInputs.controlledWorkspaceState}`,
    `Controlled workspace reason: ${input.proofInputs.controlledWorkspaceReason}`,
    `Backend consumption: ${proofRoute.proofHandoff.backendLane}`,
    `Apply state: ${proofRoute.proofHandoff.applyState}`,
    `Readback verification: ${proofRoute.verification.verificationState}`,
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
    `Anchored proposal: ${proposalBridge.anchoredProposalId ?? "none"}`,
    `Confirmation state: ${proposalBridge.confirmationState}`,
    `Evidence source: ${proposalBridge.evidenceSource}`,
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
    "Context memory scope:",
    `memory=${surface.memory.id}; scope=product-turn; session-continuation=not-wired`,
    "",
    `Evidence markers: ${selectEvidenceMarkers(input.evidence).join(" | ")}`,
  ].join("\n");
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
    entry === "mutationAuthority=not-granted" ||
    entry === "provider-called=false" ||
    entry.startsWith("provider-called=") ||
    entry === "apply=not-run" ||
    entry === "command-dispatch=not-run"
  );
  return Array.from(new Set(selected)).slice(0, 24);
}

function shouldUseProofRuntimeOutcome(
  proofRoute: PlanningMutationProofRoute,
  proofInputs: PlanningRuntimeProductProofInputs,
): boolean {
  return (
    proofInputs.confirmationState === "trusted-confirmed" ||
    proofInputs.exactProposalState === "provided" ||
    proofInputs.controlledWorkspaceState === "trusted-controlled-temp-workspace" ||
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
    return "Review the exact proposal and provide explicit trusted confirmation for a controlled workspace.";
  }
  if (input.proofInputs.controlledWorkspaceState !== "trusted-controlled-temp-workspace") {
    return "Provide controlled temp workspace authority; production workspace writes remain disabled by default.";
  }
  return input.proofRoute.verification.nextAction;
}

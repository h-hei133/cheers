import type { PlanningRuntimeResult } from "./planningRuntime.js";
import { projectPlanningRuntimeSurface } from "./planningRuntimeSurface.js";
import {
  projectRuntimeCodingOutcome,
  type RuntimeOutcomeProjection,
} from "./runtimeOutcomeProjection.js";
import type { PlanningRuntimeProductTaskKind } from "./planningRuntimeProductRoute.js";

export function projectPlanningRuntimeProductOutcome(input: {
  readonly result: PlanningRuntimeResult;
  readonly taskKind: PlanningRuntimeProductTaskKind;
  readonly routeReason: string;
  readonly routeEvidence?: readonly string[];
  readonly productPath: "runMvpIntegratedFlow";
}): RuntimeOutcomeProjection {
  const surface = projectPlanningRuntimeSurface(input.result);
  const targetPaths = surface.editTargets.map((target) => target.path);
  const reviewOnlyReason = [
    input.routeReason,
    "Review-only planning runtime stopped before mutation; mutationAuthority=not-granted.",
  ].join(" ");
  const verificationReason =
    "Planning runtime produced verification intent only; command-dispatch=not-run.";
  const productEvidence = buildProductEvidence(input.result, input.productPath, input.routeEvidence ?? [], surface);
  const nextAction = selectNextAction(surface.enoughContext, targetPaths);

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
): string[] {
  return [
    `planning-runtime-product:path:${productPath}`,
    "planning-runtime-product:demo-success-alone:not-product-path-success",
    "planning-runtime-product:context-memory-scope:product-turn",
    "session-print:stopped-final-output:include",
    "mutationAuthority=not-granted",
    "provider-called=false",
    "apply=not-run",
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
  ];
}

function formatPlanningRuntimeProductOutput(input: {
  readonly surface: ReturnType<typeof projectPlanningRuntimeSurface>;
  readonly routeReason: string;
  readonly evidence: readonly string[];
}): string {
  const surface = input.surface;
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
    entry.startsWith("generated-edit-proposal:") ||
    entry.startsWith("edit-proposal-review:") ||
    entry.startsWith("planning-runtime-product:") ||
    entry === "mutationAuthority=not-granted" ||
    entry === "provider-called=false" ||
    entry === "apply=not-run" ||
    entry === "command-dispatch=not-run"
  );
  return Array.from(new Set(selected)).slice(0, 24);
}

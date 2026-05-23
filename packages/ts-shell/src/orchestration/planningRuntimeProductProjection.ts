import type { PlanningRuntimeResult } from "./planningRuntime.js";
import { projectPlanningRuntimeSurface } from "./planningRuntimeSurface.js";
import {
  projectRuntimeCodingOutcome,
  type RuntimeOutcomeProjection,
} from "./runtimeOutcomeProjection.js";
import type { CodingTaskKind } from "./types.js";

export function projectPlanningRuntimeProductOutcome(input: {
  readonly result: PlanningRuntimeResult;
  readonly taskKind: Extract<CodingTaskKind, "edit-file" | "write-file">;
  readonly blockedReason: string;
  readonly productPath: "runMvpIntegratedFlow";
}): RuntimeOutcomeProjection {
  const surface = projectPlanningRuntimeSurface(input.result);
  const targetPaths = surface.editTargets.map((target) => target.path);
  const reviewOnlyReason = [
    input.blockedReason,
    "Review-only planning runtime stopped before mutation; mutationAuthority=not-granted.",
  ].join(" ");
  const verificationReason =
    "Planning runtime produced verification intent only; command-dispatch=not-run.";
  const productEvidence = buildProductEvidence(input.result, input.productPath);

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
      nextAction:
        surface.enoughContext === "yes" && targetPaths.length > 0
          ? "Review the planning runtime output, then rerun with one explicit target and an exact approved edit."
          : "Provide missing facts or one explicit in-workspace target before requesting mutation.",
    },
    repairNotes: [
      input.blockedReason,
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
      blockedReason: input.blockedReason,
      evidence: productEvidence,
    }),
  });
}

function buildProductEvidence(
  result: PlanningRuntimeResult,
  productPath: "runMvpIntegratedFlow",
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
    ...result.evidence,
  ];
}

function formatPlanningRuntimeProductOutput(input: {
  readonly surface: ReturnType<typeof projectPlanningRuntimeSurface>;
  readonly blockedReason: string;
  readonly evidence: readonly string[];
}): string {
  const surface = input.surface;
  return [
    "Planning runtime: product-path review-only handoff",
    `Runtime id: ${surface.runtimeId}`,
    `Status: ${surface.status}`,
    `Context engine: ${surface.contextStatus}`,
    `Original blocker: ${input.blockedReason}`,
    "",
    "Candidates:",
    ...formatCandidates(surface.candidates),
    "",
    "Read/staged context:",
    ...formatFilesRead(surface.filesRead),
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
    `Readiness: ${surface.mutationHandoff.readiness}`,
    `Target paths: ${surface.mutationHandoff.targetPaths.join(", ") || "none"}`,
    `Reason: ${surface.mutationHandoff.reason}`,
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

function formatFilesRead(
  filesRead: ReturnType<typeof projectPlanningRuntimeSurface>["filesRead"],
): string[] {
  if (filesRead.length === 0) {
    return ["- none"];
  }
  return filesRead.map((file) =>
    `- ${file.path} source=${file.source} reason=${file.reason}`,
  );
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

function selectEvidenceMarkers(evidence: readonly string[]): readonly string[] {
  const selected = evidence.filter((entry) =>
    entry.startsWith("context-engine:") ||
    entry.startsWith("planning-runtime:") ||
    entry.startsWith("planning-runtime-product:") ||
    entry === "mutationAuthority=not-granted" ||
    entry === "provider-called=false" ||
    entry === "apply=not-run" ||
    entry === "command-dispatch=not-run"
  );
  return Array.from(new Set(selected)).slice(0, 24);
}

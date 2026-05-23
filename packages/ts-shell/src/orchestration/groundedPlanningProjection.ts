import type { ContextEngineResult } from "./contextEngine.js";

export interface GroundedPlanningProjection {
  readonly analysisSummary: string;
  readonly planSummary: string;
  readonly steps: readonly string[];
  readonly evidence: readonly string[];
}

export function buildGroundedPlanningProjection(
  context: ContextEngineResult,
): GroundedPlanningProjection {
  if (context.status === "reused-memory") {
    const target = context.memory.selectedTargetPath;
    return withEvidence({
      analysisSummary: [
        `Target ${target} is backed by fresh continuation memory ${context.memory.memoryId}.`,
        `Reused receipts=${context.memory.fileReceipts.length}; staleFiles=${context.memory.invalidation.staleFiles.length}; missingFacts=${context.memory.missingFacts.length}.`,
        `Planning warnings=${context.memory.planningWarnings.length}; mutationAuthority=not-granted.`,
      ].join(" "),
      planSummary: `Review fresh memory for ${target}, then hand off only through the existing proof-carrying mutation backend after exact proposal review.`,
      steps: [
        `Reuse fresh compact context memory for ${target}.`,
        ...context.memory.fileReceipts.slice(0, 3).map((receipt) =>
          `Check remembered evidence ${receipt.path}: ${receipt.relevance}.`,
        ),
        "Review selected edit targets before any proposal handoff.",
        "Use existing runtime permission checks for verification intent; command-dispatch remains not-run in planning.",
      ],
      evidence: [
        `grounded-planning:memory:${context.memory.memoryId}`,
        `grounded-planning:target:${target}`,
      ],
    });
  }

  if (!context.bundle) {
    return withEvidence({
      analysisSummary: [
        "No unique in-workspace target was selected from bounded repo intelligence.",
        `Missing facts: ${context.missingFacts.join("; ") || "none"}.`,
        "Planning stops before mutation handoff.",
      ].join(" "),
      planSummary: "Acquire a concrete target or narrower task wording before analysis, proposal, or mutation handoff.",
      steps: [
        "Acquire one concrete in-workspace target from the user or repo intelligence.",
        "Re-run context acquisition with a bounded candidate set.",
        "Stop before provider, command, apply, or mutation handoff until target evidence exists.",
      ],
      evidence: [
        "grounded-planning:insufficient-context",
        `grounded-planning:missing-facts:${context.missingFacts.length}`,
      ],
    });
  }

  const bundle = context.bundle;
  const target = context.selectedCandidate?.safeLabel ?? bundle.packet.targetSafeLabel;
  const candidateReasons = context.selectedCandidate?.reasons.slice(0, 4) ?? [];
  const readPaths = context.filesRead.map((file) => file.path);
  const likelyTests = bundle.codeGraphImpact.likelyTests.slice(0, 3);
  const suggestedReads = context.nextReadSuggestions.slice(0, 4);
  const missingFacts = context.missingFacts.slice(0, 4);
  const analysisSummary = [
    `Target ${target} was selected from repo intelligence${candidateReasons.length ? ` because ${candidateReasons.join(", ")}` : ""}.`,
    `Read evidence: ${readPaths.slice(0, 5).join(", ") || "none"}; contextSufficiency=${bundle.taskContextSufficiency.state}; impact=${bundle.codeGraphImpact.readiness}.`,
    `Analysis confidence=${bundle.analysisCalibration.confidence}; risk=${bundle.analysisCalibration.riskLevel}; planQuality=${bundle.planQuality.level}.`,
    missingFacts.length > 0
      ? `Missing facts blocking or downgrading handoff: ${missingFacts.join("; ")}.`
      : "No required missing facts remain for review-only planning.",
    likelyTests.length > 0
      ? `Likely verification targets: ${likelyTests.join(", ")}.`
      : "No likely verification target was proven; verification remains intent-only.",
  ].join(" ");
  const planSummary = missingFacts.length > 0
    ? `Resolve missing context for ${target}, then rebuild a review-only proposal plan.`
    : `Prepare a review-only proposal for ${target} with verification intent preserved and no mutation authority granted.`;
  const steps = [
    `Use ${target} as the primary planning target (${candidateReasons.join(", ") || "selected candidate"}).`,
    `Ground the proposal in read evidence: ${readPaths.slice(0, 4).join(", ") || "none"}.`,
    ...(likelyTests.length > 0
      ? [`Keep adjacent verification intent focused on ${likelyTests.join(", ")}; do not dispatch it in planning mode.`]
      : ["Record that verification intent needs an explicit target before dispatch."]),
    ...(suggestedReads.length > 0
      ? [`If continuing, read the next suggested context first: ${suggestedReads.join(", ")}.`]
      : []),
    "Prepare only a reviewable exact proposal or target handoff; mutationAuthority remains not-granted.",
  ];

  return withEvidence({
    analysisSummary,
    planSummary,
    steps,
    evidence: [
      `grounded-planning:target:${target}`,
      `grounded-planning:context-sufficiency:${bundle.taskContextSufficiency.state}`,
      `grounded-planning:impact:${bundle.codeGraphImpact.readiness}`,
      `grounded-planning:analysis-confidence:${bundle.analysisCalibration.confidence}`,
      `grounded-planning:plan-quality:${bundle.planQuality.level}`,
      `grounded-planning:missing-facts:${context.missingFacts.length}`,
    ],
  });
}

function withEvidence(input: GroundedPlanningProjection): GroundedPlanningProjection {
  return {
    ...input,
    evidence: [
      "grounded-planning:evidence-grounded",
      "grounded-planning:hidden-cot-excluded",
      "grounded-planning:mutation-authority:not-granted",
      "grounded-planning:provider-call:not-run",
      "grounded-planning:command-dispatch:not-run",
      ...input.evidence,
    ],
  };
}

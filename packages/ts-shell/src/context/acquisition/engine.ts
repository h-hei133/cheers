import type { ContextGraphPlanningBundle } from "./graph.js";
import type { StagedContextAcquisitionFacts } from "./graph.js";
import { buildContextGraphPlanningBundle } from "./graph.js";
import {
  buildContextWorkingMemory,
  canReuseContextMemory,
  fingerprintTask,
  type ContextWorkingMemory,
} from "../memory/model.js";
import {
  buildRepoIntelligence,
  type RepoIntelligenceCandidate,
  type RepoIntelligenceResult,
  type RepoTargetRankingAmbiguityState,
} from "../discovery/scan.js";
import type { CodingTaskKind } from "../../orchestration/types.js";
import type { WorkflowTaskPlan } from "../../orchestration/workflowTaskPlanner.js";

export type ContextEngineTaskKindHint = Extract<
  CodingTaskKind,
  "edit-file" | "write-file" | "read-file" | "inspect-files" | "repo-explain"
>;

export interface ContextEngineResult {
  readonly engineId: string;
  readonly status:
    | "context-built"
    | "reused-memory"
    | "insufficient-context"
    | "ambiguous-context";
  readonly userTask: string;
  readonly repo: RepoIntelligenceResult;
  readonly selectedCandidate?: RepoIntelligenceCandidate;
  readonly discoveryHandoff: ContextDiscoveryHandoffFacts;
  readonly contextAcquisitionHandoff?: StagedContextAcquisitionFacts;
  readonly workflowPlan: WorkflowTaskPlan;
  readonly bundle?: ContextGraphPlanningBundle;
  readonly memory: ContextWorkingMemory;
  readonly filesRead: readonly {
    readonly path: string;
    readonly reason: string;
    readonly source: "repo-intelligence" | "context-graph" | "memory";
  }[];
  readonly contextBudget: {
    readonly candidateFiles: number;
    readonly filesRead: number;
    readonly bytesUsed: number;
    readonly cacheStatus: "disabled" | "enabled-not-used";
  };
  readonly missingFacts: readonly string[];
  readonly nextReadSuggestions: readonly string[];
  readonly evidence: readonly string[];
}

export interface ContextDiscoveryHandoffFacts {
  readonly handoffId: string;
  readonly selectedCandidateIds: readonly string[];
  readonly competingCandidateIds: readonly string[];
  readonly omittedCandidateFacts: readonly string[];
  readonly ambiguityState: RepoTargetRankingAmbiguityState;
  readonly ownerNarrowingSuggestions: readonly string[];
  readonly ownerNarrowingAction: {
    readonly kind: "read-candidate-owner" | "select-owner" | "expand-owner-search";
    readonly target?: string;
    readonly reason: string;
  };
  readonly missingDiscoveryFacts: readonly string[];
  readonly scanProfileId: string;
  readonly targetRankingEvidenceId: string;
  readonly rawContentExcluded: true;
  readonly notProvenClaims: readonly string[];
}

export async function runContextEngine(input: {
  readonly workspaceRoot: string;
  readonly userTask: string;
  readonly previousMemory?: ContextWorkingMemory;
  readonly maxRepoFiles?: number;
  readonly maxCandidates?: number;
  readonly taskKindHint?: ContextEngineTaskKindHint;
  readonly cache?: { readonly enabled: boolean };
}): Promise<ContextEngineResult> {
  const repo = await buildRepoIntelligence({
    workspaceRoot: input.workspaceRoot,
    userTask: input.userTask,
    maxFiles: input.maxRepoFiles,
    maxCandidates: input.maxCandidates,
    cache: input.cache,
  });
  const reuse = await canReuseContextMemory({
    workspaceRoot: input.workspaceRoot,
    userTask: input.userTask,
    currentRepoSnapshotId: repo.snapshot.snapshotId,
    currentRepoFileLabels: repo.snapshot.files.map((file) => file.safeLabel),
    memory: input.previousMemory,
  });
  const discoveryHandoff = buildDiscoveryHandoff(repo);
  if (reuse.reusable) {
    return {
      engineId: `context_engine_${reuse.memory.memoryId}`,
      status: "reused-memory",
      userTask: input.userTask,
      repo,
      selectedCandidate: repo.candidates.find((candidate) => candidate.safeLabel === reuse.memory.selectedTargetPath),
      discoveryHandoff,
      workflowPlan: buildWorkflowPlan({
        userTask: input.userTask,
        targetPath: reuse.memory.selectedTargetPath,
        hasTarget: true,
        taskKindHint: input.taskKindHint,
      }),
      memory: reuse.memory,
      filesRead: reuse.memory.fileReceipts.map((receipt) => ({
        path: receipt.path,
        reason: receipt.relevance,
        source: "memory" as const,
      })),
      contextBudget: {
        candidateFiles: repo.candidates.length,
        filesRead: 0,
        bytesUsed: 0,
        cacheStatus: repo.snapshot.cacheStatus,
      },
      missingFacts: [
        ...repo.missingFacts,
        ...reuse.memory.missingFacts,
      ],
      nextReadSuggestions: [
        ...repo.nextReadSuggestions,
        ...reuse.discoveryHandoff.nextReadSuggestions,
      ],
      evidence: [
        ...repo.evidence,
        ...reuse.evidence,
        `context-memory-reuse:eligibility:${reuse.eligibility.status}`,
        `context-memory-reuse:discovery-handoff:${reuse.discoveryHandoff.handoffId}`,
        `context-memory-reuse:planning-handoff:${reuse.planningHandoff.handoffId}`,
        `context-engine:discovery-handoff:${discoveryHandoff.handoffId}`,
        "context-engine:status:reused-memory",
        "context-engine:mutation-authority:not-granted",
      ],
    };
  }

  const selectedCandidate = repo.candidates[0];
  if (!selectedCandidate) {
    const missReason = "reason" in reuse ? reuse.reason : "unexpected reusable memory state";
    const workflowPlan = buildWorkflowPlan({
      userTask: input.userTask,
      hasTarget: false,
      taskKindHint: input.taskKindHint,
    });
    const memory = buildInsufficientMemory({
      userTask: input.userTask,
      repo,
      reason: missReason,
    });
    return {
      engineId: `context_engine_${memory.memoryId}`,
      status: "insufficient-context",
      userTask: input.userTask,
      repo,
      discoveryHandoff,
      workflowPlan,
      memory,
      filesRead: [],
      contextBudget: {
        candidateFiles: 0,
        filesRead: 0,
        bytesUsed: 0,
        cacheStatus: repo.snapshot.cacheStatus,
      },
      missingFacts: [
        ...repo.missingFacts,
        "no selected target for context graph planning",
      ],
      nextReadSuggestions: [
        ...repo.nextReadSuggestions,
        ...(reuse.discoveryHandoff?.nextReadSuggestions ?? []),
      ],
      evidence: [
        ...repo.evidence,
        ...reuse.evidence,
        `context-memory-reuse:eligibility:${reuse.eligibility.status}`,
        ...(reuse.discoveryHandoff
          ? [`context-memory-reuse:discovery-handoff:${reuse.discoveryHandoff.handoffId}`]
          : []),
        ...(reuse.planningHandoff
          ? [`context-memory-reuse:planning-handoff:${reuse.planningHandoff.handoffId}`]
          : []),
        `context-engine:discovery-handoff:${discoveryHandoff.handoffId}`,
        "context-engine:status:insufficient-context",
        "context-engine:mutation-authority:not-granted",
      ],
    };
  }

  if (
    repo.targetRanking.ambiguityState === "multiple-plausible-candidates" &&
    shouldHoldForTargetDisambiguation(selectedCandidate)
  ) {
    const workflowPlan = buildWorkflowPlan({
      userTask: input.userTask,
      targetPath: selectedCandidate.path,
      hasTarget: true,
      taskKindHint: input.taskKindHint,
      blockedReason: "Multiple plausible in-workspace targets need disambiguation before staged context reads.",
    });
    const memory = buildInsufficientMemory({
      userTask: input.userTask,
      repo,
      reason: "multiple plausible context targets",
      candidateFiles: repo.candidates.slice(0, 4).map((candidate) => candidate.safeLabel),
      selectedTargetPath: selectedCandidate.safeLabel,
      missingFacts: [
        ...repo.missingFacts,
        "ambiguous candidate set",
        "target family uncertainty",
      ],
      nextReadSuggestions: repo.candidates.slice(0, 4).map((candidate) => candidate.safeLabel),
      targetStatusMissingFact: "no confirmed target for context graph planning",
    });
    return {
      engineId: `context_engine_${memory.memoryId}`,
      status: "ambiguous-context",
      userTask: input.userTask,
      repo,
      selectedCandidate,
      discoveryHandoff,
      workflowPlan,
      memory,
      filesRead: [],
      contextBudget: {
        candidateFiles: repo.candidates.length,
        filesRead: 0,
        bytesUsed: 0,
        cacheStatus: repo.snapshot.cacheStatus,
      },
      missingFacts: memory.missingFacts,
      nextReadSuggestions: [
        ...repo.nextReadSuggestions,
        ...memory.discoveryHandoff.nextReadSuggestions,
      ],
      evidence: [
        ...repo.evidence,
        ...reuse.evidence,
        `context-memory-reuse:eligibility:${reuse.eligibility.status}`,
        ...(reuse.discoveryHandoff
          ? [`context-memory-reuse:discovery-handoff:${reuse.discoveryHandoff.handoffId}`]
          : []),
        ...(reuse.planningHandoff
          ? [`context-memory-reuse:planning-handoff:${reuse.planningHandoff.handoffId}`]
          : []),
        `context-engine:discovery-handoff:${discoveryHandoff.handoffId}`,
        "context-engine:status:ambiguous-context",
        "context-engine:ambiguity:multiple-plausible-candidates",
        "context-engine:mutation-authority:not-granted",
      ],
    };
  }

  const workflowPlan = buildWorkflowPlan({
    userTask: input.userTask,
    targetPath: selectedCandidate.path,
    hasTarget: true,
    taskKindHint: input.taskKindHint,
  });
  const bundle = await buildContextGraphPlanningBundle({
    workspaceRoot: input.workspaceRoot,
    targetPath: selectedCandidate.path,
    workflowPlan,
  });
  const memory = await buildContextWorkingMemory({
    workspaceRoot: input.workspaceRoot,
    userTask: input.userTask,
    repo,
    bundle,
  });

  return {
    engineId: `context_engine_${memory.memoryId}`,
    status: "context-built",
    userTask: input.userTask,
    repo,
    selectedCandidate,
    discoveryHandoff,
    workflowPlan,
    bundle,
    memory,
    contextAcquisitionHandoff: bundle.stagedContextAcquisition,
    filesRead: bundle.packet.selectedCandidateSummaries.map((summary) => ({
      path: summary.pathLabel,
      reason: summary.relation,
      source: summary.kind === "target-file-summary" ? "repo-intelligence" : "context-graph",
    })),
    contextBudget: {
      candidateFiles: repo.candidates.length,
      filesRead: bundle.packet.readBudget.filesRead,
      bytesUsed: bundle.packet.readBudget.bytesUsed,
      cacheStatus: repo.snapshot.cacheStatus,
    },
    missingFacts: [
      ...repo.missingFacts,
      ...bundle.taskContextSufficiency.missingRequiredFacts,
      ...bundle.analysisCalibration.missingFacts,
    ],
    nextReadSuggestions: [
      ...repo.nextReadSuggestions,
      ...bundle.taskContextAcquisition.suggestedReads,
    ],
    evidence: [
      ...repo.evidence,
      ...reuse.evidence,
      `context-memory-reuse:eligibility:${reuse.eligibility.status}`,
      ...(reuse.discoveryHandoff
        ? [`context-memory-reuse:discovery-handoff:${reuse.discoveryHandoff.handoffId}`]
        : []),
      ...(reuse.planningHandoff
        ? [`context-memory-reuse:planning-handoff:${reuse.planningHandoff.handoffId}`]
        : []),
      `context-engine:discovery-handoff:${discoveryHandoff.handoffId}`,
      `context-engine:context-acquisition-handoff:${bundle.stagedContextAcquisition.acquisitionFactsId}`,
      ...bundle.stagedContextAcquisition.evidence,
      ...memory.evidence,
      ...bundle.taskContextAcquisition.evidence,
      ...bundle.taskContextSufficiency.evidence,
      "context-engine:status:context-built",
      "context-engine:mutation-authority:not-granted",
    ],
  };
}

function buildDiscoveryHandoff(repo: RepoIntelligenceResult): ContextDiscoveryHandoffFacts {
  const ownerNarrowingSuggestions = repo.candidates.slice(0, 4).map((candidate, index) =>
    `${index + 1}:${candidate.safeLabel}`
  );
  const ownerNarrowingAction =
    repo.targetRanking.ambiguityState === "unambiguous-top-candidate" && repo.candidates[0]
      ? {
          kind: "select-owner" as const,
          target: repo.candidates[0].safeLabel,
          reason: "Use the highest-ranked owner candidate for the next planning step.",
        }
      : ownerNarrowingSuggestions.length > 0
        ? {
            kind: "read-candidate-owner" as const,
            ...(repo.candidates[0]?.safeLabel ? { target: repo.candidates[0].safeLabel } : {}),
            reason: "Read the highest-ranked candidate before selecting an owner.",
          }
        : {
            kind: "expand-owner-search" as const,
            reason: "No owner candidate is strong enough; gather additional repository facts.",
          };
  return {
    handoffId: `context_discovery_handoff_${repo.targetRanking.rankingId.replace(/^target_ranking_/, "")}`,
    selectedCandidateIds: repo.targetRanking.selectedCandidateId
      ? [repo.targetRanking.selectedCandidateId]
      : [],
    competingCandidateIds: repo.targetRanking.competingCandidateIds,
    omittedCandidateFacts: repo.snapshot.candidateOmissions.map((omission) =>
      `${omission.reason}:${omission.count}`
    ),
    ambiguityState: repo.targetRanking.ambiguityState,
    ownerNarrowingSuggestions,
    ownerNarrowingAction,
    missingDiscoveryFacts: repo.targetRanking.missingDiscoveryFacts,
    scanProfileId: repo.snapshot.scanProfile.profileId,
    targetRankingEvidenceId: repo.targetRanking.rankingId,
    rawContentExcluded: repo.snapshot.scanProfile.rawContentExcluded,
    notProvenClaims: [
      "candidate-to-context-handoff-is-not-edit-authority",
      "context-found-is-not-enough-context",
      "selected-candidate-is-not-correct-target",
      ...repo.targetRanking.notProvenClaims,
    ],
  };
}

function shouldHoldForTargetDisambiguation(
  selectedCandidate: RepoIntelligenceResult["candidates"][number],
): boolean {
  return selectedCandidate.testAdjacencyHints.length === 0;
}

function buildWorkflowPlan(input: {
  readonly userTask: string;
  readonly targetPath?: string;
  readonly hasTarget: boolean;
  readonly taskKindHint?: ContextEngineTaskKindHint;
  readonly blockedReason?: string;
}): WorkflowTaskPlan {
  const lower = input.userTask.toLowerCase();
  const taskKind = input.taskKindHint ?? inferTaskKind(lower);
  return {
    taskKind,
    reason: input.userTask,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    contextPlanningRequested: true,
    contextPlanningReason: input.hasTarget ? "explicit-context-packet" : "missing-edit-context",
    inspectFirst: taskKind !== "run-command" && taskKind !== "write-file",
    verifyAfterEdit: taskKind === "edit-file" ||
      taskKind === "write-file" ||
      /\b(test|verify|regression)\b/.test(lower),
    ...(input.blockedReason ? { blockedReason: input.blockedReason } : {}),
    ...(input.hasTarget ? {} : { targetMissing: true, blockedReason: "No likely in-workspace target found for vague task." }),
  };
}

function inferTaskKind(lowerTask: string): WorkflowTaskPlan["taskKind"] {
  if (/\b(edit|change|update|fix|implement|add|remove|rename)\b/.test(lowerTask)) {
    return "edit-file";
  }
  if (/\b(test|verify|run)\b/.test(lowerTask)) {
    return "run-command";
  }
  return "repo-explain";
}

function buildInsufficientMemory(input: {
  readonly userTask: string;
  readonly repo: RepoIntelligenceResult;
  readonly reason: string;
  readonly candidateFiles?: readonly string[];
  readonly selectedTargetPath?: string;
  readonly missingFacts?: readonly string[];
  readonly nextReadSuggestions?: readonly string[];
  readonly targetStatusMissingFact?: string;
}): ContextWorkingMemory {
  const memoryId = `ctx_mem_insufficient_${input.repo.snapshot.snapshotId}`;
  const invalidation = {
    invalidationId: `context-memory-invalidation:${memoryId}`,
    policy: "stat-size-mtime" as const,
    staleFiles: [],
    invalidationSignals: ["missing-selected-target"],
    missingFreshnessEvidence: ["no context receipts available"],
    invalidated: true,
    nextReadSuggestions: input.nextReadSuggestions ?? ["rerun discovery with an explicit target or symbol"],
    notProvenClaims: [
      "memory-exists-is-not-fresh-context",
      "memory-reused-is-not-enough-context",
      "refresh-suggested-is-not-completed-read",
    ],
  };
  const recordFacts = {
    recordId: `context-memory-record:${memoryId}`,
    memoryId,
    sourceTurnOrLabel: "context-engine-insufficient-context",
    sourceCandidateIds: [],
    sourceContextPacketIds: [],
    sourcePlanningIds: [],
    createdPhase: "context-memory",
    intendedReuseScope: "not-reusable-without-discovery-refresh",
    freshnessEvidence: [],
    stalenessEvidence: invalidation.invalidationSignals,
    invalidationState: invalidation,
    redactionState: "report-safe" as const,
    notProvenClaims: [
      "memory-record-exists-is-not-fresh-context",
      "memory-record-exists-is-not-task-success",
      "memory-record-excludes-raw-transcript-and-file-content",
    ],
  };
  const reuseEligibility = {
    eligibilityId: `context-memory-reuse:${memoryId}`,
    status: "unsupported" as const,
    reason: input.reason,
    matchingTaskFacts: [],
    matchingTargetFacts: [],
    matchingWorkspaceFacts: [`repoSnapshotId=${input.repo.snapshot.snapshotId}`],
    freshnessRequirement: "unsupported" as const,
    missingFacts: ["selected target", "context packet"],
    requiredRefreshSuggestions: input.nextReadSuggestions ?? ["rerun bounded discovery and staged reads"],
    optionalRefreshSuggestions: [],
    notProvenClaims: [
      "reuse-eligible-is-not-fresh-context",
      "memory-reused-is-not-enough-context",
      "reuse-eligible-is-not-task-success",
    ],
  };
  const discoveryHandoff = {
    handoffId: `context-memory-discovery-handoff:${memoryId}`,
    reusedCandidateIds: [],
    candidateFreshnessState: "unsupported" as const,
    reusedContextPacketIds: [],
    contextPacketFreshnessState: "unsupported" as const,
    stalePacketsExcluded: [],
    requiredRefreshCandidates: reuseEligibility.requiredRefreshSuggestions,
    optionalRefreshCandidates: [],
    discoveryFactsToRerun: ["target-ranking", "candidate-freshness"],
    stagedReadsToRerun: ["missing-context-packets"],
    nextReadSuggestions: reuseEligibility.requiredRefreshSuggestions,
    notProvenClaims: [
      "memory-handoff-is-not-fresh-discovery",
      "required-refresh-cannot-be-bypassed-by-memory",
      "next-read-suggestion-is-not-completed-read",
    ],
  };
  const planningHandoff = {
    handoffId: `context-memory-planning-handoff:${memoryId}`,
    reusedPlanningQualityIds: [],
    assumptionsRemainValid: [],
    assumptionsRequiringRefresh: reuseEligibility.requiredRefreshSuggestions,
    constraintsRemainActive: ["mutationAuthority=not-granted", "verificationIntent=selected-not-run"],
    replaySafePlanStepIds: [],
    editHandoffFreshnessState: "unsupported" as const,
    verificationHandoffFreshnessState: "unsupported" as const,
    unsupportedOrStalePlanningReasons: invalidation.invalidationSignals,
    replaySafePlanningState: {
      replayStateId: `replay-safe-planning-state:${memoryId}`,
      taskIntentSummary: input.userTask.replace(/\s+/g, " ").trim().slice(0, 160),
      discoveryHandoffIds: [],
      stagedContextIds: [],
      contextSufficiencyStatus: "unsupported",
      planningQualityIds: [],
      assumptionsAndConstraints: ["mutationAuthority=not-granted", "verificationIntent=selected-not-run"],
      editHandoffIds: [],
      verificationHandoffIds: [],
      staleInvalidationFacts: invalidation.invalidationSignals,
      continuationReadiness: "requires-refresh" as const,
      notProvenClaims: [
        "replay-state-available-is-not-plan-validity",
        "replayed-edit-handoff-is-not-mutation-authority",
        "replayed-verification-intent-is-not-verification-passed",
      ],
    },
    notProvenClaims: [
      "replayed-plan-is-not-executable-work",
      "replayed-edit-handoff-is-not-mutation-authority",
      "replayed-verification-intent-is-not-verification-passed",
    ],
  };
  return {
    memoryId,
    taskFingerprint: fingerprintTask(input.userTask),
    repoSnapshotId: input.repo.snapshot.snapshotId,
    selectedTargetPath: input.selectedTargetPath ?? "(none)",
    candidateFiles: [...(input.candidateFiles ?? [])],
    fileReceipts: [],
    compactSummary: `insufficient-context; reason=${input.reason}; candidates=${input.candidateFiles?.length ?? 0}`,
    missingFacts: [
      ...input.repo.missingFacts,
      ...(input.missingFacts ?? []),
      input.targetStatusMissingFact ?? "no selected target for context graph planning",
    ],
    planningWarnings: [],
    planQualityLevel: "unsupported",
    contextSufficiencyState: "unsupported",
    editTargetRationale: [],
    verificationIntent: [],
    handoffSummary: "handoff=blocked-before-mutation-runtime; mutationAuthority=not-granted",
    invalidation,
    recordFacts,
    reuseEligibility,
    discoveryHandoff,
    planningHandoff,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    evidence: [
      `context-memory:id:${memoryId}`,
      "context-memory:insufficient-context",
      "context-memory:mutation-authority:not-granted",
    ],
  };
}

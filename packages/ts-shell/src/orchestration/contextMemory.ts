import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { ContextGraphPlanningBundle } from "./contextGraphPlanning.js";
import type { RepoIntelligenceResult } from "./repoIntelligence.js";

export interface ContextMemoryFileReceipt {
  readonly path: string;
  readonly sizeBytes: number;
  readonly mtimeMs: number;
  readonly summary: string;
  readonly relevance: string;
}

export type ContextMemoryReuseEligibilityStatus =
  | "reusable"
  | "reusable_with_required_refresh"
  | "reusable_with_optional_refresh"
  | "stale"
  | "invalidated"
  | "workspace_mismatch"
  | "task_mismatch"
  | "target_mismatch"
  | "missing_freshness_evidence"
  | "unsupported";

export interface ContextMemoryStaleInvalidationFacts {
  readonly invalidationId: string;
  readonly policy: "stat-size-mtime";
  readonly staleFiles: readonly string[];
  readonly invalidationSignals: readonly string[];
  readonly missingFreshnessEvidence: readonly string[];
  readonly invalidated: boolean;
  readonly nextReadSuggestions: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface ContextMemoryRecordFacts {
  readonly recordId: string;
  readonly memoryId: string;
  readonly sourceTurnOrLabel: string;
  readonly sourceCandidateIds: readonly string[];
  readonly sourceContextPacketIds: readonly string[];
  readonly sourcePlanningIds: readonly string[];
  readonly sourceSessionPathOrContinuationId?: string;
  readonly createdPhase: string;
  readonly intendedReuseScope: string;
  readonly freshnessEvidence: readonly string[];
  readonly stalenessEvidence: readonly string[];
  readonly invalidationState: ContextMemoryStaleInvalidationFacts;
  readonly redactionState: "report-safe";
  readonly notProvenClaims: readonly string[];
}

export interface ContextMemoryReuseEligibilityFacts {
  readonly eligibilityId: string;
  readonly status: ContextMemoryReuseEligibilityStatus;
  readonly reason: string;
  readonly matchingTaskFacts: readonly string[];
  readonly matchingTargetFacts: readonly string[];
  readonly matchingWorkspaceFacts: readonly string[];
  readonly freshnessRequirement: "fresh-receipts-required" | "refresh-required" | "unsupported";
  readonly missingFacts: readonly string[];
  readonly requiredRefreshSuggestions: readonly string[];
  readonly optionalRefreshSuggestions: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface ContextMemoryDiscoveryHandoffFacts {
  readonly handoffId: string;
  readonly reusedCandidateIds: readonly string[];
  readonly candidateFreshnessState: ContextMemoryReuseEligibilityStatus;
  readonly reusedContextPacketIds: readonly string[];
  readonly contextPacketFreshnessState: ContextMemoryReuseEligibilityStatus;
  readonly stalePacketsExcluded: readonly string[];
  readonly requiredRefreshCandidates: readonly string[];
  readonly optionalRefreshCandidates: readonly string[];
  readonly discoveryFactsToRerun: readonly string[];
  readonly stagedReadsToRerun: readonly string[];
  readonly nextReadSuggestions: readonly string[];
  readonly notProvenClaims: readonly string[];
}

export interface ReplaySafePlanningStateFacts {
  readonly replayStateId: string;
  readonly taskIntentSummary: string;
  readonly discoveryHandoffIds: readonly string[];
  readonly stagedContextIds: readonly string[];
  readonly contextSufficiencyStatus: string;
  readonly planningQualityIds: readonly string[];
  readonly assumptionsAndConstraints: readonly string[];
  readonly editHandoffIds: readonly string[];
  readonly verificationHandoffIds: readonly string[];
  readonly staleInvalidationFacts: readonly string[];
  readonly continuationReadiness: "not-evaluated" | "requires-refresh" | "review-only";
  readonly notProvenClaims: readonly string[];
}

export interface ContextMemoryPlanningHandoffFacts {
  readonly handoffId: string;
  readonly reusedPlanningQualityIds: readonly string[];
  readonly assumptionsRemainValid: readonly string[];
  readonly assumptionsRequiringRefresh: readonly string[];
  readonly constraintsRemainActive: readonly string[];
  readonly replaySafePlanStepIds: readonly string[];
  readonly editHandoffFreshnessState: ContextMemoryReuseEligibilityStatus;
  readonly verificationHandoffFreshnessState: ContextMemoryReuseEligibilityStatus;
  readonly unsupportedOrStalePlanningReasons: readonly string[];
  readonly replaySafePlanningState: ReplaySafePlanningStateFacts;
  readonly notProvenClaims: readonly string[];
}

export interface ContextWorkingMemory {
  readonly memoryId: string;
  readonly taskFingerprint: string;
  readonly repoSnapshotId: string;
  readonly selectedTargetPath: string;
  readonly candidateFiles: readonly string[];
  readonly fileReceipts: readonly ContextMemoryFileReceipt[];
  readonly compactSummary: string;
  readonly missingFacts: readonly string[];
  readonly planningWarnings: readonly string[];
  readonly planQualityLevel?: string;
  readonly contextSufficiencyState?: string;
  readonly editTargetRationale: readonly string[];
  readonly verificationIntent: readonly string[];
  readonly handoffSummary: string;
  readonly invalidation: ContextMemoryStaleInvalidationFacts;
  readonly recordFacts: ContextMemoryRecordFacts;
  readonly reuseEligibility: ContextMemoryReuseEligibilityFacts;
  readonly discoveryHandoff: ContextMemoryDiscoveryHandoffFacts;
  readonly planningHandoff: ContextMemoryPlanningHandoffFacts;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly mutationAuthority: "not-granted";
  readonly evidence: readonly string[];
}

export async function buildContextWorkingMemory(input: {
  readonly workspaceRoot: string;
  readonly userTask: string;
  readonly repo: RepoIntelligenceResult;
  readonly bundle: ContextGraphPlanningBundle;
}): Promise<ContextWorkingMemory> {
  const candidateFiles = input.repo.candidates.map((candidate) => candidate.safeLabel);
  const selectedTargetPath = input.bundle.packet.rootTargetFile;
  const sourceLabels = input.bundle.packet.selectedCandidateSummaries.map((summary) => summary.pathLabel);
  const fileReceipts = await Promise.all(
    sourceLabels.map(async (label) => {
      const stat = await statRelative(input.workspaceRoot, label);
      const source = input.bundle.packet.selectedCandidateSummaries.find((summary) => summary.pathLabel === label);
      return {
        path: label,
        sizeBytes: stat.sizeBytes,
        mtimeMs: stat.mtimeMs,
        summary: source?.summary ?? "summary unavailable",
        relevance: source?.relation ?? "selected context",
      };
    }),
  );
  const taskFingerprint = fingerprintTask(input.userTask);
  const invalidation = await evaluateContextMemoryFreshness({
    workspaceRoot: input.workspaceRoot,
    memory: {
      fileReceipts,
    },
  });
  const editTargetRationale = [
    `${selectedTargetPath}: selected from repo intelligence and context graph root target`,
    ...input.bundle.codeGraphImpact.likelyTests.slice(0, 3).map((test) => `${test}: adjacent verification target`),
  ];
  const verificationIntent = [
    ...input.bundle.codeGraphImpact.suggestedVerification,
    ...input.bundle.testImpact.likelyVerificationCommandCandidates
      .filter((candidate) => candidate.readiness === "ready")
      .map((candidate) => candidate.command),
  ].slice(0, 5);
  const missingFacts = buildBlockingFacts(input.bundle);
  const planningWarnings = buildPlanningWarnings(input.bundle, missingFacts);
  const compactSummary = [
    `task=${input.userTask.replace(/\s+/g, " ").trim().slice(0, 160)}`,
    `target=${selectedTargetPath}`,
    `candidates=${candidateFiles.slice(0, 5).join(",") || "(none)"}`,
    `context=${fileReceipts.map((receipt) => receipt.path).slice(0, 6).join(",") || "(none)"}`,
    `analysis=${input.bundle.analysisBrief.recommendedStrategy}`,
    `planQuality=${input.bundle.planQuality.level}`,
    `missingFacts=${missingFacts.length}`,
    `warnings=${planningWarnings.length}`,
  ].join("; ");
  const handoffSummary = [
    `agentPlan=${input.bundle.agentPlan.planId}`,
    `executionPlan=${input.bundle.taskExecutionPlan.executionPlanId}`,
    `target=${selectedTargetPath}`,
    `mutationAuthority=not-granted`,
    "handoff=existing-proof-carrying-mutation-runtime-after-review",
  ].join("; ");
  const memoryId = `ctx_mem_${hash({
    taskFingerprint,
    repoSnapshotId: input.repo.snapshot.snapshotId,
    selectedTargetPath,
    receipts: fileReceipts.map((receipt) => [receipt.path, receipt.sizeBytes, receipt.mtimeMs]),
  })}`;
  const sourceCandidateIds = input.repo.candidates.map((candidate) => candidate.candidateId);
  const sourceContextPacketIds = [
    input.bundle.packet.packetId,
    input.bundle.stagedContextAcquisition.acquisitionFactsId,
  ];
  const sourcePlanningIds = [
    input.bundle.agentPlan.planId,
    input.bundle.taskExecutionPlan.executionPlanId,
    input.bundle.planQuality.qualityId,
  ];
  const recordFacts = buildContextMemoryRecordFacts({
    memoryId,
    sourceTurnOrLabel: "context-engine-current-turn",
    sourceCandidateIds,
    sourceContextPacketIds,
    sourcePlanningIds,
    createdPhase: "context-memory",
    intendedReuseScope: "same-task-same-workspace-review-only-planning",
    invalidation,
  });
  const reuseEligibility = buildReuseEligibilityFacts({
    memoryId,
    status: missingFacts.length > 0 ? "reusable_with_required_refresh" : "reusable_with_optional_refresh",
    reason: missingFacts.length > 0
      ? "memory was created with required missing facts"
      : "memory record is current-turn only and may be reused after freshness check",
    matchingTaskFacts: [`taskFingerprint=${taskFingerprint}`],
    matchingTargetFacts: [`selectedTargetPath=${selectedTargetPath}`],
    matchingWorkspaceFacts: [`repoSnapshotId=${input.repo.snapshot.snapshotId}`],
    missingFacts,
    requiredRefreshSuggestions: missingFacts.map((fact) => `refresh required fact: ${fact}`),
    optionalRefreshSuggestions: planningWarnings.map((warning) => `refresh optional planning warning: ${warning}`),
  });
  const discoveryHandoff = buildMemoryDiscoveryHandoff({
    memoryId,
    status: reuseEligibility.status,
    candidateIds: sourceCandidateIds,
    contextPacketIds: sourceContextPacketIds,
    stalePackets: invalidation.staleFiles,
    requiredRefresh: reuseEligibility.requiredRefreshSuggestions,
    optionalRefresh: reuseEligibility.optionalRefreshSuggestions,
  });
  const planningHandoff = buildMemoryPlanningHandoff({
    memoryId,
    status: reuseEligibility.status,
    planningQualityIds: [input.bundle.planQuality.qualityId],
    replaySafePlanStepIds: [input.bundle.agentPlan.planId],
    assumptionsRemainValid: [`target=${selectedTargetPath}`],
    assumptionsRequiringRefresh: missingFacts,
    constraintsRemainActive: ["mutationAuthority=not-granted", "verificationIntent=selected-not-run"],
    staleReasons: invalidation.staleFiles,
    replayState: {
      taskIntentSummary: input.userTask.replace(/\s+/g, " ").trim().slice(0, 160),
      discoveryHandoffIds: [input.repo.targetRanking.rankingId],
      stagedContextIds: sourceContextPacketIds,
      contextSufficiencyStatus: input.bundle.taskContextSufficiency.state,
      planningQualityIds: [input.bundle.planQuality.qualityId],
      assumptionsAndConstraints: [
        `target=${selectedTargetPath}`,
        "mutationAuthority=not-granted",
        "verificationIntent=selected-not-run",
      ],
      editHandoffIds: [],
      verificationHandoffIds: [],
      staleInvalidationFacts: invalidation.invalidationSignals ?? [],
      continuationReadiness: missingFacts.length > 0 ? "requires-refresh" : "review-only",
    },
  });

  return {
    memoryId,
    taskFingerprint,
    repoSnapshotId: input.repo.snapshot.snapshotId,
    selectedTargetPath,
    candidateFiles,
    fileReceipts,
    compactSummary,
    missingFacts,
    planningWarnings,
    planQualityLevel: input.bundle.planQuality.level,
    contextSufficiencyState: input.bundle.taskContextSufficiency.state,
    editTargetRationale,
    verificationIntent: Array.from(new Set(verificationIntent)),
    handoffSummary,
    invalidation,
    recordFacts,
    reuseEligibility,
    discoveryHandoff,
    planningHandoff,
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    evidence: [
      `context-memory:id:${memoryId}`,
      `context-memory:task:${taskFingerprint}`,
      `context-memory:repo-snapshot:${input.repo.snapshot.snapshotId}`,
      `context-memory:target:${selectedTargetPath}`,
      `context-memory:receipts:${fileReceipts.length}`,
      `context-memory:missing-facts:${missingFacts.length}`,
      `context-memory:warnings:${planningWarnings.length}`,
      `context-memory:plan-quality:${input.bundle.planQuality.level}`,
      `context-memory:stale-files:${invalidation.staleFiles.length}`,
      `context-memory:record:${recordFacts.recordId}`,
      `context-memory:reuse-eligibility:${reuseEligibility.status}`,
      `context-memory:discovery-handoff:${discoveryHandoff.handoffId}`,
      `context-memory:planning-handoff:${planningHandoff.handoffId}`,
      "context-memory:policy:stat-size-mtime",
      "context-memory:mutation-authority:not-granted",
      "context-memory:raw-content-excluded",
    ],
  };
}

function buildBlockingFacts(bundle: ContextGraphPlanningBundle): readonly string[] {
  const sufficiencyState = bundle.taskContextSufficiency.state;
  const calibrationReadiness = bundle.analysisCalibration.readiness;
  const stateBlocks = sufficiencyState === "needs-required-context" ||
    sufficiencyState === "stale-context" ||
    sufficiencyState === "budget-limited" ||
    sufficiencyState === "unsupported";
  const calibrationBlocks = calibrationReadiness === "missing-facts" ||
    calibrationReadiness === "stale-context" ||
    calibrationReadiness === "unsupported";
  return unique([
    ...bundle.taskContextSufficiency.missingRequiredFacts,
    ...(stateBlocks ? [bundle.taskContextSufficiency.readinessDowngrade] : []),
    ...(calibrationBlocks ? bundle.analysisCalibration.missingFacts : []),
  ]);
}

function buildPlanningWarnings(
  bundle: ContextGraphPlanningBundle,
  blockingFacts: readonly string[],
): readonly string[] {
  const blocking = new Set(blockingFacts);
  return unique([
    ...bundle.planQuality.missingFacts,
    ...bundle.taskContextSufficiency.missingOptionalFacts,
    ...bundle.taskContextSufficiency.omittedReasons,
    ...(bundle.taskContextSufficiency.state === "needs-optional-context" ||
      bundle.taskContextSufficiency.state === "low-confidence"
      ? [bundle.taskContextSufficiency.readinessDowngrade]
      : []),
    ...(bundle.analysisQualityGate.allowed ? [] : [bundle.analysisQualityGate.reason]),
  ]).filter((warning) => !blocking.has(warning));
}

export async function canReuseContextMemory(input: {
  readonly workspaceRoot: string;
  readonly userTask: string;
  readonly currentRepoSnapshotId?: string;
  readonly currentRepoFileLabels?: readonly string[];
  readonly memory?: ContextWorkingMemory;
}): Promise<
  | {
    readonly reusable: true;
    readonly memory: ContextWorkingMemory;
    readonly eligibility: ContextMemoryReuseEligibilityFacts;
    readonly discoveryHandoff: ContextMemoryDiscoveryHandoffFacts;
    readonly planningHandoff: ContextMemoryPlanningHandoffFacts;
    readonly evidence: readonly string[];
  }
  | {
    readonly reusable: false;
    readonly reason: string;
    readonly eligibility: ContextMemoryReuseEligibilityFacts;
    readonly discoveryHandoff?: ContextMemoryDiscoveryHandoffFacts;
    readonly planningHandoff?: ContextMemoryPlanningHandoffFacts;
    readonly evidence: readonly string[];
  }
> {
  if (!input.memory) {
    const eligibility = buildReuseEligibilityFacts({
      memoryId: "none",
      status: "unsupported",
      reason: "no previous context memory provided",
      missingFacts: ["previous context memory"],
      requiredRefreshSuggestions: ["run bounded discovery and staged reads"],
    });
    return {
      reusable: false,
      reason: "no previous context memory provided",
      eligibility,
      evidence: ["context-memory-reuse:miss:no-memory"],
    };
  }
  const taskFingerprint = fingerprintTask(input.userTask);
  if (taskFingerprint !== input.memory.taskFingerprint) {
    const eligibility = buildReuseEligibilityFacts({
      memoryId: input.memory.memoryId,
      status: "task_mismatch",
      reason: "task fingerprint changed",
      matchingTaskFacts: [`memoryTaskFingerprint=${input.memory.taskFingerprint}`],
      missingFacts: ["current task freshness"],
      requiredRefreshSuggestions: ["rerun discovery for changed user task"],
    });
    return {
      reusable: false,
      reason: "task fingerprint changed",
      eligibility,
      discoveryHandoff: buildMemoryDiscoveryHandoffForEligibility(input.memory, eligibility),
      planningHandoff: buildMemoryPlanningHandoffForEligibility(input.memory, eligibility),
      evidence: ["context-memory-reuse:miss:task-changed"],
    };
  }
  if (
    input.currentRepoSnapshotId &&
    input.memory.repoSnapshotId !== input.currentRepoSnapshotId
  ) {
    const eligibility = buildReuseEligibilityFacts({
      memoryId: input.memory.memoryId,
      status: "workspace_mismatch",
      reason: "repo snapshot changed",
      matchingTaskFacts: [`taskFingerprint=${taskFingerprint}`],
      matchingWorkspaceFacts: [
        `memoryRepoSnapshotId=${input.memory.repoSnapshotId}`,
        `currentRepoSnapshotId=${input.currentRepoSnapshotId}`,
      ],
      missingFacts: ["current workspace freshness"],
      requiredRefreshSuggestions: ["rerun discovery against current repo snapshot"],
    });
    return {
      reusable: false,
      reason: "repo snapshot changed",
      eligibility,
      discoveryHandoff: buildMemoryDiscoveryHandoffForEligibility(input.memory, eligibility),
      planningHandoff: buildMemoryPlanningHandoffForEligibility(input.memory, eligibility),
      evidence: [
        "context-memory-reuse:miss:repo-snapshot-changed",
        `context-memory-reuse:memory-snapshot:${input.memory.repoSnapshotId}`,
        `context-memory-reuse:current-snapshot:${input.currentRepoSnapshotId}`,
      ],
    };
  }
  const unsafePath = findUnsafeMemoryPath(input.memory);
  if (unsafePath) {
    const eligibility = buildReuseEligibilityFacts({
      memoryId: input.memory.memoryId,
      status: "invalidated",
      reason: "unsafe memory path",
      missingFacts: ["safe workspace path"],
      requiredRefreshSuggestions: ["drop unsafe memory and rerun bounded discovery"],
    });
    return {
      reusable: false,
      reason: `unsafe memory path: ${unsafePath}`,
      eligibility,
      discoveryHandoff: buildMemoryDiscoveryHandoffForEligibility(input.memory, eligibility),
      planningHandoff: buildMemoryPlanningHandoffForEligibility(input.memory, eligibility),
      evidence: [
        "context-memory-reuse:miss:unsafe-path",
        "context-memory-reuse:workspace-boundary:rejected",
      ],
    };
  }
  const absentPath = findAbsentCurrentRepoPath(input.memory, input.currentRepoFileLabels);
  if (absentPath) {
    const eligibility = buildReuseEligibilityFacts({
      memoryId: input.memory.memoryId,
      status: "target_mismatch",
      reason: "memory path absent from current repo snapshot",
      matchingTaskFacts: [`taskFingerprint=${taskFingerprint}`],
      matchingTargetFacts: [`absentPath=${absentPath}`],
      missingFacts: ["current target presence"],
      requiredRefreshSuggestions: ["rerun target ranking and staged reads for current repo"],
    });
    return {
      reusable: false,
      reason: `memory path absent from current repo snapshot: ${absentPath}`,
      eligibility,
      discoveryHandoff: buildMemoryDiscoveryHandoffForEligibility(input.memory, eligibility),
      planningHandoff: buildMemoryPlanningHandoffForEligibility(input.memory, eligibility),
      evidence: [
        "context-memory-reuse:miss:path-absent-current-repo",
        "context-memory-reuse:workspace-boundary:rejected",
      ],
    };
  }
  const freshness = await evaluateContextMemoryFreshness({
    workspaceRoot: input.workspaceRoot,
    memory: input.memory,
  });
  if (freshness.staleFiles.length > 0) {
    const eligibility = buildReuseEligibilityFacts({
      memoryId: input.memory.memoryId,
      status: "stale",
      reason: "stale files",
      matchingTaskFacts: [`taskFingerprint=${taskFingerprint}`],
      matchingTargetFacts: [`selectedTargetPath=${input.memory.selectedTargetPath}`],
      matchingWorkspaceFacts: [`repoSnapshotId=${input.memory.repoSnapshotId}`],
      missingFacts: freshness.missingFreshnessEvidence ?? [],
      requiredRefreshSuggestions: freshness.nextReadSuggestions ?? freshness.staleFiles.map((file) => `refresh stale file: ${file}`),
    });
    return {
      reusable: false,
      reason: `stale files: ${freshness.staleFiles.join(", ")}`,
      eligibility,
      discoveryHandoff: buildMemoryDiscoveryHandoffForEligibility(input.memory, eligibility, freshness),
      planningHandoff: buildMemoryPlanningHandoffForEligibility(input.memory, eligibility, freshness),
      evidence: [
        "context-memory-reuse:miss:stale-files",
        `context-memory-reuse:stale-files:${freshness.staleFiles.length}`,
      ],
    };
  }
  const eligibility = buildReuseEligibilityFacts({
    memoryId: input.memory.memoryId,
    status: input.memory.missingFacts.length > 0
      ? "reusable_with_required_refresh"
      : input.memory.planningWarnings.length > 0
        ? "reusable_with_optional_refresh"
        : "reusable",
    reason: input.memory.missingFacts.length > 0
      ? "memory receipts are fresh but required facts remain missing"
      : input.memory.planningWarnings.length > 0
        ? "memory receipts are fresh with optional planning warnings"
        : "memory receipts match current workspace stats",
    matchingTaskFacts: [`taskFingerprint=${taskFingerprint}`],
    matchingTargetFacts: [`selectedTargetPath=${input.memory.selectedTargetPath}`],
    matchingWorkspaceFacts: [`repoSnapshotId=${input.memory.repoSnapshotId}`],
    missingFacts: input.memory.missingFacts,
    requiredRefreshSuggestions: input.memory.missingFacts.map((fact) => `refresh required fact: ${fact}`),
    optionalRefreshSuggestions: input.memory.planningWarnings.map((warning) => `refresh optional planning warning: ${warning}`),
  });
  if (eligibility.status === "reusable_with_required_refresh") {
    return {
      reusable: false,
      reason: "memory receipts are fresh but required facts remain missing",
      eligibility,
      discoveryHandoff: buildMemoryDiscoveryHandoffForEligibility(input.memory, eligibility, freshness),
      planningHandoff: buildMemoryPlanningHandoffForEligibility(input.memory, eligibility, freshness),
      evidence: [
        `context-memory-reuse:refresh-required:${input.memory.memoryId}`,
        "context-memory-reuse:miss:required-refresh",
        `context-memory-reuse:eligibility:${eligibility.status}`,
      ],
    };
  }
  return {
    reusable: true,
    memory: input.memory,
    eligibility,
    discoveryHandoff: buildMemoryDiscoveryHandoffForEligibility(input.memory, eligibility, freshness),
    planningHandoff: buildMemoryPlanningHandoffForEligibility(input.memory, eligibility, freshness),
    evidence: [
      `context-memory-reuse:hit:${input.memory.memoryId}`,
      "context-memory-reuse:avoids-reread:fresh-receipts",
      `context-memory-reuse:eligibility:${eligibility.status}`,
    ],
  };
}

export async function evaluateContextMemoryFreshness(input: {
  readonly workspaceRoot: string;
  readonly memory: Pick<ContextWorkingMemory, "fileReceipts">;
}): Promise<ContextWorkingMemory["invalidation"]> {
  const staleFiles: string[] = [];
  for (const receipt of input.memory.fileReceipts) {
    const stat = await statRelative(input.workspaceRoot, receipt.path);
    if (stat.sizeBytes !== receipt.sizeBytes || stat.mtimeMs !== receipt.mtimeMs) {
      staleFiles.push(receipt.path);
    }
  }
  const invalidationSignals = staleFiles.map((file) => `file-stat-mismatch:${file}`);
  const missingFreshnessEvidence = input.memory.fileReceipts.length === 0
    ? ["no file receipts available"]
    : [];
  return {
    invalidationId: `context-memory-invalidation:${hash(input.memory.fileReceipts.map((receipt) => [
      receipt.path,
      receipt.sizeBytes,
      receipt.mtimeMs,
    ]))}`,
    policy: "stat-size-mtime",
    staleFiles,
    invalidationSignals,
    missingFreshnessEvidence,
    invalidated: staleFiles.length > 0 || missingFreshnessEvidence.length > 0,
    nextReadSuggestions: [
      ...staleFiles.map((file) => `refresh stale context file: ${file}`),
      ...missingFreshnessEvidence.map((fact) => `rebuild context memory: ${fact}`),
    ],
    notProvenClaims: [
      "memory-exists-is-not-fresh-context",
      "memory-reused-is-not-enough-context",
      "refresh-suggested-is-not-completed-read",
    ],
  };
}

function buildContextMemoryRecordFacts(input: {
  readonly memoryId: string;
  readonly sourceTurnOrLabel: string;
  readonly sourceCandidateIds: readonly string[];
  readonly sourceContextPacketIds: readonly string[];
  readonly sourcePlanningIds: readonly string[];
  readonly sourceSessionPathOrContinuationId?: string;
  readonly createdPhase: string;
  readonly intendedReuseScope: string;
  readonly invalidation: ContextMemoryStaleInvalidationFacts;
}): ContextMemoryRecordFacts {
  return {
    recordId: `context-memory-record:${input.memoryId}`,
    memoryId: input.memoryId,
    sourceTurnOrLabel: input.sourceTurnOrLabel,
    sourceCandidateIds: input.sourceCandidateIds,
    sourceContextPacketIds: input.sourceContextPacketIds,
    sourcePlanningIds: input.sourcePlanningIds,
    ...(input.sourceSessionPathOrContinuationId
      ? { sourceSessionPathOrContinuationId: input.sourceSessionPathOrContinuationId }
      : {}),
    createdPhase: input.createdPhase,
    intendedReuseScope: input.intendedReuseScope,
    freshnessEvidence: input.invalidation.staleFiles.length === 0 &&
      input.invalidation.missingFreshnessEvidence.length === 0
      ? ["stat-size-mtime receipts matched at record creation"]
      : [],
    stalenessEvidence: input.invalidation.invalidationSignals,
    invalidationState: input.invalidation,
    redactionState: "report-safe",
    notProvenClaims: [
      "memory-record-exists-is-not-fresh-context",
      "memory-record-exists-is-not-task-success",
      "memory-record-excludes-raw-transcript-and-file-content",
    ],
  };
}

function buildReuseEligibilityFacts(input: {
  readonly memoryId: string;
  readonly status: ContextMemoryReuseEligibilityStatus;
  readonly reason: string;
  readonly matchingTaskFacts?: readonly string[];
  readonly matchingTargetFacts?: readonly string[];
  readonly matchingWorkspaceFacts?: readonly string[];
  readonly missingFacts?: readonly string[];
  readonly requiredRefreshSuggestions?: readonly string[];
  readonly optionalRefreshSuggestions?: readonly string[];
}): ContextMemoryReuseEligibilityFacts {
  return {
    eligibilityId: `context-memory-reuse:${input.memoryId}`,
    status: input.status,
    reason: input.reason,
    matchingTaskFacts: input.matchingTaskFacts ?? [],
    matchingTargetFacts: input.matchingTargetFacts ?? [],
    matchingWorkspaceFacts: input.matchingWorkspaceFacts ?? [],
    freshnessRequirement: input.status === "unsupported"
      ? "unsupported"
      : input.status === "reusable" || input.status === "reusable_with_optional_refresh"
        ? "fresh-receipts-required"
        : "refresh-required",
    missingFacts: input.missingFacts ?? [],
    requiredRefreshSuggestions: input.requiredRefreshSuggestions ?? [],
    optionalRefreshSuggestions: input.optionalRefreshSuggestions ?? [],
    notProvenClaims: [
      "reuse-eligible-is-not-fresh-context",
      "memory-reused-is-not-enough-context",
      "reuse-eligible-is-not-task-success",
    ],
  };
}

function buildMemoryDiscoveryHandoff(input: {
  readonly memoryId: string;
  readonly status: ContextMemoryReuseEligibilityStatus;
  readonly candidateIds: readonly string[];
  readonly contextPacketIds: readonly string[];
  readonly stalePackets: readonly string[];
  readonly requiredRefresh: readonly string[];
  readonly optionalRefresh: readonly string[];
}): ContextMemoryDiscoveryHandoffFacts {
  const refreshRequired = input.status !== "reusable" &&
    input.status !== "reusable_with_optional_refresh";
  return {
    handoffId: `context-memory-discovery-handoff:${input.memoryId}`,
    reusedCandidateIds: input.candidateIds,
    candidateFreshnessState: input.status,
    reusedContextPacketIds: input.contextPacketIds,
    contextPacketFreshnessState: input.status,
    stalePacketsExcluded: input.stalePackets,
    requiredRefreshCandidates: input.requiredRefresh,
    optionalRefreshCandidates: input.optionalRefresh,
    discoveryFactsToRerun: refreshRequired ? ["target-ranking", "candidate-freshness"] : [],
    stagedReadsToRerun: refreshRequired ? ["stale-or-missing-context-packets"] : [],
    nextReadSuggestions: [...input.requiredRefresh, ...input.optionalRefresh],
    notProvenClaims: [
      "memory-handoff-is-not-fresh-discovery",
      "required-refresh-cannot-be-bypassed-by-memory",
      "next-read-suggestion-is-not-completed-read",
    ],
  };
}

function buildMemoryDiscoveryHandoffForEligibility(
  memory: ContextWorkingMemory,
  eligibility: ContextMemoryReuseEligibilityFacts,
  invalidation: ContextMemoryStaleInvalidationFacts = memory.invalidation as ContextMemoryStaleInvalidationFacts,
): ContextMemoryDiscoveryHandoffFacts {
  const recordFacts = (memory as Partial<ContextWorkingMemory>).recordFacts;
  return buildMemoryDiscoveryHandoff({
    memoryId: memory.memoryId,
    status: eligibility.status,
    candidateIds: recordFacts?.sourceCandidateIds ?? memory.candidateFiles,
    contextPacketIds: recordFacts?.sourceContextPacketIds ?? memory.fileReceipts.map((receipt) => receipt.path),
    stalePackets: invalidation.staleFiles,
    requiredRefresh: eligibility.requiredRefreshSuggestions,
    optionalRefresh: eligibility.optionalRefreshSuggestions,
  });
}

function buildMemoryPlanningHandoff(input: {
  readonly memoryId: string;
  readonly status: ContextMemoryReuseEligibilityStatus;
  readonly planningQualityIds: readonly string[];
  readonly assumptionsRemainValid: readonly string[];
  readonly assumptionsRequiringRefresh: readonly string[];
  readonly constraintsRemainActive: readonly string[];
  readonly replaySafePlanStepIds: readonly string[];
  readonly staleReasons: readonly string[];
  readonly replayState: Omit<ReplaySafePlanningStateFacts, "replayStateId" | "notProvenClaims">;
}): ContextMemoryPlanningHandoffFacts {
  const replaySafePlanningState: ReplaySafePlanningStateFacts = {
    replayStateId: `replay-safe-planning-state:${input.memoryId}`,
    ...input.replayState,
    notProvenClaims: [
      "replay-state-available-is-not-plan-validity",
      "replayed-edit-handoff-is-not-mutation-authority",
      "replayed-verification-intent-is-not-verification-passed",
    ],
  };
  return {
    handoffId: `context-memory-planning-handoff:${input.memoryId}`,
    reusedPlanningQualityIds: input.planningQualityIds,
    assumptionsRemainValid: input.assumptionsRemainValid,
    assumptionsRequiringRefresh: input.assumptionsRequiringRefresh,
    constraintsRemainActive: input.constraintsRemainActive,
    replaySafePlanStepIds: input.replaySafePlanStepIds,
    editHandoffFreshnessState: input.status,
    verificationHandoffFreshnessState: input.status,
    unsupportedOrStalePlanningReasons: input.staleReasons,
    replaySafePlanningState,
    notProvenClaims: [
      "replayed-plan-is-not-executable-work",
      "replayed-edit-handoff-is-not-mutation-authority",
      "replayed-verification-intent-is-not-verification-passed",
    ],
  };
}

function buildMemoryPlanningHandoffForEligibility(
  memory: ContextWorkingMemory,
  eligibility: ContextMemoryReuseEligibilityFacts,
  invalidation: ContextMemoryStaleInvalidationFacts = memory.invalidation as ContextMemoryStaleInvalidationFacts,
): ContextMemoryPlanningHandoffFacts {
  const recordFacts = (memory as Partial<ContextWorkingMemory>).recordFacts;
  const discoveryHandoff = (memory as Partial<ContextWorkingMemory>).discoveryHandoff;
  return buildMemoryPlanningHandoff({
    memoryId: memory.memoryId,
    status: eligibility.status,
    planningQualityIds: recordFacts?.sourcePlanningIds ?? [],
    replaySafePlanStepIds: [],
    assumptionsRemainValid: [`target=${memory.selectedTargetPath}`],
    assumptionsRequiringRefresh: eligibility.requiredRefreshSuggestions,
    constraintsRemainActive: ["mutationAuthority=not-granted", "verificationIntent=selected-not-run"],
    staleReasons: invalidation.invalidationSignals ?? invalidation.staleFiles,
    replayState: {
      taskIntentSummary: memory.compactSummary.slice(0, 160),
      discoveryHandoffIds: [discoveryHandoff?.handoffId ?? `context-memory-discovery-handoff:${memory.memoryId}`],
      stagedContextIds: recordFacts?.sourceContextPacketIds ?? memory.fileReceipts.map((receipt) => receipt.path),
      contextSufficiencyStatus: memory.contextSufficiencyState ?? "not-proven",
      planningQualityIds: recordFacts?.sourcePlanningIds ?? [],
      assumptionsAndConstraints: [
        `target=${memory.selectedTargetPath}`,
        "mutationAuthority=not-granted",
        "verificationIntent=selected-not-run",
      ],
      editHandoffIds: [],
      verificationHandoffIds: [],
      staleInvalidationFacts: invalidation.invalidationSignals ?? [],
      continuationReadiness: eligibility.status === "reusable" ? "review-only" : "requires-refresh",
    },
  });
}

export function fingerprintTask(userTask: string): string {
  return `task_fp_${hash(userTask.toLowerCase().replace(/\s+/g, " ").trim())}`;
}

function findUnsafeMemoryPath(memory: ContextWorkingMemory): string | undefined {
  const editTargetPaths = memory.editTargetRationale.map((entry) => entry.split(":")[0]?.trim() ?? "");
  const paths = [
    memory.selectedTargetPath,
    ...memory.candidateFiles,
    ...memory.fileReceipts.map((receipt) => receipt.path),
    ...editTargetPaths,
  ];
  return paths.find((value) => !isSafeWorkspaceLabel(value));
}

function findAbsentCurrentRepoPath(
  memory: ContextWorkingMemory,
  currentRepoFileLabels: readonly string[] | undefined,
): string | undefined {
  if (!currentRepoFileLabels) {
    return undefined;
  }
  const labels = new Set(currentRepoFileLabels);
  const editTargetPaths = memory.editTargetRationale.map((entry) => entry.split(":")[0]?.trim() ?? "");
  const paths = [
    memory.selectedTargetPath,
    ...memory.fileReceipts.map((receipt) => receipt.path),
    ...editTargetPaths,
  ];
  return paths.find((value) => !labels.has(value));
}

function isSafeWorkspaceLabel(value: string): boolean {
  if (!value || value === "(none)" || value.includes("\0") || value.includes("\\")) {
    return false;
  }
  if (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value)) {
    return false;
  }
  const normalized = path.posix.normalize(value);
  return normalized === value &&
    normalized !== "." &&
    !normalized.startsWith("../") &&
    !normalized.split("/").includes("..");
}

async function statRelative(
  workspaceRoot: string,
  relativePath: string,
): Promise<{ readonly sizeBytes: number; readonly mtimeMs: number }> {
  if (!isSafeWorkspaceLabel(relativePath)) {
    return { sizeBytes: -2, mtimeMs: -2 };
  }
  try {
    const stat = await fs.stat(path.resolve(workspaceRoot, relativePath));
    return { sizeBytes: stat.size, mtimeMs: stat.mtimeMs };
  } catch {
    return { sizeBytes: -1, mtimeMs: -1 };
  }
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function hash(input: unknown): string {
  return crypto.createHash("sha256").update(JSON.stringify(input)).digest("hex").slice(0, 12);
}

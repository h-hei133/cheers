import type { ContextGraphPlanningBundle } from "./contextGraphPlanning.js";
import { buildContextGraphPlanningBundle } from "./contextGraphPlanning.js";
import {
  buildContextWorkingMemory,
  canReuseContextMemory,
  fingerprintTask,
  type ContextWorkingMemory,
} from "./contextMemory.js";
import {
  buildRepoIntelligence,
  type RepoIntelligenceCandidate,
  type RepoIntelligenceResult,
} from "./repoIntelligence.js";
import type { CodingTaskKind } from "./types.js";
import type { WorkflowTaskPlan } from "./workflowTaskPlanner.js";

export type ContextEngineTaskKindHint = Extract<
  CodingTaskKind,
  "edit-file" | "write-file" | "read-file" | "inspect-files" | "repo-explain"
>;

export interface ContextEngineResult {
  readonly engineId: string;
  readonly status: "context-built" | "reused-memory" | "insufficient-context";
  readonly userTask: string;
  readonly repo: RepoIntelligenceResult;
  readonly selectedCandidate?: RepoIntelligenceCandidate;
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
  if (reuse.reusable) {
    return {
      engineId: `context_engine_${reuse.memory.memoryId}`,
      status: "reused-memory",
      userTask: input.userTask,
      repo,
      selectedCandidate: repo.candidates.find((candidate) => candidate.safeLabel === reuse.memory.selectedTargetPath),
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
      nextReadSuggestions: repo.nextReadSuggestions,
      evidence: [
        ...repo.evidence,
        ...reuse.evidence,
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
      nextReadSuggestions: repo.nextReadSuggestions,
      evidence: [
        ...repo.evidence,
        ...reuse.evidence,
        "context-engine:status:insufficient-context",
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
    workflowPlan,
    bundle,
    memory,
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
      ...memory.evidence,
      ...bundle.taskContextAcquisition.evidence,
      ...bundle.taskContextSufficiency.evidence,
      "context-engine:status:context-built",
      "context-engine:mutation-authority:not-granted",
    ],
  };
}

function buildWorkflowPlan(input: {
  readonly userTask: string;
  readonly targetPath?: string;
  readonly hasTarget: boolean;
  readonly taskKindHint?: ContextEngineTaskKindHint;
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
}): ContextWorkingMemory {
  const memoryId = `ctx_mem_insufficient_${input.repo.snapshot.snapshotId}`;
  return {
    memoryId,
    taskFingerprint: fingerprintTask(input.userTask),
    repoSnapshotId: input.repo.snapshot.snapshotId,
    selectedTargetPath: "(none)",
    candidateFiles: [],
    fileReceipts: [],
    compactSummary: `insufficient-context; reason=${input.reason}; candidates=0`,
    missingFacts: [
      ...input.repo.missingFacts,
      "no selected target for context graph planning",
    ],
    planningWarnings: [],
    planQualityLevel: "unsupported",
    contextSufficiencyState: "unsupported",
    editTargetRationale: [],
    verificationIntent: [],
    handoffSummary: "handoff=blocked-before-mutation-runtime; mutationAuthority=not-granted",
    invalidation: {
      policy: "stat-size-mtime",
      staleFiles: [],
    },
    redactionStatus: "redacted-and-budgeted",
    mutationAuthority: "not-granted",
    evidence: [
      `context-memory:id:${memoryId}`,
      "context-memory:insufficient-context",
      "context-memory:mutation-authority:not-granted",
    ],
  };
}

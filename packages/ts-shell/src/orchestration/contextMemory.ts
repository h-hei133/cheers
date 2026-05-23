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
  readonly invalidation: {
    readonly policy: "stat-size-mtime";
    readonly staleFiles: readonly string[];
  };
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
  | { readonly reusable: true; readonly memory: ContextWorkingMemory; readonly evidence: readonly string[] }
  | { readonly reusable: false; readonly reason: string; readonly evidence: readonly string[] }
> {
  if (!input.memory) {
    return {
      reusable: false,
      reason: "no previous context memory provided",
      evidence: ["context-memory-reuse:miss:no-memory"],
    };
  }
  const taskFingerprint = fingerprintTask(input.userTask);
  if (taskFingerprint !== input.memory.taskFingerprint) {
    return {
      reusable: false,
      reason: "task fingerprint changed",
      evidence: ["context-memory-reuse:miss:task-changed"],
    };
  }
  if (
    input.currentRepoSnapshotId &&
    input.memory.repoSnapshotId !== input.currentRepoSnapshotId
  ) {
    return {
      reusable: false,
      reason: "repo snapshot changed",
      evidence: [
        "context-memory-reuse:miss:repo-snapshot-changed",
        `context-memory-reuse:memory-snapshot:${input.memory.repoSnapshotId}`,
        `context-memory-reuse:current-snapshot:${input.currentRepoSnapshotId}`,
      ],
    };
  }
  const unsafePath = findUnsafeMemoryPath(input.memory);
  if (unsafePath) {
    return {
      reusable: false,
      reason: `unsafe memory path: ${unsafePath}`,
      evidence: [
        "context-memory-reuse:miss:unsafe-path",
        "context-memory-reuse:workspace-boundary:rejected",
      ],
    };
  }
  const absentPath = findAbsentCurrentRepoPath(input.memory, input.currentRepoFileLabels);
  if (absentPath) {
    return {
      reusable: false,
      reason: `memory path absent from current repo snapshot: ${absentPath}`,
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
    return {
      reusable: false,
      reason: `stale files: ${freshness.staleFiles.join(", ")}`,
      evidence: [
        "context-memory-reuse:miss:stale-files",
        `context-memory-reuse:stale-files:${freshness.staleFiles.length}`,
      ],
    };
  }
  return {
    reusable: true,
    memory: input.memory,
    evidence: [
      `context-memory-reuse:hit:${input.memory.memoryId}`,
      "context-memory-reuse:avoids-reread:fresh-receipts",
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
  return {
    policy: "stat-size-mtime",
    staleFiles,
  };
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

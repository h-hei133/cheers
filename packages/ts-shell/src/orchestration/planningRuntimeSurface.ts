import type { PlanningRuntimeResult } from "../planning/runtime/engine.js";
import {
  projectContextAcquisition,
  type ContextAcquisitionProjection,
} from "../context/acquisition/projection.js";

export interface PlanningRuntimeSurface {
  readonly runtimeId: string;
  readonly status: PlanningRuntimeResult["status"];
  readonly contextStatus: PlanningRuntimeResult["context"]["status"];
  readonly candidates: readonly {
    readonly path: string;
    readonly score: number;
    readonly reasons: readonly string[];
  }[];
  readonly filesRead: readonly {
    readonly path: string;
    readonly reason: string;
    readonly source: string;
  }[];
  readonly contextAcquisition: ContextAcquisitionProjection;
  readonly enoughContext: "yes" | "missing-facts";
  readonly missingFacts: readonly string[];
  readonly planningWarnings: readonly string[];
  readonly groundedAnalysis: {
    readonly confidence: string;
    readonly summary: string;
    readonly planningWarnings: readonly string[];
    readonly evidenceIds: readonly string[];
  };
  readonly executablePlan: {
    readonly summary: string;
    readonly steps: readonly string[];
    readonly planQuality?: string;
    readonly executionPlanId?: string;
  };
  readonly editTargets: PlanningRuntimeResult["editTargets"];
  readonly verificationIntent: {
    readonly state: string;
    readonly command?: string;
    readonly commandKind?: string;
    readonly readiness?: string;
  };
  readonly planningEvidence: {
    readonly candidateFiles: readonly string[];
    readonly filesRead: readonly string[];
    readonly readReasons: readonly string[];
    readonly missingFacts: readonly string[];
    readonly editTargets: readonly string[];
    readonly verificationIntent: string;
    readonly contextBudget: {
      readonly candidateFiles: number;
      readonly filesRead: number;
      readonly bytesUsed: number;
      readonly cacheStatus: string;
    };
    readonly memoryReuseStatus: "fresh-context" | "reused-memory" | "stale-memory-rejected" | "not-reused";
  };
  readonly mutationHandoff: PlanningRuntimeResult["mutationHandoff"];
  readonly memory: {
    readonly id: string;
    readonly receipts: number;
    readonly staleFiles: number;
    readonly missingFacts: number;
    readonly planningWarnings: number;
  };
  readonly safety: {
    readonly mutationAuthority: "not-granted";
    readonly providerCall: "not-run";
    readonly commandDispatch: "not-run";
  };
  readonly evidence: readonly string[];
}

export function projectPlanningRuntimeSurface(
  result: PlanningRuntimeResult,
): PlanningRuntimeSurface {
  const contextAcquisition = projectContextAcquisition(result.context);
  const verificationIntent = projectVerificationIntent(result);
  const planningEvidence = {
    candidateFiles: result.context.repo.candidates.slice(0, 10).map((candidate) => candidate.safeLabel),
    filesRead: result.context.filesRead.map((file) => file.path),
    readReasons: result.context.filesRead.map((file) => `${file.path}:${file.reason}:${file.source}`),
    missingFacts: result.groundedAnalysis.missingFacts,
    editTargets: result.editTargets.map((target) => target.path),
    verificationIntent: formatVerificationEvidence(verificationIntent),
    contextBudget: result.context.contextBudget,
    memoryReuseStatus: memoryReuseStatus(result),
  } satisfies PlanningRuntimeSurface["planningEvidence"];

  return {
    runtimeId: result.runtimeId,
    status: result.status,
    contextStatus: result.context.status,
    candidates: result.context.repo.candidates.slice(0, 5).map((candidate) => ({
      path: candidate.safeLabel,
      score: candidate.score,
      reasons: candidate.reasons,
    })),
    filesRead: result.context.filesRead.map((file) => ({
      path: file.path,
      reason: file.reason,
      source: file.source,
    })),
    contextAcquisition,
    enoughContext: result.groundedAnalysis.missingFacts.length === 0 ? "yes" : "missing-facts",
    missingFacts: result.groundedAnalysis.missingFacts,
    planningWarnings: result.groundedAnalysis.planningWarnings,
    groundedAnalysis: {
      confidence: result.groundedAnalysis.confidence,
      summary: result.groundedAnalysis.summary,
      planningWarnings: result.groundedAnalysis.planningWarnings,
      evidenceIds: result.groundedAnalysis.evidenceIds,
    },
    executablePlan: result.executablePlan,
    editTargets: result.editTargets,
    verificationIntent,
    planningEvidence,
    mutationHandoff: result.mutationHandoff,
    memory: {
      id: result.continuationMemory.memoryId,
      receipts: result.continuationMemory.fileReceipts.length,
      staleFiles: result.continuationMemory.invalidation.staleFiles.length,
      missingFacts: result.continuationMemory.missingFacts.length,
      planningWarnings: result.continuationMemory.planningWarnings.length,
    },
    safety: {
      mutationAuthority: "not-granted",
      providerCall: "not-run",
      commandDispatch: "not-run",
    },
    evidence: [
      `planning-runtime-surface:runtime:${result.runtimeId}`,
      `planning-runtime-surface:status:${result.status}`,
      `planning-runtime-surface:context:${result.context.status}`,
      `planning-runtime-surface:edit-targets:${result.editTargets.length}`,
      `planning-runtime-surface:missing-facts:${result.groundedAnalysis.missingFacts.length}`,
      `planning-runtime-surface:warnings:${result.groundedAnalysis.planningWarnings.length}`,
      `planning-runtime-surface:candidate-files:${planningEvidence.candidateFiles.length}`,
      `planning-runtime-surface:files-read:${planningEvidence.filesRead.length}`,
      `planning-runtime-surface:memory-reuse:${planningEvidence.memoryReuseStatus}`,
      ...contextAcquisition.evidence,
      "planning-runtime-surface:mutation-authority:not-granted",
      "planning-runtime-surface:provider-call:not-run",
      "planning-runtime-surface:command-dispatch:not-run",
      "planning-runtime-surface:raw-content-excluded",
    ],
  };
}

function formatVerificationEvidence(
  verificationIntent: PlanningRuntimeSurface["verificationIntent"],
): string {
  return [
    `state=${verificationIntent.state}`,
    verificationIntent.command ? `command=${verificationIntent.command}` : undefined,
    verificationIntent.commandKind ? `kind=${verificationIntent.commandKind}` : undefined,
    verificationIntent.readiness ? `readiness=${verificationIntent.readiness}` : undefined,
  ].filter(Boolean).join("; ");
}

function memoryReuseStatus(
  result: PlanningRuntimeResult,
): PlanningRuntimeSurface["planningEvidence"]["memoryReuseStatus"] {
  if (result.context.status === "reused-memory") return "reused-memory";
  if (result.continuationMemory.invalidation.staleFiles.length > 0) {
    return "stale-memory-rejected";
  }
  if (result.continuationMemory.fileReceipts.length > 0) return "not-reused";
  return "fresh-context";
}

function projectVerificationIntent(result: PlanningRuntimeResult): PlanningRuntimeSurface["verificationIntent"] {
  if ("verificationPlanId" in result.verificationIntent) {
    return {
      state: result.verificationIntent.state,
      ...(result.verificationIntent.commandSafeLabel
        ? { command: result.verificationIntent.commandSafeLabel }
        : {}),
      commandKind: result.verificationIntent.commandKind,
      readiness: result.verificationIntent.executionReadiness,
    };
  }
  return {
    state: result.verificationIntent.state,
    ...(result.verificationIntent.commands[0]
      ? { command: result.verificationIntent.commands[0] }
      : {}),
    readiness: result.verificationIntent.state === "memory-reused" ? "ready" : "not-ready",
  };
}

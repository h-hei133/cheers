import type { ContextEngineResult } from "./contextEngine.js";

export type ContextAcquisitionMode =
  | "staged-runtime"
  | "memory-reuse"
  | "insufficient-context";

export type ContextAcquisitionStageName =
  | "candidate-discovery"
  | "initial-high-value-reads"
  | "sufficiency-check"
  | "conditional-next-read"
  | "report-and-handoff"
  | "memory-reuse";

export interface ContextAcquisitionStageProjection {
  readonly name: ContextAcquisitionStageName;
  readonly status: "completed" | "blocked" | "suggested" | "skipped";
  readonly summary: string;
}

export interface ContextAcquisitionReadProjection {
  readonly path: string;
  readonly stage: ContextAcquisitionStageName;
  readonly source: string;
  readonly whyRead: string;
  readonly byteLength?: number;
  readonly redactionApplied?: boolean;
}

export interface ContextAcquisitionOmittedProjection {
  readonly path: string;
  readonly stage: ContextAcquisitionStageName;
  readonly source: string;
  readonly reason: string;
  readonly byteLength?: number;
}

export interface ContextAcquisitionProjection {
  readonly mode: ContextAcquisitionMode;
  readonly packetId?: string;
  readonly acquisitionId?: string;
  readonly sufficiencyId?: string;
  readonly sufficiencyState?: string;
  readonly budget: {
    readonly candidateFiles: number;
    readonly filesRead: number;
    readonly bytesUsed: number;
    readonly maxFilesRead?: number;
    readonly maxBytesPerFile?: number;
    readonly maxTotalBytes?: number;
    readonly cacheStatus: ContextEngineResult["contextBudget"]["cacheStatus"];
  };
  readonly stages: readonly ContextAcquisitionStageProjection[];
  readonly reads: readonly ContextAcquisitionReadProjection[];
  readonly omitted: readonly ContextAcquisitionOmittedProjection[];
  readonly nextReads: readonly string[];
  readonly enoughContext: "yes" | "missing-facts";
  readonly missingFacts: readonly string[];
  readonly safety: {
    readonly mutationAuthority: "not-granted";
    readonly providerCall: "not-run";
    readonly commandDispatch: "not-run";
  };
  readonly evidence: readonly string[];
}

export function projectContextAcquisition(
  context: ContextEngineResult,
): ContextAcquisitionProjection {
  if (!context.bundle) {
    return context.status === "reused-memory"
      ? projectMemoryReuseAcquisition(context)
      : projectInsufficientAcquisition(context);
  }

  const packet = context.bundle.packet;
  const acquisition = context.bundle.taskContextAcquisition;
  const sufficiency = context.bundle.taskContextSufficiency;
  const missingFacts = context.missingFacts;
  const enoughContext = missingFacts.length === 0 ? "yes" : "missing-facts";
  const reads = packet.selectedCandidateSummaries.map((summary) => ({
    path: summary.pathLabel,
    stage: "initial-high-value-reads" as const,
    source: summary.kind,
    whyRead: summary.relation,
    byteLength: summary.byteLength,
    redactionApplied: summary.redactionApplied,
  }));
  const omitted = [
    ...packet.omittedCandidateSummaries.map((summary) => ({
      path: summary.pathLabel,
      stage: "initial-high-value-reads" as const,
      source: summary.kind,
      reason: summary.reason ?? "omitted",
      byteLength: summary.byteLength,
    })),
    ...context.bundle.graph.omittedCandidates.map((node) => ({
      path: node.pathLabel,
      stage: "conditional-next-read" as const,
      source: node.sourceKind,
      reason: node.omissionReason ?? node.reason,
    })),
  ];
  const nextReads = missingFacts.length > 0
    ? unique(context.nextReadSuggestions)
    : [];
  const projection: ContextAcquisitionProjection = {
    mode: "staged-runtime",
    packetId: packet.packetId,
    acquisitionId: acquisition.acquisitionId,
    sufficiencyId: sufficiency.sufficiencyId,
    sufficiencyState: sufficiency.state,
    budget: {
      candidateFiles: context.contextBudget.candidateFiles,
      filesRead: packet.readBudget.filesRead,
      bytesUsed: packet.readBudget.bytesUsed,
      maxFilesRead: packet.readBudget.maxFilesRead,
      maxBytesPerFile: packet.readBudget.maxBytesPerFile,
      maxTotalBytes: packet.readBudget.maxTotalBytes,
      cacheStatus: context.contextBudget.cacheStatus,
    },
    stages: [
      {
        name: "candidate-discovery",
        status: context.repo.candidates.length > 0 ? "completed" : "blocked",
        summary: `ranked ${context.repo.candidates.length} candidates from ${context.repo.snapshot.files.length} bounded repo files; context reads not started in this stage`,
      },
      {
        name: "initial-high-value-reads",
        status: reads.length > 0 ? "completed" : "blocked",
        summary: `read ${reads.length} selected sources; bytes=${packet.readBudget.bytesUsed}; omitted=${packet.omittedCandidateSummaries.length}`,
      },
      {
        name: "sufficiency-check",
        status: enoughContext === "yes" ? "completed" : "blocked",
        summary: `state=${sufficiency.state}; missingRequired=${sufficiency.missingRequiredFacts.length}; missingOptional=${sufficiency.missingOptionalFacts.length}`,
      },
      {
        name: "conditional-next-read",
        status: nextReads.length > 0 ? "suggested" : "skipped",
        summary: nextReads.length > 0
          ? `suggested ${nextReads.length} next reads because sufficiency=${sufficiency.state}`
          : "no required next reads before review-only planning handoff",
      },
      {
        name: "report-and-handoff",
        status: "completed",
        summary: "reported staged context evidence; mutationAuthority=not-granted",
      },
    ],
    reads,
    omitted: dedupeOmitted(omitted),
    nextReads,
    enoughContext,
    missingFacts,
    safety: noWriteSafety(),
    evidence: [],
  };
  return withEvidence(projection);
}

function projectMemoryReuseAcquisition(
  context: ContextEngineResult,
): ContextAcquisitionProjection {
  const reads = context.memory.fileReceipts.map((receipt) => ({
    path: receipt.path,
    stage: "memory-reuse" as const,
    source: "memory",
    whyRead: receipt.relevance,
    byteLength: receipt.sizeBytes,
  }));
  const projection: ContextAcquisitionProjection = {
    mode: "memory-reuse",
    budget: {
      ...context.contextBudget,
      filesRead: 0,
      bytesUsed: 0,
    },
    stages: [
      {
        name: "candidate-discovery",
        status: "completed",
        summary: `ranked ${context.repo.candidates.length} candidates before memory reuse check`,
      },
      {
        name: "memory-reuse",
        status: "completed",
        summary: `reused ${reads.length} fresh file receipts; no reread performed`,
      },
      {
        name: "report-and-handoff",
        status: "completed",
        summary: "reported fresh memory evidence; mutationAuthority=not-granted",
      },
    ],
    reads,
    omitted: [],
    nextReads: [],
    enoughContext: context.missingFacts.length === 0 ? "yes" : "missing-facts",
    missingFacts: context.missingFacts,
    safety: noWriteSafety(),
    evidence: [],
  };
  return withEvidence(projection);
}

function projectInsufficientAcquisition(
  context: ContextEngineResult,
): ContextAcquisitionProjection {
  const projection: ContextAcquisitionProjection = {
    mode: "insufficient-context",
    budget: context.contextBudget,
    stages: [
      {
        name: "candidate-discovery",
        status: "blocked",
        summary: `ranked ${context.repo.candidates.length} candidates from ${context.repo.snapshot.files.length} bounded repo files`,
      },
      {
        name: "sufficiency-check",
        status: "blocked",
        summary: `missingFacts=${context.missingFacts.length}; no selected target for staged reads`,
      },
      {
        name: "conditional-next-read",
        status: context.nextReadSuggestions.length > 0 ? "suggested" : "skipped",
        summary: context.nextReadSuggestions.length > 0
          ? `suggested ${context.nextReadSuggestions.length} candidate reads`
          : "no safe next reads available from bounded repo intelligence",
      },
      {
        name: "report-and-handoff",
        status: "blocked",
        summary: "stopped before mutation handoff; mutationAuthority=not-granted",
      },
    ],
    reads: [],
    omitted: [],
    nextReads: unique(context.nextReadSuggestions),
    enoughContext: "missing-facts",
    missingFacts: context.missingFacts,
    safety: noWriteSafety(),
    evidence: [],
  };
  return withEvidence(projection);
}

function withEvidence(
  projection: Omit<ContextAcquisitionProjection, "evidence"> & { readonly evidence: readonly string[] },
): ContextAcquisitionProjection {
  return {
    ...projection,
    evidence: unique([
      `context-acquisition:mode:${projection.mode}`,
      ...(projection.packetId ? [`context-acquisition:packet:${projection.packetId}`] : []),
      ...(projection.acquisitionId ? [`context-acquisition:id:${projection.acquisitionId}`] : []),
      ...(projection.sufficiencyId ? [`context-acquisition:sufficiency:${projection.sufficiencyId}`] : []),
      ...(projection.sufficiencyState ? [`context-acquisition:sufficiency-state:${projection.sufficiencyState}`] : []),
      ...projection.stages.map((stage) => `context-acquisition:stage:${stage.name}`),
      `context-acquisition:budget:candidate-files:${projection.budget.candidateFiles}`,
      `context-acquisition:budget:files-read:${projection.budget.filesRead}`,
      `context-acquisition:budget:bytes-used:${projection.budget.bytesUsed}`,
      `context-acquisition:budget:cache:${projection.budget.cacheStatus}`,
      `context-acquisition:enough-context:${projection.enoughContext}`,
      `context-acquisition:missing-facts:${projection.missingFacts.length}`,
      ...projection.reads.map((read) => `context-acquisition:why-read:${read.path}:${read.whyRead}`),
      ...projection.omitted.map((item) => `context-acquisition:omitted:${item.path}:${item.reason}`),
      ...projection.nextReads.map((read) => `context-acquisition:next-read:${read}`),
      "context-acquisition:mutation-authority:not-granted",
      "context-acquisition:provider-call:not-run",
      "context-acquisition:command-dispatch:not-run",
      "context-acquisition:raw-content-excluded",
    ]),
  };
}

function noWriteSafety(): ContextAcquisitionProjection["safety"] {
  return {
    mutationAuthority: "not-granted",
    providerCall: "not-run",
    commandDispatch: "not-run",
  };
}

function dedupeOmitted(
  omitted: readonly ContextAcquisitionOmittedProjection[],
): readonly ContextAcquisitionOmittedProjection[] {
  const byKey = new Map<string, ContextAcquisitionOmittedProjection>();
  for (const item of omitted) {
    const key = `${item.stage}:${item.path}:${item.reason}`;
    if (!byKey.has(key)) {
      byKey.set(key, item);
    }
  }
  return Array.from(byKey.values());
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

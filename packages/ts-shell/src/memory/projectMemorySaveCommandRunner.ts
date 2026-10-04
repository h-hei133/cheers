import { readProjectMemoryHealth } from "./store/health.js";
import {
  evaluateProjectMemoryCandidateQuality,
  type ProjectMemoryCandidateQualityResult,
} from "./projectMemoryCandidateQuality.js";
import type { ProjectMemoryCandidate } from "./projectMemoryCandidate.js";
import type { ProjectMemorySaveCommandRequest } from "./projectMemorySaveCommandContract.js";
import { projectMemoryRecordId } from "./projectMemoryLocalStore.js";
import type {
  ProjectMemoryRecord,
  ProjectMemoryStore,
  ProjectMemoryStoreHealth,
  ProjectMemoryWriteResult,
} from "./projectMemoryStoreContract.js";
import {
  DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE,
  type ProjectMemoryReviewEntry,
  type ProjectMemoryReviewState,
  type ProjectMemoryReviewStateStore,
} from "./projectMemoryReviewState.js";
import { renderProjectMemoryStoreSurface } from "./projectMemoryStoreSurface.js";

export type ProjectMemorySaveCommandOutcome = "saved" | "blocked" | "status";

export interface RunProjectMemorySaveCommandInput {
  readonly request: ProjectMemorySaveCommandRequest;
  readonly reviewSessionId: string;
  readonly candidates: readonly ProjectMemoryCandidate[];
  readonly reviewStore?: ProjectMemoryReviewStateStore;
  readonly memoryStore?: ProjectMemoryStore;
  readonly now?: () => string;
}

export interface ProjectMemorySaveCommandResult {
  readonly outcome: ProjectMemorySaveCommandOutcome;
  readonly state: ProjectMemoryReviewState;
  readonly quality: ProjectMemoryCandidateQualityResult;
  readonly health: ProjectMemoryStoreHealth;
  readonly savedRecords: readonly ProjectMemoryRecord[];
  readonly writeResults: readonly ProjectMemoryWriteResult[];
  readonly skipped: readonly string[];
  readonly output: string;
  readonly persistence: "explicit-local";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export async function runProjectMemorySaveCommand(
  input: RunProjectMemorySaveCommandInput,
): Promise<ProjectMemorySaveCommandResult> {
  const reviewStore =
    input.reviewStore ?? DEFAULT_PROJECT_MEMORY_REVIEW_STATE_STORE;
  const quality = evaluateProjectMemoryCandidateQuality(input.candidates);
  const state = reviewStore.updateCandidates({
    reviewSessionId: input.reviewSessionId,
    candidates: input.candidates,
    sourceCommand: "/memory",
  });
  const health = await readProjectMemoryHealth(input.memoryStore, "project-memory-save-command-runner");

  if (input.request.mode === "status") {
    return buildResult({
      input,
      state,
      quality,
      health,
      outcome: "status",
      writeResults: [],
      savedRecords: [],
      skipped: [],
    });
  }
  if (!input.memoryStore || !health.writable) {
    return buildResult({
      input,
      state,
      quality,
      health,
      outcome: "blocked",
      blocker: "Explicit local memory store root is required.",
      writeResults: [],
      savedRecords: [],
      skipped: [],
    });
  }

  const selected = selectApprovedEntries(input.request, state);
  if (selected.blocker) {
    return buildResult({
      input,
      state,
      quality,
      health,
      outcome: "blocked",
      blocker: selected.blocker,
      writeResults: [],
      savedRecords: [],
      skipped: selected.skipped,
    });
  }

  const writeResults: ProjectMemoryWriteResult[] = [];
  for (const entry of selected.entries) {
    const record = recordFromApprovedEntry(entry, input.now ?? (() => new Date().toISOString()));
    writeResults.push(
      await input.memoryStore.write({
        record,
        storeRef: input.memoryStore.ref,
      }),
    );
  }
  const savedRecords = writeResults
    .filter((result) => result.written && result.record)
    .map((result) => result.record as ProjectMemoryRecord);
  return buildResult({
    input,
    state,
    quality,
    health: await input.memoryStore.health(),
    outcome: savedRecords.length > 0 ? "saved" : "blocked",
    writeResults,
    savedRecords,
    skipped: selected.skipped,
    blocker:
      savedRecords.length > 0
        ? undefined
        : writeResults.map((result) => result.blocker).find(Boolean) ??
          "No approved safe memory candidates were saved.",
  });
}

function selectApprovedEntries(
  request: ProjectMemorySaveCommandRequest,
  state: ProjectMemoryReviewState,
): {
  readonly entries: readonly ProjectMemoryReviewEntry[];
  readonly skipped: readonly string[];
  readonly blocker?: string;
} {
  const approvedSafe = state.approvedCandidates.filter(isSaveEligible);
  if (request.mode === "save-approved") {
    const skipped = state.decisions
      .filter((entry) => !approvedSafe.some((safe) => safe.candidateId === entry.candidateId))
      .map((entry) => `${entry.candidateId}:${entry.decision}`);
    return approvedSafe.length > 0
      ? { entries: approvedSafe, skipped }
      : {
          entries: [],
          skipped,
          blocker: "No approved memory candidates meet durable retention and quality requirements.",
        };
  }

  const entry = state.decisions.find((candidate) => candidate.candidateId === request.candidateId);
  if (!entry) {
    return {
      entries: [],
      skipped: [],
      blocker: `Unknown memory candidate id: ${request.candidateId ?? "not provided"}`,
    };
  }
  if (!isSaveEligible(entry)) {
    return {
      entries: [],
      skipped: [`${entry.candidateId}:${entry.decision}`],
      blocker: `Candidate ${entry.candidateId} is ${entry.decision} and does not meet approved durable-memory requirements.`,
    };
  }
  return { entries: [entry], skipped: [] };
}

function isSaveEligible(entry: ProjectMemoryReviewEntry): boolean {
  return (
    entry.decision === "approved" &&
    entry.candidate.safety === "safe" &&
    (entry.candidate.retentionClass === "project-scoped-candidate" ||
      entry.candidate.retentionClass === "user-memory-candidate") &&
    entry.candidate.candidateKind !== "rejected" &&
    evaluateProjectMemoryCandidateQuality([entry.candidate]).qualityStatus !== "reject"
  );
}

function recordFromApprovedEntry(
  entry: ProjectMemoryReviewEntry,
  now: () => string,
): ProjectMemoryRecord {
  const createdAt = now();
  const approvedAt = entry.decidedAt ?? createdAt;
  const memoryText = entry.candidate.summary;
  return {
    id: projectMemoryRecordId({
      candidateId: entry.candidateId,
      approvedAt,
      memoryText,
    }),
    version: 1,
    createdAt,
    candidateId: entry.candidateId,
    candidateKind: entry.candidate.candidateKind,
    retentionClass: entry.candidate.retentionClass,
    approvedAt,
    approvedBySourceCommand: "/memory",
    memoryText,
    evidence: entry.candidate.evidence,
    source: entry.candidate.source,
    sourcePacket: entry.candidate.source,
    routeReferences: entry.candidate.evidence.filter((value) =>
      /route|compact|context|manifest/i.test(value),
    ),
    safety: "safe",
    redactions: entry.candidate.redactions,
  };
}

function buildResult(input: {
  readonly input: RunProjectMemorySaveCommandInput;
  readonly state: ProjectMemoryReviewState;
  readonly quality: ProjectMemoryCandidateQualityResult;
  readonly health: ProjectMemoryStoreHealth;
  readonly outcome: ProjectMemorySaveCommandOutcome;
  readonly writeResults: readonly ProjectMemoryWriteResult[];
  readonly savedRecords: readonly ProjectMemoryRecord[];
  readonly skipped: readonly string[];
  readonly blocker?: string;
}): ProjectMemorySaveCommandResult {
  return {
    outcome: input.outcome,
    state: input.state,
    quality: input.quality,
    health: input.health,
    savedRecords: input.savedRecords,
    writeResults: input.writeResults,
    skipped: input.skipped,
    output: renderProjectMemoryStoreSurface({
      reviewRetention: input.state,
      outcome: input.outcome,
      health: input.health,
      savedRecords: input.savedRecords,
      skipped: input.skipped,
      writeResults: input.writeResults,
      blocker: input.blocker,
    }),
    persistence: "explicit-local",
    providerCall: "none",
    evidence: [
      ...input.input.request.evidence,
      ...input.quality.evidence,
      ...input.state.evidence,
      ...input.health.evidence,
      ...input.writeResults.flatMap((result) => result.evidence),
      "project-memory-save-command-runner:review-before-write",
      "project-memory-save-command-runner:explicit-save-only",
      "project-memory-save-command-runner:no-auto-load",
      "project-memory-save-command-runner:no-retrieval",
      "project-memory-save-command-runner:no-provider-call",
    ],
  };
}

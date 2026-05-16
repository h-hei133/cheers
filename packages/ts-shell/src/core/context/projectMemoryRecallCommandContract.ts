import type {
  ProjectMemoryCandidateKind,
  ProjectMemoryCandidateSource,
  ProjectMemoryRetentionClass,
} from "./projectMemoryCandidate.js";

export type ProjectMemoryRecallCommandMode = "recall" | "search" | "wake";

export interface ProjectMemoryRecallCommandRequest {
  readonly mode: ProjectMemoryRecallCommandMode;
  readonly query?: string;
  readonly candidateKind?: ProjectMemoryCandidateKind;
  readonly retentionClass?: ProjectMemoryRetentionClass;
  readonly source?: ProjectMemoryCandidateSource;
  readonly maxResults: number;
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly autoInjected: false;
  readonly evidence: readonly string[];
}

export class ProjectMemoryRecallCommandContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMemoryRecallCommandContractError";
    this.code = code;
  }
}

export function parseProjectMemoryRecallCommandArgs(
  args: readonly string[],
): ProjectMemoryRecallCommandRequest {
  const [rawMode, ...rest] = args;
  if (rawMode !== "recall" && rawMode !== "search" && rawMode !== "wake") {
    throw new ProjectMemoryRecallCommandContractError(
      "memory-recall-unknown-mode",
      `Unknown memory recall mode: ${rawMode ?? "not provided"}`,
    );
  }
  if (rawMode === "wake") {
    return normalizeProjectMemoryRecallCommandRequest({ mode: "wake" });
  }
  const parsed = parseRecallArgs(rest);
  if (!parsed.query) {
    throw new ProjectMemoryRecallCommandContractError(
      "memory-recall-missing-query",
      "Recall/search requires a query.",
    );
  }
  return normalizeProjectMemoryRecallCommandRequest({
    mode: rawMode,
    query: parsed.query,
    candidateKind: parsed.candidateKind,
    retentionClass: parsed.retentionClass,
    source: parsed.source,
    maxResults: parsed.maxResults,
  });
}

export function normalizeProjectMemoryRecallCommandRequest(input: {
  readonly mode: ProjectMemoryRecallCommandMode;
  readonly query?: string;
  readonly candidateKind?: ProjectMemoryCandidateKind;
  readonly retentionClass?: ProjectMemoryRetentionClass;
  readonly source?: ProjectMemoryCandidateSource;
  readonly maxResults?: number;
}): ProjectMemoryRecallCommandRequest {
  const query = input.query?.trim().replace(/\s+/g, " ");
  if ((input.mode === "recall" || input.mode === "search") && !query) {
    throw new ProjectMemoryRecallCommandContractError(
      "memory-recall-missing-query",
      "Recall/search requires a query.",
    );
  }
  return {
    mode: input.mode,
    query,
    candidateKind: input.candidateKind,
    retentionClass: input.retentionClass,
    source: input.source,
    maxResults: boundedMaxResults(input.maxResults),
    persistence: "none",
    providerCall: "none",
    autoInjected: false,
    evidence: [
      "project-memory-recall-command-contract:parsed",
      "project-memory-recall-command-contract:no-provider-call",
      "project-memory-recall-command-contract:no-auto-injection",
      "project-memory-recall-command-contract:no-persistence-write",
    ],
  };
}

function parseRecallArgs(args: readonly string[]): {
  readonly query?: string;
  readonly candidateKind?: ProjectMemoryCandidateKind;
  readonly retentionClass?: ProjectMemoryRetentionClass;
  readonly source?: ProjectMemoryCandidateSource;
  readonly maxResults?: number;
} {
  const queryParts: string[] = [];
  let candidateKind: ProjectMemoryCandidateKind | undefined;
  let retentionClass: ProjectMemoryRetentionClass | undefined;
  let source: ProjectMemoryCandidateSource | undefined;
  let maxResults: number | undefined;
  for (const arg of args) {
    if (arg.startsWith("kind:")) {
      candidateKind = arg.slice("kind:".length) as ProjectMemoryCandidateKind;
    } else if (arg.startsWith("retention:")) {
      retentionClass = arg.slice("retention:".length) as ProjectMemoryRetentionClass;
    } else if (arg.startsWith("source:")) {
      source = arg.slice("source:".length) as ProjectMemoryCandidateSource;
    } else if (arg.startsWith("limit:")) {
      maxResults = Number(arg.slice("limit:".length));
    } else {
      queryParts.push(arg);
    }
  }
  return {
    query: queryParts.join(" ").trim() || undefined,
    candidateKind,
    retentionClass,
    source,
    maxResults,
  };
}

function boundedMaxResults(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return 5;
  }
  return Math.max(1, Math.min(20, Math.trunc(value ?? 5)));
}

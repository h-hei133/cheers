import { PROJECT_MEMORY_KINDS, PROJECT_MEMORY_RETENTIONS, PROJECT_MEMORY_SOURCES } from "./projectMemoryCandidate.js";
import { memoryRecallSyntax } from "./commands/syntax.js";
import { parseSyntax } from "../core/commands/syntax/parse.js";
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

export function parseProjectMemoryRecallCommandArgs(args: readonly string[]): ProjectMemoryRecallCommandRequest {
  const parsed = parseSyntax(memoryRecallSyntax, args);
  if (!parsed.ok) throw new ProjectMemoryRecallCommandContractError("memory-recall-invalid-arguments", parsed.reason);
  if (parsed.action.name === "wake") return normalizeProjectMemoryRecallCommandRequest({ mode: "wake" });
  const filters = parseRecallArgs(parsed.args);
  return normalizeProjectMemoryRecallCommandRequest({ mode: args[0]!.toLowerCase() as ProjectMemoryRecallCommandMode, ...filters });
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
  if ((input.candidateKind !== undefined && !PROJECT_MEMORY_KINDS.some(value => value === input.candidateKind)) ||
      (input.retentionClass !== undefined && !PROJECT_MEMORY_RETENTIONS.some(value => value === input.retentionClass)) ||
      (input.source !== undefined && !PROJECT_MEMORY_SOURCES.some(value => value === input.source))) {
    throw new ProjectMemoryRecallCommandContractError("memory-recall-invalid-filter", "Unknown recall filter value.");
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
  const seen = new Set<string>();
  let candidateKind: ProjectMemoryCandidateKind | undefined;
  let retentionClass: ProjectMemoryRetentionClass | undefined;
  let source: ProjectMemoryCandidateSource | undefined;
  let maxResults: number | undefined;
  for (const arg of args) {
    const separator = arg.indexOf(":");
    const key = separator < 0 ? "" : arg.slice(0, separator);
    if (["kind", "retention", "source", "limit"].includes(key)) {
      if (seen.has(key)) throw new ProjectMemoryRecallCommandContractError("memory-recall-repeated-filter", "A recall filter cannot be repeated.");
      seen.add(key);
    }
    if (arg.startsWith("kind:")) {
      candidateKind = arg.slice("kind:".length) as ProjectMemoryCandidateKind;
    } else if (arg.startsWith("retention:")) {
      retentionClass = arg.slice("retention:".length) as ProjectMemoryRetentionClass;
    } else if (arg.startsWith("source:")) {
      source = arg.slice("source:".length) as ProjectMemoryCandidateSource;
    } else if (arg.startsWith("limit:")) {
      const value = arg.slice("limit:".length);
      if (!/^\d+$/.test(value)) throw new ProjectMemoryRecallCommandContractError("memory-recall-invalid-limit", "Limit must be an integer from 1 to 20.");
      maxResults = Number(value);
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
  if (value === undefined) return 5;
  if (!Number.isSafeInteger(value) || value < 1 || value > 20) {
    throw new ProjectMemoryRecallCommandContractError("memory-recall-invalid-limit", "Limit must be an integer from 1 to 20.");
  }
  return value;
}

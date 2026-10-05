import { memoryReviewSyntax } from "./commands/syntax.js";
import { parseSyntax } from "../core/commands/syntax/parse.js";
export type ProjectMemoryReviewCommandMode =
  | "list"
  | "review"
  | "approve"
  | "reject"
  | "status";

export interface ProjectMemoryReviewCommandRequest {
  readonly mode: ProjectMemoryReviewCommandMode;
  readonly candidateId?: string;
  readonly allSafe: boolean;
  readonly rejectUnsafe: boolean;
  readonly reason?: string;
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export class ProjectMemoryReviewCommandContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMemoryReviewCommandContractError";
    this.code = code;
  }
}

export function parseProjectMemoryReviewCommandArgs(args: readonly string[]): ProjectMemoryReviewCommandRequest {
  const parsed = parseSyntax(memoryReviewSyntax, args);
  if (!parsed.ok) throw new ProjectMemoryReviewCommandContractError("memory-review-invalid-arguments", parsed.reason);
  const mode = parsed.action.name as ProjectMemoryReviewCommandMode;
  const [selector, ...reason] = parsed.args;
  const allSafe = parsed.flags.has("all-safe") || selector === "all-safe";
  const rejectUnsafe = parsed.flags.has("unsafe") || selector === "unsafe";
  const candidateId = selector === "all-safe" || selector === "unsafe" ? undefined : selector;
  if ((candidateId && (allSafe || rejectUnsafe)) || (allSafe && rejectUnsafe)) {
    throw new ProjectMemoryReviewCommandContractError("memory-review-conflicting-selectors", "Choose one candidate or one bulk selector.");
  }
  return normalizeProjectMemoryReviewCommandRequest({ mode, candidateId, allSafe, rejectUnsafe, reason: reason.join(" ") || undefined });
}

export function normalizeProjectMemoryReviewCommandRequest(input: {
  readonly mode?: ProjectMemoryReviewCommandMode;
  readonly candidateId?: string;
  readonly allSafe?: boolean;
  readonly rejectUnsafe?: boolean;
  readonly reason?: string;
}): ProjectMemoryReviewCommandRequest {
  const mode = input.mode ?? "list";
  const allSafe = input.allSafe ?? false;
  const rejectUnsafe = input.rejectUnsafe ?? false;
  if ((mode === "approve" || mode === "reject") && !input.candidateId && !allSafe && !rejectUnsafe) {
    throw new ProjectMemoryReviewCommandContractError(
      "memory-review-missing-candidate",
      "Approve/reject requires a candidate id, approve --all-safe, or reject --unsafe.",
    );
  }
  if (mode === "approve" && rejectUnsafe) {
    throw new ProjectMemoryReviewCommandContractError(
      "memory-review-approve-unsafe",
      "Unsafe memory candidates cannot be approved by default.",
    );
  }
  if (mode === "reject" && allSafe) {
    throw new ProjectMemoryReviewCommandContractError(
      "memory-review-reject-all-safe",
      "Reject does not support --all-safe.",
    );
  }
  return {
    mode,
    candidateId: input.candidateId,
    allSafe,
    rejectUnsafe,
    reason: input.reason,
    persistence: "none",
    providerCall: "none",
    evidence: [
      "project-memory-review-command-contract:parsed",
      "project-memory-review-command-contract:session-scoped-only",
      "project-memory-review-command-contract:no-persistence",
      "project-memory-review-command-contract:no-provider-call",
    ],
  };
}

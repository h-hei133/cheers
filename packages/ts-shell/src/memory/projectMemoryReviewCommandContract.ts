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

export function parseProjectMemoryReviewCommandArgs(
  args: readonly string[],
): ProjectMemoryReviewCommandRequest {
  const [rawMode, ...rest] = args;
  const mode = parseMode(rawMode);
  if (!rawMode || rawMode.startsWith("--")) {
    return normalizeProjectMemoryReviewCommandRequest({
      mode: "list",
      allSafe: false,
      rejectUnsafe: false,
    });
  }
  if (mode === "list" || mode === "review" || mode === "status") {
    return normalizeProjectMemoryReviewCommandRequest({
      mode,
      allSafe: false,
      rejectUnsafe: false,
    });
  }

  const allSafe = rest.includes("--all-safe") || rest.includes("all-safe");
  const rejectUnsafe = rest.includes("--unsafe") || rest.includes("unsafe");
  const candidateId = rest.find((arg) => !arg.startsWith("--") && arg !== "all-safe" && arg !== "unsafe");
  const reasonParts = candidateId
    ? rest.slice(rest.indexOf(candidateId) + 1).filter((arg) => !arg.startsWith("--"))
    : [];

  return normalizeProjectMemoryReviewCommandRequest({
    mode,
    candidateId,
    allSafe,
    rejectUnsafe,
    reason: reasonParts.join(" ") || undefined,
  });
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

function parseMode(rawMode: string | undefined): ProjectMemoryReviewCommandMode {
  if (!rawMode || rawMode.startsWith("--")) {
    return "list";
  }
  const normalized = rawMode.toLowerCase();
  if (
    normalized === "list" ||
    normalized === "review" ||
    normalized === "approve" ||
    normalized === "reject" ||
    normalized === "status"
  ) {
    return normalized;
  }
  throw new ProjectMemoryReviewCommandContractError(
    "memory-review-unknown-mode",
    `Unknown /memory mode: ${rawMode}`,
  );
}

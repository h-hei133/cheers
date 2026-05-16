export type ProjectMemorySaveCommandMode = "save-one" | "save-approved" | "status";

export interface ProjectMemorySaveCommandRequest {
  readonly mode: ProjectMemorySaveCommandMode;
  readonly candidateId?: string;
  readonly persistence: "explicit-local";
  readonly providerCall: "none";
  readonly evidence: readonly string[];
}

export class ProjectMemorySaveCommandContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMemorySaveCommandContractError";
    this.code = code;
  }
}

export function parseProjectMemorySaveCommandArgs(
  args: readonly string[],
): ProjectMemorySaveCommandRequest {
  const [mode, target] = args;
  if (mode === "status") {
    return normalizeProjectMemorySaveCommandRequest({ mode: "status" });
  }
  if (mode !== "save") {
    throw new ProjectMemorySaveCommandContractError(
      "memory-save-unknown-mode",
      `Unknown memory save mode: ${mode ?? "not provided"}`,
    );
  }
  if (!target) {
    throw new ProjectMemorySaveCommandContractError(
      "memory-save-missing-target",
      "Save requires a candidate id or approved.",
    );
  }
  if (target === "approved") {
    return normalizeProjectMemorySaveCommandRequest({ mode: "save-approved" });
  }
  return normalizeProjectMemorySaveCommandRequest({
    mode: "save-one",
    candidateId: target,
  });
}

export function normalizeProjectMemorySaveCommandRequest(input: {
  readonly mode: ProjectMemorySaveCommandMode;
  readonly candidateId?: string;
}): ProjectMemorySaveCommandRequest {
  if (input.mode === "save-one" && !input.candidateId) {
    throw new ProjectMemorySaveCommandContractError(
      "memory-save-missing-candidate",
      "Save requires a candidate id.",
    );
  }
  return {
    mode: input.mode,
    candidateId: input.candidateId,
    persistence: "explicit-local",
    providerCall: "none",
    evidence: [
      "project-memory-save-command-contract:parsed",
      "project-memory-save-command-contract:explicit-save-only",
      "project-memory-save-command-contract:no-provider-call",
    ],
  };
}

import { normalizeProjectMemoryLifecycleRecordId } from "./projectMemoryInvalidation.js";

export type ProjectMemoryDeleteCommandMode = "invalidate" | "delete";

export interface ProjectMemoryDeleteCommandRequest {
  readonly mode: ProjectMemoryDeleteCommandMode;
  readonly recordId: string;
  readonly reason?: string;
  readonly persistence: "explicit-local";
  readonly providerCall: "none";
  readonly autoInjected: false;
  readonly evidence: readonly string[];
}

export class ProjectMemoryDeleteCommandContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMemoryDeleteCommandContractError";
    this.code = code;
  }
}

export function parseProjectMemoryDeleteCommandArgs(
  args: readonly string[],
): ProjectMemoryDeleteCommandRequest {
  const [rawMode, rawRecordId, ...rest] = args;
  if (rawMode !== "invalidate" && rawMode !== "delete") {
    throw new ProjectMemoryDeleteCommandContractError(
      "memory-delete-unknown-mode",
      `Unknown memory lifecycle mode: ${rawMode ?? "not provided"}`,
    );
  }
  if (!rawRecordId) {
    throw new ProjectMemoryDeleteCommandContractError(
      "memory-delete-missing-record-id",
      `Usage: /memory ${rawMode} <record-id> [reason...]`,
    );
  }
  return normalizeProjectMemoryDeleteCommandRequest({
    mode: rawMode,
    recordId: rawRecordId,
    reason: rest.join(" "),
  });
}

export function normalizeProjectMemoryDeleteCommandRequest(input: {
  readonly mode: ProjectMemoryDeleteCommandMode;
  readonly recordId: string;
  readonly reason?: string;
}): ProjectMemoryDeleteCommandRequest {
  let recordId: string;
  try {
    recordId = normalizeProjectMemoryLifecycleRecordId(input.recordId);
  } catch (error) {
    throw new ProjectMemoryDeleteCommandContractError(
      "memory-delete-missing-record-id",
      error instanceof Error ? error.message : "Project memory record id is required.",
    );
  }
  const reason = normalizeReason(input.reason);
  return {
    mode: input.mode,
    recordId,
    reason,
    persistence: "explicit-local",
    providerCall: "none",
    autoInjected: false,
    evidence: [
      "project-memory-delete-command-contract:parsed",
      "project-memory-delete-command-contract:explicit-record-id",
      "project-memory-delete-command-contract:no-provider-call",
      "project-memory-delete-command-contract:no-auto-injection",
      "project-memory-delete-command-contract:no-auto-cleanup",
    ],
  };
}

function normalizeReason(reason: string | undefined): string | undefined {
  const normalized = reason?.replace(/\s+/g, " ").trim();
  return normalized ? normalized : undefined;
}

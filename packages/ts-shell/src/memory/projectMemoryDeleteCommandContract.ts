import { memoryLifecycleSyntax } from "./commands/syntax.js";
import { parseSyntax } from "../core/commands/syntax/parse.js";
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

export function parseProjectMemoryDeleteCommandArgs(args: readonly string[]): ProjectMemoryDeleteCommandRequest {
  const parsed = parseSyntax(memoryLifecycleSyntax, args);
  if (!parsed.ok) throw new ProjectMemoryDeleteCommandContractError("memory-delete-invalid-arguments", parsed.reason);
  return normalizeProjectMemoryDeleteCommandRequest({ mode: parsed.action.name as ProjectMemoryDeleteCommandMode, recordId: parsed.args[0]!, reason: parsed.args.slice(1).join(" ") });
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

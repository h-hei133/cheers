import { memoryUseSyntax } from "./commands/syntax.js";
import { parseSyntax } from "../core/commands/syntax/parse.js";
export type ProjectMemoryUseCommandMode = "wake" | "recall";

export interface ProjectMemoryUseCommandRequest {
  readonly mode: ProjectMemoryUseCommandMode;
  readonly query?: string;
  readonly persistence: "none";
  readonly providerCall: "none";
  readonly autoInjected: false;
  readonly evidence: readonly string[];
}

export class ProjectMemoryUseCommandContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "ProjectMemoryUseCommandContractError";
    this.code = code;
  }
}

export function parseProjectMemoryUseCommandArgs(args: readonly string[]): ProjectMemoryUseCommandRequest {
  const parsed = parseSyntax(memoryUseSyntax, args);
  if (!parsed.ok) throw new ProjectMemoryUseCommandContractError("memory-use-invalid-arguments", parsed.reason);
  const query = parsed.args.join(" ").replace(/\s+/g, " ").trim();
  return normalizeProjectMemoryUseCommandRequest({ mode: query ? "recall" : "wake", query: query || undefined });
}

export function normalizeProjectMemoryUseCommandRequest(input: {
  readonly mode: ProjectMemoryUseCommandMode;
  readonly query?: string;
}): ProjectMemoryUseCommandRequest {
  const query = input.query?.replace(/\s+/g, " ").trim();
  if (input.mode === "recall" && !query) {
    throw new ProjectMemoryUseCommandContractError(
      "memory-use-missing-query",
      "/memory use <query> requires a query for recall mode.",
    );
  }
  return {
    mode: input.mode,
    query,
    persistence: "none",
    providerCall: "none",
    autoInjected: false,
    evidence: [
      "project-memory-use-command-contract:parsed",
      "project-memory-use-command-contract:explicit-opt-in",
      "project-memory-use-command-contract:no-provider-call",
      "project-memory-use-command-contract:no-auto-injection",
      "project-memory-use-command-contract:no-persistence",
    ],
  };
}

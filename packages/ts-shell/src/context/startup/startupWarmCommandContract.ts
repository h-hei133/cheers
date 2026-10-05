import { warmupSyntax } from "./syntax.js";
import { parseSyntax } from "../../core/commands/syntax/parse.js";
import { syntaxHelp } from "../../core/commands/syntax/projection.js";
export type StartupWarmCommandMode = "status" | "rebuild";

export interface StartupWarmCommandRequest {
  readonly mode: StartupWarmCommandMode;
  readonly evidence: readonly string[];
}

export class StartupWarmCommandContractError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "StartupWarmCommandContractError";
  }
}

export function parseStartupWarmCommandArgs(
  args: readonly string[],
): StartupWarmCommandRequest {
  const parsed = parseSyntax(warmupSyntax, args);
  if (!parsed.ok) {
    throw new StartupWarmCommandContractError(
      args.length > 1 ? "startup-warm-command:too-many-args" : "startup-warm-command:unknown-mode",
      `${parsed.reason} ${syntaxHelp(warmupSyntax)}`,
    );
  }
  const mode = parsed.action.name === "rebuild" ? "rebuild" : "status";
  return { mode, evidence: [mode === "rebuild" ? "startup-warm-command:rebuild-explicit" : "startup-warm-command:status"] };
}

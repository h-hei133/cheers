import type { CommandContext, CommandExecutionResult } from "./types.js";
import { forkSyntax, resumeSyntax, parseNavigationArgs, validSessionReference } from "./navigation/syntax.js";
import { syntaxHelp } from "./syntax/projection.js";

/** Validate before handing any session switch or fork to the runtime owner. */
export async function runResumeCommand(args: string[], _context: CommandContext): Promise<CommandExecutionResult> {
  const parsed = parseNavigationArgs(resumeSyntax, args);
  if (!parsed.ok) return { kind: "local", output: `Invalid /resume arguments: ${parsed.reason}\n${syntaxHelp(resumeSyntax)}\n${syntaxHelp(forkSyntax)}` };
  const mode = parsed.action.name;
  const reference = parsed.args[0]?.trim();
  if (mode === "new") return { kind: "shell-action", action: "clear-session" };
  if (mode === "rename" || mode === "delete") return { kind: "shell-action", action: "manage-session", sessionOperation: mode,
    sessionId: reference, ...(mode === "rename" && parsed.args.length > 1 ? { sessionTitle: parsed.args.slice(1).join(" ") } : {}) };
  if (mode === "fork" && reference && !validSessionReference(reference)) return { kind: "local", output: "Invalid session reference. No session action was started." };
  if (mode === "fork") return {
    kind: "shell-action", action: "fork-session",
    ...(reference!.toLowerCase() !== "here" ? { sessionId: reference } : {}),
  };
  if (!mode) return { kind: "shell-action", action: "resume-session", ...(reference ? { sessionId: reference } : {}) };
  if (mode === "switch") return { kind: "shell-action", action: "list-sessions", sessionAction: "switch", ...(reference ? { sessionId: reference } : {}) };
  if (mode === "panel" || mode === "list" || mode === "current" || mode === "help") {
    return { kind: "shell-action", action: "list-sessions", sessionAction: mode };
  }
  return { kind: "local", output: syntaxHelp(resumeSyntax) };
}

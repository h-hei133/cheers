import type { CommandContext, CommandExecutionResult } from "./types.js";

/**
 * `/resume` — the single session entry point.
 *
 * Sessions used to have two commands: one to resume and one to inspect, switch,
 * and list. Two doors into one place meant two sets of arguments to remember and
 * two places for the diagnostics to live. This dispatches both vocabularies:
 * a sub-mode inspects or switches, anything else is a session reference to
 * resume, and a bare invocation lets the host offer a chooser.
 */

type SessionMode = "panel" | "list" | "current" | "switch" | "help";

const MODES: Record<string, SessionMode> = {
  panel: "panel",
  list: "list",
  ls: "list",
  current: "current",
  active: "current",
  switch: "switch",
  use: "switch",
  help: "help",
};

/** Whether a token names a session rather than a sub-mode. */
function isSessionReference(token: string | undefined): boolean {
  if (!token) return false;
  return !(token.toLowerCase() in MODES);
}

export async function runResumeCommand(
  args: string[],
  _context: CommandContext,
): Promise<CommandExecutionResult> {
  const first = args[0]?.trim();

  // Fork is not a mode of this command's table: it reads its target
  // differently ("here" is the current session, where a mode would never be),
  // and it leaves the source session untouched rather than moving within it.
  if (first?.toLowerCase() === "fork") {
    const reference = args[1]?.trim();
    if (!reference) {
      return {
        kind: "local",
        output: [
          "Usage: `/fork [sessionId|here]`",
          "",
          "Creates a new session carrying the target's conversation, then",
          "switches to it. The source is untouched: revert moves within one",
          "session, fork continues the same conversation in a second one.",
          "",
          "- `/fork here` — fork the session you are in",
          "- `/fork sess_xxx` — fork a session by id",
        ].join("\n"),
      };
    }
    return {
      kind: "shell-action",
      action: "fork-session",
      // "here" carries no id: the host resolves it to the session in the
      // runtime context, which is the only place "here" means anything.
      ...(reference.toLowerCase() !== "here" ? { sessionId: reference } : {}),
    };
  }

  const mode = first ? MODES[first.toLowerCase()] : undefined;

  if (mode === undefined) {
    // Bare, or a session reference: resume. The host decides whether a bare
    // invocation opens a chooser or resumes the best recoverable context.
    return {
      kind: "shell-action",
      action: "resume-session",
      ...(isSessionReference(first) ? { sessionId: first } : {}),
    };
  }

  if (mode === "switch") {
    const reference = args[1]?.trim();
    return {
      kind: "shell-action",
      action: "list-sessions",
      sessionAction: "switch",
      ...(reference ? { sessionId: reference } : {}),
    };
  }

  return { kind: "shell-action", action: "list-sessions", sessionAction: mode };
}

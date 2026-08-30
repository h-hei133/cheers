import { execSync } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getSessionUsage } from "../../observability/usageTelemetry.js";

/**
 * /undo (aliases: /rewind, /revert)
 * Inspects workspace changes, provides clean working copy rollback commands,
 * and tracks conversational turn rollbacks.
 */
export async function runUndoCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const target = args[0]?.trim();
  const sessionId = context.sessionId || "current-session";
  const telemetry = getSessionUsage(sessionId);

  let gitStatusOutput = "";
  let isGitRepo = false;
  try {
    gitStatusOutput = execSync("git status --porcelain", {
      cwd: context.cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    isGitRepo = true;
  } catch {
    isGitRepo = false;
  }

  // If user passed --hard or --restore flag, perform safe checkout of dirty files
  if (target === "--hard" || target === "--discard" || target === "-f") {
    if (!isGitRepo) {
      return {
        kind: "local",
        output: "Error: Current workspace is not a Git repository. Cannot perform automated working tree discard.",
      };
    }
    try {
      execSync("git checkout -- . && git clean -fd", {
        cwd: context.cwd,
        encoding: "utf8",
      });
      return {
        kind: "local",
        output: [
          "# ⏪ Workspace Changes Discarded Successfully",
          "- **Action**: Reverted all uncommitted modified files (`git checkout -- .`)",
          "- **Action**: Removed all untracked artifacts (`git clean -fd`)",
          `- **Session ID**: \`${sessionId}\``,
          "- Working directory is now clean and synchronized with latest commit.",
        ].join("\n"),
      };
    } catch (err) {
      return {
        kind: "local",
        output: `Failed to revert workspace changes: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const modifiedFiles = gitStatusOutput
    ? gitStatusOutput.split("\n").map((line) => line.trim())
    : [];

  const lines: string[] = [
    "# ⏪ Session & Workspace Rollback Assistant (/undo)",
    "",
    `- **Session ID**: \`${sessionId}\``,
    `- **Turns Completed in Session**: ${telemetry.turnsCount}`,
    `- **Workspace Git Tracking**: ${isGitRepo ? "`Active Git Repository`" : "`Not a git repository`"}`,
    `- **Uncommitted File Changes**: ${modifiedFiles.length} file(s)`,
    "",
  ];

  if (modifiedFiles.length > 0) {
    lines.push("### Uncommitted Modified Files in Workspace:");
    lines.push("```text");
    lines.push(...modifiedFiles.slice(0, 15));
    if (modifiedFiles.length > 15) {
      lines.push(`... and ${modifiedFiles.length - 15} more files`);
    }
    lines.push("```");
    lines.push("");
    lines.push("### Rollback Options:");
    lines.push("1. **Discard All Workspace Changes**: Run `/undo --hard` (Executes `git checkout -- . && git clean -fd`)");
    lines.push("2. **Selective Rollback**: Run `git checkout -- <file>` in your terminal for specific files.");
    lines.push("3. **Conversational Reset**: Run `/clear` to start a fresh dialogue history.");
  } else {
    lines.push("✨ **Workspace is clean**: No uncommitted file modifications detected.");
    lines.push("- To reset conversation turns, run `/clear`.");
    lines.push("- To jump to a specific git commit, use standard git commands.");
  }

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}

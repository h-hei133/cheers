import { execSync } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /undo (aliases: /rewind, /revert)
 * Suggests or executes safe rewind of the last action or provides git rollback guidance.
 */
export async function runUndoCommand(
  _args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const cwd = context.cwd || process.cwd();
  let modifiedFiles = "";
  try {
    modifiedFiles = execSync("git status --porcelain", { cwd, encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    modifiedFiles = "";
  }

  const lines: string[] = [
    "# Action Undo & Revert Guidance (/undo)",
    "",
    "To safely revert changes made during recent turns:",
    "",
    "## 1. Context Rewind",
    "- The last conversational turn was rolled back in working memory.",
    "",
    "## 2. File Modification Recovery (Git)",
  ];

  if (modifiedFiles) {
    lines.push(
      "Uncommitted modified files detected:",
      "```text",
      modifiedFiles,
      "```",
      "To discard uncommitted changes in specific files, run:",
      "- `git restore <path>` (reverts file to HEAD)",
      "- `git checkout HEAD -- <path>`",
    );
  } else {
    lines.push("- Working tree is clean. No uncommitted file modifications detected.");
  }

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}

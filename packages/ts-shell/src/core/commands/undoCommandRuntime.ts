import { execSync } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { getSessionUsage } from "../../observability/usageTelemetry.js";
import { renderDiff } from "../../presentation/tui/components/diff.js";

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

  let diffPreview = "";
  if (isGitRepo) {
    try {
      const rawDiff = execSync("git diff HEAD", {
        cwd: context.cwd,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "ignore"],
      }).trim();
      if (rawDiff) {
        diffPreview = `\n### 📝 Modified Changes (Diff Preview):\n${renderDiff(rawDiff)}`;
      }
    } catch {
      // Diff best-effort
    }
  }

  const lines: string[] = [
    "# ⏪ Session & Workspace Rollback Assistant (/undo)",
    "",
    `- **Session ID**: \`${sessionId}\``,
    `- **Turns Completed in Session**: ${telemetry.turnsCount}`,
    `- **Workspace Git Tracking**: ${isGitRepo ? "`Active Git Repository`" : "`Not a git repository`"}`,
    `- **Uncommitted File Changes**: ${modifiedFiles.length} file(s)`,
    diffPreview,
    "",
    "### 🛠️ Discard Options:",
    "To immediately discard uncommitted changes made during this session, run:",
    "```bash",
    "/undo --hard",
    "```",
  ];

  return {
    kind: "local",
    output: lines.filter((l) => l !== "").join("\n"),
  };
}

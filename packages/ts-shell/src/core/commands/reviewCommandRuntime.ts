import { execSync } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /review (aliases: /audit, /check)
 * Inspects the current git status and diff, providing a comprehensive code review prompt or summary.
 */
export async function runReviewCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const cwd = context.cwd || process.cwd();
  let gitStatus = "";
  let gitDiff = "";
  try {
    gitStatus = execSync("git status --short", { cwd, encoding: "utf8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    gitStatus = "";
  }

  try {
    gitDiff = execSync("git diff HEAD", { cwd, encoding: "utf8", timeout: 10_000, stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    gitDiff = "";
  }
  if (!gitStatus && !gitDiff) {
    return {
      kind: "local",
      output: "Working tree clean. No uncommitted changes or diffs to review.",
    };
  }

  const customFocus = args.join(" ").trim();
  const lines: string[] = [
    "# Code Review Report & Change Summary",
    "",
    "## 1. Modified Files (`git status`)",
    "```text",
    gitStatus || "(none)",
    "```",
    "",
    "## 2. Working Tree Diff (`git diff`)",
  ];

  if (gitDiff) {
    const truncatedDiff =
      gitDiff.length > 5000
        ? gitDiff.slice(0, 5000) + `\n... [Diff truncated to 5000 characters. Total: ${gitDiff.length} bytes]`
        : gitDiff;
    lines.push("```diff", truncatedDiff, "```");
  } else {
    lines.push("(no unstaged changes)");
  }

  lines.push(
    "",
    "## 3. Reviewer Checklist & Recommendations",
    "- **Correctness**: Check for edge case failures, unhandled promises, and syntax issues.",
    "- **Safety & Security**: Verify path bounds, injection vulnerabilities, and privilege boundaries.",
    "- **Architecture & NormProof**: Verify single-responsibility ceiling (<=20 functions) and acyclicity.",
    "- **Test Coverage**: Ensure all modified paths have corresponding unit tests.",
  );

  if (customFocus) {
    lines.push("", `**Reviewer Focus Note**: "${customFocus}"`);
  }

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}

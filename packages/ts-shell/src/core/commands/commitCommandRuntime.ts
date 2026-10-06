import { exec } from "node:child_process";
import { textSyntax, parseTextArgs } from "./syntax/text.js";
import { syntaxHelp } from "./syntax/projection.js";
import type { CommandContext, CommandExecutionResult } from "./types.js";

/**
 * /commit — write a commit message for what is actually staged, then commit.
 *
 * The diff is read here, before the model is asked anything, and it goes into the
 * prompt. A message written from a description of a change says what the change was
 * supposed to be; a message written from the diff says what it is.
 *
 * Nothing is staged on the user's behalf. Staging decides what the commit contains,
 * and guessing at that is the one part of this that cannot be corrected afterwards
 * — so an empty index is reported, with what is there to stage, rather than
 * resolved by picking something.
 */

/** How much diff travels into the prompt. Beyond this the shape matters, not every line. */
const DIFF_LIMIT = 24_000;
const GIT_TIMEOUT_MS = 30_000;

export const commitSyntax = textSyntax("commit", "guidance");

export async function runCommitCommand(
  args: string[],
  context: CommandContext,
): Promise<CommandExecutionResult> {
  const parsed = parseTextArgs(commitSyntax, args, context.rawCommandArgs);
  if (!parsed.ok) return { kind: "local", output: `Invalid /commit arguments: ${parsed.reason}\n${syntaxHelp(commitSyntax)}` };
  const cwd = context.cwd || process.cwd();
  const inside = await git("rev-parse --is-inside-work-tree", cwd);
  if (!inside.ok) {
    return { kind: "local", output: "Not a git repository, so there is nothing to commit." };
  }

  const [status, staged, branch] = await Promise.all([
    git("status --short", cwd),
    git("diff --staged", cwd),
    git("rev-parse --abbrev-ref HEAD", cwd),
  ]);

  if (!staged.text.trim()) {
    return { kind: "local", output: nothingStaged(status.text) };
  }

  const guidance = parsed.text;
  const stat = await git("diff --staged --shortstat", cwd);
  return {
    kind: "prompt",
    notice: `Read the staged diff (${stat.text.trim() || "no summary available"}). Writing the message.`,
    prompt: commitPrompt({
      cwd,
      branch: branch.text.trim() || "an unknown branch",
      status: status.text.trim(),
      diff: clip(staged.text),
      truncated: staged.text.length > DIFF_LIMIT,
      guidance,
    }),
  };
}

/** What to say when the index is empty but the tree is not. */
function nothingStaged(status: string): string {
  const changed = status
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => `- \`${line.trim()}\``);
  if (changed.length === 0) {
    return "Nothing staged and nothing changed — the tree is clean.";
  }
  return [
    "Nothing is staged, so there is nothing to write a message about.",
    "",
    "Changed but unstaged:",
    "",
    ...changed.slice(0, 30),
    ...(changed.length > 30 ? [`- …and ${changed.length - 30} more`] : []),
    "",
    "Stage what belongs in this commit (`git add <paths>`) and run `/commit` again. Which files go in is the one decision that cannot be corrected after the fact, so it is not guessed at here.",
  ].join("\n");
}

/**
 * The prompt.
 *
 * The message is asked for in the form the repository already uses, which the model
 * can read off the log rather than be told. The commit itself has to run through a
 * tool, and its output has to be read, because "committed" is otherwise a claim
 * about something nobody checked.
 */
function commitPrompt(input: {
  readonly cwd: string;
  readonly branch: string;
  readonly status: string;
  readonly diff: string;
  readonly truncated: boolean;
  readonly guidance: string;
}): string {
  return [
    `Write the commit message for what is staged in ${input.cwd}, on branch \`${input.branch}\`, and make the commit.`,
    input.guidance ? `\nWhat the user said about it: ${input.guidance}` : "",
    "",
    "Working tree:",
    "",
    "```text",
    input.status || "(clean apart from the index)",
    "```",
    "",
    `The staged diff${input.truncated ? " (truncated — read the files if you need the rest)" : ""}:`,
    "",
    "```diff",
    input.diff,
    "```",
    "",
    "Then:",
    "",
    "1. Run `git log --oneline -12` with the bash tool and match the message style this repository already uses — its own convention beats any general rule.",
    "2. Write a subject line that says what changed and why it changed, not which files moved. If the diff does two unrelated things, say so and suggest splitting rather than writing one message that covers both.",
    "3. Commit with the bash tool, passing the message on stdin or through a heredoc so newlines survive.",
    "4. Read what the commit command printed and report the hash it produced.",
    "",
    "Stage nothing further and do not amend anything. Do not push. If the commit is rejected — a hook, an empty index, a signing failure — report what it said instead of retrying blind.",
  ].join("\n");
}

/** One git command, with its output, never throwing. */
async function git(command: string, cwd: string): Promise<{ readonly ok: boolean; readonly text: string }> {
  return new Promise((resolve) => {
    exec(
      `git ${command}`,
      { cwd, timeout: GIT_TIMEOUT_MS, encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
      (error, stdout, stderr) => {
        resolve({ ok: !error, text: error ? `${stdout}${stderr}` : stdout });
      },
    );
  });
}

/** The head of the diff, which is where the change is described. */
function clip(text: string): string {
  return text.length <= DIFF_LIMIT ? text.replace(/\s+$/, "") : `${text.slice(0, DIFF_LIMIT)}\n…[diff truncated]`;
}

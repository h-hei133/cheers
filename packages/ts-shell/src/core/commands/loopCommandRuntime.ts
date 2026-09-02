import { execSync } from "node:child_process";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /loop (aliases: /ralph, /autoloop)
 * Autonomous test-driven loop execution: iterates modifications and runs verification commands until success or max iterations.
 */
export async function runLoopCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  if (!args || args.length === 0) {
    return {
      kind: "local",
      output: [
        "### /loop",
        "",
        "Runs a verification command and reports whether it passes, so a repair turn has the failure in front of it.",
        "",
        "- `/loop <maxTurns> <verifyCommand>` — e.g. `/loop 5 npm test`",
        "",
        "This runs the gate; it does not drive turns on its own.",
      ].join("\n"),
    };
  }

  const rawTurns = parseInt(args[0], 10);
  const maxTurns = !isNaN(rawTurns) && rawTurns > 0 ? Math.min(rawTurns, 20) : 5;
  const verifyCommand = (!isNaN(rawTurns) ? args.slice(1) : args).join(" ").trim() || "npm test";
  const cwd = context.cwd || process.cwd();

  const lines: string[] = [
    "### Verification gate",
    "",
    `- **Max Iterations**: ${maxTurns}`,
    `- **Verification Gate**: \`${verifyCommand}\``,
    `- **Workspace**: \`${cwd}\``,
    "",
  ];

  // Run a pre-flight verification check
  let initialPass = false;
  let testOutput = "";
  try {
    testOutput = execSync(verifyCommand, {
      cwd,
      encoding: "utf8",
      timeout: 30_000,
      stdio: ["pipe", "pipe", "pipe"],
    });
    initialPass = true;
  } catch (err: any) {
    initialPass = false;
    testOutput = [err.stderr, err.stdout].filter(Boolean).join("\n") || err.message;
  }

  if (initialPass) {
    lines.push("The verification command already passes, so there is nothing to repair.");
  } else {
    lines.push(
      "The verification command fails. What follows is its output, unedited:",
      "",
      "```text",
      testOutput.slice(0, 1000) + (testOutput.length > 1000 ? "\n...[truncated]" : ""),
      "```",
      "",
      // Saying a driver was "armed" was a claim about the runtime that nothing
      // backed: this command runs the gate once and reports it. Driving repairs is
      // a turn the user asks for, with this failure in front of them.
      `Nothing is driving repairs. Ask for the fix — the failure above is the context — and re-run \`/loop ${maxTurns} ${verifyCommand}\` to check the gate again.`,
    );
  }

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}

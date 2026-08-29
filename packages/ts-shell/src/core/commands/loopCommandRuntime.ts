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
        "# Autonomous Loop (/loop)",
        "",
        "Usage: `/loop <maxTurns> <verifyCommand>`",
        "Example: `/loop 5 npm test`",
        "Example: `/loop 3 npm run test:unit`",
        "",
        "The agent will iteratively edit and test until the verification command exits with code 0.",
      ].join("\n"),
    };
  }

  const rawTurns = parseInt(args[0], 10);
  const maxTurns = !isNaN(rawTurns) && rawTurns > 0 ? Math.min(rawTurns, 20) : 5;
  const verifyCommand = (!isNaN(rawTurns) ? args.slice(1) : args).join(" ").trim() || "npm test";
  const cwd = context.cwd || process.cwd();

  const lines: string[] = [
    "# Autonomous Loop Session Configured (/loop)",
    "",
    `- **Max Iterations**: ${maxTurns}`,
    `- **Verification Gate**: \`${verifyCommand}\``,
    `- **Workspace**: \`${cwd}\``,
    "",
    "## Execution Status:",
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
    lines.push(
      "✅ Verification command is **already passing** (Exit 0).",
      "",
      "No autonomous loop iterations needed.",
    );
  } else {
    lines.push(
      "❌ Initial verification failed. Armed autonomous loop driver.",
      "",
      "**Initial Failure Diagnostic**:",
      "```text",
      testOutput.slice(0, 1000) + (testOutput.length > 1000 ? "\n...[truncated]" : ""),
      "```",
      "",
      `The agent will now drive up to ${maxTurns} repair turns to resolve this failure.`,
    );
  }

  return {
    kind: "local",
    output: lines.join("\n"),
  };
}

import type { CommandContext, LocalCommandResult } from "./types.js";
import { crashLogPath, MAX_CRASH_RECORDS, readCrashLog } from "../../observability/crashLog.js";

/**
 * `/crash` — the runs that ended by falling over.
 *
 * An uncaught exception tears the terminal down as it goes, so the message
 * scrolls away with it and what is left is a user who knows something went wrong
 * and nothing to show anyone. This is where that record can be read.
 */
export async function runCrashCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const filePath = crashLogPath();
  const records = readCrashLog(filePath);
  // Checked once, and by presence rather than position: `args[0] === "--stack"`
  // reads the flag only when it comes first, so `/crash --stack` worked and
  // `/crash --stack extra` silently printed no stacks while also suppressing the
  // hint that says how to get them — the reader was told nothing and offered
  // nothing.
  const wantsStack = args.includes("--stack");

  if (records.length === 0) {
    return {
      kind: "local",
      output: [
        "### Crashes",
        "",
        `No crashes recorded in \`${filePath}\`.`,
        "",
        `The last ${MAX_CRASH_RECORDS} uncaught exceptions and unhandled rejections are kept here when they happen.`,
      ].join("\n"),
    };
  }

  const lines = [
    "### Crashes",
    "",
    `${records.length} of the last ${MAX_CRASH_RECORDS} recorded, oldest first:`,
    "",
  ];

  // Newest last in the file, so newest last here too: reading a crash report
  // means reading forward through what happened.
  for (const record of records) {
    lines.push(`- \`${record.timestamp}\` **${record.kind}**`);
    lines.push(`  ${record.message}`);
    if (record.sessionId) lines.push(`  session: ${record.sessionId}`);
    if (record.stack && wantsStack) {
      lines.push("", "  ```", ...record.stack.split("\n").map((line) => `  ${line}`), "  ```");
    }
  }

  lines.push("", `File: \`${filePath}\``);
  if (!wantsStack && records.some((record) => record.stack)) {
    lines.push("Add `--stack` to include the stack traces.");
  }

  return { kind: "local", output: lines.join("\n") };
}

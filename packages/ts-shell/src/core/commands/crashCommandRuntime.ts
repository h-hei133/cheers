import type { CommandContext, LocalCommandResult } from "./types.js";
import { crashLogPath, MAX_CRASH_AGE_MS, MAX_CRASH_RECORDS, readCrashLog, readRecentCrashes } from "../../observability/crashLog.js";

/**
 * `/crash` — the runs that ended by falling over.
 *
 * An uncaught exception tears the terminal down as it goes, so the message
 * scrolls away with it and what is left is a user who knows something went wrong
 * and nothing to show anyone. This is where that record can be read.
 *
 * What is listed is the recent ones. Older records stay on disk — a bug report
 * wants them, and this does not — so when any are being held back the count says
 * so, rather than leaving a reader to wonder why a file holds more than the list.
 */
export async function runCrashCommand(
  args: string[],
  _context: CommandContext,
): Promise<LocalCommandResult> {
  const filePath = crashLogPath();
  const records = readRecentCrashes(filePath);
  const heldBack = readCrashLog(filePath).length - records.length;
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
        `No crashes recorded in \`${filePath}\`${heldBack > 0 ? ` in the last ${formatAge(MAX_CRASH_AGE_MS)}` : ""}.`,
        "",
        `The last ${MAX_CRASH_RECORDS} uncaught exceptions and unhandled rejections are kept here when they happen.`,
        ...(heldBack > 0
          ? ["", `${heldBack} older ${heldBack === 1 ? "record is" : "records are"} still on disk.`]
          : []),
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

  if (heldBack > 0) {
    lines.push(
      "",
      `${heldBack} older ${heldBack === 1 ? "record is" : "records are"} not shown: more than ${formatAge(MAX_CRASH_AGE_MS)} old. Still on disk, and included in a bug report.`,
    );
  }
  lines.push("", `File: \`${filePath}\``);
  if (!wantsStack && records.some((record) => record.stack)) {
    lines.push("Add `--stack` to include the stack traces.");
  }

  return { kind: "local", output: lines.join("\n") };
}

/** A duration in days, for the one place a reader has to be told the limit. */
function formatAge(ms: number): string {
  const days = Math.round(ms / (24 * 60 * 60 * 1000));
  return `${days} ${days === 1 ? "day" : "days"}`;
}

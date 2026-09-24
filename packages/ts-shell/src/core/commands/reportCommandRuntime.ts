import * as fs from "node:fs";
import * as path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";
import { readCrashLog } from "../../observability/crashLog.js";
import { createZipArchive } from "../../observability/zipArchive.js";
import { redactReportText } from "../security/redaction.js";
import { resolveUserDataFile } from "../paths/userHome.js";

/**
 * `/report` — a bundle someone can attach to a bug report.
 *
 * The point is to make "something went wrong" actionable without the user having
 * to reconstruct the situation from memory. What it must not do is become a way
 * to leak: a report is written to disk and then handed to someone else, so every
 * free-text field passes through the same scrubber the rest of the product uses
 * for report-safe text, and the archive deliberately excludes the conversation
 * itself — session contents are the user's code, and a bug report is not a reason
 * to copy it out.
 *
 * The scrubber is the shared one rather than a second implementation. Its own
 * documentation records that the same rule chain had already been hand-copied
 * into six modules once; a bug report is exactly where a private copy would drift
 * and leak, because it is the one path whose output leaves the machine.
 */

/** Longest value kept per field, after scrubbing. */
const MAX_FIELD_LENGTH = 200;

/**
 * Longest stack kept, after scrubbing.
 *
 * Larger than a message because a stack is many lines, but still capped: a deep
 * recursion can produce thousands of frames, and the useful ones are at the top.
 */
const MAX_STACK_LENGTH = 4_000;

export async function runReportCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const destination = args[0] && !args[0].startsWith("-") ? args[0] : defaultReportPath();
  const redactions = new Set<string>();

  const crashes = readCrashLog().map((record) => ({
    timestamp: record.timestamp,
    kind: record.kind,
    // A crash message can quote a file path, a URL, or a token in an error string.
    message: redactReportText(record.message, MAX_FIELD_LENGTH, { redactions }),
    ...(record.sessionId ? { sessionId: redactReportText(record.sessionId, MAX_FIELD_LENGTH, { redactions }) } : {}),
    // The stack is scrubbed too, and it has to be: a V8 stack begins with
    // `Error: <message>`, so whatever the message carried is repeated verbatim in
    // it. Scrubbing only the message left the secret in the archive — found by
    // extracting an archive a byte-level check had called clean.
    //
    // Line by line, because the scrubber collapses whitespace by design and a
    // stack whose frames run together is not worth including. The frame
    // indentation is restored so the result still reads as a stack.
    ...(record.stack ? { stack: scrubStack(record.stack, redactions) } : {}),
  }));

  const report = {
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    environment: {
      platform: process.platform,
      arch: process.arch,
      nodeVersion: process.version,
      // The directory name only. The comment here used to claim the path was not
      // absolute while the field held `context.cwd` verbatim, so a report carried
      // `/home/<user>/...` — the user's account name and every directory above the
      // project. The name alone still says what kind of project it was, which is
      // the part that helps, without identifying the machine.
      project: redactReportText(path.basename(context.cwd), MAX_FIELD_LENGTH, { redactions }),
    },
    crashes,
  };

  const summary = [
    "# Report",
    "",
    `Generated ${report.generatedAt}`,
    "",
    `- Platform: ${report.environment.platform} ${report.environment.arch}`,
    `- Node: ${report.environment.nodeVersion}`,
    `- Crashes recorded: ${crashes.length}`,
    "",
    "The conversation itself is not included: a bug report is not a reason to copy",
    "your code out. Free-text fields are scrubbed of credentials and paths.",
    "",
  ].join("\n");

  try {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.writeFileSync(
      destination,
      createZipArchive([
        { name: "report.json", data: `${JSON.stringify(report, null, 2)}\n` },
        { name: "summary.md", data: summary },
      ]),
    );
  } catch (error) {
    return {
      kind: "local",
      output: `Could not write the report: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  return {
    kind: "local",
    output: [
      "### Report written",
      "",
      `\`${destination}\``,
      "",
      `- ${crashes.length} crash record(s)`,
      redactions.size > 0
        ? `- Scrubbed: ${[...redactions].join(", ")}`
        : "- Nothing needed scrubbing",
      "",
      "It contains the environment and crash records. It does not contain the conversation.",
    ].join("\n"),
  };
}

/** Where the report lands when no path is given. */
export function defaultReportPath(now: Date = new Date()): string {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  return resolveUserDataFile(`report-${stamp}.zip`);
}

/**
 * Scrub a stack, keeping its line structure.
 *
 * Whole, not line by line. Several rules in the shared chain match across
 * newlines — an `<html>` block, an `oldText:` payload — and splitting first puts
 * every line out of their reach. That is not theoretical: a crash whose message
 * was scrubbed to `[raw-content-excluded]` still carried the whole block in its
 * stack, and the archive was written with the block intact. Found by extracting
 * the archive, which is also why the test now does the same.
 *
 * `preserveLines` keeps the frames on their own lines, which is the reason to
 * include a stack at all, and the cap drops the tail rather than the head: the
 * frames nearest the throw are the informative ones.
 */
function scrubStack(stack: string, redactions: Set<string>): string {
  const scrubbed = redactReportText(stack, MAX_STACK_LENGTH, { redactions, preserveLines: true });
  return scrubbed.length >= MAX_STACK_LENGTH ? `${scrubbed}\n...` : scrubbed;
}

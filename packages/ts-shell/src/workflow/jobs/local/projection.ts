import type { BackgroundTask } from './model.js';
import { redactReportText } from '../../../core/security/redaction.js';
import { neutraliseForDisplay } from '../../../core/text/safety.js';

export function renderTask(task: BackgroundTask): string {
  const state =
    task.state === "running"
      ? "still running"
      : task.state === "killed"
        ? "stopped"
        : task.state === "starting" ? "native start pending"
      : task.state === 'queued' || task.state === 'paused' ? `${task.state}; no command dispatched`
      : task.state === "unknown" ? "native outcome unverified"
      : `finished with exit code ${task.exitCode ?? "unknown"}`;
  const lines = [`${task.id}: ${task.command}`, `  ${state}, started ${new Date(task.startedAt).toISOString()}`];
  if (task.failure) lines.push(`  failure: ${task.failure}`);
  if (task.output) {
    if (task.outputTruncated) {
      lines.push(
        task.outputPath
          ? `  (earlier output is in ${task.outputPath})`
          : "  (earlier output was dropped to stay within the size limit)",
      );
    }
    lines.push("  output so far:", task.output.split("\n").map((line) => `    ${line}`).join("\n"));
  }
  return neutraliseForDisplay(redactReportText(lines.join("\n"), 100000, { preserveLines: true }));
}

/**
 * What the user is told when a background command ends.
 *
 * Phrased as something to act on rather than a status line: the command was
 * started so its result could be used later, and the moment it ends is when that
 * becomes possible. The tail of its output travels with the notice because the
 * only other way to get it is a second tool call.
 */
export function renderTaskNotice(task: Parameters<typeof renderTask>[0]): string {
  return `A background command finished.\n\n${renderTask(task)}\n\nUse taskOutput to inspect retained task results.`;
}

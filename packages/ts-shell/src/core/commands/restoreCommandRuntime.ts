import {
  runRestoreCommand,
} from "../../edit/recovery/restoreCommandRunner.js";
import type {
  RestoreCommandRecordSelection,
  RestoreCommandRequest,
  RestoreCommandResult,
} from "../../edit/recovery/restoreCommandContract.js";
import path from "node:path";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * Where edit snapshots are kept when no ledger is named.
 *
 * The edit pipeline writes here, so resolving to the same place is what makes
 * `/restore` answer about this project instead of refusing for want of a flag.
 */
export function defaultLedgerRoot(workspaceRoot: string): string {
  return path.join(workspaceRoot, ".sisyphus", "edit-snapshots");
}

export async function runRestoreLocalCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  const request = parseRestoreCommandArgs(args, context);
  const result = await runRestoreCommand(request);
  return {
    kind: "local",
    output: formatRestoreCommandResult(result),
  };
}

export function parseRestoreCommandArgs(
  args: readonly string[],
  context: CommandContext,
): RestoreCommandRequest {
  const mode = args[0]?.trim().toLowerCase() === "execute" ? "execute" : "preview";
  const optionArgs =
    args[0]?.trim().toLowerCase() === "preview" ||
    args[0]?.trim().toLowerCase() === "execute"
      ? args.slice(1)
      : args;
  const options = parseOptions(optionArgs);
  const records =
    optionValue(options.get("record")) ?? optionValue(options.get("records"));
  const all = options.has("all");
  const ledgerRoot =
    optionValue(options.get("ledger-root")) ?? optionValue(options.get("ledger"));
  const workspaceRoot =
    optionValue(options.get("workspace-root")) ??
    optionValue(options.get("workspace")) ??
    context.cwd;
  const authorityId =
    optionValue(options.get("authority-id")) ??
    optionValue(options.get("authority")) ??
    optionValue(options.get("route-id")) ??
    optionValue(options.get("route"));
  const recordSelection: RestoreCommandRecordSelection | undefined = all
    ? { kind: "all" }
    : records
      ? {
          kind: "records",
          recordIds: records
            .split(",")
            .map((record) => record.trim())
            .filter(Boolean),
        }
      : undefined;

  return {
    mode,
    ledgerRoot: ledgerRoot ?? defaultLedgerRoot(workspaceRoot),
    workspaceRoot,
    authorityId,
    recordSelection,
    requireExplicitExecute:
      mode === "execute" &&
      (options.has("execute") || optionValue(options.get("confirm")) === "execute"),
    dryRun: mode === "preview" || options.has("dry-run"),
  };
}

/**
 * Restore output as Markdown.
 *
 * The one thing a reader must not have to infer is whether anything was written.
 * So the state comes first, in words, and preview never borrows the vocabulary of
 * a completed restore: a preview lists what *would* be restored and says how to
 * ask for it, while an execute lists what was. Blocked records keep their reason
 * attached to their path rather than being collected into an anonymous count.
 */
export function formatRestoreCommandResult(
  result: RestoreCommandResult,
): string {
  const preview = result.mode === "preview";
  const lines = [
    `### Restore — ${preview ? "preview" : result.executed ? "executed" : "not executed"}`,
    "",
    `- Mode: ${result.mode}`,
    `- Executed: ${result.executed ? "yes" : "no"}`,
    `- Automatic recovery: ${result.automaticRecovery ? "yes" : "no"}`,
    `- Atomic rollback: ${result.rollbackAtomicityClaim ? "yes" : "no"}`,
  ];
  const blockers = result.evidence
    .filter((entry) => entry.startsWith("restore-command-contract:blocker:"))
    .map((entry) => entry.slice("restore-command-contract:blocker:".length));
  if (blockers.length > 0) {
    lines.push("", "**Blocked before reading the ledger**", "");
    for (const blocker of blockers) lines.push(`- ${blocker}`);
  }
  lines.push(...fileSection(preview ? "Would restore" : "Restorable", result.restorableFiles.map(pathOf)));
  lines.push(...fileSection("Restored", result.restoredFiles));
  lines.push(
    ...fileSection(
      "Blocked",
      result.blockedFiles.map((file) => `${pathOf(file)} — ${file.blockedReason}`),
    ),
  );
  lines.push(...fileSection("Inspected", result.inspectedFiles));
  lines.push(...fileSection("Missing records", result.missingRecords));
  lines.push(
    "",
    preview
      ? "Nothing was written. Re-run the same command as `/restore execute … --execute` to restore the listed records."
      : "Inspect the restored and blocked files before retrying the original edit.",
  );
  return lines.join("\n");
}

/** A titled list, or nothing at all when there is nothing to list. */
function fileSection(title: string, entries: readonly string[]): string[] {
  if (entries.length === 0) return [];
  return ["", `**${title}**`, "", ...entries.map((entry) => `- \`${entry}\``)];
}

function pathOf(file: { readonly workspaceRelativePath: string }): string {
  return file.workspaceRelativePath;
}

function parseOptions(args: readonly string[]): Map<string, string | true> {
  const options = new Map<string, string | true>();
  for (let index = 0; index < args.length; index += 1) {
    const raw = args[index];
    if (!raw.startsWith("--")) {
      continue;
    }
    const normalized = raw.slice(2);
    const inline = normalized.indexOf("=");
    if (inline !== -1) {
      options.set(
        normalized.slice(0, inline).trim().toLowerCase(),
        normalized.slice(inline + 1).trim(),
      );
      continue;
    }
    const key = normalized.trim().toLowerCase();
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      options.set(key, next);
      index += 1;
    } else {
      options.set(key, true);
    }
  }
  return options;
}

function optionValue(value: string | true | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

import { restoreSyntax } from "./restore/syntax.js";
import { restoreAccess } from './restore/access.js';
import { parseSyntax } from "./syntax/parse.js";
import { syntaxHelp } from "./syntax/projection.js";
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
  let request: RestoreCommandRequest;
  try {
    request = parseRestoreCommandArgs(args, context);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
    return { kind: "local", output: `Invalid /restore arguments: ${error.message} Nothing was written.\n${syntaxHelp(restoreSyntax)}` };
  }
  const result = await runRestoreCommand({ ...request, assertFileAccess: restoreAccess(context) });
  return {
    kind: "local",
    output: formatRestoreCommandResult(result),
  };
}

export function parseRestoreCommandArgs(
  args: readonly string[],
  context: CommandContext,
): RestoreCommandRequest {
  const parsed = parseSyntax(restoreSyntax, args);
  if (!parsed.ok) throw new SyntaxError(parsed.reason);
  const mode = parsed.action.name === "execute" ? "execute" : "preview";
  const options = parsed.flags;
  const records =
    optionValue(options.get("record"));
  const all = options.has("all");
  const ledgerRoot =
    optionValue(options.get("ledger-root"));
  const workspaceRoot =
    optionValue(options.get("workspace-root")) ??
    context.cwd;
  const authorityId =
    optionValue(options.get("authority-id"));
  const recordIds = records?.split(",").map(record => record.trim());
  if (recordIds && (recordIds.some(record => !record) || new Set(recordIds).size !== recordIds.length)) {
    throw new SyntaxError("Record IDs must be nonempty and unique.");
  }
  const recordSelection: RestoreCommandRecordSelection | undefined = all
    ? { kind: "all" }
    : recordIds ? { kind: "records", recordIds } : undefined;

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
  const unknown = result.outcome === 'unknown';
  const partial = result.outcome === 'partial';
  const lines = [
    `### Restore — ${preview ? "preview" : unknown ? 'outcome unknown' : partial ? 'partially restored' : result.executed ? "executed" : "not executed"}`,
    "",
    `- Mode: ${result.mode}`,
    `- Executed: ${unknown ? 'unknown; a write may have occurred' : result.executed ? "yes" : "no"}`,
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
  lines.push(...fileSection('Unknown; inspect before retrying', (result.unknownFiles ?? []).map(pathOf)));
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

function optionValue(value: string | true | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

import {
  runRestoreCommand,
} from "../../orchestration/patchRecovery/restoreCommandRunner.js";
import type {
  RestoreCommandRecordSelection,
  RestoreCommandRequest,
  RestoreCommandResult,
} from "../../orchestration/patchRecovery/restoreCommandContract.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

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
    ledgerRoot,
    workspaceRoot,
    authorityId,
    recordSelection,
    requireExplicitExecute:
      mode === "execute" &&
      (options.has("execute") || optionValue(options.get("confirm")) === "execute"),
    dryRun: mode === "preview" || options.has("dry-run"),
  };
}

export function formatRestoreCommandResult(
  result: RestoreCommandResult,
): string {
  const lines = [
    "Restore",
    "Result",
    `- Mode: ${result.mode}`,
    `- Executed: ${result.executed ? "yes" : "no"}`,
    `- Automatic recovery: ${result.automaticRecovery ? "yes" : "no"}`,
    `- Atomic rollback: ${result.rollbackAtomicityClaim ? "yes" : "no"}`,
  ];
  if (result.restorableFiles.length > 0) {
    lines.push(
      `- Restorable files: ${result.restorableFiles.map((file) => file.workspaceRelativePath).join(", ")}`,
    );
  }
  if (result.restoredFiles.length > 0) {
    lines.push(`- Restored files: ${result.restoredFiles.join(", ")}`);
  }
  if (result.blockedFiles.length > 0) {
    lines.push(
      `- Blocked files: ${result.blockedFiles.map((file) => `${file.workspaceRelativePath} (${file.blockedReason})`).join("; ")}`,
    );
  }
  if (result.inspectedFiles.length > 0) {
    lines.push(`- Inspected files: ${result.inspectedFiles.join(", ")}`);
  }
  if (result.missingRecords.length > 0) {
    lines.push(`- Missing records: ${result.missingRecords.join(", ")}`);
  }
  const blockers = result.evidence
    .filter((entry) => entry.startsWith("restore-command-contract:blocker:"))
    .map((entry) => entry.slice("restore-command-contract:blocker:".length));
  if (blockers.length > 0) {
    lines.push(`- Blockers: ${blockers.join(", ")}`);
  }
  lines.push(
    result.mode === "preview"
      ? "- Next action: Re-run with /restore execute --execute to restore eligible records explicitly."
      : "- Next action: Inspect restored and blocked files before retrying the original edit.",
  );
  return lines.join("\n");
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

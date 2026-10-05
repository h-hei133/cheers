import { rejectArguments } from "./syntax/empty.js";
import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";
import { defaultLedgerRoot } from "./restoreCommandRuntime.js";
import type { CommandContext, LocalCommandResult } from "./types.js";

/**
 * /undo — report the most recent file edit and how to revert it.
 *
 * The old output was a report: session telemetry, a file count, the entire
 * `git diff HEAD`, and instructions to run something else. None of that is the
 * thing a person wants when they say undo, and the one action it did offer —
 * `git checkout -- . && git clean -fd` — discarded the whole working tree,
 * including work the agent never touched.
 *
 * So this answers narrowly: which edit was the most recent, what it touched, and
 * the exact audited command that reverts it. The revert itself stays behind that
 * command because it writes to the working tree, and this shell does not turn one
 * word into a write.
 *
 * Going back in the *conversation* is a different act, named differently: `/back`,
 * or Escape twice. It does not touch files, and this command does not touch the
 * conversation. The two used to share the word `rewind`, which meant someone
 * asking to revisit a question was handed a report about files.
 */
export async function runUndoCommand(
  args: string[],
  context: CommandContext,
): Promise<LocalCommandResult> {
  if (args[0]?.trim() === "--hard" || args[0]?.trim() === "--discard") {
    return {
      kind: "local",
      output: [
        "`--hard` is gone. It ran `git checkout -- . && git clean -fd`, which discards the whole working tree — including files this session never touched.",
        "",
        "Run `/undo` with no arguments to see the most recent edit and the command that reverts exactly it.",
      ].join("\n"),
    };
  }

  const invalid = rejectArguments("undo", args);
  if (invalid) return invalid;
  const latest = latestEdit(context.cwd);
  if (!latest) {
    return {
      kind: "local",
      output: [
        "### Nothing to undo",
        "",
        "No edit snapshots were recorded for this project, so there is no recorded change to take back.",
        "",
        `Uncommitted changes in the working tree: ${dirtyCount(context.cwd)}. Those were not necessarily made here — inspect them with \`git diff\` before discarding anything.`,
      ].join("\n"),
    };
  }

  return {
    kind: "local",
    output: [
      "### Most recent edit",
      "",
      `- When: ${latest.when}`,
      `- Files: ${latest.files.map((file) => `\`${file}\``).join(", ")}`,
      "",
      "Revert exactly those files:",
      "",
      "```",
      `/restore execute --ledger-root ${latest.ledgerRoot} --authority ${latest.authorityId} --all --execute`,
      "```",
      "",
      "`/restore` on its own opens the snapshot list, and previews before it writes. To go back in the conversation instead, without touching files, press Escape twice.",
    ].join("\n"),
  };
}

interface LatestEdit {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly when: string;
  readonly files: readonly string[];
}

/**
 * The newest recorded edit, read from the snapshot ledger.
 *
 * Read straight off disk rather than through the async index: `/undo` answers one
 * question about one namespace, and the index exists for listing every record in
 * every namespace.
 */
function latestEdit(workspaceRoot: string): LatestEdit | undefined {
  const ledgerRoot = defaultLedgerRoot(workspaceRoot);
  let namespaces: string[];
  try {
    namespaces = fs
      .readdirSync(ledgerRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    return undefined;
  }
  let newest: LatestEdit | undefined;
  for (const authorityId of namespaces) {
    const recordsDir = path.join(ledgerRoot, authorityId, "records");
    let files: string[];
    try {
      files = fs.readdirSync(recordsDir).filter((name) => name.endsWith(".json"));
    } catch {
      continue;
    }
    const paths: string[] = [];
    let when = "";
    for (const name of files) {
      try {
        const record = JSON.parse(fs.readFileSync(path.join(recordsDir, name), "utf8")) as {
          workspaceRelativePath?: string;
          createdAt?: string;
        };
        if (record.workspaceRelativePath) paths.push(record.workspaceRelativePath);
        if (record.createdAt && record.createdAt > when) when = record.createdAt;
      } catch {
        continue;
      }
    }
    if (paths.length === 0 || !when) continue;
    if (!newest || when > newest.when) {
      newest = { ledgerRoot, authorityId, when, files: paths };
    }
  }
  return newest;
}

/** How many files the working tree has uncommitted, or "unknown" outside git. */
function dirtyCount(cwd: string): string {
  try {
    const output = execSync("git status --porcelain", {
      cwd,
      encoding: "utf8",
      stdio: ["pipe", "pipe", "ignore"],
    }).trim();
    return output ? `${output.split("\n").length}` : "0";
  } catch {
    return "unknown (not a git repository)";
  }
}

import fs from "node:fs/promises";
import path from "node:path";
import {
  hashContent,
  normalizeWorkspaceRelativePath,
  readRecoveryAuthorityRecord,
} from "./recoveryAuthorityStore.js";

export type RestorePrimitiveBlockedReason =
  | "invalid-workspace-relative-path"
  | "record-not-found"
  | "record-path-mismatch"
  | "workspace-boundary"
  | "current-state-mismatch"
  | "current-content-hash-mismatch"
  | "original-content-missing"
  | "file-system-error";

export type RestorePrimitiveResult =
  | {
      readonly restored: true;
      readonly restoredFiles: readonly [string];
      readonly inspectedFiles: readonly [string];
      readonly rollbackAtomicityClaim: false;
      readonly evidence: readonly string[];
    }
  | {
      readonly restored: false;
      readonly blockedReason: RestorePrimitiveBlockedReason;
      readonly restoredFiles: readonly [];
      readonly inspectedFiles: readonly string[];
      readonly rollbackAtomicityClaim: false;
      readonly evidence: readonly string[];
    };

export async function restoreRecoveryAuthorityRecord(input: {
  readonly ledgerRoot: string;
  readonly authorityId: string;
  readonly recordId: string;
  readonly workspaceRoot: string;
  readonly workspaceRelativePath: string;
  readonly expectedCurrentState?: "exists" | "absent" | "unknown";
  readonly expectedCurrentContentHash?: string;
}): Promise<RestorePrimitiveResult> {
  const relativePath = normalizeWorkspaceRelativePath(
    input.workspaceRelativePath,
  );
  if (!relativePath) {
    return blocked("invalid-workspace-relative-path", []);
  }

  const absolutePath = path.resolve(input.workspaceRoot, relativePath);
  if (!pathStaysInsideWorkspace(input.workspaceRoot, absolutePath)) {
    return blocked("workspace-boundary", [relativePath]);
  }

  const record = await readRecoveryAuthorityRecord({
    ledgerRoot: input.ledgerRoot,
    authorityId: input.authorityId,
    recordId: input.recordId,
  });
  if (!record) {
    return blocked("record-not-found", [relativePath]);
  }
  if (record.workspaceRelativePath !== relativePath) {
    return blocked("record-path-mismatch", [relativePath]);
  }

  const expectedCurrentState =
    input.expectedCurrentState ?? record.expectedCurrentState;
  const expectedCurrentContentHash =
    input.expectedCurrentContentHash ?? record.expectedCurrentContentHash;
  const current = await inspectCurrentContent(absolutePath);
  if (
    (expectedCurrentState === "exists" && current.state !== "exists") ||
    (expectedCurrentState === "absent" && current.state !== "absent")
  ) {
    return blocked("current-state-mismatch", [relativePath]);
  }
  if (
    current.state === "exists" &&
    expectedCurrentContentHash &&
    hashContent(current.content) !== expectedCurrentContentHash
  ) {
    return blocked("current-content-hash-mismatch", [relativePath]);
  }

  try {
    if (record.beforeState === "exists") {
      if (!record.beforeContentRef) {
        return blocked("original-content-missing", [relativePath]);
      }
      const originalContent = await fs.readFile(
        path.join(
          path.resolve(input.ledgerRoot),
          input.authorityId,
          record.beforeContentRef,
        ),
        "utf8",
      );
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, originalContent, "utf8");
    } else if (current.state === "exists") {
      await fs.rm(absolutePath, { force: true });
    }
  } catch {
    return blocked("file-system-error", [relativePath]);
  }

  return {
    restored: true,
    restoredFiles: [relativePath],
    inspectedFiles: [relativePath],
    rollbackAtomicityClaim: false,
    evidence: [
      "recovery-restore-primitive:explicit-call",
      "recovery-restore-primitive:current-content-guard-passed",
      "recovery-restore-primitive:single-file-restore",
      "recovery-restore-primitive:no-atomic-rollback",
    ],
  };
}

async function inspectCurrentContent(
  absolutePath: string,
): Promise<
  | { readonly state: "exists"; readonly content: string }
  | { readonly state: "absent" }
> {
  try {
    const stat = await fs.stat(absolutePath);
    if (!stat.isFile()) {
      return { state: "absent" };
    }
    return {
      state: "exists",
      content: await fs.readFile(absolutePath, "utf8"),
    };
  } catch {
    return { state: "absent" };
  }
}

function blocked(
  blockedReason: RestorePrimitiveBlockedReason,
  inspectedFiles: readonly string[],
): RestorePrimitiveResult {
  return {
    restored: false,
    blockedReason,
    restoredFiles: [],
    inspectedFiles,
    rollbackAtomicityClaim: false,
    evidence: [
      "recovery-restore-primitive:blocked",
      `recovery-restore-primitive:blocker:${blockedReason}`,
      "recovery-restore-primitive:no-atomic-rollback",
    ],
  };
}

function pathStaysInsideWorkspace(
  workspaceRoot: string,
  candidatePath: string,
): boolean {
  const root = path.resolve(workspaceRoot);
  const resolved = path.resolve(candidatePath);
  const relative = path.relative(root, resolved);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

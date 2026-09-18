import path from "node:path";
import type {
  RestorePreviewBlockedFile,
  RestorePreviewFile,
} from "./restorePreview.js";

export type RestoreCommandMode = "preview" | "execute";

export type RestoreCommandRecordSelection =
  | { readonly kind: "all" }
  | { readonly kind: "records"; readonly recordIds: readonly string[] };

export interface RestoreCommandRequest {
  readonly mode: RestoreCommandMode;
  readonly ledgerRoot?: string;
  readonly workspaceRoot?: string;
  readonly authorityId?: string;
  readonly routeId?: string;
  readonly recordSelection?: RestoreCommandRecordSelection;
  readonly requireExplicitExecute?: boolean;
  readonly dryRun?: boolean;
}

export interface ValidRestoreCommand {
  readonly mode: RestoreCommandMode;
  readonly ledgerRoot: string;
  readonly workspaceRoot: string;
  readonly authorityId: string;
  readonly recordSelection: readonly string[] | "all";
  readonly requireExplicitExecute: boolean;
  readonly dryRun: boolean;
  readonly previewOnly: boolean;
  readonly automaticRecovery: false;
  readonly rollbackAtomicityClaim: false;
  readonly evidence: readonly string[];
}

export interface RestoreCommandResult {
  readonly mode: RestoreCommandMode;
  readonly executed: boolean;
  readonly restorableFiles: readonly RestorePreviewFile[];
  readonly restoredFiles: readonly string[];
  readonly blockedFiles: readonly RestorePreviewBlockedFile[];
  readonly inspectedFiles: readonly string[];
  readonly missingRecords: readonly string[];
  readonly evidence: readonly string[];
  readonly automaticRecovery: false;
  readonly rollbackAtomicityClaim: false;
}

export type RestoreCommandValidationResult =
  | { readonly ok: true; readonly command: ValidRestoreCommand }
  | {
      readonly ok: false;
      readonly result: RestoreCommandResult;
      readonly errors: readonly string[];
    };

const safeIdPattern = /^[A-Za-z0-9._-]+$/;

export function validateRestoreCommandRequest(
  request: RestoreCommandRequest,
): RestoreCommandValidationResult {
  const mode = request.mode;
  const errors: string[] = [];
  const ledgerRoot = normalizeRoot(request.ledgerRoot);
  const workspaceRoot = normalizeRoot(request.workspaceRoot);
  const authorityId = sanitizeId(request.authorityId ?? request.routeId);
  const selection = normalizeSelection(request.recordSelection);
  const recordSelection = selection.ok ? selection.value : undefined;
  const requireExplicitExecute = request.requireExplicitExecute === true;

  if (!ledgerRoot) {
    errors.push("ledger-root-required");
  }
  if (!workspaceRoot) {
    errors.push("workspace-root-required");
  }
  if (!authorityId) {
    errors.push("authority-or-route-id-required");
  }
  if (selection.ok === false) {
    errors.push(selection.error);
  }
  if (mode === "execute" && !requireExplicitExecute) {
    errors.push("explicit-execute-intent-required");
  }

  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      result: blockedCommandResult(mode, errors),
    };
  }

  return {
    ok: true,
    command: {
      mode,
      ledgerRoot: ledgerRoot!,
      workspaceRoot: workspaceRoot!,
      authorityId: authorityId!,
      recordSelection: recordSelection!,
      requireExplicitExecute,
      dryRun: request.dryRun === true || mode === "preview",
      previewOnly: mode === "preview",
      automaticRecovery: false,
      rollbackAtomicityClaim: false,
      evidence: [
        "restore-command-contract:validated",
        `restore-command-contract:mode:${mode}`,
        mode === "preview"
          ? "restore-command-contract:preview-default"
          : "restore-command-contract:explicit-execute-intent",
        "restore-command-contract:no-automatic-recovery",
        "restore-command-contract:no-rollback",
      ],
    },
  };
}

export function blockedCommandResult(
  mode: RestoreCommandMode,
  errors: readonly string[],
): RestoreCommandResult {
  return {
    mode,
    executed: false,
    restorableFiles: [],
    restoredFiles: [],
    blockedFiles: [],
    inspectedFiles: [],
    missingRecords: [],
    automaticRecovery: false,
    rollbackAtomicityClaim: false,
    evidence: [
      "restore-command-contract:blocked",
      ...errors.map((error) => `restore-command-contract:blocker:${error}`),
      "restore-command-contract:no-restore-execution",
      "restore-command-contract:no-automatic-recovery",
      "restore-command-contract:no-rollback",
    ],
  };
}

function normalizeRoot(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.includes("\0")) {
    return undefined;
  }
  return path.resolve(trimmed);
}

function sanitizeId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !safeIdPattern.test(trimmed)) {
    return undefined;
  }
  return trimmed;
}

function normalizeSelection(
  selection: RestoreCommandRecordSelection | undefined,
):
  | { readonly ok: true; readonly value: readonly string[] | "all" }
  | { readonly ok: false; readonly error: string } {
  if (!selection) {
    return { ok: false, error: "record-selection-required" };
  }
  if (selection.kind === "all") {
    return { ok: true, value: "all" };
  }
  const sanitized = selection.recordIds.map(sanitizeId);
  if (
    selection.recordIds.length === 0 ||
    sanitized.some((recordId) => !recordId)
  ) {
    return { ok: false, error: "invalid-record-selection" };
  }
  return { ok: true, value: sanitized as string[] };
}

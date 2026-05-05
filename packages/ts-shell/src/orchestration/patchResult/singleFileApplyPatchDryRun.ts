import { buildNoPartialPatchApplicationContract } from "../patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../patchParsing/parser.js";
import type { PatchFailure } from "../patchParsing/types.js";
import { verifyParsedPatch } from "../patchVerification/verify.js";
import { buildPatchPreview } from "./preview.js";
import {
  buildSingleFileUpdatePatchApprovalContract,
  buildSingleFileUpdatePatchResultSurfaceContract,
  type SingleFileUpdatePatchApprovalContract,
  type SingleFileUpdatePatchResultSurfaceContract,
} from "./productionGate.js";
import { buildSingleFileUpdatePatchReadinessContract } from "./readiness.js";

export interface SingleFileApplyPatchDryRunOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly dryRun: true;
}

export type SingleFileApplyPatchDryRunStatus = "dry-run-ready" | "blocked";

export interface SingleFileApplyPatchDryRunBlockedApproval {
  readonly capability: "single-file-update-apply-patch-dry-run";
  readonly permissionKind: "edit";
  readonly operationKind: "update";
  readonly decision: "blocked";
  readonly writeIntent: {
    readonly authorized: false;
    readonly count: 0;
  };
  readonly metadata: {
    readonly auditSafe: true;
    readonly willWrite: false;
    readonly singleFileOnly: true;
    readonly unsupportedOperations: readonly [
      "multi-file",
      "add",
      "delete",
      "move",
    ];
  };
  readonly nextAction: string;
}

export interface SingleFileApplyPatchDryRunBlockedSurface {
  readonly status: "blocked";
  readonly changedFiles: readonly [];
  readonly failedFiles: readonly PatchFailure[];
  readonly patches: readonly [];
  readonly evidence: readonly string[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly failureCategory: "unsupported-patch-shape";
  readonly blocker: "unsupported-patch-shape";
  readonly noWriteProof: {
    readonly willWrite: false;
    readonly writeIntentCount: 0;
    readonly blockedWrites: true;
    readonly reason: string;
  };
}

export interface SingleFileApplyPatchDryRunResult {
  readonly status: SingleFileApplyPatchDryRunStatus;
  readonly willWrite: false;
  readonly changedFiles: readonly [];
  readonly wouldChangeFiles: readonly string[];
  readonly previewChangedFiles: readonly string[];
  readonly failedFiles: readonly PatchFailure[];
  readonly writeIntents: readonly [];
  readonly noWriterInvoked: true;
  readonly terminalResultVisible: true;
  readonly doesNotClaimWriteSuccess: true;
  readonly approval:
    | SingleFileUpdatePatchApprovalContract
    | SingleFileApplyPatchDryRunBlockedApproval;
  readonly resultSurface:
    | SingleFileUpdatePatchResultSurfaceContract
    | SingleFileApplyPatchDryRunBlockedSurface;
  readonly evidence: readonly string[];
  readonly nextAction: string;
  readonly doNext: string;
  readonly noPartial: {
    readonly atomicity: "verify-all-before-write";
    readonly writeIntents: number;
    readonly blockedWrites: boolean;
  };
}

const unsupportedOperations = ["multi-file", "add", "delete", "move"] as const;

export function buildSingleFileApplyPatchDryRun(
  options: SingleFileApplyPatchDryRunOptions,
): SingleFileApplyPatchDryRunResult {
  const parsed = parseApplyPatchText(options.rawPatchText);
  if (parsed.ok === false) {
    return blockedFromParseFailure(parsed.failure);
  }

  const verification = verifyParsedPatch(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    supportedOperations: ["update"],
  });
  const preview = buildPatchPreview(verification);
  const applicationContract = buildNoPartialPatchApplicationContract(verification);
  const readiness = buildSingleFileUpdatePatchReadinessContract({
    verification,
    preview,
    applicationContract,
  });
  const approval = buildSingleFileUpdatePatchApprovalContract(readiness, {
    decision: readiness.ready ? "pending" : "blocked",
  });
  const contractSurface = buildSingleFileUpdatePatchResultSurfaceContract({
    readiness,
    approval,
  });
  const resultSurface: SingleFileUpdatePatchResultSurfaceContract = {
    ...contractSurface,
    changedFiles: [],
  };
  const previewChangedFiles = readiness.ready ? preview.changedFiles : [];
  const wouldChangeFiles = readiness.ready ? readiness.result.changedFiles : [];
  const evidence = [
    ...resultSurface.evidence,
    "apply-patch-dry-run:explicit-opt-in",
    "apply-patch-dry-run:will-write-false",
    "apply-patch-dry-run:no-writer-invoked",
    "apply-patch-dry-run:terminal-changed-files-empty",
  ];

  return {
    status: readiness.ready ? "dry-run-ready" : "blocked",
    willWrite: false,
    changedFiles: [],
    wouldChangeFiles,
    previewChangedFiles,
    failedFiles: resultSurface.failedFiles,
    writeIntents: [],
    noWriterInvoked: true,
    terminalResultVisible: true,
    doesNotClaimWriteSuccess: true,
    approval,
    resultSurface,
    evidence,
    nextAction: resultSurface.nextAction,
    doNext: resultSurface.doNext,
    noPartial: readiness.noPartial,
  };
}

function blockedFromParseFailure(
  failure: PatchFailure,
): SingleFileApplyPatchDryRunResult {
  const nextAction = failure.nextAction;
  const evidence = [
    "apply-patch-dry-run:blocked",
    "apply-patch-dry-run:parse-failed",
    "apply-patch-dry-run:will-write-false",
    "apply-patch-dry-run:no-writer-invoked",
    "apply-patch-dry-run:terminal-changed-files-empty",
  ];
  const approval: SingleFileApplyPatchDryRunBlockedApproval = {
    capability: "single-file-update-apply-patch-dry-run",
    permissionKind: "edit",
    operationKind: "update",
    decision: "blocked",
    writeIntent: {
      authorized: false,
      count: 0,
    },
    metadata: {
      auditSafe: true,
      willWrite: false,
      singleFileOnly: true,
      unsupportedOperations,
    },
    nextAction,
  };
  const resultSurface: SingleFileApplyPatchDryRunBlockedSurface = {
    status: "blocked",
    changedFiles: [],
    failedFiles: [failure],
    patches: [],
    evidence,
    nextAction,
    doNext: nextAction,
    failureCategory: "unsupported-patch-shape",
    blocker: "unsupported-patch-shape",
    noWriteProof: {
      willWrite: false,
      writeIntentCount: 0,
      blockedWrites: true,
      reason: failure.message,
    },
  };

  return {
    status: "blocked",
    willWrite: false,
    changedFiles: [],
    wouldChangeFiles: [],
    previewChangedFiles: [],
    failedFiles: [failure],
    writeIntents: [],
    noWriterInvoked: true,
    terminalResultVisible: true,
    doesNotClaimWriteSuccess: true,
    approval,
    resultSurface,
    evidence,
    nextAction,
    doNext: nextAction,
    noPartial: {
      atomicity: "verify-all-before-write",
      writeIntents: 0,
      blockedWrites: true,
    },
  };
}

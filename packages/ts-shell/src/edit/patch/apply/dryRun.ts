import { buildNoPartialPatchApplicationContract } from "../../../orchestration/patchApplication/noPartialApply.js";
import { parseApplyPatchText } from "../../../orchestration/patchParsing/parser.js";
import type { PatchFailure } from "../../../orchestration/patchParsing/types.js";
import { verifyParsedPatch } from "../../../orchestration/patchVerification/verify.js";
import { buildPatchPreview } from "../result/preview.js";
import {
  classifyAddFileNoWrite,
  patchFailureFromAddClassification,
  type AddFileNoWriteClassification,
} from "../status/addFile.js";
import {
  buildSingleFileApplyPatchBaseEvidence,
  type SingleFileApplyPatchBaseEvidence,
} from "../../../evidence/projection/patch/base.js";
import {
  buildSingleFileUpdatePatchApprovalContract,
  buildSingleFileUpdatePatchResultSurfaceContract,
  type SingleFileUpdatePatchApprovalContract,
  type SingleFileUpdatePatchResultSurfaceContract,
} from "../../authority/approval/production.js";
import {
  classifyMultiFileUpdatePlanningNoWrite,
  type MultiFileUpdatePlanningClassification,
} from "../plan/multiFile.js";
import { buildSingleFileUpdatePatchReadinessContract } from "../status/readiness.js";

type UnsupportedCapability =
  | AddFileNoWriteClassification
  | MultiFileUpdatePlanningClassification;

export interface SingleFileApplyPatchDryRunOptions {
  readonly workspaceRoot: string;
  readonly rawPatchText: string;
  readonly readFile: (absolutePath: string) => string | undefined;
  readonly directoryExists?: (absolutePath: string) => boolean;
  readonly dryRun: true;
}

export type SingleFileApplyPatchDryRunStatus = "dry-run-ready" | "blocked";

export interface SingleFileApplyPatchDryRunBlockedApproval {
  readonly capability: "single-file-update-apply-patch-dry-run";
  readonly permissionKind: "edit";
  readonly operationKind: "update" | "add";
  readonly decision: "blocked";
  readonly writeIntent: {
    readonly authorized: false;
    readonly count: 0;
  };
  readonly metadata: {
    readonly auditSafe: true;
    readonly willWrite: false;
    readonly singleFileOnly: boolean;
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
  readonly failureCategory:
    | "unsupported-patch-shape"
    | "candidate-capability-no-write";
  readonly blocker: "unsupported-patch-shape" | "candidate-capability-no-write";
  readonly unsupportedCapability?: UnsupportedCapability;
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
  readonly plannedFiles: readonly string[];
  readonly wouldChangeFiles: readonly string[];
  readonly wouldCreateFiles: readonly string[];
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
  readonly unsupportedCapability?: UnsupportedCapability;
  readonly baseEvidence?: SingleFileApplyPatchBaseEvidence;
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

  const multiFileUpdatePlanning = classifyMultiFileUpdatePlanningNoWrite(
    parsed.patch,
    {
      workspaceRoot: options.workspaceRoot,
      readFile: options.readFile,
      ...(options.directoryExists
        ? { directoryExists: options.directoryExists }
        : {}),
    },
  );
  if (multiFileUpdatePlanning) {
    return blockedFromMultiFileUpdatePlanning(multiFileUpdatePlanning);
  }

  const addClassification = classifyAddFileNoWrite(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    ...(options.directoryExists
      ? { directoryExists: options.directoryExists }
      : {}),
  });
  if (addClassification) {
    return blockedFromAddFileClassification(addClassification);
  }

  const verification = verifyParsedPatch(parsed.patch, {
    workspaceRoot: options.workspaceRoot,
    readFile: options.readFile,
    ...(options.directoryExists
      ? { directoryExists: options.directoryExists }
      : {}),
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
  const baseEvidence = readiness.ready
    ? baseEvidenceFromVerification(verification)
    : undefined;
  const evidence = [
    ...resultSurface.evidence,
    "apply-patch-dry-run:explicit-opt-in",
    "apply-patch-dry-run:will-write-false",
    "apply-patch-dry-run:no-writer-invoked",
    "apply-patch-dry-run:terminal-changed-files-empty",
    ...(baseEvidence ? ["apply-patch-dry-run:base-evidence-captured"] : []),
  ];

  return {
    status: readiness.ready ? "dry-run-ready" : "blocked",
    willWrite: false,
    changedFiles: [],
    plannedFiles: [],
    wouldChangeFiles,
    wouldCreateFiles: [],
    previewChangedFiles,
    failedFiles: resultSurface.failedFiles,
    writeIntents: [],
    noWriterInvoked: true,
    terminalResultVisible: true,
    doesNotClaimWriteSuccess: true,
    approval,
    resultSurface,
    baseEvidence,
    evidence,
    nextAction: resultSurface.nextAction,
    doNext: resultSurface.doNext,
    noPartial: readiness.noPartial,
  };
}

function baseEvidenceFromVerification(
  verification: ReturnType<typeof verifyParsedPatch>,
): SingleFileApplyPatchBaseEvidence | undefined {
  if (verification.ok === false || verification.plan.operations.length !== 1) {
    return undefined;
  }
  const operation = verification.plan.operations[0];
  if (!operation || operation.operation.kind !== "update") {
    return undefined;
  }
  if (operation.originalContent === undefined) {
    return undefined;
  }
  return buildSingleFileApplyPatchBaseEvidence({
    targetPath: operation.operation.path,
    baseContent: operation.originalContent,
  });
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
    plannedFiles: [],
    wouldChangeFiles: [],
    wouldCreateFiles: [],
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

function blockedFromAddFileClassification(
  classification: AddFileNoWriteClassification,
): SingleFileApplyPatchDryRunResult {
  const failure = patchFailureFromAddClassification(classification);
  const evidence = [
    "apply-patch-dry-run:blocked",
    "apply-patch-dry-run:add-file-classified",
    `apply-patch-dry-run:add-file-blocker:${classification.blockedReason}`,
    "apply-patch-dry-run:create-file-candidate-only",
    "apply-patch-dry-run:will-write-false",
    "apply-patch-dry-run:no-writer-invoked",
    "apply-patch-dry-run:terminal-changed-files-empty",
  ];
  const approval: SingleFileApplyPatchDryRunBlockedApproval = {
    capability: "single-file-update-apply-patch-dry-run",
    permissionKind: "edit",
    operationKind: "add",
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
    nextAction: classification.nextAction,
  };
  const resultSurface: SingleFileApplyPatchDryRunBlockedSurface = {
    status: "blocked",
    changedFiles: [],
    failedFiles: [failure],
    patches: [],
    evidence,
    nextAction: classification.nextAction,
    doNext: classification.nextAction,
    failureCategory: "unsupported-patch-shape",
    blocker: "unsupported-patch-shape",
    unsupportedCapability: classification,
    noWriteProof: {
      willWrite: false,
      writeIntentCount: 0,
      blockedWrites: true,
      reason: classification.explanation,
    },
  };

  return {
    status: "blocked",
    willWrite: false,
    changedFiles: [],
    plannedFiles: [],
    wouldChangeFiles: [],
    wouldCreateFiles: classification.wouldCreateFiles,
    previewChangedFiles: [],
    failedFiles: [failure],
    writeIntents: [],
    noWriterInvoked: true,
    terminalResultVisible: true,
    doesNotClaimWriteSuccess: true,
    approval,
    resultSurface,
    unsupportedCapability: classification,
    evidence,
    nextAction: classification.nextAction,
    doNext: classification.nextAction,
    noPartial: {
      atomicity: "verify-all-before-write",
      writeIntents: 0,
      blockedWrites: true,
    },
  };
}

function blockedFromMultiFileUpdatePlanning(
  classification: MultiFileUpdatePlanningClassification,
): SingleFileApplyPatchDryRunResult {
  const evidence = [
    "apply-patch-dry-run:blocked",
    "apply-patch-dry-run:multi-file-update-planning-classified",
    `apply-patch-dry-run:multi-file-update-blocker:${classification.blockedReason}`,
    "apply-patch-dry-run:multi-file-update-candidate-no-write",
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
      singleFileOnly: false,
      unsupportedOperations,
    },
    nextAction: classification.nextAction,
  };
  const resultSurface: SingleFileApplyPatchDryRunBlockedSurface = {
    status: "blocked",
    changedFiles: [],
    failedFiles: classification.failedFiles,
    patches: [],
    evidence,
    nextAction: classification.nextAction,
    doNext: classification.nextAction,
    failureCategory: "candidate-capability-no-write",
    blocker: "candidate-capability-no-write",
    unsupportedCapability: classification,
    noWriteProof: {
      willWrite: false,
      writeIntentCount: 0,
      blockedWrites: true,
      reason: classification.explanation,
    },
  };

  return {
    status: "blocked",
    willWrite: false,
    changedFiles: [],
    plannedFiles: classification.plannedFiles,
    wouldChangeFiles: classification.wouldChangeFiles,
    wouldCreateFiles: [],
    previewChangedFiles: classification.wouldChangeFiles,
    failedFiles: classification.failedFiles,
    writeIntents: [],
    noWriterInvoked: true,
    terminalResultVisible: true,
    doesNotClaimWriteSuccess: true,
    approval,
    resultSurface,
    unsupportedCapability: classification,
    evidence,
    nextAction: classification.nextAction,
    doNext: classification.nextAction,
    noPartial: {
      atomicity: "verify-all-before-write",
      writeIntents: 0,
      blockedWrites: true,
    },
  };
}

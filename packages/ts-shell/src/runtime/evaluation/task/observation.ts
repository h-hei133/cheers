import type {
  TaskLiveEntry,
  TaskLiveEntryId,
} from "./liveTypes.js";
import type {
  TaskLiveGate,
  TaskLiveGateOutcome,
} from "./model.js";
import { isWriteCapableEntry } from "./quality.js";

/**
 * Live gate observation projection.
 *
 * These functions turn gate receipts and workspace state into the per-entry
 * `TaskLiveRunObservation`s the live report is assembled from. They read and
 * describe; nothing here runs a provider or writes a workspace. The receipt
 * shapes are declared here because they are this module's input contract.
 */

export interface TaskLiveRunObservation {
  readonly entryId: TaskLiveEntryId;
  readonly gate: TaskLiveGate;
  readonly explicitOptIn: true;
  readonly providerAttempted: boolean;
  readonly providerOutcome: TaskLiveGateOutcome;
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed";
  readonly verificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly artifactValidationStatus?: "passed" | "partial" | "failed" | "not-run";
  readonly proofStatus: "complete" | "partial" | "missing";
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
  readonly primaryFailureClass?: "none" | "provider-network" | "provider-auth" | "config-or-skip" | "product-regression";
  readonly forcedPrimaryFailure?: boolean;
  readonly patchIntentStatus?: "present" | "missing" | "invalid";
  readonly safePlanStatus?: "ready" | "missing" | "blocked";
  readonly dryRunDiffStatus?: "produced" | "missing" | "failed";
  readonly reviewAuthority?: "approved" | "missing" | "denied" | "not-required";
  readonly applyStatus?: "applied" | "not-run" | "blocked" | "failed";
  readonly isolatedApply?: boolean;
  readonly realWorkspaceMutation?: boolean;
  readonly postApplyVerificationStatus?: "passed" | "partial" | "failed" | "not-run";
  readonly rollbackStatus?: "complete" | "partial" | "blocked" | "not-run";
  readonly realWorkspaceApplyStatus?: "applied" | "not-run" | "blocked" | "failed";
  readonly realWorkspaceApplyScope?: "isolated-selected-workspace" | "not-run";
  readonly exactBlocker?: string;
  readonly proofSource?: "provider-receipt" | "owner-receipt-validation";
}

export interface TaskLiveGateReceipt {
  readonly gate: "read-only-provider" | "anchored-provider";
  readonly attempted: boolean;
  readonly outcome: TaskLiveGateOutcome;
  readonly noMutation: boolean;
  readonly changedFiles: readonly string[];
  readonly noApply: boolean;
  readonly redactionStatus: "passed" | "failed";
  readonly fallbackConfigured?: boolean;
  readonly fallbackAttempted?: boolean;
  readonly fallbackOutcome?: "passed" | "failed" | "skipped" | "inconclusive";
  readonly primaryFailureClass?: "none" | "provider-network" | "provider-auth" | "config-or-skip" | "product-regression";
  readonly forcedPrimaryFailure?: boolean;
  readonly blocker?: string;
}

export interface TaskLiveWorkspaceApplyReceipt {
  readonly gate: "selected-workspace-apply";
  readonly attempted: boolean;
  readonly outcome: "passed" | "failed" | "blocked" | "skipped" | "provider-network-inconclusive" | "config-or-skip";
  readonly entryId: Extract<TaskLiveEntryId, "single-file-edit" | "coordinated-edit" | "label-normalization" | "status-consumer-coordination">;
  readonly changedFiles: readonly string[];
  readonly writerTarget: "isolated-selected-workspace" | "missing-or-unverified";
  readonly postActionVerificationStatus: "passed" | "partial" | "failed" | "not-run";
  readonly redactionStatus: "passed" | "failed";
  readonly repositoryClean: boolean;
  readonly blocker?: string;
}


export function observationFromReceipt(input: {
  readonly entryId: TaskLiveEntryId;
  readonly gate: TaskLiveGate;
  readonly receipt: TaskLiveGateReceipt;
  readonly proofStatus: TaskLiveRunObservation["proofStatus"];
  readonly verificationStatus: TaskLiveRunObservation["verificationStatus"];
  readonly artifactValidationStatus?: TaskLiveRunObservation["artifactValidationStatus"];
}): TaskLiveRunObservation {
  return freeze({
    entryId: input.entryId,
    gate: input.gate,
    explicitOptIn: true,
    providerAttempted: input.receipt.attempted,
    providerOutcome: input.receipt.outcome,
    noMutation: input.receipt.noMutation,
    changedFiles: freeze([...input.receipt.changedFiles]),
    noApply: input.receipt.noApply,
    redactionStatus: input.receipt.redactionStatus,
    verificationStatus: input.verificationStatus,
    artifactValidationStatus: input.artifactValidationStatus,
    proofStatus: input.proofStatus,
    proofSource: "provider-receipt",
    fallbackConfigured: input.receipt.fallbackConfigured,
    fallbackAttempted: input.receipt.fallbackAttempted,
    fallbackOutcome: input.receipt.fallbackOutcome,
    primaryFailureClass: input.receipt.primaryFailureClass,
    forcedPrimaryFailure: input.receipt.forcedPrimaryFailure,
    ...(input.receipt.blocker ? { exactBlocker: input.receipt.blocker } : {}),
  });
}

export function ownerReceiptValidationObservation(
  entry: TaskLiveEntry,
  readOnly: TaskLiveGateReceipt,
  anchored: TaskLiveGateReceipt | undefined,
): TaskLiveRunObservation {
  const anchoredSafe = anchored?.outcome === "passed" &&
    anchored.noMutation &&
    anchored.changedFiles.length === 0 &&
    anchored.noApply &&
    anchored.redactionStatus === "passed";
  const ownerReceiptValid =
    entry.entryId === "catalog-owner-receipt" &&
    entry.entryKind === "pathless-context" &&
    entry.writePolicy === "no-write" &&
    entry.requirements.includes("task proof");
  const proven = anchoredSafe && ownerReceiptValid;

  return freeze({
    entryId: entry.entryId,
    gate: "read-only-provider",
    explicitOptIn: true,
    providerAttempted: readOnly.attempted,
    providerOutcome: readOnly.outcome,
    noMutation: true,
    changedFiles: freeze([]),
    noApply: true,
    redactionStatus: anchoredSafe ? anchored.redactionStatus : readOnly.redactionStatus,
    verificationStatus: proven ? "partial" : "not-run",
    proofStatus: proven ? "complete" : "missing",
    proofSource: "owner-receipt-validation",
    exactBlocker: proven
      ? undefined
      : "owner receipt proof missing: safe no-write receipt source unavailable",
  });
}

export function writePlanningObservation(receipt: TaskLiveGateReceipt): TaskLiveRunObservation {
  return freeze({
    ...observationFromReceipt({
      entryId: "write-planning-dry-run",
      gate: "anchored-provider",
      receipt,
      proofStatus: "partial",
      verificationStatus: "partial",
    }),
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "missing",
    applyStatus: "not-run",
    isolatedApply: false,
    realWorkspaceMutation: false,
    postApplyVerificationStatus: "not-run",
    rollbackStatus: "not-run",
    realWorkspaceApplyStatus: "not-run",
    realWorkspaceApplyScope: "not-run",
  });
}

export function writeApplyObservation(
  entryId: Extract<TaskLiveRunObservation["entryId"], "single-file-edit" | "coordinated-edit" | "failed-check-repair" | "rollback-recovery" | "label-normalization" | "status-consumer-coordination" | "assertion-repair">,
  receipt: TaskLiveGateReceipt,
  changedFiles: readonly string[],
  proofStatus: TaskLiveRunObservation["proofStatus"],
  postApplyVerificationStatus: NonNullable<TaskLiveRunObservation["postApplyVerificationStatus"]>,
  rollbackStatus: NonNullable<TaskLiveRunObservation["rollbackStatus"]>,
): TaskLiveRunObservation {
  return freeze({
    ...observationFromReceipt({
      entryId,
      gate: "anchored-provider",
      receipt,
      proofStatus,
      verificationStatus: "passed",
    }),
    noMutation: false,
    changedFiles: freeze([...changedFiles]),
    noApply: false,
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "approved",
    applyStatus: "applied",
    isolatedApply: true,
    realWorkspaceMutation: false,
    postApplyVerificationStatus,
    rollbackStatus,
    realWorkspaceApplyStatus: "not-run",
    realWorkspaceApplyScope: "not-run",
  });
}

export function readOnlyObservationFor(
  entry: TaskLiveEntry,
  receipt: TaskLiveGateReceipt,
): TaskLiveRunObservation {
  return observationFromReceipt({
    entryId: entry.entryId,
    gate: "read-only-provider",
    receipt,
    proofStatus: "complete",
    verificationStatus: "partial",
  });
}

export function anchoredObservationFor(
  entry: TaskLiveEntry,
  receipt: TaskLiveGateReceipt,
  reviewedApplyOptIn: boolean,
): TaskLiveRunObservation {
  if (isWriteCapableEntry(entry)) {
    return reviewedApplyOptIn
      ? writeApplyObservationFor(entry, receipt)
      : writePlanningObservationFor(entry, receipt);
  }
  return observationFromReceipt({
    entryId: entry.entryId,
    gate: "anchored-provider",
    receipt,
    proofStatus: "complete",
    verificationStatus: "partial",
  });
}

export function artifactObservationFor(
  entry: TaskLiveEntry,
  receipt: TaskLiveGateReceipt,
): TaskLiveRunObservation {
  return observationFromReceipt({
    entryId: entry.entryId,
    gate: "artifact-dry-run",
    receipt,
    proofStatus: "complete",
    verificationStatus: "passed",
    artifactValidationStatus: "passed",
  });
}

function writePlanningObservationFor(
  entry: TaskLiveEntry,
  receipt: TaskLiveGateReceipt,
): TaskLiveRunObservation {
  return freeze({
    ...observationFromReceipt({
      entryId: entry.entryId,
      gate: entry.gate,
      receipt,
      proofStatus: "partial",
      verificationStatus: "partial",
    }),
    changedFiles: freeze([]),
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "missing",
    applyStatus: "not-run",
    isolatedApply: false,
    realWorkspaceMutation: false,
    postApplyVerificationStatus: "not-run",
    rollbackStatus: "not-run",
    realWorkspaceApplyStatus: "not-run",
    realWorkspaceApplyScope: "not-run",
  });
}

function writeApplyObservationFor(
  entry: TaskLiveEntry,
  receipt: TaskLiveGateReceipt,
): TaskLiveRunObservation {
  return freeze({
    ...observationFromReceipt({
      entryId: entry.entryId,
      gate: entry.gate,
      receipt,
      proofStatus: "complete",
      verificationStatus: "passed",
    }),
    noMutation: false,
    changedFiles: freeze(expectedChangedFilesFor(entry)),
    noApply: false,
    patchIntentStatus: "present",
    safePlanStatus: "ready",
    dryRunDiffStatus: "produced",
    reviewAuthority: "approved",
    applyStatus: "applied",
    isolatedApply: true,
    realWorkspaceMutation: false,
    postApplyVerificationStatus: "passed",
    rollbackStatus: entry.entryKind === "write-rollback" ? "partial" : "not-run",
    realWorkspaceApplyStatus: "not-run",
    realWorkspaceApplyScope: "not-run",
  });
}

function expectedChangedFilesFor(entry: TaskLiveEntry): readonly string[] {
  if (entry.expectedChangedFiles && entry.expectedChangedFiles.length > 0) {
    return freeze([...entry.expectedChangedFiles]);
  }
  return freeze(["src/change.ts"]);
}

export function workspaceApplyObservation(
  receipt: TaskLiveWorkspaceApplyReceipt,
  existing: TaskLiveRunObservation | undefined,
  anchored: TaskLiveGateReceipt | undefined,
): TaskLiveRunObservation | undefined {
  if (!receipt.attempted) return existing;
  const providerReceipt = anchored ?? {
    gate: "anchored-provider" as const,
    attempted: true,
    outcome: receipt.outcome === "provider-network-inconclusive" || receipt.outcome === "config-or-skip"
      ? receipt.outcome
      : receipt.outcome === "passed"
        ? "passed" as const
        : "failed" as const,
    noMutation: false,
    changedFiles: [],
    noApply: false,
    redactionStatus: receipt.redactionStatus,
  };
  const base = existing ?? writeApplyObservation(
    receipt.entryId,
    providerReceipt,
    receipt.changedFiles.length > 0 ? receipt.changedFiles : ["src/app.ts"],
    receipt.outcome === "passed" ? "complete" : "partial",
    receipt.postActionVerificationStatus,
    "not-run",
  );
  return freeze({
    ...base,
    changedFiles: freeze(receipt.changedFiles.length > 0 ? [...receipt.changedFiles] : [...base.changedFiles]),
    redactionStatus: receipt.redactionStatus,
    realWorkspaceMutation: false,
    realWorkspaceApplyStatus: receipt.outcome === "passed"
      ? "applied"
      : receipt.outcome === "blocked" || receipt.outcome === "config-or-skip"
        ? "blocked"
        : receipt.outcome === "provider-network-inconclusive"
          ? "blocked"
        : receipt.outcome === "skipped"
          ? "not-run"
          : "failed",
    realWorkspaceApplyScope: receipt.writerTarget === "isolated-selected-workspace"
      ? "isolated-selected-workspace"
      : "not-run",
    postApplyVerificationStatus: receipt.outcome === "passed"
      ? receipt.postActionVerificationStatus
      : base.postApplyVerificationStatus,
    ...(receipt.blocker ? { exactBlocker: receipt.blocker } : {}),
  });
}

export function liveEntry(input: Omit<TaskLiveEntry, "defaultOff" | "optInRequired" | "terminalSuccessClaim">): TaskLiveEntry {
  return freeze({
    ...input,
    requirements: freeze(unique([
      ...input.requirements,
      "explicit opt-in",
      "isolated runtime home",
      "redacted output",
    ])),
    defaultOff: true,
    optInRequired: true,
    terminalSuccessClaim: false,
  });
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function unique<T extends string>(values: readonly T[]): readonly T[] {
  return freeze(Array.from(new Set(values)));
}

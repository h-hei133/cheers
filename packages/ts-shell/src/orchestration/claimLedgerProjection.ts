import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";

export type ClaimLedgerEvidenceSource =
  | "default-safe"
  | "fake-provider"
  | "fake-ready"
  | "live-provider"
  | "focused-tests"
  | "unknown";

export type ClaimLedgerMutationScope =
  | "none"
  | "controlled-temp-workspace"
  | "selected-workspace";

export type ClaimLedgerClaimGroup =
  | "provider"
  | "proposal"
  | "anchor"
  | "authority"
  | "mutation"
  | "verification"
  | "recovery"
  | "repair";

export type ClaimLedgerClaimStatus =
  | "proven"
  | "not-proven"
  | "not-required"
  | "not-run"
  | "blocked"
  | "failed"
  | "invalid";

export type ClaimLedgerTerminalStatus =
  | "verified-success"
  | "verified-success-with-repair"
  | "verification-succeeded-not-live"
  | "verification-succeeded-with-repair-not-live"
  | "confirmation-required"
  | "review-required"
  | "repair-eligible"
  | "repair-proposed"
  | "repair-confirmation-required"
  | "repair-applied"
  | "apply-succeeded"
  | "apply-stopped"
  | "provider-unavailable"
  | "skipped"
  | "not-proven";

export type ClaimLedgerResultStatus =
  | "skipped-no-provider-opt-in"
  | "provider-unavailable"
  | "proposal-created-no-write"
  | "anchoring-exact-ready"
  | "review-required"
  | "confirmation-required"
  | "apply-succeeded"
  | "apply-stopped"
  | "verification-succeeded"
  | "verification-succeeded-with-repair"
  | "verification-failed"
  | "repair-eligible"
  | "repair-proposed"
  | "repair-confirmation-required"
  | "repair-applied"
  | "task-loop-complete-with-repair"
  | "task-loop-complete"
  | "task-loop-stopped";

export type ClaimLedgerRepairStatus =
  | "not-required"
  | "repair-available"
  | "repair-not-run"
  | "repair-proposed"
  | "repair-confirmation-required"
  | "repair-applied"
  | "repair-verification-succeeded"
  | "repair-invalid"
  | "repair-failed";

export interface ClaimLedgerRepairInput {
  readonly originalFailurePreserved: boolean;
  readonly originalFailureRuntimeDerived: boolean;
  readonly proposalStatus: "not-run" | "created" | "invalid";
  readonly anchorStatus: "not-run" | "exact-ready" | "unsupported";
  readonly confirmationStatus:
    | "not-requested"
    | "required"
    | "trusted-confirmed"
    | "invalid";
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly verificationRuntimeDerived: boolean;
  readonly verificationEvidenceCount: number;
  readonly mutationScope: ClaimLedgerMutationScope;
  readonly providerCallDuringApply: boolean;
  readonly evidenceSource?: ClaimLedgerEvidenceSource;
}

export interface ClaimLedgerClaim {
  readonly group: ClaimLedgerClaimGroup;
  readonly status: ClaimLedgerClaimStatus;
  readonly evidenceType: string;
  readonly source: string;
  readonly scope: string;
  readonly reason: string;
  readonly blocker?: string;
  readonly receiptFields: Readonly<Record<string, string | boolean | number>>;
}

export interface ClaimLedgerRepairClaim {
  readonly group: "repair";
  readonly status: ClaimLedgerRepairStatus;
  readonly evidenceType: string;
  readonly source: string;
  readonly scope: string;
  readonly reason: string;
  readonly blocker?: string;
  readonly receiptFields: Readonly<Record<string, string | boolean | number>>;
}

export interface ClaimLedgerNotProvenClaim {
  readonly group: ClaimLedgerClaimGroup | "terminal";
  readonly reason: string;
  readonly blocker: string;
}

export interface ClaimLedgerPerFileClaim {
  readonly targetPath: string;
  readonly proposalStatus: "proven" | "not-proven" | "failed";
  readonly anchorQuality: "exact-ready" | "not-exact" | "missing";
  readonly authorityStatus: "proven" | "blocked" | "invalid" | "not-run";
  readonly applyStatus: "succeeded" | "failed" | "stopped" | "not-run";
  readonly applyRuntimeDerived: boolean;
  readonly verificationStatus: "succeeded" | "failed" | "not-run";
  readonly readbackRuntimeDerived: boolean;
  readonly verificationEvidenceCount: number;
  readonly fileStatus: "changed" | "failed" | "unattempted";
  readonly snapshotStatus: "created" | "blocked" | "not-run";
  readonly recoveryStatus: "available" | "blocked" | "not-run";
  readonly repairStatus?: ClaimLedgerRepairStatus;
  readonly evidence: readonly string[];
}

export interface ClaimLedgerTerminalClaim {
  readonly status: ClaimLedgerTerminalStatus;
  readonly evidenceType: "ledger-derived";
  readonly source: string;
  readonly scope: string;
  readonly reason: string;
  readonly blocker?: string;
  readonly resultStatus: ClaimLedgerResultStatus;
  readonly liveSuccess: boolean;
  readonly receiptFields: Readonly<Record<string, string | boolean | number>>;
}

export interface ClaimLedgerProjection {
  readonly ledgerId: string;
  readonly version: "v1";
  readonly evidenceSource: ClaimLedgerEvidenceSource;
  readonly provider: ClaimLedgerClaim;
  readonly proposal: ClaimLedgerClaim;
  readonly anchor: ClaimLedgerClaim;
  readonly authority: ClaimLedgerClaim;
  readonly mutation: ClaimLedgerClaim;
  readonly verification: ClaimLedgerClaim;
  readonly recovery: ClaimLedgerClaim;
  readonly repair: ClaimLedgerRepairClaim;
  readonly perFileClaims: readonly ClaimLedgerPerFileClaim[];
  readonly terminal: ClaimLedgerTerminalClaim;
  readonly notProvenClaims: readonly ClaimLedgerNotProvenClaim[];
  readonly replaySafeSummary: string;
  readonly evidence: readonly string[];
}

export function buildClaimLedgerProjection(input: {
  readonly taskLoopId: string;
  readonly fixtureId: string;
  readonly evidenceSource: ClaimLedgerEvidenceSource;
  readonly providerKind: string;
  readonly liveOptIn: boolean;
  readonly providerCalled: boolean;
  readonly providerErrorClass?: string;
  readonly outputValidationStatus: string;
  readonly anchorQuality: string;
  readonly handoffReadiness?: string;
  readonly confirmationStatus: string;
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly snapshotStatus: "not-run" | "created" | "blocked";
  readonly recoveryStatus: "not-run" | "available" | "blocked";
  readonly mutationScope: ClaimLedgerMutationScope;
  readonly providerCallDuringApply: boolean;
  readonly scorecardStatus?: string;
  readonly repair?: ClaimLedgerRepairInput;
  readonly perFileClaims?: readonly ClaimLedgerPerFileClaim[];
  readonly requiredTargetPaths?: readonly string[];
}): ClaimLedgerProjection {
  const provider = projectProviderClaim(input);
  const proposal = projectProposalClaim(input);
  const anchor = projectAnchorClaim(input);
  const authority = projectAuthorityClaim(input, proposal, anchor);
  const mutation = projectMutationClaim(input);
  const verification = projectVerificationClaim(input);
  const recovery = projectRecoveryClaim(input);
  const repair = projectRepairClaim(input);
  const notProvenClaims = collectNotProvenClaims(input, {
    provider,
    proposal,
    anchor,
    authority,
    mutation,
    verification,
    recovery,
    repair,
  });
  const terminal = projectTerminalClaim(input, {
    provider,
    proposal,
    anchor,
    authority,
    mutation,
    verification,
    recovery,
    repair,
    notProvenClaims,
  });
  const ledgerId = buildLedgerId({
    taskLoopId: input.taskLoopId,
    evidenceSource: input.evidenceSource,
    provider: provider.status,
    proposal: proposal.status,
    anchor: anchor.status,
    authority: authority.status,
    mutation: mutation.status,
    verification: verification.status,
    recovery: recovery.status,
    repair: repair.status,
    perFileClaims: summarizePerFileClaims(input.perFileClaims ?? []),
    requiredTargetPaths: input.requiredTargetPaths?.join(",") ?? "none",
    terminal: terminal.status,
    resultStatus: terminal.resultStatus,
  });
  const notProvenSummary = notProvenClaims.length === 0
    ? "none"
    : notProvenClaims.map((claim) => claim.group).join(",");
  const replaySafeSummary = [
    `claim-ledger ${ledgerId}`,
    "version=v1",
    `source=${input.evidenceSource}`,
    `terminal=${terminal.status}`,
    `result=${terminal.resultStatus}`,
    `liveSuccess=${terminal.liveSuccess}`,
    `notProven=${notProvenSummary}`,
    `provider=${provider.status}`,
    `proposal=${proposal.status}`,
    `anchor=${anchor.status}`,
    `authority=${authority.status}`,
    `mutation=${mutation.status}`,
    `verification=${verification.status}`,
    `recovery=${recovery.status}`,
    `repair=${repair.status}`,
    ...(input.requiredTargetPaths?.length ? [`requiredFiles=${input.requiredTargetPaths.join(",")}`] : []),
    ...(input.perFileClaims?.length ? [`files=${summarizePerFileClaims(input.perFileClaims)}`] : []),
    "raw-content-excluded",
  ].join("; ");
  return {
    ledgerId,
    version: "v1",
    evidenceSource: input.evidenceSource,
    provider,
    proposal,
    anchor,
    authority,
    mutation,
    verification,
    recovery,
    repair,
    perFileClaims: input.perFileClaims ?? [],
    terminal,
    notProvenClaims,
    replaySafeSummary,
    evidence: [
      replaySafeSummary,
      `claim-ledger:id:${ledgerId}`,
      "claim-ledger:version:v1",
      `claim-ledger:evidence-source:${input.evidenceSource}`,
      `claim-ledger:provider:${provider.status}`,
      `claim-ledger:proposal:${proposal.status}`,
      `claim-ledger:anchor:${anchor.status}`,
      `claim-ledger:authority:${authority.status}`,
      `claim-ledger:mutation:${mutation.status}`,
      `claim-ledger:mutation-scope:${input.mutationScope}`,
      `claim-ledger:verification:${verification.status}`,
      `claim-ledger:recovery:${recovery.status}`,
      `claim-ledger:repair:${repair.status}`,
      ...(input.requiredTargetPaths ?? []).map((targetPath) => `claim-ledger:required-file:${targetPath}`),
      ...projectPerFileClaimEvidence(input.perFileClaims ?? []),
      `claim-ledger:terminal:${terminal.status}`,
      `claim-ledger:terminal-result:${terminal.resultStatus}`,
      `claim-ledger:live-success:${terminal.liveSuccess}`,
      ...notProvenClaims.map((claim) => `claim-ledger:not-proven:${claim.group}:${claim.blocker}`),
      ...(notProvenClaims.length === 0 ? ["claim-ledger:not-proven:none"] : []),
      "claim-ledger:raw-content-excluded",
    ],
  };
}

function projectProviderClaim(input: {
  readonly evidenceSource: ClaimLedgerEvidenceSource;
  readonly providerKind: string;
  readonly liveOptIn: boolean;
  readonly providerCalled: boolean;
  readonly providerErrorClass?: string;
}): ClaimLedgerClaim {
  if (input.evidenceSource === "default-safe" && !input.liveOptIn) {
    return claim({
      group: "provider",
      status: "not-required",
      source: input.evidenceSource,
      scope: "no-provider-no-apply",
      reason: "Default route did not opt into a provider call.",
      receiptFields: {
        providerKind: input.providerKind,
        providerCalled: input.providerCalled,
      },
    });
  }
  if (input.providerErrorClass) {
    return claim({
      group: "provider",
      status: "failed",
      source: input.evidenceSource,
      scope: providerScope(input.evidenceSource),
      reason: `Provider call failed with class ${input.providerErrorClass}.`,
      blocker: "provider-error",
      receiptFields: {
        providerKind: input.providerKind,
        providerCalled: input.providerCalled,
        providerErrorClass: input.providerErrorClass,
      },
    });
  }
  if (!input.providerCalled) {
    return claim({
      group: "provider",
      status: "not-proven",
      source: input.evidenceSource,
      scope: providerScope(input.evidenceSource),
      reason: "No provider call receipt was produced.",
      blocker: "provider-not-called",
      receiptFields: {
        providerKind: input.providerKind,
        providerCalled: input.providerCalled,
      },
    });
  }
  return claim({
    group: "provider",
    status: "proven",
    source: input.evidenceSource,
    scope: providerScope(input.evidenceSource),
    reason: "Provider call receipt was produced.",
    receiptFields: {
      providerKind: input.providerKind,
      providerCalled: input.providerCalled,
    },
  });
}

function projectProposalClaim(input: {
  readonly outputValidationStatus: string;
  readonly evidenceSource: ClaimLedgerEvidenceSource;
}): ClaimLedgerClaim {
  if (isValidExactOutput(input.outputValidationStatus)) {
    const targetShape = input.outputValidationStatus === "valid-exact-hunk-set" ? "target-set" : "single-target";
    return claim({
      group: "proposal",
      status: "proven",
      source: input.evidenceSource,
      scope: `${targetShape}-exact-proposal`,
      reason: input.outputValidationStatus === "valid-exact-hunk-set"
        ? "Provider output validation proved a bounded exact target set."
        : "Provider output validation proved one exact bounded target.",
      receiptFields: { outputValidation: input.outputValidationStatus },
    });
  }
  if (input.outputValidationStatus === "none") {
    return claim({
      group: "proposal",
      status: "not-proven",
      source: input.evidenceSource,
      scope: "provider-output",
      reason: "No provider output validation receipt was produced.",
      blocker: "output-validation-missing",
      receiptFields: { outputValidation: input.outputValidationStatus },
    });
  }
  return claim({
    group: "proposal",
    status: "failed",
    source: input.evidenceSource,
    scope: "provider-output",
    reason: `Provider output validation did not prove exact readiness: ${input.outputValidationStatus}.`,
    blocker: "output-validation-failed",
    receiptFields: { outputValidation: input.outputValidationStatus },
  });
}

function projectAnchorClaim(input: {
  readonly anchorQuality: string;
  readonly handoffReadiness?: string;
  readonly evidenceSource: ClaimLedgerEvidenceSource;
}): ClaimLedgerClaim {
  if (
    input.anchorQuality === "exact-ready" &&
    (input.handoffReadiness === "exact-single-target" || input.handoffReadiness === "exact-hunk-set")
  ) {
    return claim({
      group: "anchor",
      status: "proven",
      source: input.evidenceSource,
      scope: input.handoffReadiness,
      reason: "Anchor quality and handoff readiness are exact.",
      receiptFields: {
        anchorQuality: input.anchorQuality,
        handoffReadiness: input.handoffReadiness,
      },
    });
  }
  if (input.anchorQuality === "none") {
    return claim({
      group: "anchor",
      status: "not-proven",
      source: input.evidenceSource,
      scope: "provider-anchor",
      reason: "No anchor-quality receipt was produced.",
      blocker: "anchor-missing",
      receiptFields: {
        anchorQuality: input.anchorQuality,
        handoffReadiness: input.handoffReadiness ?? "none",
      },
    });
  }
  return claim({
    group: "anchor",
    status: "failed",
    source: input.evidenceSource,
    scope: "provider-anchor",
    reason: `Anchor quality is not exact-ready: ${input.anchorQuality}.`,
    blocker: "anchor-not-exact-ready",
    receiptFields: {
      anchorQuality: input.anchorQuality,
      handoffReadiness: input.handoffReadiness ?? "none",
    },
  });
}

function projectAuthorityClaim(
  input: {
    readonly confirmationStatus: string;
    readonly evidenceSource: ClaimLedgerEvidenceSource;
  },
  proposal: ClaimLedgerClaim,
  anchor: ClaimLedgerClaim,
): ClaimLedgerClaim {
  if (input.confirmationStatus === "trusted-confirmed" || input.confirmationStatus === "confirmed") {
    if (proposal.status === "proven" && anchor.status === "proven") {
      return claim({
        group: "authority",
        status: "proven",
        source: input.evidenceSource,
        scope: anchor.scope === "exact-hunk-set" ? "confirmed-exact-target-set" : "confirmed-exact-target",
        reason: "Trusted confirmation is backed by proven proposal and anchor claims.",
        receiptFields: { confirmation: input.confirmationStatus },
      });
    }
    return claim({
      group: "authority",
      status: "invalid",
      source: input.evidenceSource,
      scope: "confirmation",
      reason: "Confirmation cannot authorize mutation without proven proposal and anchor claims.",
      blocker: "confirmation-without-exact-anchor",
      receiptFields: {
        confirmation: input.confirmationStatus,
        proposal: proposal.status,
        anchor: anchor.status,
      },
    });
  }
  if (input.confirmationStatus === "required") {
    return claim({
      group: "authority",
      status: "blocked",
      source: input.evidenceSource,
      scope: "confirmation",
      reason: "Exact-ready proposal requires explicit trusted confirmation before mutation.",
      blocker: "confirmation-required",
      receiptFields: { confirmation: input.confirmationStatus },
    });
  }
  if (input.confirmationStatus === "invalid") {
    return claim({
      group: "authority",
      status: "invalid",
      source: input.evidenceSource,
      scope: "confirmation",
      reason: "Confirmation was requested but the proof chain was not exact-ready.",
      blocker: "confirmation-invalid",
      receiptFields: { confirmation: input.confirmationStatus },
    });
  }
  return claim({
    group: "authority",
    status: "not-run",
    source: input.evidenceSource,
    scope: "confirmation",
    reason: "No mutation authority was requested.",
    blocker: "authority-not-requested",
    receiptFields: { confirmation: input.confirmationStatus },
  });
}

function projectMutationClaim(input: {
  readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
  readonly mutationScope: ClaimLedgerMutationScope;
  readonly providerCallDuringApply: boolean;
  readonly evidenceSource: ClaimLedgerEvidenceSource;
}): ClaimLedgerClaim {
  if (
    input.applyStatus === "succeeded" &&
    (input.mutationScope === "controlled-temp-workspace" ||
      input.mutationScope === "selected-workspace") &&
    !input.providerCallDuringApply
  ) {
    return claim({
      group: "mutation",
      status: "proven",
      source: input.evidenceSource,
      scope: input.mutationScope,
      reason: input.mutationScope === "selected-workspace"
        ? "Existing exact apply lane changed the explicitly selected workspace without provider calls."
        : "Existing exact apply lane changed the controlled temp workspace without provider calls.",
      receiptFields: {
        apply: input.applyStatus,
        mutationScope: input.mutationScope,
        providerCallDuringApply: input.providerCallDuringApply,
      },
    });
  }
  if (input.applyStatus === "not-run") {
    return claim({
      group: "mutation",
      status: "not-run",
      source: input.evidenceSource,
      scope: input.mutationScope,
      reason: "No apply result was produced.",
      blocker: "apply-not-run",
      receiptFields: {
        apply: input.applyStatus,
        mutationScope: input.mutationScope,
        providerCallDuringApply: input.providerCallDuringApply,
      },
    });
  }
  return claim({
    group: "mutation",
    status: input.applyStatus === "stopped" ? "blocked" : "failed",
    source: input.evidenceSource,
    scope: input.mutationScope,
    reason: input.providerCallDuringApply
      ? "Apply path called the provider after mutation began."
      : `Apply did not prove a controlled mutation: ${input.applyStatus}.`,
    blocker: input.providerCallDuringApply ? "provider-call-during-apply" : "apply-not-proven",
    receiptFields: {
      apply: input.applyStatus,
      mutationScope: input.mutationScope,
      providerCallDuringApply: input.providerCallDuringApply,
    },
  });
}

function projectVerificationClaim(input: {
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly evidenceSource: ClaimLedgerEvidenceSource;
}): ClaimLedgerClaim {
  if (input.verificationStatus === "succeeded") {
    return claim({
      group: "verification",
      status: "proven",
      source: input.evidenceSource,
      scope: "readback",
      reason: "Readback verification succeeded.",
      receiptFields: { verification: input.verificationStatus },
    });
  }
  if (input.verificationStatus === "failed") {
    return claim({
      group: "verification",
      status: "failed",
      source: input.evidenceSource,
      scope: "readback",
      reason: "Readback verification failed.",
      blocker: "verification-failed",
      receiptFields: { verification: input.verificationStatus },
    });
  }
  return claim({
    group: "verification",
    status: "not-run",
    source: input.evidenceSource,
    scope: "readback",
    reason: "Readback verification was not run.",
    blocker: "verification-not-run",
    receiptFields: { verification: input.verificationStatus },
  });
}

function projectRecoveryClaim(input: {
  readonly snapshotStatus: "not-run" | "created" | "blocked";
  readonly recoveryStatus: "not-run" | "available" | "blocked";
  readonly evidenceSource: ClaimLedgerEvidenceSource;
}): ClaimLedgerClaim {
  if (input.snapshotStatus === "created" && input.recoveryStatus === "available") {
    return claim({
      group: "recovery",
      status: "proven",
      source: input.evidenceSource,
      scope: "snapshot-and-recovery",
      reason: "Snapshot and recovery receipts are available.",
      receiptFields: {
        snapshot: input.snapshotStatus,
        recovery: input.recoveryStatus,
      },
    });
  }
  if (input.snapshotStatus === "not-run" && input.recoveryStatus === "not-run") {
    return claim({
      group: "recovery",
      status: "not-run",
      source: input.evidenceSource,
      scope: "snapshot-and-recovery",
      reason: "No apply occurred, so snapshot and recovery receipts were not required.",
      blocker: "recovery-not-run",
      receiptFields: {
        snapshot: input.snapshotStatus,
        recovery: input.recoveryStatus,
      },
    });
  }
  return claim({
    group: "recovery",
    status: "failed",
    source: input.evidenceSource,
    scope: "snapshot-and-recovery",
    reason: "Snapshot and recovery receipts are incomplete.",
    blocker: "recovery-incomplete",
    receiptFields: {
      snapshot: input.snapshotStatus,
      recovery: input.recoveryStatus,
    },
  });
}

function projectRepairClaim(input: {
  readonly evidenceSource: ClaimLedgerEvidenceSource;
  readonly verificationStatus: "not-run" | "succeeded" | "failed";
  readonly repair?: ClaimLedgerRepairInput;
}): ClaimLedgerRepairClaim {
  const repair = input.repair;
  if (!repair) {
    if (input.verificationStatus === "failed") {
      return repairClaim({
        status: "repair-available",
        source: input.evidenceSource,
        scope: "verification-failure",
        reason: "Original verification failed; repair is available but no repair proposal has been applied.",
        blocker: "repair-not-run",
        receiptFields: baseRepairReceiptFields(),
      });
    }
    return repairClaim({
      status: "not-required",
      source: input.evidenceSource,
      scope: "verification",
      reason: "Repair is not required because original verification did not fail.",
      receiptFields: baseRepairReceiptFields(),
    });
  }

  const source = repair.evidenceSource ?? input.evidenceSource;
  const receiptFields = {
    originalFailurePreserved: repair.originalFailurePreserved,
    originalFailureRuntimeDerived: repair.originalFailureRuntimeDerived,
    proposal: repair.proposalStatus,
    anchor: repair.anchorStatus,
    confirmation: repair.confirmationStatus,
    apply: repair.applyStatus,
    verification: repair.verificationStatus,
    verificationRuntimeDerived: repair.verificationRuntimeDerived,
    verificationEvidenceCount: repair.verificationEvidenceCount,
    mutationScope: repair.mutationScope,
    providerCallDuringApply: repair.providerCallDuringApply,
  };
  if (input.verificationStatus !== "failed") {
    return repairClaim({
      status: "repair-invalid",
      source,
      scope: "verification-failure",
      reason: "Repair proof cannot run without preserved original verification failure evidence.",
      blocker: "repair-without-original-failure",
      receiptFields,
    });
  }
  if (!repair.originalFailurePreserved) {
    return repairClaim({
      status: "repair-invalid",
      source,
      scope: "original-failure",
      reason: "Repair proof did not preserve the original verification failure.",
      blocker: "original-failure-not-preserved",
      receiptFields,
    });
  }
  if (!repair.originalFailureRuntimeDerived) {
    return repairClaim({
      status: "repair-invalid",
      source,
      scope: "original-failure",
      reason: "Original verification failure was not backed by runtime readback evidence.",
      blocker: "original-failure-not-runtime-derived",
      receiptFields,
    });
  }
  if (repair.providerCallDuringApply) {
    return repairClaim({
      status: "repair-invalid",
      source,
      scope: "repair-apply",
      reason: "Repair apply called the provider during mutation.",
      blocker: "repair-provider-call-during-apply",
      receiptFields,
    });
  }
  if (repair.proposalStatus === "invalid" || repair.anchorStatus === "unsupported") {
    return repairClaim({
      status: "repair-invalid",
      source,
      scope: "repair-proposal",
      reason: "Repair proposal did not prove an exact-ready bounded hunk.",
      blocker: repair.proposalStatus === "invalid" ? "repair-proposal-invalid" : "repair-anchor-not-exact-ready",
      receiptFields,
    });
  }
  if (repair.proposalStatus !== "created") {
    return repairClaim({
      status: "repair-not-run",
      source,
      scope: "repair-proposal",
      reason: "No repair proposal was created.",
      blocker: "repair-proposal-not-run",
      receiptFields,
    });
  }
  if (repair.anchorStatus !== "exact-ready") {
    if (repair.confirmationStatus === "trusted-confirmed" || repair.confirmationStatus === "invalid") {
      return repairClaim({
        status: "repair-invalid",
        source,
        scope: "repair-confirmation",
        reason: "Repair confirmation cannot authorize mutation without exact-ready repair anchors.",
        blocker: "repair-confirmation-without-exact-anchor",
        receiptFields,
      });
    }
    return repairClaim({
      status: "repair-proposed",
      source,
      scope: "repair-proposal",
      reason: "Repair proposal exists but is not exact-ready.",
      blocker: "repair-anchor-not-exact-ready",
      receiptFields,
    });
  }
  if (repair.confirmationStatus !== "trusted-confirmed") {
    return repairClaim({
      status:
        repair.confirmationStatus === "invalid"
          ? "repair-invalid"
          : "repair-confirmation-required",
      source,
      scope: "repair-confirmation",
      reason:
        repair.confirmationStatus === "invalid"
          ? "Repair confirmation was requested without an exact-ready repair proof."
          : "Exact-ready repair proposal requires separate trusted confirmation before apply.",
      blocker:
        repair.confirmationStatus === "invalid"
          ? "repair-confirmation-invalid"
          : "repair-confirmation-required",
      receiptFields,
    });
  }
  if (repair.applyStatus !== "succeeded") {
    return repairClaim({
      status: repair.applyStatus === "not-run" ? "repair-proposed" : "repair-failed",
      source,
      scope: "repair-apply",
      reason:
        repair.applyStatus === "not-run"
          ? "Repair was confirmed but did not run through the existing exact apply lane."
          : "Repair apply did not succeed through the existing exact apply lane.",
      blocker: repair.applyStatus === "not-run" ? "repair-apply-not-run" : "repair-apply-failed",
      receiptFields,
    });
  }
  if (
    repair.mutationScope !== "controlled-temp-workspace" &&
    repair.mutationScope !== "selected-workspace"
  ) {
    return repairClaim({
      status: "repair-invalid",
      source,
      scope: "repair-mutation-scope",
      reason: "Repair apply did not remain in the controlled temp workspace.",
      blocker: "repair-mutation-scope-invalid",
      receiptFields,
    });
  }
  if (repair.verificationStatus !== "succeeded") {
    return repairClaim({
      status:
        repair.verificationStatus === "failed"
          ? "repair-failed"
          : "repair-applied",
      source,
      scope: "repair-readback",
      reason:
        repair.verificationStatus === "failed"
          ? "Repair readback verification failed."
          : "Repair apply succeeded, but repair readback verification did not run.",
      blocker:
        repair.verificationStatus === "failed"
          ? "repair-verification-failed"
          : "repair-verification-not-run",
      receiptFields,
    });
  }
  if (!repair.verificationRuntimeDerived || repair.verificationEvidenceCount < 1) {
    return repairClaim({
      status: "repair-applied",
      source,
      scope: "repair-readback",
      reason: "Repair apply succeeded, but repair readback verification evidence was not runtime-derived.",
      blocker: "repair-verification-not-runtime-derived",
      receiptFields,
    });
  }
  return repairClaim({
    status: "repair-verification-succeeded",
    source,
    scope: "repair-readback",
    reason: "Repair proposal was confirmed, applied through an existing exact lane, and re-verified.",
    receiptFields,
  });
}

function baseRepairReceiptFields(): Readonly<Record<string, string | boolean | number>> {
  return {
    proposal: "not-run",
    anchor: "not-run",
    confirmation: "not-requested",
    apply: "not-run",
    verification: "not-run",
    mutationScope: "none",
    providerCallDuringApply: false,
  };
}

function collectNotProvenClaims(
  input: {
    readonly evidenceSource: ClaimLedgerEvidenceSource;
    readonly providerKind: string;
    readonly liveOptIn: boolean;
    readonly verificationStatus: "not-run" | "succeeded" | "failed";
    readonly repair?: ClaimLedgerRepairInput;
    readonly perFileClaims?: readonly ClaimLedgerPerFileClaim[];
    readonly requiredTargetPaths?: readonly string[];
  },
  claims: Record<Exclude<ClaimLedgerClaimGroup, "repair">, ClaimLedgerClaim> & {
    readonly repair: ClaimLedgerRepairClaim;
  },
): readonly ClaimLedgerNotProvenClaim[] {
  const notProven: ClaimLedgerNotProvenClaim[] = [];
  const repairSucceeded =
    input.verificationStatus === "failed" &&
    claims.repair.status === "repair-verification-succeeded";
  for (const claimItem of [
    claims.provider,
    claims.proposal,
    claims.anchor,
    claims.authority,
    claims.mutation,
    claims.verification,
    claims.recovery,
  ]) {
    if (claimItem.group === "verification" && repairSucceeded) {
      continue;
    }
    if (
      claimItem.status === "not-proven" ||
      claimItem.status === "not-run" ||
      claimItem.status === "blocked" ||
      claimItem.status === "failed" ||
      claimItem.status === "invalid"
    ) {
      notProven.push({
        group: claimItem.group,
        reason: claimItem.reason,
        blocker: claimItem.blocker ?? claimItem.status,
      });
    }
  }
  if (isBlockingRepairStatus(claims.repair.status)) {
    notProven.push({
      group: "repair",
      reason: claims.repair.reason,
      blocker: claims.repair.blocker ?? claims.repair.status,
    });
  }
  if (
    repairSucceeded &&
    input.repair?.evidenceSource &&
    input.repair.evidenceSource !== "live-provider"
  ) {
    notProven.push({
      group: "repair",
      reason: "Repair evidence source does not prove a live repair success claim.",
      blocker: "not-live-repair-evidence",
    });
  }
  if (
    (input.verificationStatus === "succeeded" || repairSucceeded) &&
    !canProveLiveProvider(input)
  ) {
    notProven.push({
      group: "provider",
      reason: "Provider provenance does not prove a live openai-compatible provider success claim.",
      blocker: "not-live-provider-evidence",
    });
  }
  for (const fileClaim of input.perFileClaims ?? []) {
    const blocker = perFileClaimBlocker(fileClaim, repairSucceeded);
    if (blocker) {
      notProven.push({
        group: "terminal",
        reason: `Per-file proof is incomplete for ${fileClaim.targetPath}.`,
        blocker,
      });
    }
  }
  const claimedTargets = new Set((input.perFileClaims ?? []).map((claim) => claim.targetPath));
  for (const targetPath of input.requiredTargetPaths ?? []) {
    if (!claimedTargets.has(targetPath)) {
      notProven.push({
        group: "terminal",
        reason: `Required file proof is missing for ${targetPath}.`,
        blocker: `file-missing-claim-${targetPath}`,
      });
    }
  }
  return notProven;
}

function projectTerminalClaim(
  input: {
    readonly evidenceSource: ClaimLedgerEvidenceSource;
    readonly providerKind: string;
    readonly liveOptIn: boolean;
    readonly applyStatus: "not-run" | "succeeded" | "stopped" | "failed";
    readonly verificationStatus: "not-run" | "succeeded" | "failed";
    readonly scorecardStatus?: string;
    readonly repair?: ClaimLedgerRepairInput;
  },
  claims: Record<Exclude<ClaimLedgerClaimGroup, "repair">, ClaimLedgerClaim> & {
    readonly repair: ClaimLedgerRepairClaim;
    readonly notProvenClaims: readonly ClaimLedgerNotProvenClaim[];
  },
): ClaimLedgerTerminalClaim {
  const requiredClaims: readonly ClaimLedgerClaim[] = [
    claims.provider,
    claims.proposal,
    claims.anchor,
    claims.authority,
    claims.mutation,
    claims.verification,
    claims.recovery,
  ];
  const allRequiredProven = requiredClaims.every((claimItem) => claimItem.status === "proven");
  const allNonProviderRequiredProven = [
    claims.proposal,
    claims.anchor,
    claims.authority,
    claims.mutation,
    claims.verification,
    claims.recovery,
  ].every((claimItem) => claimItem.status === "proven");
  const liveSuccess =
    canProveLiveProvider(input) &&
    allRequiredProven &&
    claims.notProvenClaims.length === 0;
  if (liveSuccess) {
    return terminalClaim({
      input,
      status: "verified-success",
      resultStatus: "task-loop-complete",
      liveSuccess,
      reason: "All live provider, proposal, anchor, authority, mutation, verification, and recovery claims are proven.",
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  const repairCoreClaims: readonly ClaimLedgerClaim[] = [
    claims.provider,
    claims.proposal,
    claims.anchor,
    claims.authority,
    claims.mutation,
    claims.recovery,
  ];
  const repairCoreClaimsProven = repairCoreClaims.every((claimItem) => claimItem.status === "proven");
  const repairedVerificationSucceeded =
    input.verificationStatus === "failed" &&
    claims.repair.status === "repair-verification-succeeded" &&
    repairCoreClaimsProven;
  if (
    repairedVerificationSucceeded &&
    canProveLiveProvider(input) &&
    (input.repair?.evidenceSource ?? input.evidenceSource) === "live-provider" &&
    claims.notProvenClaims.length === 0
  ) {
    return terminalClaim({
      input,
      status: "verified-success-with-repair",
      resultStatus: "task-loop-complete-with-repair",
      liveSuccess: true,
      reason: "Original verification failure was preserved; repair was confirmed, applied through an existing exact lane, and re-verified with live provider evidence.",
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (
    repairedVerificationSucceeded &&
    onlyNotLiveRepairBlockers(claims.notProvenClaims)
  ) {
    return terminalClaim({
      input,
      status: "verification-succeeded-with-repair-not-live",
      resultStatus: "verification-succeeded-with-repair",
      liveSuccess: false,
      reason: "Repair readback succeeded, but provider or repair provenance is not live-provider evidence.",
      blocker: firstBlocker(claims.notProvenClaims),
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (claims.verification.status === "failed") {
    if (claims.repair.status === "repair-confirmation-required") {
      return terminalClaim({
        input,
        status: "repair-confirmation-required",
        resultStatus: "repair-confirmation-required",
        liveSuccess: false,
        reason: "Verification failed and exact-ready repair proposal requires separate trusted confirmation.",
        blocker: firstBlocker(claims.notProvenClaims),
        receiptFields: terminalReceiptFields(input, claims),
      });
    }
    if (claims.repair.status === "repair-proposed") {
      return terminalClaim({
        input,
        status: "repair-proposed",
        resultStatus: "repair-proposed",
        liveSuccess: false,
        reason: "Verification failed and a repair proposal exists, but it has not proven the full repair chain.",
        blocker: firstBlocker(claims.notProvenClaims),
        receiptFields: terminalReceiptFields(input, claims),
      });
    }
    if (claims.repair.status === "repair-applied") {
      return terminalClaim({
        input,
        status: "repair-applied",
        resultStatus: "repair-applied",
        liveSuccess: false,
        reason: "Repair apply succeeded, but re-verification has not succeeded.",
        blocker: firstBlocker(claims.notProvenClaims),
        receiptFields: terminalReceiptFields(input, claims),
      });
    }
    if (claims.repair.status === "repair-invalid" || claims.repair.status === "repair-failed") {
      return terminalClaim({
        input,
        status: "review-required",
        resultStatus: "review-required",
        liveSuccess: false,
        reason: "Repair proof chain is invalid or failed.",
        blocker: firstBlocker(claims.notProvenClaims),
        receiptFields: terminalReceiptFields(input, claims),
      });
    }
    return terminalClaim({
      input,
      status: "repair-eligible",
      resultStatus: "repair-eligible",
      liveSuccess: false,
      reason: "Verification failed; recovery evidence may support a future repair proposal but does not prove success.",
      blocker: "verification-failed",
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (claims.provider.status === "failed" || (input.liveOptIn && claims.provider.status === "not-proven")) {
    return terminalClaim({
      input,
      status: "provider-unavailable",
      resultStatus: "provider-unavailable",
      liveSuccess: false,
      reason: "Provider proof is unavailable.",
      blocker: firstBlocker(claims.notProvenClaims),
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (claims.authority.status === "blocked" && claims.anchor.status === "proven") {
    return terminalClaim({
      input,
      status: "confirmation-required",
      resultStatus: "confirmation-required",
      liveSuccess: false,
      reason: "Exact-ready proposal needs explicit trusted confirmation before mutation.",
      blocker: "confirmation-required",
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (claims.provider.status === "not-required" && input.evidenceSource === "default-safe") {
    return terminalClaim({
      input,
      status: "skipped",
      resultStatus: "skipped-no-provider-opt-in",
      liveSuccess: false,
      reason: "Default no-provider/no-apply path was safely skipped.",
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (
    input.verificationStatus === "succeeded" &&
    input.applyStatus === "succeeded" &&
    allNonProviderRequiredProven &&
    onlyNotLiveProviderBlockers(claims.notProvenClaims) &&
    input.evidenceSource !== "live-provider"
  ) {
    return terminalClaim({
      input,
      status: "verification-succeeded-not-live",
      resultStatus: "verification-succeeded",
      liveSuccess: false,
      reason: "Readback succeeded, but the ledger source is not live-provider evidence.",
      blocker: firstBlocker(claims.notProvenClaims),
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (
    (input.evidenceSource === "live-provider" && !canProveLiveProvider(input)) ||
    claims.proposal.status === "failed" ||
    claims.proposal.status === "not-proven" ||
    claims.anchor.status === "failed" ||
    claims.anchor.status === "not-proven" ||
    claims.authority.status === "invalid" ||
    claims.mutation.status === "failed" ||
    claims.recovery.status === "failed"
  ) {
    return terminalClaim({
      input,
      status: "review-required",
      resultStatus: "review-required",
      liveSuccess: false,
      reason: "Required proposal, anchor, authority, mutation, or recovery claims are incomplete.",
      blocker: firstBlocker(claims.notProvenClaims),
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (input.applyStatus === "stopped" || input.applyStatus === "failed") {
    return terminalClaim({
      input,
      status: "apply-stopped",
      resultStatus: "apply-stopped",
      liveSuccess: false,
      reason: "Apply did not complete as a proven controlled mutation.",
      blocker: firstBlocker(claims.notProvenClaims),
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  if (input.applyStatus === "succeeded") {
    return terminalClaim({
      input,
      status: "apply-succeeded",
      resultStatus: "apply-succeeded",
      liveSuccess: false,
      reason: "Apply succeeded, but verification or live-success claims are incomplete.",
      blocker: firstBlocker(claims.notProvenClaims),
      receiptFields: terminalReceiptFields(input, claims),
    });
  }
  return terminalClaim({
    input,
    status: "not-proven",
    resultStatus: "review-required",
    liveSuccess: false,
    reason: "Required success claims are incomplete.",
    blocker: firstBlocker(claims.notProvenClaims),
    receiptFields: terminalReceiptFields(input, claims),
  });
}

function terminalClaim(input: {
  readonly input: {
    readonly evidenceSource: ClaimLedgerEvidenceSource;
  };
  readonly status: ClaimLedgerTerminalStatus;
  readonly resultStatus: ClaimLedgerResultStatus;
  readonly liveSuccess: boolean;
  readonly reason: string;
  readonly blocker?: string;
  readonly receiptFields: Readonly<Record<string, string | boolean | number>>;
}): ClaimLedgerTerminalClaim {
  return {
    status: input.status,
    evidenceType: "ledger-derived",
    source: input.input.evidenceSource,
    scope: input.liveSuccess ? "live-provider-controlled-mutation" : providerScope(input.input.evidenceSource),
    reason: input.reason,
    ...(input.blocker ? { blocker: input.blocker } : {}),
    resultStatus: input.resultStatus,
    liveSuccess: input.liveSuccess,
    receiptFields: input.receiptFields,
  };
}

function perFileClaimBlocker(fileClaim: ClaimLedgerPerFileClaim, repairSucceeded: boolean): string | undefined {
  if (fileClaim.proposalStatus !== "proven") return `file-proposal-${fileClaim.targetPath}`;
  if (fileClaim.anchorQuality !== "exact-ready") return `file-anchor-${fileClaim.targetPath}`;
  if (fileClaim.authorityStatus !== "proven") return `file-authority-${fileClaim.targetPath}`;
  if (fileClaim.fileStatus === "unattempted") return `file-unattempted-${fileClaim.targetPath}`;
  if (fileClaim.applyStatus !== "succeeded") return `file-apply-${fileClaim.targetPath}`;
  if (!fileClaim.applyRuntimeDerived) return `file-apply-not-runtime-derived-${fileClaim.targetPath}`;
  if (fileClaim.verificationStatus === "not-run") return `file-unverified-${fileClaim.targetPath}`;
  if (!fileClaim.readbackRuntimeDerived) return `file-readback-not-runtime-derived-${fileClaim.targetPath}`;
  if (fileClaim.verificationEvidenceCount <= 0) return `file-verification-missing-evidence-${fileClaim.targetPath}`;
  if (fileClaim.verificationStatus === "succeeded") return undefined;
  if (fileClaim.repairStatus === "repair-verification-succeeded" && repairSucceeded) return undefined;
  return `file-failed-${fileClaim.targetPath}`;
}

function summarizePerFileClaims(claims: readonly ClaimLedgerPerFileClaim[]): string {
  if (claims.length === 0) return "none";
  return claims.map((claimItem) => [
    claimItem.targetPath,
    claimItem.fileStatus,
    `apply=${claimItem.applyStatus}`,
    `verify=${claimItem.verificationStatus}`,
    claimItem.repairStatus ? `repair=${claimItem.repairStatus}` : undefined,
  ].filter(Boolean).join("/")).join(",");
}

function projectPerFileClaimEvidence(claims: readonly ClaimLedgerPerFileClaim[]): readonly string[] {
  return claims.flatMap((claimItem) => [
    `claim-ledger:file:${claimItem.targetPath}:status:${claimItem.fileStatus}`,
    `claim-ledger:file:${claimItem.targetPath}:proposal:${claimItem.proposalStatus}`,
    `claim-ledger:file:${claimItem.targetPath}:anchor:${claimItem.anchorQuality}`,
    `claim-ledger:file:${claimItem.targetPath}:authority:${claimItem.authorityStatus}`,
    `claim-ledger:file:${claimItem.targetPath}:apply:${claimItem.applyStatus}`,
    `claim-ledger:file:${claimItem.targetPath}:apply-runtime-derived:${claimItem.applyRuntimeDerived}`,
    `claim-ledger:file:${claimItem.targetPath}:verification:${claimItem.verificationStatus}`,
    `claim-ledger:file:${claimItem.targetPath}:readback-runtime-derived:${claimItem.readbackRuntimeDerived}`,
    `claim-ledger:file:${claimItem.targetPath}:verification-evidence-count:${claimItem.verificationEvidenceCount}`,
    `claim-ledger:file:${claimItem.targetPath}:snapshot:${claimItem.snapshotStatus}`,
    `claim-ledger:file:${claimItem.targetPath}:recovery:${claimItem.recoveryStatus}`,
    ...(claimItem.repairStatus ? [`claim-ledger:file:${claimItem.targetPath}:repair:${claimItem.repairStatus}`] : []),
    ...claimItem.evidence,
  ]);
}

function claim(input: {
  readonly group: ClaimLedgerClaimGroup;
  readonly status: ClaimLedgerClaimStatus;
  readonly source: ClaimLedgerEvidenceSource;
  readonly scope: string;
  readonly reason: string;
  readonly blocker?: string;
  readonly receiptFields: Readonly<Record<string, string | boolean | number>>;
}): ClaimLedgerClaim {
  return {
    group: input.group,
    status: input.status,
    evidenceType: "runtime-derived",
    source: input.source,
    scope: input.scope,
    reason: input.reason,
    ...(input.blocker ? { blocker: input.blocker } : {}),
    receiptFields: input.receiptFields,
  };
}

function repairClaim(input: {
  readonly status: ClaimLedgerRepairStatus;
  readonly source: ClaimLedgerEvidenceSource;
  readonly scope: string;
  readonly reason: string;
  readonly blocker?: string;
  readonly receiptFields: Readonly<Record<string, string | boolean | number>>;
}): ClaimLedgerRepairClaim {
  return {
    group: "repair",
    status: input.status,
    evidenceType: "runtime-derived",
    source: input.source,
    scope: input.scope,
    reason: input.reason,
    ...(input.blocker ? { blocker: input.blocker } : {}),
    receiptFields: input.receiptFields,
  };
}

function terminalReceiptFields(
  input: {
    readonly evidenceSource: ClaimLedgerEvidenceSource;
    readonly scorecardStatus?: string;
  },
  claims: Record<Exclude<ClaimLedgerClaimGroup, "repair">, ClaimLedgerClaim> & {
    readonly repair: ClaimLedgerRepairClaim;
    readonly notProvenClaims: readonly ClaimLedgerNotProvenClaim[];
  },
): Readonly<Record<string, string | boolean | number>> {
  return {
    evidenceSource: input.evidenceSource,
    provider: claims.provider.status,
    proposal: claims.proposal.status,
    anchor: claims.anchor.status,
    authority: claims.authority.status,
    mutation: claims.mutation.status,
    verification: claims.verification.status,
    recovery: claims.recovery.status,
    repair: claims.repair.status,
    scorecard: input.scorecardStatus ?? "unknown",
    notProvenClaims: claims.notProvenClaims.length,
  };
}

function firstBlocker(
  claims: readonly ClaimLedgerNotProvenClaim[],
): string | undefined {
  return claims[0]?.blocker;
}

function isValidExactOutput(status: string): boolean {
  return status === "valid-exact-single-target" || status === "valid-exact-hunk-set";
}

function canProveLiveProvider(input: {
  readonly evidenceSource: ClaimLedgerEvidenceSource;
  readonly providerKind: string;
  readonly liveOptIn: boolean;
}): boolean {
  return input.evidenceSource === "live-provider" &&
    input.liveOptIn &&
    input.providerKind === "openai-compatible";
}

function onlyNotLiveProviderBlockers(
  claims: readonly ClaimLedgerNotProvenClaim[],
): boolean {
  return claims.length > 0 &&
    claims.every((claim) =>
      claim.blocker === "not-live-provider-evidence" ||
      claim.blocker === "provider-not-called"
    );
}

function onlyNotLiveRepairBlockers(
  claims: readonly ClaimLedgerNotProvenClaim[],
): boolean {
  return claims.length > 0 &&
    claims.every((claim) =>
      claim.blocker === "not-live-provider-evidence" ||
      claim.blocker === "not-live-repair-evidence"
    );
}

function isBlockingRepairStatus(status: ClaimLedgerRepairStatus): boolean {
  return status !== "not-required" && status !== "repair-verification-succeeded";
}

function providerScope(source: ClaimLedgerEvidenceSource): string {
  switch (source) {
    case "live-provider":
      return "live-provider";
    case "fake-ready":
      return "fake-ready-controlled";
    case "fake-provider":
      return "fake-provider-controlled";
    case "focused-tests":
      return "focused-test-evidence";
    case "default-safe":
      return "no-provider-no-apply";
    default:
      return "unknown";
  }
}

function buildLedgerId(input: object): string {
  return `claim_ledger_${hashContent(JSON.stringify(input)).slice(0, 12)}`;
}

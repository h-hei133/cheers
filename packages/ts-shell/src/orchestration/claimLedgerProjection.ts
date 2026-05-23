import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";

export type ClaimLedgerEvidenceSource =
  | "default-safe"
  | "fake-provider"
  | "fake-ready"
  | "live-provider"
  | "focused-tests"
  | "unknown";

export type ClaimLedgerClaimGroup =
  | "provider"
  | "proposal"
  | "anchor"
  | "authority"
  | "mutation"
  | "verification"
  | "recovery";

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
  | "verification-succeeded-not-live"
  | "confirmation-required"
  | "review-required"
  | "repair-eligible"
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
  | "verification-failed"
  | "repair-eligible"
  | "task-loop-complete"
  | "task-loop-stopped";

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

export interface ClaimLedgerNotProvenClaim {
  readonly group: ClaimLedgerClaimGroup | "terminal";
  readonly reason: string;
  readonly blocker: string;
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
  readonly mutationScope: "none" | "controlled-temp-workspace";
  readonly providerCallDuringApply: boolean;
  readonly scorecardStatus?: string;
}): ClaimLedgerProjection {
  const provider = projectProviderClaim(input);
  const proposal = projectProposalClaim(input);
  const anchor = projectAnchorClaim(input);
  const authority = projectAuthorityClaim(input, proposal, anchor);
  const mutation = projectMutationClaim(input);
  const verification = projectVerificationClaim(input);
  const recovery = projectRecoveryClaim(input);
  const notProvenClaims = collectNotProvenClaims(input, {
    provider,
    proposal,
    anchor,
    authority,
    mutation,
    verification,
    recovery,
  });
  const terminal = projectTerminalClaim(input, {
    provider,
    proposal,
    anchor,
    authority,
    mutation,
    verification,
    recovery,
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
      `claim-ledger:verification:${verification.status}`,
      `claim-ledger:recovery:${recovery.status}`,
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
    return claim({
      group: "proposal",
      status: "proven",
      source: input.evidenceSource,
      scope: "single-target-exact-proposal",
      reason: "Provider output validation proved one exact bounded target.",
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
        scope: "confirmed-exact-target",
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
  readonly mutationScope: "none" | "controlled-temp-workspace";
  readonly providerCallDuringApply: boolean;
  readonly evidenceSource: ClaimLedgerEvidenceSource;
}): ClaimLedgerClaim {
  if (
    input.applyStatus === "succeeded" &&
    input.mutationScope === "controlled-temp-workspace" &&
    !input.providerCallDuringApply
  ) {
    return claim({
      group: "mutation",
      status: "proven",
      source: input.evidenceSource,
      scope: input.mutationScope,
      reason: "Existing exact apply lane changed the controlled temp workspace without provider calls.",
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

function collectNotProvenClaims(
  input: {
    readonly evidenceSource: ClaimLedgerEvidenceSource;
    readonly providerKind: string;
    readonly liveOptIn: boolean;
    readonly verificationStatus: "not-run" | "succeeded" | "failed";
  },
  claims: Record<ClaimLedgerClaimGroup, ClaimLedgerClaim>,
): readonly ClaimLedgerNotProvenClaim[] {
  const notProven: ClaimLedgerNotProvenClaim[] = [];
  for (const claimItem of Object.values(claims)) {
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
  if (
    input.verificationStatus === "succeeded" &&
    !canProveLiveProvider(input)
  ) {
    notProven.push({
      group: "provider",
      reason: "Provider provenance does not prove a live openai-compatible provider success claim.",
      blocker: "not-live-provider-evidence",
    });
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
  },
  claims: Record<ClaimLedgerClaimGroup, ClaimLedgerClaim> & {
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
  if (claims.verification.status === "failed") {
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
    allRequiredProven &&
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

function terminalReceiptFields(
  input: {
    readonly evidenceSource: ClaimLedgerEvidenceSource;
    readonly scorecardStatus?: string;
  },
  claims: Record<ClaimLedgerClaimGroup, ClaimLedgerClaim> & {
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
    claims.every((claim) => claim.blocker === "not-live-provider-evidence");
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

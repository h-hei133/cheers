import {
  buildProviderEditProposalManifest,
  type ProviderEditConfirmationStatus,
  type ProviderEditProposalManifest,
} from "./providerEditProposal.js";

export type ProviderEditConfirmationDecision =
  | {
      readonly state: Exclude<
        ProviderEditConfirmationStatus,
        "confirmed-exact-single-target" | "confirmed-exact-target-set"
      >;
      readonly canHandoffToExactLane: false;
      readonly handoffLane: "none";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly state: "confirmed-exact-single-target";
      readonly canHandoffToExactLane: true;
      readonly handoffLane: "existing-fenced-replacement";
      readonly manifest: ProviderEditProposalManifest;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly state: "confirmed-exact-target-set";
      readonly canHandoffToExactLane: true;
      readonly handoffLane: "existing-target-set-edit";
      readonly manifest: ProviderEditProposalManifest;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export function decideProviderEditConfirmation(input: {
  readonly manifest: ProviderEditProposalManifest;
  readonly confirmProposalOnly?: boolean;
  readonly confirmExactSingleTarget?: boolean;
  readonly confirmExactTargetSet?: boolean;
}): ProviderEditConfirmationDecision {
  const evidence = [
    `provider-edit-confirmation:proposal:${input.manifest.proposalId}`,
    `provider-edit-confirmation:manifest-readiness:${input.manifest.handoffReadiness}`,
  ];
  if (input.confirmProposalOnly) {
    return stopped({
      state: "confirmed-proposal-no-mutation",
      reason:
        "Provider proposal review was confirmed, but review confirmation is not write authorization.",
      nextAction:
        "Confirm exact target and old/new mapping before any existing edit lane can run.",
      evidence: [...evidence, "provider-edit-confirmation:proposal-only-confirmed"],
    });
  }
  if (input.confirmExactSingleTarget) {
    if (input.manifest.exactReadiness !== "exact-single-target") {
      return stopped({
        state: "provider-output-not-executable",
        reason: "Provider proposal is not an exact single-target mapping.",
        nextAction: "Request or provide exact old/new mapping for one target.",
        evidence: [...evidence, "provider-edit-confirmation:not-single-target-exact"],
      });
    }
    const manifest = withConfirmation(input.manifest, "confirmed-exact-single-target");
    return {
      state: "confirmed-exact-single-target",
      canHandoffToExactLane: true,
      handoffLane: "existing-fenced-replacement",
      manifest,
      reason:
        "Provider proposal was explicitly confirmed as one exact target mapping.",
      nextAction:
        "Hand off through the existing exact fenced replacement route; that route owns authority, stale-read, snapshot, and verification.",
      evidence: [
        ...evidence,
        ...manifest.evidence,
        "provider-edit-confirmation:confirmed-exact-single-target",
        "provider-edit-confirmation:handoff-ready:exact-fenced-replacement",
        "provider-edit-confirmation:mutation-authority:execution-route-only",
        "provider-edit-confirmation:raw-content-excluded",
      ],
    };
  }
  if (input.confirmExactTargetSet) {
    if (input.manifest.exactReadiness !== "exact-target-set") {
      return stopped({
        state: "provider-output-not-executable",
        reason: "Provider proposal is not an exact target-set mapping.",
        nextAction: "Request or provide exact old/new mapping for every target.",
        evidence: [...evidence, "provider-edit-confirmation:not-target-set-exact"],
      });
    }
    const manifest = withConfirmation(input.manifest, "confirmed-exact-target-set");
    return {
      state: "confirmed-exact-target-set",
      canHandoffToExactLane: true,
      handoffLane: "existing-target-set-edit",
      manifest,
      reason:
        "Provider proposal was explicitly confirmed as an exact target set.",
      nextAction:
        "Hand off through the existing target-set edit route; that route owns authority, stale-read, snapshot, recovery, and verification.",
      evidence: [
        ...evidence,
        ...manifest.evidence,
        "provider-edit-confirmation:confirmed-exact-target-set",
        "provider-edit-confirmation:handoff-ready:target-set-edit",
        "provider-edit-confirmation:mutation-authority:execution-route-only",
        "provider-edit-confirmation:raw-content-excluded",
      ],
    };
  }
  return stopped({
    state: "review-required",
    reason: "Provider proposal requires review and explicit exact confirmation.",
    nextAction:
      "Review the proposal; prompt wording alone does not confirm mutation or handoff.",
    evidence: [...evidence, "provider-edit-confirmation:review-required"],
  });
}

function withConfirmation(
  manifest: ProviderEditProposalManifest,
  confirmationStatus: "confirmed-exact-single-target" | "confirmed-exact-target-set",
): ProviderEditProposalManifest {
  return buildProviderEditProposalManifest({
    providerKindLabel: manifest.providerKindLabel,
    targetLabels: manifest.targets.map((target) => target.pathLabel),
    proposedOperationKind: manifest.proposedOperationKind,
    targetSummaries: manifest.targets.map((target) => target.proposedSummary),
    exactReadiness: manifest.exactReadiness,
    confidence: manifest.confidence,
    riskSummary: manifest.riskSummary,
    verificationPlan: manifest.verificationPlan,
    confirmationStatus,
  });
}

function stopped(input: {
  readonly state: Exclude<
    ProviderEditConfirmationStatus,
    "confirmed-exact-single-target" | "confirmed-exact-target-set"
  >;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): ProviderEditConfirmationDecision {
  return {
    state: input.state,
    canHandoffToExactLane: false,
    handoffLane: "none",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      "provider-edit-confirmation:no-mutation",
      "provider-edit-confirmation:no-handoff",
      "provider-edit-confirmation:raw-content-excluded",
    ],
  };
}

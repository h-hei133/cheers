import {
  buildDiscoveryEditManifest,
} from "./discoveryEditManifest.js";
import {
  runFencedEditReplacementRoute,
  type FencedEditReplacementRoute,
  type FencedEditReplacementRouteOptions,
} from "./fencedEditRoute.js";
import type {
  GeneratedEditConfirmationStatus,
  GeneratedEditProposalManifest,
} from "./generatedEditProposal.js";
import type { GeneratedEditPlan } from "./generatedEditPlanner.js";
import {
  runTargetSetEditRoute,
  type TargetSetEditRoute,
  type TargetSetEditRouteOptions,
} from "./targetSetEditRoute.js";

export type GeneratedEditConfirmationDecision =
  | {
      readonly state: Exclude<
        GeneratedEditConfirmationStatus,
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
      readonly targetPath: string;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly state: "confirmed-exact-target-set";
      readonly canHandoffToExactLane: true;
      readonly handoffLane: "existing-target-set-edit";
      readonly confirmedTargetSet: readonly string[];
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export type GeneratedEditHandoffResult =
  | {
      readonly status: "single-target-handoff";
      readonly proposalId: string;
      readonly route: FencedEditReplacementRoute;
      readonly changedFiles: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "target-set-handoff";
      readonly proposalId: string;
      readonly route: TargetSetEditRoute;
      readonly changedFiles: readonly string[];
      readonly evidence: readonly string[];
    }
  | {
      readonly status: "stopped-no-write";
      readonly proposalId: string;
      readonly changedFiles: readonly [];
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export function decideGeneratedEditConfirmation(input: {
  readonly manifest: GeneratedEditProposalManifest;
  readonly exactMappingReady: boolean;
  readonly confirmationTargetPath?: string;
  readonly confirmedTargetSet?: readonly string[];
  readonly confirmProposalOnly?: boolean;
}): GeneratedEditConfirmationDecision {
  const evidence = [
    `generated-edit-confirmation:proposal:${input.manifest.proposalId}`,
    `generated-edit-confirmation:manifest-readiness:${input.manifest.mutationReadiness}`,
  ];
  if (input.confirmProposalOnly) {
    return stopped({
      state: "confirmed-proposal-no-mutation",
      reason:
        "Generated proposal review was confirmed, but confirmation did not grant mutation.",
      nextAction:
        "Confirm exact target and old/new mapping before any existing edit lane can run.",
      evidence: [
        ...evidence,
        "generated-edit-confirmation:proposal-only-confirmed",
      ],
    });
  }
  if (!input.exactMappingReady) {
    return stopped({
      state: "review-required",
      reason: "Generated proposal does not yet have exact old/new mapping.",
      nextAction:
        "Review and convert the proposal into explicit old/new mapping before handoff.",
      evidence: [
        ...evidence,
        "generated-edit-confirmation:exact-mapping-required",
      ],
    });
  }
  if (input.confirmedTargetSet && input.confirmedTargetSet.length > 1) {
    return {
      state: "confirmed-exact-target-set",
      canHandoffToExactLane: true,
      handoffLane: "existing-target-set-edit",
      confirmedTargetSet: input.confirmedTargetSet,
      reason:
        "Generated proposal was explicitly confirmed as an exact target set.",
      nextAction:
        "Hand off through the existing target-set exact fenced replacement route.",
      evidence: [
        ...evidence,
        "generated-edit-confirmation:confirmed-exact-target-set",
        "generated-edit-confirmation:handoff-ready:target-set-edit",
        "generated-edit-confirmation:mutation-authority:execution-route-only",
        "generated-edit-confirmation:raw-content-excluded",
      ],
    };
  }
  if (input.confirmationTargetPath) {
    return {
      state: "confirmed-exact-single-target",
      canHandoffToExactLane: true,
      handoffLane: "existing-fenced-replacement",
      targetPath: input.confirmationTargetPath,
      reason:
        "Generated proposal was explicitly confirmed as one exact target mapping.",
      nextAction:
        "Hand off through the existing exact fenced replacement route.",
      evidence: [
        ...evidence,
        "generated-edit-confirmation:confirmed-exact-single-target",
        "generated-edit-confirmation:handoff-ready:exact-fenced-replacement",
        "generated-edit-confirmation:mutation-authority:execution-route-only",
        "generated-edit-confirmation:raw-content-excluded",
      ],
    };
  }
  return stopped({
    state: "not-confirmed",
    reason: "Generated proposal has no explicit target confirmation.",
    nextAction:
      "Confirm one exact target path or confirmed target set before handoff.",
    evidence: [...evidence, "generated-edit-confirmation:not-confirmed"],
  });
}

export async function runGeneratedEditHandoff(input: {
  readonly plan: Extract<GeneratedEditPlan, { status: "ready-for-exact-handoff" }>;
  readonly fencedOptions: Omit<FencedEditReplacementRouteOptions, "targetPath" | "mapping">;
  readonly targetSetOptions?: Omit<
    TargetSetEditRouteOptions,
    "manifest" | "confirmedTargetSet" | "mapping"
  >;
}): Promise<GeneratedEditHandoffResult> {
  if (input.plan.handoffLane === "existing-fenced-replacement") {
    if (!input.plan.targetPath) {
      return stoppedHandoff({
        proposalId: input.plan.manifest.proposalId,
        reason: "Confirmed generated proposal is missing a single target path.",
        nextAction: "Confirm one exact target path before handoff.",
        evidence: input.plan.evidence,
      });
    }
    const route = await runFencedEditReplacementRoute({
      ...input.fencedOptions,
      targetPath: input.plan.targetPath,
      mapping: input.plan.mapping,
    });
    return {
      status: "single-target-handoff",
      proposalId: input.plan.manifest.proposalId,
      route,
      changedFiles: route.changedFiles,
      evidence: [
        ...input.plan.evidence,
        ...route.evidence,
        "generated-edit-handoff:existing-fenced-route",
        "generated-edit-handoff:authority-stale-read-snapshot-verification-owned-by-existing-route",
        "generated-edit-handoff:raw-content-excluded",
      ],
    };
  }

  if (!input.plan.confirmedTargetSet || input.plan.confirmedTargetSet.length < 2) {
    return stoppedHandoff({
      proposalId: input.plan.manifest.proposalId,
      reason: "Confirmed generated target-set proposal is missing target set.",
      nextAction: "Confirm every target before target-set handoff.",
      evidence: input.plan.evidence,
    });
  }
  if (!input.targetSetOptions) {
    return stoppedHandoff({
      proposalId: input.plan.manifest.proposalId,
      reason: "Target-set handoff options were not provided.",
      nextAction:
        "Provide existing target-set route options; do not execute a generated proposal directly.",
      evidence: input.plan.evidence,
    });
  }
  const manifest = buildDiscoveryEditManifest({
    workspaceRoot: input.targetSetOptions.workspaceRoot,
    candidates: input.plan.confirmedTargetSet.map((target) => ({
      path: target,
      matchCount: 1,
      evidenceSummary: "generated proposal exact mapping confirmed",
      confidence: "high",
    })),
    maxCandidates: input.plan.confirmedTargetSet.length,
    requiredConfirmationStatus: "confirmed-target-set",
    evidence: [
      `generated-edit-handoff:source-proposal:${input.plan.manifest.proposalId}`,
      "generated-edit-handoff:target-set-manifest-bridge",
      "generated-edit-handoff:raw-content-excluded",
    ],
  });
  const route = await runTargetSetEditRoute({
    ...input.targetSetOptions,
    manifest,
    confirmedTargetSet: input.plan.confirmedTargetSet,
    mapping: input.plan.mapping,
  });
  return {
    status: "target-set-handoff",
    proposalId: input.plan.manifest.proposalId,
    route,
    changedFiles: route.changedFiles,
    evidence: [
      ...input.plan.evidence,
      ...route.evidence,
      "generated-edit-handoff:existing-target-set-route",
      "generated-edit-handoff:authority-stale-read-snapshot-recovery-verification-owned-by-existing-route",
      "generated-edit-handoff:raw-content-excluded",
    ],
  };
}

function stopped(input: {
  readonly state: Exclude<
    GeneratedEditConfirmationStatus,
    "confirmed-exact-single-target" | "confirmed-exact-target-set"
  >;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): GeneratedEditConfirmationDecision {
  return {
    state: input.state,
    canHandoffToExactLane: false,
    handoffLane: "none",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      "generated-edit-confirmation:no-handoff",
      "generated-edit-confirmation:mutation:not-run",
      "generated-edit-confirmation:raw-content-excluded",
    ],
  };
}

function stoppedHandoff(input: {
  readonly proposalId: string;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): GeneratedEditHandoffResult {
  return {
    status: "stopped-no-write",
    proposalId: input.proposalId,
    changedFiles: [],
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      "generated-edit-handoff:stopped-no-write",
      "generated-edit-handoff:mutation:not-run",
      "generated-edit-handoff:raw-content-excluded",
    ],
  };
}

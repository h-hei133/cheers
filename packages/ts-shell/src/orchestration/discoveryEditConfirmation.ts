import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type {
  DiscoveryEditCandidate,
  DiscoveryEditConfirmationRequirement,
  DiscoveryEditManifest,
} from "./discoveryEditManifest.js";

export type DiscoveryEditConfirmationState =
  | "not-required-explicit-target"
  | "required-target-selection"
  | "confirmed-single-target"
  | "confirmed-target-set-no-mutation"
  | "ambiguous-confirmation"
  | "invalid-confirmation";

export type DiscoveryEditConfirmationDecision =
  | {
      readonly state: Exclude<
        DiscoveryEditConfirmationState,
        "confirmed-single-target"
      >;
      readonly selectedCandidate?: DiscoveryEditCandidate;
      readonly canHandoffToExactFencedReplacement: false;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly state: "confirmed-single-target";
      readonly selectedCandidate: DiscoveryEditCandidate;
      readonly canHandoffToExactFencedReplacement: true;
      readonly targetPath: string;
      readonly mapping: FencedEditMapping;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export function decideDiscoveryEditConfirmation(input: {
  readonly manifest: DiscoveryEditManifest;
  readonly mapping?: FencedEditMapping;
  readonly confirmationTargetPath?: string;
  readonly confirmedTargetSet?: readonly string[];
}): DiscoveryEditConfirmationDecision {
  const evidence = [
    `discovery-edit-confirmation:state:${input.manifest.requiredConfirmationStatus}`,
  ];

  if (input.confirmedTargetSet && input.confirmedTargetSet.length > 1) {
    return stopped({
      state: "confirmed-target-set-no-mutation",
      reason: "Discovery edit target-set confirmation is no-write in this route.",
      nextAction:
        "Choose exactly one candidate target for the exact fenced replacement lane.",
      evidence: [
        ...evidence,
        "discovery-edit-confirmation:multi-target-no-mutation",
      ],
    });
  }

  if (!input.confirmationTargetPath) {
    return stopped({
      state: "required-target-selection",
      reason: "Discovery edit found candidates but no exact target was confirmed.",
      nextAction:
        "Confirm exactly one candidate path before any mutation can be considered.",
      evidence: [
        ...evidence,
        "discovery-edit-confirmation:target-selection-required",
      ],
    });
  }

  const matches = input.manifest.candidates.filter(
    (candidate) => normalize(candidate.path) === normalize(input.confirmationTargetPath),
  );
  if (matches.length === 0) {
    return stopped({
      state: "invalid-confirmation",
      reason: "The confirmed target is not present in the discovery manifest.",
      nextAction:
        "Confirm one of the listed candidate paths from the current manifest.",
      evidence: [
        ...evidence,
        "discovery-edit-confirmation:invalid-target",
      ],
    });
  }
  if (matches.length > 1) {
    return stopped({
      state: "ambiguous-confirmation",
      reason: "The confirmed target matched more than one candidate.",
      nextAction:
        "Confirm a single candidate id or an unambiguous in-workspace path.",
      evidence: [
        ...evidence,
        "discovery-edit-confirmation:ambiguous-target",
      ],
    });
  }
  const selectedCandidate = matches[0]!;
  if (!input.mapping) {
    return stopped({
      state: "invalid-confirmation",
      selectedCandidate,
      reason:
        "Confirmed discovery target cannot hand off without an exact old/new mapping.",
      nextAction:
        "Provide exact old and new fenced blocks for the selected candidate.",
      evidence: [
        ...evidence,
        "discovery-edit-confirmation:missing-exact-mapping",
      ],
    });
  }
  return {
    state: "confirmed-single-target",
    selectedCandidate,
    canHandoffToExactFencedReplacement: true,
    targetPath: selectedCandidate.path,
    mapping: input.mapping,
    reason:
      "Exactly one discovery candidate was confirmed and reduces to exact fenced replacement.",
    nextAction:
      "Hand off to the existing exact fenced replacement route with workspace authority and stale-read checks.",
    evidence: [
      ...evidence,
      "discovery-edit-confirmation:confirmed-single-target",
      "discovery-edit-confirmation:handoff-ready:exact-fenced-replacement",
      "discovery-edit-confirmation:mutation-authority:not-granted",
      "discovery-edit-confirmation:raw-content-excluded",
    ],
  };
}

export function confirmationStatusFromDecision(
  decision: DiscoveryEditConfirmationDecision,
): DiscoveryEditConfirmationRequirement {
  return decision.state;
}

function stopped(input: {
  readonly state: Exclude<
    DiscoveryEditConfirmationState,
    "confirmed-single-target"
  >;
  readonly selectedCandidate?: DiscoveryEditCandidate;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): DiscoveryEditConfirmationDecision {
  return {
    state: input.state,
    ...(input.selectedCandidate
      ? { selectedCandidate: input.selectedCandidate }
      : {}),
    canHandoffToExactFencedReplacement: false,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      "discovery-edit-confirmation:no-handoff",
      "discovery-edit-confirmation:mutation:not-run",
    ],
  };
}

function normalize(value: string): string {
  return value.replace(/\\/g, "/").toLowerCase();
}

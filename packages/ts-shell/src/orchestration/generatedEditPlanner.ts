import {
  buildGeneratedEditProposalManifest,
  type GeneratedEditProposalManifest,
} from "./generatedEditProposal.js";
import {
  parseExactFencedReplacementMapping,
  type FencedEditMapping,
} from "./fencedEditPlanner.js";

export type GeneratedEditPlanStatus =
  | "missing-generated-content"
  | "proposal-created-no-write"
  | "exact-single-target-proposal"
  | "exact-target-set-proposal"
  | "broad-generated-request"
  | "fuzzy-generated-request"
  | "generated-discovery-request"
  | "unsupported-provider-generated-request"
  | "confirmation-required"
  | "ready-for-exact-handoff";

export type GeneratedEditHandoffLane =
  | "none"
  | "existing-fenced-replacement"
  | "existing-target-set-edit";

export type GeneratedEditPlan =
  | {
      readonly status: "ready-for-exact-handoff";
      readonly manifest: GeneratedEditProposalManifest;
      readonly mapping: FencedEditMapping;
      readonly targetPath?: string;
      readonly confirmedTargetSet?: readonly string[];
      readonly handoffLane: Exclude<GeneratedEditHandoffLane, "none">;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: Exclude<GeneratedEditPlanStatus, "ready-for-exact-handoff">;
      readonly manifest: GeneratedEditProposalManifest;
      readonly mapping?: FencedEditMapping;
      readonly handoffLane: "none";
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export function planGeneratedEdit(input: {
  readonly prompt: string;
  readonly targetPath?: string;
  readonly candidateTargets?: readonly string[];
  readonly confirmationTargetPath?: string;
  readonly confirmedTargetSet?: readonly string[];
  readonly providerGeneratedContent?: boolean;
}): GeneratedEditPlan {
  const prompt = input.prompt.trim();
  const targets =
    input.confirmedTargetSet ??
    input.candidateTargets ??
    (input.targetPath ? [input.targetPath] : []);
  const mappingResult = parseExactFencedReplacementMapping({ prompt });
  const unsupported = classifyUnsupportedGeneratedEditPrompt({
    prompt,
    providerGeneratedContent: input.providerGeneratedContent === true,
  });

  if (unsupported) {
    return noWritePlan({
      status: unsupported.status,
      targets,
      requestedOperationKind: unsupported.operationKind,
      proposedContentStatus: unsupported.proposedContentStatus,
      exactMappingStatus: "not-exact",
      reason: unsupported.reason,
      nextAction: unsupported.nextAction,
      evidence: unsupported.evidence,
    });
  }

  if (mappingResult.ok === false) {
    return noWritePlan({
      status: missingContentStatus(prompt),
      targets,
      requestedOperationKind: "generated-replacement",
      proposedContentStatus: "missing-generated-content",
      exactMappingStatus:
        mappingResult.blocker === "missing-mapping"
          ? "missing-new-content"
          : "not-exact",
      reason:
        "Generated edit proposal is no-write until exact old and new content are explicit.",
      nextAction:
        "Review the proposal, then provide exact old/new fenced blocks and explicit target confirmation before handoff.",
      evidence: [
        ...mappingResult.evidence,
        "generated-edit-planner:missing-explicit-content",
      ],
    });
  }

  const confirmedSingleTarget =
    input.confirmationTargetPath ?? input.targetPath;
  if (input.confirmedTargetSet && input.confirmedTargetSet.length > 1) {
    return readyPlan({
      targets: input.confirmedTargetSet,
      exactMappingStatus: "exact-target-set",
      confirmationStatus: "confirmed-exact-target-set",
      mapping: mappingResult.mapping,
      confirmedTargetSet: input.confirmedTargetSet,
      handoffLane: "existing-target-set-edit",
      reason:
        "Generated proposal was reviewed and every target has exact old/new mapping.",
      nextAction:
        "Hand off to the existing target-set exact fenced replacement route.",
      evidence: [
        ...mappingResult.evidence,
        "generated-edit-planner:confirmed-exact-target-set",
        "generated-edit-planner:ready-for-existing-target-set-route",
      ],
    });
  }

  if (confirmedSingleTarget) {
    return readyPlan({
      targets: [confirmedSingleTarget],
      exactMappingStatus: "exact-single-target",
      confirmationStatus: "confirmed-exact-single-target",
      mapping: mappingResult.mapping,
      targetPath: confirmedSingleTarget,
      handoffLane: "existing-fenced-replacement",
      reason:
        "Generated proposal was reviewed and reduced to one exact old/new mapping.",
      nextAction:
        "Hand off to the existing exact fenced replacement route.",
      evidence: [
        ...mappingResult.evidence,
        "generated-edit-planner:confirmed-exact-single-target",
        "generated-edit-planner:ready-for-existing-fenced-route",
      ],
    });
  }

  return noWritePlan({
    status: targets.length > 1 ? "exact-target-set-proposal" : "exact-single-target-proposal",
    targets,
    requestedOperationKind: "exact-fenced-replacement",
    proposedContentStatus: "explicit-new-content",
    exactMappingStatus: targets.length > 1 ? "exact-target-set" : "exact-single-target",
    reason:
      "Generated proposal has exact mapping but still requires explicit target confirmation.",
    nextAction:
      "Confirm the exact target path or target set before any handoff can execute.",
    evidence: [
      ...mappingResult.evidence,
      "generated-edit-planner:confirmation-required",
    ],
  });
}

function readyPlan(input: {
  readonly targets: readonly string[];
  readonly exactMappingStatus: "exact-single-target" | "exact-target-set";
  readonly confirmationStatus:
    | "confirmed-exact-single-target"
    | "confirmed-exact-target-set";
  readonly mapping: FencedEditMapping;
  readonly targetPath?: string;
  readonly confirmedTargetSet?: readonly string[];
  readonly handoffLane: Exclude<GeneratedEditHandoffLane, "none">;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): GeneratedEditPlan {
  const manifest = buildGeneratedEditProposalManifest({
    targets: input.targets,
    requestedOperationKind: "exact-fenced-replacement",
    proposedContentStatus: "explicit-new-content",
    exactMappingStatus: input.exactMappingStatus,
    confirmationStatus: input.confirmationStatus,
    mutationReadiness: "ready-for-exact-handoff",
    evidence: input.evidence,
  });
  return {
    status: "ready-for-exact-handoff",
    manifest,
    mapping: input.mapping,
    ...(input.targetPath ? { targetPath: input.targetPath } : {}),
    ...(input.confirmedTargetSet
      ? { confirmedTargetSet: input.confirmedTargetSet }
      : {}),
    handoffLane: input.handoffLane,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...manifest.evidence,
      ...input.evidence,
      "generated-edit-planner:mutation-authority:execution-route-only",
      "generated-edit-planner:raw-content-excluded",
    ],
  };
}

function noWritePlan(input: {
  readonly status: Exclude<GeneratedEditPlanStatus, "ready-for-exact-handoff">;
  readonly targets: readonly string[];
  readonly requestedOperationKind:
    | "exact-fenced-replacement"
    | "generated-replacement"
    | "broad-refactor"
    | "fuzzy-replacement"
    | "discovery";
  readonly proposedContentStatus:
    | "missing-generated-content"
    | "safe-summary-only"
    | "explicit-new-content"
    | "provider-generated-unsupported";
  readonly exactMappingStatus:
    | "missing-old-block"
    | "missing-new-content"
    | "exact-single-target"
    | "exact-target-set"
    | "not-exact";
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): GeneratedEditPlan {
  const manifest = buildGeneratedEditProposalManifest({
    targets: input.targets,
    requestedOperationKind: input.requestedOperationKind,
    proposedContentStatus: input.proposedContentStatus,
    exactMappingStatus: input.exactMappingStatus,
    confirmationStatus:
      input.status === "proposal-created-no-write" ||
      input.status === "exact-single-target-proposal" ||
      input.status === "exact-target-set-proposal"
        ? "review-required"
        : "not-confirmed",
    evidence: input.evidence,
  });
  return {
    status: input.status,
    manifest,
    handoffLane: "none",
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...manifest.evidence,
      ...input.evidence,
      `generated-edit-planner:status:${input.status}`,
      "generated-edit-planner:mutation:not-run",
      "generated-edit-planner:no-provider-call",
      "generated-edit-planner:raw-content-excluded",
    ],
  };
}

function classifyUnsupportedGeneratedEditPrompt(input: {
  readonly prompt: string;
  readonly providerGeneratedContent: boolean;
}):
  | {
      readonly status: Extract<
        GeneratedEditPlanStatus,
        | "broad-generated-request"
        | "fuzzy-generated-request"
        | "generated-discovery-request"
        | "unsupported-provider-generated-request"
      >;
      readonly operationKind:
        | "broad-refactor"
        | "fuzzy-replacement"
        | "discovery"
        | "generated-replacement";
      readonly proposedContentStatus:
        | "safe-summary-only"
        | "provider-generated-unsupported";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | undefined {
  if (input.providerGeneratedContent) {
    return {
      status: "unsupported-provider-generated-request",
      operationKind: "generated-replacement",
      proposedContentStatus: "provider-generated-unsupported",
      reason: "Provider-generated edit content is not accepted as mutation authority.",
      nextAction:
        "Convert the reviewed proposal into explicit old/new mapping before handoff.",
      evidence: ["generated-edit-planner:provider-generated-unsupported"],
    };
  }
  if (/\b(?:similar|approximately|roughly|fuzzy|closest|nearest)\b/i.test(input.prompt)) {
    return {
      status: "fuzzy-generated-request",
      operationKind: "fuzzy-replacement",
      proposedContentStatus: "safe-summary-only",
      reason: "Fuzzy generated replacement is outside the exact edit lane.",
      nextAction: "Provide exact old and new fenced blocks for each target.",
      evidence: ["generated-edit-planner:fuzzy-generated-stopped"],
    };
  }
  if (/\b(?:find|discover|search|choose)\b[\s\S]{0,80}\b(?:file|target|place|location)\b/i.test(input.prompt)) {
    return {
      status: "generated-discovery-request",
      operationKind: "discovery",
      proposedContentStatus: "safe-summary-only",
      reason: "Generated discovery requests remain no-write proposals.",
      nextAction:
        "Review the candidate manifest, then confirm exact targets and mappings before handoff.",
      evidence: ["generated-edit-planner:generated-discovery-no-write"],
    };
  }
  if (/\b(?:refactor|broad|all|every|each|across the repo|workspace)\b/i.test(input.prompt)) {
    return {
      status: "broad-generated-request",
      operationKind: "broad-refactor",
      proposedContentStatus: "safe-summary-only",
      reason: "Broad generated edits are not executable in this route.",
      nextAction:
        "Narrow the request to exact old/new mapping and explicit confirmed targets.",
      evidence: ["generated-edit-planner:broad-generated-stopped"],
    };
  }
  return undefined;
}

function missingContentStatus(prompt: string): Extract<
  GeneratedEditPlanStatus,
  "missing-generated-content" | "proposal-created-no-write"
> {
  return /\b(?:generate|generated|rewrite|implement|create)\b/i.test(prompt)
    ? "proposal-created-no-write"
    : "missing-generated-content";
}

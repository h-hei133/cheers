import {
  buildDiscoveryEditManifest,
  type DiscoveryEditManifest,
} from "./discoveryEditManifest.js";
import {
  decideDiscoveryEditConfirmation,
  type DiscoveryEditConfirmationDecision,
} from "./discoveryEditConfirmation.js";
import {
  parseExactFencedReplacementMapping,
  type FencedEditMapping,
} from "./fencedEditPlanner.js";

export type DiscoveryEditPlanStatus =
  | "manifest-produced"
  | "confirmation-required"
  | "ready-for-handoff"
  | "stopped";

export type DiscoveryEditPlanBlocker =
  | "no-candidates"
  | "too-many-candidates"
  | "ambiguous-candidates"
  | "missing-mapping"
  | "confirmation-required"
  | "invalid-confirmation"
  | "multi-target-mutation-unsupported"
  | "unsupported-fuzzy-discovery"
  | "unsupported-generated-discovery"
  | "unsupported-broad-refactor";

export interface DiscoveryEditCandidateInput {
  readonly path: string;
  readonly content?: string;
}

export type DiscoveryEditPlan =
  | {
      readonly status: "ready-for-handoff";
      readonly manifest: DiscoveryEditManifest;
      readonly mapping: FencedEditMapping;
      readonly confirmation: Extract<
        DiscoveryEditConfirmationDecision,
        { state: "confirmed-single-target" }
      >;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly blocker?: never;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: Exclude<DiscoveryEditPlanStatus, "ready-for-handoff">;
      readonly manifest: DiscoveryEditManifest;
      readonly confirmation: DiscoveryEditConfirmationDecision;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly blocker: DiscoveryEditPlanBlocker;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export function planDiscoveryEdit(input: {
  readonly prompt: string;
  readonly workspaceRoot?: string;
  readonly candidates: readonly DiscoveryEditCandidateInput[];
  readonly maxCandidates?: number;
  readonly confirmationTargetPath?: string;
  readonly confirmedTargetSet?: readonly string[];
}): DiscoveryEditPlan {
  const maxCandidates = input.maxCandidates ?? 5;
  const unsupported = classifyUnsupportedDiscoveryPrompt(input.prompt);
  const mappingResult = parseExactFencedReplacementMapping({ prompt: input.prompt });
  const candidateMatches =
    mappingResult.ok === true
      ? input.candidates
          .map((candidate) => ({
            path: candidate.path,
            matchCount: countExactBlockMatches(
              candidate.content ?? "",
              mappingResult.mapping.oldText,
            ),
          }))
          .filter((candidate) => candidate.matchCount > 0)
      : [];
  const initialConfirmationStatus = input.confirmedTargetSet
    ? "confirmed-target-set-no-mutation"
    : input.confirmationTargetPath
      ? "confirmed-single-target"
      : "required-target-selection";
  const manifest = buildDiscoveryEditManifest({
    workspaceRoot: input.workspaceRoot,
    candidates: candidateMatches,
    maxCandidates,
    requiredConfirmationStatus: unsupported
      ? "required-target-selection"
      : initialConfirmationStatus,
    evidence: [
      "discovery-edit-planner:bounded-candidate-search",
      `discovery-edit-planner:max-candidates:${maxCandidates}`,
    ],
  });

  if (unsupported) {
    return stoppedPlan({
      status: "stopped",
      manifest,
      blocker: unsupported.blocker,
      reason: unsupported.reason,
      nextAction: unsupported.nextAction,
      evidence: unsupported.evidence,
    });
  }

  if (mappingResult.ok === false) {
    return stoppedPlan({
      status: "stopped",
      manifest,
      blocker:
        mappingResult.blocker === "unsupported-fuzzy"
          ? "unsupported-fuzzy-discovery"
          : "missing-mapping",
      reason: mappingResult.reason,
      nextAction: mappingResult.nextAction,
      evidence: mappingResult.evidence,
    });
  }

  if (manifest.maxCandidateGuardStatus === "over-limit") {
    return stoppedPlan({
      status: "stopped",
      manifest,
      blocker: "too-many-candidates",
      reason: "Discovery edit found more candidates than the bounded guard allows.",
      nextAction:
        "Narrow the search or confirm one exact target path before retrying.",
      evidence: ["discovery-edit-planner:too-many-candidates"],
    });
  }

  if (manifest.candidates.length === 0) {
    return stoppedPlan({
      status: "stopped",
      manifest,
      blocker: "no-candidates",
      reason: "Discovery edit found no candidate containing the exact old block.",
      nextAction:
        "Re-read the workspace or provide one explicit target file with the current exact block.",
      evidence: ["discovery-edit-planner:no-candidates"],
    });
  }

  const confirmation = decideDiscoveryEditConfirmation({
    manifest,
    mapping: mappingResult.mapping,
    ...(input.confirmationTargetPath
      ? { confirmationTargetPath: input.confirmationTargetPath }
      : {}),
    ...(input.confirmedTargetSet
      ? { confirmedTargetSet: input.confirmedTargetSet }
      : {}),
  });

  if (confirmation.canHandoffToExactFencedReplacement) {
    return {
      status: "ready-for-handoff",
      manifest,
      mapping: mappingResult.mapping,
      confirmation,
      changedFiles: [],
      mutationAuthority: "not-granted",
      mutation: "not-run",
      reason: confirmation.reason,
      nextAction: confirmation.nextAction,
      evidence: [
        ...manifest.evidence,
        ...confirmation.evidence,
        "discovery-edit-planner:ready-for-existing-fenced-route",
      ],
    };
  }

  const blocker =
    confirmation.state === "confirmed-target-set-no-mutation"
      ? "multi-target-mutation-unsupported"
      : confirmation.state === "invalid-confirmation" ||
          confirmation.state === "ambiguous-confirmation"
        ? "invalid-confirmation"
        : manifest.candidates.length > 1
          ? "ambiguous-candidates"
          : "confirmation-required";

  return {
    status: "confirmation-required",
    manifest,
    confirmation,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    blocker,
    reason: confirmation.reason,
    nextAction: confirmation.nextAction,
    evidence: [
      ...manifest.evidence,
      ...confirmation.evidence,
      `discovery-edit-planner:blocker:${blocker}`,
    ],
  };
}

function classifyUnsupportedDiscoveryPrompt(prompt: string):
  | {
      readonly blocker: Extract<
        DiscoveryEditPlanBlocker,
        | "unsupported-fuzzy-discovery"
        | "unsupported-generated-discovery"
        | "unsupported-broad-refactor"
      >;
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | undefined {
  if (/\b(?:similar|approximately|roughly|fuzzy|closest|nearest)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-fuzzy-discovery",
      reason: "Fuzzy discovery replacement is not supported.",
      nextAction:
        "Provide exact old and new fenced blocks and confirm one exact target.",
      evidence: ["discovery-edit-planner:unsupported-fuzzy"],
    };
  }
  if (/\b(?:generate|generated|rewrite|implement)\b[\s\S]{0,100}\b(?:content|implementation|block|replacement)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-generated-discovery",
      reason: "Generated discovery edit content is not supported.",
      nextAction:
        "Provide the exact replacement text explicitly before discovery handoff.",
      evidence: ["discovery-edit-planner:unsupported-generated"],
    };
  }
  if (/\b(?:refactor|broad|all|every|each)\b[\s\S]{0,100}\b(?:repo|repository|workspace|file|files|matches|blocks)\b/i.test(prompt)) {
    return {
      blocker: "unsupported-broad-refactor",
      reason: "Broad or multi-target discovery mutation is not supported.",
      nextAction:
        "Confirm exactly one candidate target for the exact fenced replacement route.",
      evidence: ["discovery-edit-planner:unsupported-broad"],
    };
  }
  return undefined;
}

function stoppedPlan(input: {
  readonly status: Exclude<DiscoveryEditPlanStatus, "ready-for-handoff">;
  readonly manifest: DiscoveryEditManifest;
  readonly blocker: DiscoveryEditPlanBlocker;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): DiscoveryEditPlan {
  return {
    status: input.status,
    manifest: input.manifest,
    confirmation: {
      state: stoppedConfirmationState(input.manifest.requiredConfirmationStatus),
      canHandoffToExactFencedReplacement: false,
      reason: input.reason,
      nextAction: input.nextAction,
      evidence: [
        `discovery-edit-confirmation:state:${input.manifest.requiredConfirmationStatus}`,
        "discovery-edit-confirmation:no-handoff",
        "discovery-edit-confirmation:mutation:not-run",
      ],
    },
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    blocker: input.blocker,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.manifest.evidence,
      ...input.evidence,
      `discovery-edit-planner:blocker:${input.blocker}`,
      "discovery-edit-planner:mutation:not-run",
      "discovery-edit-planner:raw-content-excluded",
    ],
  };
}

function stoppedConfirmationState(
  state: DiscoveryEditManifest["requiredConfirmationStatus"],
): Exclude<
  DiscoveryEditManifest["requiredConfirmationStatus"],
  "confirmed-single-target"
> {
  return state === "confirmed-single-target" ? "invalid-confirmation" : state;
}

function countExactBlockMatches(content: string, block: string): number {
  const haystack = splitLines(content);
  const needle = splitLines(block);
  if (needle.length === 0 || needle.length > haystack.length) {
    return 0;
  }
  let count = 0;
  for (let index = 0; index <= haystack.length - needle.length; index += 1) {
    let matched = true;
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (haystack[index + offset] !== needle[offset]) {
        matched = false;
        break;
      }
    }
    if (matched) {
      count += 1;
    }
  }
  return count;
}

function splitLines(value: string): readonly string[] {
  const lines = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

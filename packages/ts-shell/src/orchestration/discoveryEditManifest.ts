import crypto from "node:crypto";
import path from "node:path";
import { safeTargetLabel } from "./workspaceFileContract.js";

export type DiscoveryEditOperationKind = "exact-fenced-replacement";
export type DiscoveryEditConfidence = "high" | "medium" | "low";
export type DiscoveryEditAmbiguityStatus =
  | "no-candidates"
  | "single-candidate"
  | "multiple-candidates"
  | "too-many-candidates";
export type DiscoveryEditMaxCandidateGuardStatus = "within-limit" | "over-limit";
export type DiscoveryEditConfirmationRequirement =
  | "not-required-explicit-target"
  | "required-target-selection"
  | "confirmed-single-target"
  | "confirmed-target-set-no-mutation"
  | "ambiguous-confirmation"
  | "invalid-confirmation";

export interface DiscoveryEditCandidate {
  readonly candidateId: string;
  readonly path: string;
  readonly pathLabel: string;
  readonly evidenceSummary: string;
  readonly confidence: DiscoveryEditConfidence;
  readonly matchCount: number;
  readonly plannedOperationKind: DiscoveryEditOperationKind;
}

export interface DiscoveryEditManifest {
  readonly manifestId: string;
  readonly requestedMode: "discovery-edit";
  readonly requestedOperationKind: DiscoveryEditOperationKind;
  readonly workspaceRootLabel: string;
  readonly candidates: readonly DiscoveryEditCandidate[];
  readonly ambiguityStatus: DiscoveryEditAmbiguityStatus;
  readonly maxCandidateGuardStatus: DiscoveryEditMaxCandidateGuardStatus;
  readonly requiredConfirmationStatus: DiscoveryEditConfirmationRequirement;
  readonly mutationAuthority: "not-granted";
  readonly snapshotRequirement: "required-before-write";
  readonly verificationRequirement: "required-before-write";
  readonly redactionStatus: "raw-content-excluded";
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export function buildDiscoveryEditManifest(input: {
  readonly workspaceRoot?: string;
  readonly requestedOperationKind?: DiscoveryEditOperationKind;
  readonly candidates: readonly {
    readonly path: string;
    readonly matchCount: number;
    readonly evidenceSummary?: string;
    readonly confidence?: DiscoveryEditConfidence;
  }[];
  readonly maxCandidates: number;
  readonly requiredConfirmationStatus: DiscoveryEditConfirmationRequirement;
  readonly evidence?: readonly string[];
}): DiscoveryEditManifest {
  const requestedOperationKind =
    input.requestedOperationKind ?? "exact-fenced-replacement";
  const candidates = input.candidates.map((candidate, index) => {
    const pathLabel = safeTargetLabel(candidate.path);
    return {
      candidateId: `candidate-${index + 1}`,
      path: candidate.path,
      pathLabel,
      evidenceSummary:
        candidate.evidenceSummary ??
        `exact old block match-count:${candidate.matchCount}`,
      confidence: candidate.confidence ?? confidenceForMatchCount(candidate.matchCount),
      matchCount: candidate.matchCount,
      plannedOperationKind: requestedOperationKind,
    };
  });
  const overLimit = candidates.length > input.maxCandidates;
  const boundedCandidates = overLimit
    ? candidates.slice(0, input.maxCandidates)
    : candidates;
  const ambiguityStatus = overLimit
    ? "too-many-candidates"
    : boundedCandidates.length === 0
      ? "no-candidates"
      : boundedCandidates.length === 1
        ? "single-candidate"
        : "multiple-candidates";
  const workspaceRootLabel = safeWorkspaceRootLabel(input.workspaceRoot);
  const manifestId = buildManifestId({
    workspaceRootLabel,
    requestedOperationKind,
    candidates: boundedCandidates.map((candidate) => candidate.pathLabel),
    confirmation: input.requiredConfirmationStatus,
  });
  const evidence = [
    "discovery-edit-manifest:created",
    "discovery-edit-manifest:mutation-authority:not-granted",
    `discovery-edit-manifest:ambiguity:${ambiguityStatus}`,
    `discovery-edit-manifest:max-candidate-guard:${
      overLimit ? "over-limit" : "within-limit"
    }`,
    `discovery-edit-manifest:confirmation:${input.requiredConfirmationStatus}`,
    "discovery-edit-manifest:raw-content-excluded",
    ...(input.evidence ?? []),
  ];

  return {
    manifestId,
    requestedMode: "discovery-edit",
    requestedOperationKind,
    workspaceRootLabel,
    candidates: boundedCandidates,
    ambiguityStatus,
    maxCandidateGuardStatus: overLimit ? "over-limit" : "within-limit",
    requiredConfirmationStatus: input.requiredConfirmationStatus,
    mutationAuthority: "not-granted",
    snapshotRequirement: "required-before-write",
    verificationRequirement: "required-before-write",
    redactionStatus: "raw-content-excluded",
    evidence,
    transcriptSummary: buildTranscriptSummary({
      manifestId,
      candidates: boundedCandidates,
      confirmation: input.requiredConfirmationStatus,
      ambiguityStatus,
    }),
  };
}

function confidenceForMatchCount(matchCount: number): DiscoveryEditConfidence {
  if (matchCount === 1) {
    return "high";
  }
  if (matchCount > 1) {
    return "medium";
  }
  return "low";
}

function safeWorkspaceRootLabel(workspaceRoot: string | undefined): string {
  if (!workspaceRoot) {
    return "(workspace)";
  }
  return safeTargetLabel(path.basename(path.resolve(workspaceRoot)) || "workspace");
}

function buildManifestId(input: {
  readonly workspaceRootLabel: string;
  readonly requestedOperationKind: string;
  readonly candidates: readonly string[];
  readonly confirmation: string;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `discovery-edit-${hash}`;
}

function buildTranscriptSummary(input: {
  readonly manifestId: string;
  readonly candidates: readonly DiscoveryEditCandidate[];
  readonly confirmation: DiscoveryEditConfirmationRequirement;
  readonly ambiguityStatus: DiscoveryEditAmbiguityStatus;
}): string {
  const candidateSummary =
    input.candidates.length > 0
      ? input.candidates.map((candidate) => candidate.pathLabel).join(", ")
      : "(none)";
  return [
    `discovery-edit manifest=${input.manifestId}`,
    `candidates=${candidateSummary}`,
    `ambiguity=${input.ambiguityStatus}`,
    `confirmation=${input.confirmation}`,
    "mutation:not-run",
    "mutationAuthority:not-granted",
    "raw-content-excluded",
  ].join("; ");
}

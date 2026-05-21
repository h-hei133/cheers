import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { EditProposalSelection } from "./editProposalSelection.js";
import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";

export type ProposalHunkSetSource = EditProposalSelection["source"];

export interface ProposalHunkSetHunk {
  readonly hunkId: string;
  readonly targetLabel: string;
  readonly targetPath: string;
  readonly operationSummary: string;
  readonly exactMappingStatus: "exact" | "missing" | "non-exact";
  readonly targetBinding: "single-target";
  readonly unsupportedReason?: string;
  readonly redactionStatus: "raw-content-excluded";
}

export interface ProposalHunkSetManifest {
  readonly hunkSetId: string;
  readonly sourceProposalId: string;
  readonly source: ProposalHunkSetSource;
  readonly selectedTargetPaths: readonly string[];
  readonly selectedHunks: readonly ProposalHunkSetHunk[];
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "raw-content-excluded";
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export function buildProposalHunkSetManifest(input: {
  readonly selection: EditProposalSelection;
  readonly mappingByHunkId?: ReadonlyMap<string, FencedEditMapping>;
  readonly targetPathByLabel?: ReadonlyMap<string, string>;
}): ProposalHunkSetManifest {
  const selectedHunks = input.selection.selectedHunks.map((hunk) => {
    const targetPath = input.targetPathByLabel?.get(hunk.targetLabel) ?? hunk.targetLabel;
    const exactMappingStatus: ProposalHunkSetHunk["exactMappingStatus"] = hunk.exactMappingReady
      ? input.mappingByHunkId?.has(hunk.hunkId)
        ? "exact"
        : "missing"
      : "non-exact";
    return {
      hunkId: hunk.hunkId,
      targetLabel: hunk.targetLabel,
      targetPath,
      operationSummary: hunk.operationSummary,
      exactMappingStatus,
      targetBinding: "single-target" as const,
      ...(hunk.unsupportedReason
        ? { unsupportedReason: hunk.unsupportedReason }
        : exactMappingStatus === "missing"
          ? { unsupportedReason: "missing exact old/new mapping payload" }
          : {}),
      redactionStatus: "raw-content-excluded" as const,
    };
  });
  const selectedTargetPaths = Array.from(
    new Set(selectedHunks.map((hunk) => hunk.targetPath)),
  );
  const hunkSetId = buildProposalHunkSetId({
    proposalId: input.selection.proposalId,
    source: input.selection.source,
    hunkIds: selectedHunks.map((hunk) => hunk.hunkId),
    targetPaths: selectedTargetPaths,
  });
  const transcriptSummary = [
    `proposal-hunk-set proposal=${input.selection.proposalId}`,
    `hunkSet=${hunkSetId}`,
    `source=${input.selection.source}`,
    `targets=${selectedTargetPaths.join(", ") || "(none)"}`,
    `hunks=${selectedHunks.map((hunk) => hunk.hunkId).join(", ") || "(none)"}`,
    "mutationAuthority:not-granted",
    "raw-content-excluded",
  ].join("; ");
  return {
    hunkSetId,
    sourceProposalId: input.selection.proposalId,
    source: input.selection.source,
    selectedTargetPaths,
    selectedHunks,
    mutationAuthority: "not-granted",
    redactionStatus: "raw-content-excluded",
    evidence: [
      `proposal-hunk-set:proposal:${input.selection.proposalId}`,
      `proposal-hunk-set:id:${hunkSetId}`,
      `proposal-hunk-set:source:${input.selection.source}`,
      `proposal-hunk-set:target-count:${selectedTargetPaths.length}`,
      `proposal-hunk-set:hunk-count:${selectedHunks.length}`,
      "proposal-hunk-set:mutation-authority:not-granted",
      "proposal-hunk-set:raw-content-excluded",
    ],
    transcriptSummary,
  };
}

function buildProposalHunkSetId(input: {
  readonly proposalId: string;
  readonly source: ProposalHunkSetSource;
  readonly hunkIds: readonly string[];
  readonly targetPaths: readonly string[];
}): string {
  const digest = hashContent(JSON.stringify(input)).slice(0, 12);
  return `proposal-hunk-set-${digest}`;
}

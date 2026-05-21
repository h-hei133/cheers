import {
  buildDiscoveryEditManifest,
} from "./discoveryEditManifest.js";
import {
  runFencedEditReplacementRoute,
  type FencedEditReplacementRoute,
  type FencedEditReplacementRouteOptions,
} from "./fencedEditRoute.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { EditProposalSelection } from "./editProposalSelection.js";
import {
  runTargetSetEditRoute,
  type TargetSetEditRoute,
  type TargetSetEditRouteOptions,
} from "./targetSetEditRoute.js";
import { buildProposalHunkSetManifest } from "./proposalHunkSet.js";
import {
  runProposalHunkSetRoute,
  type ProposalHunkSetRoute,
} from "./proposalHunkSetRoute.js";

export type EditProposalApplyResult =
  | {
      readonly status: "single-target-applied" | "single-target-stopped";
      readonly proposalId: string;
      readonly source: EditProposalSelection["source"];
      readonly route: FencedEditReplacementRoute;
      readonly changedFiles: readonly string[];
      readonly evidence: readonly string[];
      readonly transcriptSummary: string;
    }
  | {
      readonly status:
        | "target-set-applied"
        | "target-set-partial-failure"
        | "target-set-stopped";
      readonly proposalId: string;
      readonly source: EditProposalSelection["source"];
      readonly route: TargetSetEditRoute;
      readonly changedFiles: readonly string[];
      readonly evidence: readonly string[];
      readonly transcriptSummary: string;
    }
  | {
      readonly status:
        | "hunk-set-applied"
        | "hunk-set-partial-failure"
        | "hunk-set-preflight-stopped"
        | "hunk-set-failed";
      readonly proposalId: string;
      readonly source: EditProposalSelection["source"];
      readonly route: ProposalHunkSetRoute;
      readonly changedFiles: readonly string[];
      readonly evidence: readonly string[];
      readonly transcriptSummary: string;
    }
  | {
      readonly status:
        | "unconfirmed-no-write"
        | "unsupported-for-apply"
        | "invalid-selection";
      readonly proposalId?: string;
      readonly source?: EditProposalSelection["source"];
      readonly changedFiles: readonly [];
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
      readonly transcriptSummary: string;
    };

export async function applyEditProposalSelection(input: {
  readonly selection: EditProposalSelection;
  readonly mappingByHunkId?: ReadonlyMap<string, FencedEditMapping>;
  readonly targetPathByLabel?: ReadonlyMap<string, string>;
  readonly fencedOptions: Omit<FencedEditReplacementRouteOptions, "targetPath" | "mapping">;
  readonly targetSetOptions?: Omit<
    TargetSetEditRouteOptions,
    "manifest" | "confirmedTargetSet" | "mapping"
  >;
}): Promise<EditProposalApplyResult> {
  if (
    input.selection.state !== "confirmed-exact-single-target" &&
    input.selection.state !== "confirmed-exact-target-set"
  ) {
    return stoppedApply({
      status:
        input.selection.state === "unsupported-for-apply"
          ? "unsupported-for-apply"
          : input.selection.state === "invalid-selection"
            ? "invalid-selection"
            : "unconfirmed-no-write",
      proposalId: input.selection.proposalId,
      source: input.selection.source,
      reason: input.selection.reason,
      nextAction: input.selection.nextAction,
      evidence: input.selection.evidence,
    });
  }

  const mappings = input.selection.selectedHunks.map((hunk) =>
    input.mappingByHunkId?.get(hunk.hunkId),
  );
  if (mappings.some((mapping) => !mapping)) {
    return stoppedApply({
      status: "unsupported-for-apply",
      proposalId: input.selection.proposalId,
      source: input.selection.source,
      reason: "Selected proposal hunks are missing exact old/new mapping payloads.",
      nextAction: "Provide exact mapping payloads for every selected hunk.",
      evidence: input.selection.evidence,
    });
  }
  const mapping = mappings[0]!;
  if (
    mappings.some(
      (candidate) =>
        candidate!.oldText !== mapping.oldText ||
        candidate!.newText !== mapping.newText,
    )
  ) {
    const manifest = buildProposalHunkSetManifest({
      selection: input.selection,
      mappingByHunkId: input.mappingByHunkId,
      targetPathByLabel: input.targetPathByLabel,
    });
    const route = await runProposalHunkSetRoute({
      ...input.fencedOptions,
      manifest,
      mappingByHunkId: input.mappingByHunkId ?? new Map(),
      confirmed: input.selection.state === "confirmed-exact-target-set",
    });
    const status = hunkSetApplyStatus(route.status);
    return {
      status,
      proposalId: input.selection.proposalId,
      source: input.selection.source,
      route,
      changedFiles: route.changedFiles,
      evidence: [
        ...input.selection.evidence,
        ...route.evidence,
        `edit-proposal-apply:status:${status}`,
        "edit-proposal-apply:hunk-set-route",
        "edit-proposal-apply:per-target-distinct-mapping",
        "edit-proposal-apply:transaction-route",
        "edit-proposal-apply:no-provider-call",
        "edit-proposal-apply:raw-content-excluded",
      ],
      transcriptSummary: buildHunkSetApplySummary(route),
    };
  }

  const targetPaths = input.selection.selectedTargetLabels.map(
    (label) => input.targetPathByLabel?.get(label) ?? label,
  );
  if (input.selection.state === "confirmed-exact-single-target") {
    const route = await runFencedEditReplacementRoute({
      ...input.fencedOptions,
      targetPath: targetPaths[0],
      mapping,
    });
    const status =
      route.status === "written" ? "single-target-applied" : "single-target-stopped";
    return {
      status,
      proposalId: input.selection.proposalId,
      source: input.selection.source,
      route,
      changedFiles: route.changedFiles,
      evidence: [
        ...input.selection.evidence,
        ...route.evidence,
        `edit-proposal-apply:status:${status}`,
        "edit-proposal-apply:existing-fenced-route",
        "edit-proposal-apply:no-provider-call",
        "edit-proposal-apply:raw-content-excluded",
      ],
      transcriptSummary: buildApplySummary({
        proposalId: input.selection.proposalId,
        status,
        targets: targetPaths,
        changedFiles: route.changedFiles,
      }),
    };
  }

  if (!input.targetSetOptions) {
    return stoppedApply({
      status: "invalid-selection",
      proposalId: input.selection.proposalId,
      source: input.selection.source,
      reason: "Target-set apply requires existing target-set route options.",
      nextAction: "Provide target-set route options; do not use a proposal writer.",
      evidence: input.selection.evidence,
    });
  }
  const manifest = buildDiscoveryEditManifest({
    workspaceRoot: input.targetSetOptions.workspaceRoot,
    candidates: targetPaths.map((target) => ({
      path: target,
      matchCount: 1,
      evidenceSummary: "proposal review exact mapping confirmed",
      confidence: "high",
    })),
    maxCandidates: targetPaths.length,
    requiredConfirmationStatus: "confirmed-target-set",
    evidence: [
      `edit-proposal-apply:source-proposal:${input.selection.proposalId}`,
      "edit-proposal-apply:target-set-manifest-bridge",
      "edit-proposal-apply:raw-content-excluded",
    ],
  });
  const route = await runTargetSetEditRoute({
    ...input.targetSetOptions,
    manifest,
    confirmedTargetSet: targetPaths,
    mapping,
  });
  const status =
    route.status === "written"
      ? "target-set-applied"
      : route.status === "partial-failure"
        ? "target-set-partial-failure"
        : "target-set-stopped";
  return {
    status,
    proposalId: input.selection.proposalId,
    source: input.selection.source,
    route,
    changedFiles: route.changedFiles,
    evidence: [
      ...input.selection.evidence,
      ...route.evidence,
      `edit-proposal-apply:status:${status}`,
      "edit-proposal-apply:existing-target-set-route",
      "edit-proposal-apply:transaction-route",
      "edit-proposal-apply:no-provider-call",
      "edit-proposal-apply:raw-content-excluded",
    ],
    transcriptSummary: buildApplySummary({
      proposalId: input.selection.proposalId,
      status,
      targets: targetPaths,
      changedFiles: route.changedFiles,
    }),
  };
}

function hunkSetApplyStatus(
  status: ProposalHunkSetRoute["status"],
): Extract<
  EditProposalApplyResult["status"],
  | "hunk-set-applied"
  | "hunk-set-partial-failure"
  | "hunk-set-preflight-stopped"
  | "hunk-set-failed"
> {
  switch (status) {
    case "written":
      return "hunk-set-applied";
    case "partial-failure":
      return "hunk-set-partial-failure";
    case "preflight-stopped":
      return "hunk-set-preflight-stopped";
    case "failed":
      return "hunk-set-failed";
  }
}

function buildHunkSetApplySummary(route: ProposalHunkSetRoute): string {
  return [
    `edit-proposal-apply proposal=${route.proposalId}`,
    `hunkSet=${route.hunkSetId}`,
    `status=${hunkSetApplyStatus(route.status)}`,
    `targets=${route.manifest.selectedTargetPaths.join(", ") || "(none)"}`,
    `hunks=${route.manifest.selectedHunks.map((hunk) => hunk.hunkId).join(", ") || "(none)"}`,
    `changed=${route.changedFiles.join(", ") || "none"}`,
    `failed=${route.failedFiles.map((file) => file.path).join(", ") || "none"}`,
    `unattempted=${route.unattemptedFiles.map((file) => file.path).join(", ") || "none"}`,
    "raw-content-excluded",
  ].join("; ");
}

function stoppedApply(input: {
  readonly status:
    | "unconfirmed-no-write"
    | "unsupported-for-apply"
    | "invalid-selection";
  readonly proposalId?: string;
  readonly source?: EditProposalSelection["source"];
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): EditProposalApplyResult {
  return {
    status: input.status,
    ...(input.proposalId ? { proposalId: input.proposalId } : {}),
    ...(input.source ? { source: input.source } : {}),
    changedFiles: [],
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `edit-proposal-apply:status:${input.status}`,
      "edit-proposal-apply:mutation:not-run",
      "edit-proposal-apply:no-provider-call",
      "edit-proposal-apply:raw-content-excluded",
    ],
    transcriptSummary: buildApplySummary({
      proposalId: input.proposalId ?? "(none)",
      status: input.status,
      targets: [],
      changedFiles: [],
    }),
  };
}

function buildApplySummary(input: {
  readonly proposalId: string;
  readonly status: EditProposalApplyResult["status"];
  readonly targets: readonly string[];
  readonly changedFiles: readonly string[];
}): string {
  return [
    `edit-proposal-apply proposal=${input.proposalId}`,
    `status=${input.status}`,
    `targets=${input.targets.join(", ") || "(none)"}`,
    `changed=${input.changedFiles.join(", ") || "none"}`,
    "raw-content-excluded",
  ].join("; ");
}

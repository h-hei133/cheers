import fs from "node:fs";
import path from "node:path";

import type { PlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";

export type PlanningRuntimeProductProposalStatus =
  | "prepared-exact"
  | "live-provider-config-failed"
  | "review-only"
  | "unsupported"
  | "not-run";

export type PlanningRuntimeProductProposalSource =
  | "manual-proposal-json"
  | "planning-runtime-deterministic"
  | "planning-handoff-summary"
  | "live-provider-proposal";

export interface PlanningRuntimeProductProposalPreparation {
  readonly proposalPreparationId: string;
  readonly status: PlanningRuntimeProductProposalStatus;
  readonly source: PlanningRuntimeProductProposalSource;
  readonly rawProposal?: ProviderEditRawProposal;
  readonly providerCalled: boolean;
  readonly liveOptIn: boolean;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

const TARGET_RANKING_PATH = "src/planning/targetRanking.ts";
const TARGET_RANKING_OLD =
  "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';";
const TARGET_RANKING_NEW =
  "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';";

export function preparePlanningRuntimeProductProposal(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly rawProposal?: ProviderEditRawProposal | null;
  readonly liveProviderOptIn?: boolean;
}): PlanningRuntimeProductProposalPreparation {
  if (input.rawProposal) {
    return proposalPreparation({
      status: "prepared-exact",
      source: "manual-proposal-json",
      rawProposal: input.rawProposal,
      providerCalled: false,
      liveOptIn: false,
      reason:
        "Explicit internal proposal JSON was supplied for the compatibility/debug path.",
      nextAction:
        "Validate and anchor the supplied proposal before any review-confirm-execute handoff.",
      evidence: [
        "planning-runtime-product-proposal:manual-json:provided",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  if (input.liveProviderOptIn) {
    return proposalPreparation({
      status: "live-provider-config-failed",
      source: "live-provider-proposal",
      providerCalled: false,
      liveOptIn: true,
      reason:
        "CONFIG-FAILED: product live-provider proposal opt-in did not include an approved configured adapter.",
      nextAction:
        "Use the existing approved real-provider smoke/config seam before claiming live provider proposal generation.",
      evidence: [
        "planning-runtime-product-proposal:live-provider-opt-in:true",
        "planning-runtime-product-proposal:live-provider-status:CONFIG-FAILED",
        "planning-runtime-product-proposal:provider-called:false",
        "planning-runtime-product-proposal:raw-provider-output-excluded",
      ],
    });
  }

  if (input.handoff.handoffState !== "handoff-ready") {
    return proposalPreparation({
      status: "not-run",
      source: "planning-handoff-summary",
      providerCalled: false,
      liveOptIn: false,
      reason: "Planning handoff is not ready for product proposal preparation.",
      nextAction: input.handoff.nextAction,
      evidence: [
        "planning-runtime-product-proposal:handoff:not-ready",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  if (input.handoff.targetPaths.length !== 1) {
    return proposalPreparation({
      status: "review-only",
      source: "planning-handoff-summary",
      providerCalled: false,
      liveOptIn: false,
      reason:
        "Deterministic product proposal preparation currently supports one exact target only.",
      nextAction:
        "Keep the planning handoff review-only or obtain an explicit provider/manual exact proposal.",
      evidence: [
        `planning-runtime-product-proposal:target-count:${input.handoff.targetPaths.length}`,
        "planning-runtime-product-proposal:deterministic:unsupported-target-count",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  const targetPath = input.handoff.targetPaths[0];
  if (targetPath !== TARGET_RANKING_PATH) {
    return proposalPreparation({
      status: "review-only",
      source: "planning-handoff-summary",
      providerCalled: false,
      liveOptIn: false,
      reason:
        "Planning handoff target is reviewable, but no deterministic exact proposal pattern matched it.",
      nextAction:
        "Use the review surface to obtain an exact provider/manual proposal before applying.",
      evidence: [
        `planning-runtime-product-proposal:target:${targetPath}`,
        "planning-runtime-product-proposal:deterministic:no-pattern",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  const current = readWorkspaceFile(input.workspaceRoot, targetPath);
  if (current === undefined) {
    return proposalPreparation({
      status: "unsupported",
      source: "planning-handoff-summary",
      providerCalled: false,
      liveOptIn: false,
      reason:
        "Deterministic product proposal could not read the selected in-workspace target.",
      nextAction:
        "Restore the selected target or use an explicit proposal path with current read evidence.",
      evidence: [
        `planning-runtime-product-proposal:target:${targetPath}`,
        "planning-runtime-product-proposal:target-readable:false",
        "planning-runtime-product-proposal:provider-called:false",
      ],
    });
  }

  if (!current.includes(TARGET_RANKING_OLD)) {
    return proposalPreparation({
      status: "review-only",
      source: "planning-handoff-summary",
      providerCalled: false,
      liveOptIn: false,
      reason:
        "Selected target did not contain the deterministic oldText anchor; no exact proposal was fabricated.",
      nextAction:
        "Refresh context and obtain a new exact proposal before requesting apply.",
      evidence: [
        `planning-runtime-product-proposal:target:${targetPath}`,
        "planning-runtime-product-proposal:deterministic:old-anchor-missing",
        "planning-runtime-product-proposal:provider-called:false",
        "planning-runtime-product-proposal:raw-content-excluded",
      ],
    });
  }

  return proposalPreparation({
    status: "prepared-exact",
    source: "planning-runtime-deterministic",
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: targetPath,
          summary:
            "Trim the planner task string before checking the target-ranking keyword.",
          oldText: TARGET_RANKING_OLD,
          newText: TARGET_RANKING_NEW,
        },
      ],
      confidence: "medium",
      riskSummary:
        "Focused deterministic product proposal for the planning runtime fixture; requires review and explicit confirmation.",
      verificationPlan: [
        "readback verifies targetRanking.ts contains the trimmed planner predicate",
      ],
    },
    providerCalled: false,
    liveOptIn: false,
    reason:
      "Planning Runtime handoff produced a deterministic exact proposal from current read evidence.",
    nextAction:
      "Review and explicitly confirm the anchored exact proposal before using the existing proof backend.",
    evidence: [
      `planning-runtime-product-proposal:target:${targetPath}`,
      "planning-runtime-product-proposal:deterministic:prepared-exact",
      "planning-runtime-product-proposal:manual-json:not-required",
      "planning-runtime-product-proposal:provider-called:false",
      "planning-runtime-product-proposal:live-opt-in:false",
      "planning-runtime-product-proposal:raw-content-excluded",
    ],
  });
}

function proposalPreparation(input: Omit<
  PlanningRuntimeProductProposalPreparation,
  "proposalPreparationId"
>): PlanningRuntimeProductProposalPreparation {
  const proposalPreparationId = `planning-product-proposal-${hashContent(JSON.stringify({
    status: input.status,
    source: input.source,
    targetPaths: input.rawProposal?.targets?.map((target) => target.path) ?? [],
    reason: input.reason,
  })).slice(0, 12)}`;
  return {
    proposalPreparationId,
    ...input,
    evidence: unique([
      `planning-runtime-product-proposal:id:${proposalPreparationId}`,
      `planning-runtime-product-proposal:status:${input.status}`,
      `planning-runtime-product-proposal:source:${input.source}`,
      `planning-runtime-product-proposal:provider-called:${input.providerCalled}`,
      `planning-runtime-product-proposal:live-opt-in:${input.liveOptIn}`,
      ...input.evidence,
    ]),
  };
}

function readWorkspaceFile(
  workspaceRootInput: string,
  relativePath: string,
): string | undefined {
  const workspaceRoot = path.resolve(workspaceRootInput);
  const absolutePath = path.resolve(workspaceRoot, relativePath);
  if (!isSameOrInside(absolutePath, workspaceRoot)) {
    return undefined;
  }
  try {
    return fs.readFileSync(absolutePath, "utf8");
  } catch {
    return undefined;
  }
}

function isSameOrInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { PlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import type { PlanningRuntimeResult } from "./planningRuntime.js";

export type PlanningExactProposalStatus =
  | "prepared-exact"
  | "review-only"
  | "unsupported";

export interface PlanningExactProposalResult {
  readonly status: PlanningExactProposalStatus;
  readonly rawProposal?: ProviderEditRawProposal;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

interface PlanningExactProposalRule {
  readonly targetPath: string;
  readonly summary: string;
  readonly oldText: string;
  readonly newText: string;
  readonly verificationPlan: readonly string[];
}

const RULES: readonly PlanningExactProposalRule[] = [
  {
    targetPath: "src/planning/targetRanking.ts",
    summary:
      "Trim the planner task string before checking the target-ranking keyword.",
    oldText:
      "  return task.includes('planner') ? 'targetRanking.ts' : 'unknown';",
    newText:
      "  return task.trim().includes('planner') ? 'targetRanking.ts' : 'unknown';",
    verificationPlan: [
      "readback verifies targetRanking.ts contains the trimmed planner predicate",
    ],
  },
  {
    targetPath: "packages/ts-shell/src/orchestration/planningRuntimeProductProjection.ts",
    summary:
      "Make the product-path header describe the review-confirm-execute loop instead of always saying review-only.",
    oldText: '    "Planning runtime: product-path review-only handoff",',
    newText: '    "Planning runtime: product-path review-confirm-execute handoff",',
    verificationPlan: [
      "readback verifies the product-path output title no longer hard-codes review-only",
    ],
  },
  {
    targetPath: "packages/ts-shell/src/orchestration/realTaskLoopRepairChain.ts",
    summary:
      "Expose explicit repair-chain proof evidence that anchor, apply, verification, and repair status are reported together.",
    oldText: [
      '      "real-task-loop-repair:existing-exact-apply-lane",',
      '      ...(applyResult ? ["real-task-loop-repair:apply-route:existing-exact-lane"] : []),',
    ].join("\n"),
    newText: [
      '      "real-task-loop-repair:existing-exact-apply-lane",',
      '      "real-task-loop-repair:result-reporting:anchor-apply-verification-repair",',
      '      ...(applyResult ? ["real-task-loop-repair:apply-route:existing-exact-lane"] : []),',
    ].join("\n"),
    verificationPlan: [
      "readback verifies repair-chain evidence includes anchor/apply/verification/repair result reporting",
    ],
  },
];

export function buildPlanningExactProposal(input: {
  readonly handoff: PlanningMutationHandoffProjection;
  readonly planningResult?: PlanningRuntimeResult;
  readonly currentContentByTargetPath: ReadonlyMap<string, string>;
}): PlanningExactProposalResult {
  const targetPaths = input.handoff.targetPaths;
  if (input.handoff.handoffState !== "handoff-ready") {
    return stopped("unsupported", {
      reason: "Planning handoff is not ready for deterministic exact proposal generation.",
      nextAction: input.handoff.nextAction,
      evidence: ["planning-exact-proposal:handoff:not-ready"],
    });
  }
  if (targetPaths.length !== 1) {
    return stopped("review-only", {
      reason:
        "Deterministic exact proposal generation currently supports one exact target only.",
      nextAction:
        "Keep the planning handoff review-only or obtain an explicit provider/manual exact proposal.",
      evidence: [
        `planning-exact-proposal:target-count:${targetPaths.length}`,
        "planning-exact-proposal:unsupported-target-count",
      ],
    });
  }

  const targetPath = targetPaths[0];
  const target = input.handoff.targets.find((entry) => entry.path === targetPath);
  if (!target || target.readEvidenceIds.length === 0) {
    return stopped("review-only", {
      reason:
        "Selected target was not backed by Planning Runtime read evidence, so no exact proposal was produced.",
      nextAction: "Refresh read evidence before deterministic exact proposal generation.",
      evidence: [
        `planning-exact-proposal:target:${targetPath}`,
        "planning-exact-proposal:read-evidence:missing",
      ],
    });
  }

  const currentContent = input.currentContentByTargetPath.get(targetPath);
  if (currentContent === undefined) {
    return stopped("unsupported", {
      reason:
        "Selected in-workspace target could not be read for deterministic exact proposal generation.",
      nextAction:
        "Restore the selected target or use an explicit proposal path with current read evidence.",
      evidence: [
        `planning-exact-proposal:target:${targetPath}`,
        "planning-exact-proposal:target-readable:false",
      ],
    });
  }

  const rule = RULES.find((candidate) => candidate.targetPath === targetPath);
  if (!rule) {
    return stopped("review-only", {
      reason:
        "Planning handoff target is reviewable, but no deterministic exact proposal rule matched the read evidence.",
      nextAction:
        "Use the review surface to obtain an exact provider/manual proposal before applying.",
      evidence: [
        `planning-exact-proposal:target:${targetPath}`,
        "planning-exact-proposal:no-rule-match",
      ],
    });
  }

  const oldTextCount = countOccurrences(currentContent, rule.oldText);
  if (oldTextCount !== 1) {
    return stopped("review-only", {
      reason:
        "Selected target did not contain exactly one deterministic oldText anchor; no exact proposal was fabricated.",
      nextAction:
        "Refresh context and obtain a new exact proposal before requesting apply.",
      evidence: [
        `planning-exact-proposal:target:${targetPath}`,
        `planning-exact-proposal:old-anchor-count:${oldTextCount}`,
        "planning-exact-proposal:raw-content-excluded",
      ],
    });
  }
  if (rule.oldText === rule.newText || rule.newText.length === 0) {
    return stopped("unsupported", {
      reason:
        "Matched deterministic proposal rule did not contain a non-empty replacement.",
      nextAction: "Fix the deterministic proposal rule before using this path.",
      evidence: [
        `planning-exact-proposal:target:${targetPath}`,
        "planning-exact-proposal:replacement:invalid",
      ],
    });
  }

  const proposalId = `planning-exact-proposal-${hashContent(JSON.stringify({
    targetPath,
    oldHash: hashContent(rule.oldText),
    newHash: hashContent(rule.newText),
    readEvidenceIds: target.readEvidenceIds,
  })).slice(0, 12)}`;
  return {
    status: "prepared-exact",
    rawProposal: {
      operationKind: "exact-fenced-replacement",
      targets: [
        {
          path: targetPath,
          summary: rule.summary,
          oldText: rule.oldText,
          newText: rule.newText,
        },
      ],
      confidence: "medium",
      riskSummary:
        "Focused deterministic proposal from Planning Runtime target and current read evidence; requires review and explicit confirmation.",
      verificationPlan: rule.verificationPlan,
    },
    reason:
      "Planning Runtime target and current read evidence produced a deterministic exact proposal.",
    nextAction:
      "Review and explicitly confirm the anchored exact proposal before using the existing proof backend.",
    evidence: [
      `planning-exact-proposal:id:${proposalId}`,
      `planning-exact-proposal:target:${targetPath}`,
      `planning-exact-proposal:read-evidence-count:${target.readEvidenceIds.length}`,
      "planning-exact-proposal:source:planning-runtime-read-evidence",
      "planning-exact-proposal:prepared-exact",
      "planning-exact-proposal:old-anchor-count:1",
      "planning-exact-proposal:provider-called:false",
      "planning-exact-proposal:mutation-authority:not-granted",
      "planning-exact-proposal:raw-content-excluded",
    ],
  };
}

function stopped(
  status: Exclude<PlanningExactProposalStatus, "prepared-exact">,
  input: {
    readonly reason: string;
    readonly nextAction: string;
    readonly evidence: readonly string[];
  },
): PlanningExactProposalResult {
  return {
    status,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      "planning-exact-proposal:provider-called:false",
      "planning-exact-proposal:mutation-authority:not-granted",
    ],
  };
}

function countOccurrences(content: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let index = 0;
  while (true) {
    const found = content.indexOf(needle, index);
    if (found === -1) return count;
    count += 1;
    index = found + needle.length;
  }
}

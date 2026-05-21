import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import type { FencedEditMapping } from "./fencedEditPlanner.js";
import type { EditProposalSelection } from "./editProposalSelection.js";
import type { EditRepairContext } from "./editRepairContext.js";
import {
  normalizeEditRepairProposal,
  type EditRepairProposalManifest,
  type EditRepairRawProposal,
} from "./editRepairProposal.js";

export type EditRepairPlannerStatus =
  | "repair-context-created"
  | "repair-provider-not-configured"
  | "repair-provider-opt-in-required"
  | "repair-context-over-budget"
  | "repair-proposal-created"
  | "repair-proposal-invalid"
  | "repair-review-required"
  | "repair-ready-for-hunk-set-handoff"
  | "repair-unsupported"
  | "repair-not-needed";

export interface EditRepairFakeProvider {
  readonly proposeRepair: (
    context: EditRepairContext,
  ) => EditRepairRawProposal | Promise<EditRepairRawProposal>;
}

export type EditRepairPlan =
  | {
      readonly status:
        | "repair-proposal-created"
        | "repair-review-required"
        | "repair-ready-for-hunk-set-handoff";
      readonly context: EditRepairContext;
      readonly manifest: EditRepairProposalManifest;
      readonly mappingByHunkId: ReadonlyMap<string, FencedEditMapping>;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: Exclude<
        EditRepairPlannerStatus,
        | "repair-proposal-created"
        | "repair-review-required"
        | "repair-ready-for-hunk-set-handoff"
      >;
      readonly context?: EditRepairContext;
      readonly manifest?: EditRepairProposalManifest;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export async function planEditRepairProposal(input: {
  readonly context: EditRepairContext;
  readonly availability: ProviderEditAvailability;
  readonly provider?: EditRepairFakeProvider;
  readonly rawProposal?: EditRepairRawProposal;
  readonly maxHunks?: number;
}): Promise<EditRepairPlan> {
  if (input.context.status === "repair-not-needed") {
    return stoppedRepairPlan({
      status: "repair-not-needed",
      context: input.context,
      reason: "Verification did not fail; no repair proposal is needed.",
      nextAction: "Do not create a repair proposal for a passing verification result.",
      evidence: input.context.evidence,
    });
  }
  if (input.context.status === "repair-context-over-budget") {
    return stoppedRepairPlan({
      status: "repair-context-over-budget",
      context: input.context,
      reason: "Repair context exceeded the bounded safe-context budget.",
      nextAction: "Reduce failed files or failure excerpts before requesting repair planning.",
      evidence: input.context.evidence,
    });
  }
  if (input.context.status !== "repair-context-created") {
    return stoppedRepairPlan({
      status: "repair-unsupported",
      context: input.context,
      reason: "Repair proposal requires a failed verification or apply context.",
      nextAction: "Create repair context from a supported failed edit apply or verification result.",
      evidence: input.context.evidence,
    });
  }

  const unavailable = classifyRepairProviderAvailability(input.availability);
  if (unavailable) {
    return stoppedRepairPlan({
      ...unavailable,
      context: input.context,
      evidence: input.context.evidence,
    });
  }

  const rawProposal =
    input.rawProposal ??
    (input.provider ? await input.provider.proposeRepair(input.context) : undefined);
  if (!rawProposal) {
    return stoppedRepairPlan({
      status: "repair-provider-opt-in-required",
      context: input.context,
      reason: "Repair proposal generation requires an explicit fake/stub or opt-in provider boundary.",
      nextAction: "Use a deterministic fake provider in tests or an isolated real-provider gate.",
      evidence: input.context.evidence,
    });
  }

  const normalized = normalizeEditRepairProposal({
    context: input.context,
    rawProposal,
    maxHunks: input.maxHunks,
  });
  if (normalized.ok === false) {
    return stoppedRepairPlan({
      status: "repair-proposal-invalid",
      context: input.context,
      reason: normalized.reason,
      nextAction: "Request exact target-bound repair hunks, then review before confirmation.",
      evidence: [...input.context.evidence, ...normalized.evidence],
    });
  }
  const status =
    normalized.manifest.handoffReadiness === "review-only"
      ? "repair-proposal-created"
      : "repair-review-required";
  return {
    status,
    context: input.context,
    manifest: normalized.manifest,
    mappingByHunkId: normalized.mappingByHunkId,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason:
      status === "repair-review-required"
        ? "Repair proposal was created and requires review plus explicit confirmation before hunk-set handoff."
        : "Repair proposal was created for review only; mutation did not run.",
    nextAction:
      status === "repair-review-required"
        ? "Review the repair proposal, select exact hunks, and explicitly confirm before handoff."
        : "Review the repair proposal and request exact old/new hunks before handoff.",
    evidence: [
      ...input.context.evidence,
      ...normalized.manifest.evidence,
      `edit-repair-planner:status:${status}`,
      "edit-repair-planner:fake-provider-boundary-supported",
      "edit-repair-planner:provider-call:proposal-only",
      "edit-repair-planner:no-provider-call-during-apply",
      "edit-repair-planner:mutation:not-run",
      "edit-repair-planner:mutation-authority:not-granted",
      "edit-repair-planner:raw-content-excluded",
    ],
  };
}

export function planEditRepairHunkSetHandoff(input: {
  readonly plan: EditRepairPlan;
  readonly selection?: EditProposalSelection;
}): EditRepairPlan {
  if (
    !("manifest" in input.plan) ||
    !input.plan.manifest ||
    !("mappingByHunkId" in input.plan)
  ) {
    return input.plan;
  }
  if (
    input.selection?.source !== "repair" ||
    (input.selection.state !== "confirmed-exact-target-set" &&
      input.selection.state !== "confirmed-exact-single-target")
  ) {
    return input.plan;
  }
  return {
    ...input.plan,
    status: "repair-ready-for-hunk-set-handoff",
    reason: "Repair proposal exact hunks were explicitly confirmed; hunk-set handoff is ready but no write has run yet.",
    nextAction: "Hand off confirmed exact repair hunks to the existing proposal hunk-set apply route.",
    evidence: [
      ...input.plan.evidence,
      ...input.selection.evidence,
      "edit-repair-planner:status:repair-ready-for-hunk-set-handoff",
      "edit-repair-planner:handoff:existing-hunk-set-route",
      "edit-repair-planner:mutation:not-run",
    ],
  };
}

function classifyRepairProviderAvailability(
  availability: ProviderEditAvailability,
):
  | {
      readonly status:
        | "repair-provider-not-configured"
        | "repair-provider-opt-in-required"
        | "repair-unsupported";
      readonly reason: string;
      readonly nextAction: string;
    }
  | undefined {
  switch (availability.kind) {
    case "available":
      return undefined;
    case "not-configured":
      return {
        status: "repair-provider-not-configured",
        reason: availability.reason ?? "Repair provider is not configured.",
        nextAction: "Configure provider credentials through the approved opt-in flow, then retry.",
      };
    case "opt-in-required":
      return {
        status: "repair-provider-opt-in-required",
        reason: availability.reason ?? "Repair provider proposal generation was not explicitly opted in.",
        nextAction: "Use an explicit repair proposal gate or deterministic fake provider.",
      };
    case "unsupported":
    case "request-blocked":
      return {
        status: "repair-unsupported",
        reason: availability.reason ?? "Repair provider proposal request is unsupported or blocked.",
        nextAction: "Resolve the repair provider readiness blocker before retrying.",
      };
  }
}

function stoppedRepairPlan(input: {
  readonly status: Exclude<
    EditRepairPlannerStatus,
    | "repair-proposal-created"
    | "repair-review-required"
    | "repair-ready-for-hunk-set-handoff"
  >;
  readonly context?: EditRepairContext;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): EditRepairPlan {
  return {
    status: input.status,
    ...(input.context ? { context: input.context } : {}),
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `edit-repair-planner:status:${input.status}`,
      "edit-repair-planner:provider-call:not-run-or-invalid",
      "edit-repair-planner:mutation:not-run",
      "edit-repair-planner:mutation-authority:not-granted",
      "edit-repair-planner:raw-content-excluded",
    ],
  };
}

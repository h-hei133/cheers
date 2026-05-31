import type { EditProposalSelection } from "./editProposalSelection.js";
import {
  planEditRepairHunkSetHandoff,
  planEditRepairProposal,
  type EditRepairPlan,
} from "./editRepairPlanner.js";
import type { EditRepairRawProposal } from "./editRepairProposal.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import type { PlanQuality } from "../planning/quality/model.js";
import { evaluatePlanQualityGate } from "../planning/quality/gate.js";
import type { VerificationRepairContext } from "./verificationRepairContext.js";

export type VerificationRepairPlannerStatus =
  | "repair-loop-context-created"
  | "repair-loop-missing-verification"
  | "repair-loop-missing-context"
  | "repair-loop-missing-runtime-receipt"
  | "repair-loop-quality-blocked"
  | "repair-loop-provider-not-configured"
  | "repair-loop-provider-opt-in-required"
  | "repair-loop-context-over-budget"
  | "repair-loop-proposal-created"
  | "repair-loop-proposal-invalid"
  | "repair-loop-review-required"
  | "repair-loop-ready-for-hunk-set-handoff"
  | "repair-loop-not-needed"
  | "repair-loop-unsupported";

export interface VerificationRepairPromptContext {
  readonly repairLoopId: string;
  readonly repairContextId: string;
  readonly contextPacketId: string;
  readonly agentPlanId: string;
  readonly taskLifecycleId?: string;
  readonly analysisBriefId?: string;
  readonly taskExecutionPlanId?: string;
  readonly verificationFailureSummary: string;
  readonly verificationCommandSafeLabel?: string;
  readonly verificationOutcome: VerificationRepairContext["verificationOutcome"];
  readonly runtimeReceiptMarkers: readonly string[];
  readonly failedFileLabels: readonly string[];
  readonly failedHunkSummaries: readonly {
    readonly hunkId: string;
    readonly targetLabel: string;
    readonly operationSummary: string;
    readonly failureSummary: string;
  }[];
  readonly changedFileLabels: readonly string[];
  readonly recoveryAvailabilitySummary: VerificationRepairContext["recoveryAvailabilitySummary"];
  readonly constraints: readonly string[];
  readonly nonGoals: readonly string[];
  readonly verificationRetryExpectation: "review-confirm-apply-rerun";
  readonly mutationAuthority: "not-granted";
  readonly redactionStatus: "redacted-and-budgeted";
  readonly providerPrompt: string;
  readonly evidence: readonly string[];
}

export interface VerificationRepairFakeProvider {
  readonly proposeRepair: (
    context: VerificationRepairPromptContext,
  ) => EditRepairRawProposal | Promise<EditRepairRawProposal>;
}

export type VerificationRepairPlan =
  | {
      readonly status:
        | "repair-loop-proposal-created"
        | "repair-loop-review-required"
        | "repair-loop-ready-for-hunk-set-handoff";
      readonly context: VerificationRepairContext;
      readonly promptContext: VerificationRepairPromptContext;
      readonly editRepairPlan: EditRepairPlan;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    }
  | {
      readonly status: Exclude<
        VerificationRepairPlannerStatus,
        | "repair-loop-proposal-created"
        | "repair-loop-review-required"
        | "repair-loop-ready-for-hunk-set-handoff"
      >;
      readonly context: VerificationRepairContext;
      readonly promptContext?: VerificationRepairPromptContext;
      readonly editRepairPlan?: EditRepairPlan;
      readonly changedFiles: readonly [];
      readonly mutationAuthority: "not-granted";
      readonly mutation: "not-run";
      readonly reason: string;
      readonly nextAction: string;
      readonly evidence: readonly string[];
    };

export async function planVerificationRepairLoop(input: {
  readonly context: VerificationRepairContext;
  readonly availability: ProviderEditAvailability;
  readonly provider?: VerificationRepairFakeProvider;
  readonly rawProposal?: EditRepairRawProposal;
  readonly planQuality?: PlanQuality;
  readonly constraints?: readonly string[];
  readonly nonGoals?: readonly string[];
  readonly maxHunks?: number;
}): Promise<VerificationRepairPlan> {
  const preflight = preflightStoppedPlan(input.context);
  if (preflight) {
    return preflight;
  }

  if (input.planQuality) {
    const qualityGate = evaluatePlanQualityGate({
      planQuality: input.planQuality,
      action: "repair-loop",
      hasRuntimeReceipt: input.context.runtimeReceiptMarkers.length > 0,
    });
    if (!qualityGate.allowed) {
      return stoppedPlan({
        status:
          qualityGate.decision === "stop-missing-runtime-receipt"
            ? "repair-loop-missing-runtime-receipt"
            : "repair-loop-quality-blocked",
        context: input.context,
        reason: qualityGate.reason,
        nextAction: qualityGate.nextAction,
        evidence: [...input.context.evidence, ...input.planQuality.evidence, ...qualityGate.evidence],
      });
    }
  }

  const unavailable = classifyProviderAvailability(input.availability);
  if (unavailable) {
    return stoppedPlan({
      ...unavailable,
      context: input.context,
      evidence: input.context.evidence,
    });
  }

  const promptContext = buildVerificationRepairPromptContext({
    context: input.context,
    constraints: input.constraints,
    nonGoals: input.nonGoals,
  });
  const rawProposal =
    input.rawProposal ??
    (input.provider ? await input.provider.proposeRepair(promptContext) : undefined);
  if (!rawProposal) {
    return stoppedPlan({
      status: "repair-loop-provider-opt-in-required",
      context: input.context,
      promptContext,
      reason:
        "Verification repair proposal requires an explicit fake/stub or opt-in provider boundary.",
      nextAction: "Use a deterministic fake provider or an isolated opt-in provider gate.",
      evidence: [...input.context.evidence, ...promptContext.evidence],
    });
  }

  const editRepairPlan = await planEditRepairProposal({
    context: input.context.editRepairContext,
    availability: input.availability,
    rawProposal,
    maxHunks: input.maxHunks,
  });
  if (
    editRepairPlan.status !== "repair-proposal-created" &&
    editRepairPlan.status !== "repair-review-required" &&
    editRepairPlan.status !== "repair-ready-for-hunk-set-handoff"
  ) {
    const stoppedStatus =
      editRepairPlan.status === "repair-proposal-invalid"
        ? "repair-loop-proposal-invalid"
        : mapEditStoppedStatus(editRepairPlan.status);
    return stoppedPlan({
      status: stoppedStatus,
      context: input.context,
      promptContext,
      editRepairPlan,
      reason: editRepairPlan.reason,
      nextAction: editRepairPlan.nextAction,
      evidence: [...input.context.evidence, ...promptContext.evidence, ...editRepairPlan.evidence],
    });
  }

  const status =
    editRepairPlan.status === "repair-proposal-created"
      ? "repair-loop-proposal-created"
      : "repair-loop-review-required";
  return {
    status,
    context: input.context,
    promptContext,
    editRepairPlan,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason:
      status === "repair-loop-review-required"
        ? "Context-aware verification repair proposal was created and requires review plus explicit confirmation."
        : "Context-aware verification repair proposal was created for review only; mutation did not run.",
    nextAction:
      status === "repair-loop-review-required"
        ? "Review the repair proposal, select exact hunks, and explicitly confirm before hunk-set handoff."
        : "Review the repair proposal and request exact old/new hunks before handoff.",
    evidence: [
      ...input.context.evidence,
      ...promptContext.evidence,
      ...editRepairPlan.evidence,
      `verification-repair-planner:status:${status}`,
      "verification-repair-planner:provider-call:fake-or-opt-in",
      "verification-repair-planner:no-provider-call-during-apply",
      "verification-repair-planner:mutation:not-run",
      "verification-repair-planner:mutation-authority:not-granted",
      "verification-repair-planner:review-required",
      "verification-repair-planner:raw-content-excluded",
    ],
  };
}

export function planVerificationRepairHunkSetHandoff(input: {
  readonly plan: VerificationRepairPlan;
  readonly selection?: EditProposalSelection;
}): VerificationRepairPlan {
  if (
    !("editRepairPlan" in input.plan) ||
    !input.plan.editRepairPlan ||
    !input.plan.promptContext
  ) {
    return input.plan;
  }
  const editHandoff = planEditRepairHunkSetHandoff({
    plan: input.plan.editRepairPlan,
    selection: input.selection,
  });
  if (editHandoff.status !== "repair-ready-for-hunk-set-handoff") {
    return input.plan;
  }
  const promptContext = input.plan.promptContext;
  return {
    status: "repair-loop-ready-for-hunk-set-handoff",
    context: input.plan.context,
    promptContext,
    editRepairPlan: editHandoff,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: "Confirmed exact repair hunks are ready for the existing proposal hunk-set apply route; no write has run yet.",
    nextAction: "Hand off only the confirmed exact hunk set to the existing proposal hunk-set apply route.",
    evidence: [
      ...input.plan.evidence,
      ...editHandoff.evidence,
      "verification-repair-planner:status:repair-loop-ready-for-hunk-set-handoff",
      "verification-repair-planner:handoff:existing-hunk-set-route",
      "verification-repair-planner:exact-hunk-set-only",
      "verification-repair-planner:mutation:not-run",
    ],
  };
}

function buildVerificationRepairPromptContext(input: {
  readonly context: VerificationRepairContext;
  readonly constraints?: readonly string[];
  readonly nonGoals?: readonly string[];
}): VerificationRepairPromptContext {
  const contextPacketId = input.context.sourceContextPacketId ?? "(missing-context-packet)";
  const agentPlanId = input.context.sourceAgentPlanId ?? "(missing-agent-plan)";
  const taskLifecycleId = input.context.sourceTaskLifecycleId;
  const analysisBriefId = input.context.sourceAnalysisBriefId;
  const taskExecutionPlanId = input.context.sourceTaskExecutionPlanId;
  const constraints = [
    ...(input.constraints ?? []),
    "repair proposal must be review-required",
    "mutation authority is not granted",
    "exact old/new hunks are required before handoff",
  ];
  const nonGoals = [
    ...(input.nonGoals ?? []),
    "do not apply changes",
    "do not call provider during apply",
    "do not use fuzzy or broad mutation",
  ];
  const providerPrompt = [
    "Create a review-only verification repair proposal from safe failed verification context.",
    `Repair loop: ${input.context.repairLoopId}`,
    `Repair context: ${input.context.editRepairContext.repairContextId}`,
    `Context packet: ${contextPacketId}`,
    `Agent Plan: ${agentPlanId}`,
    `Task lifecycle: ${taskLifecycleId ?? "none"}`,
    `Analysis brief: ${analysisBriefId ?? "none"}`,
    `Task execution plan: ${taskExecutionPlanId ?? "none"}`,
    `Verification outcome: ${input.context.verificationOutcome}`,
    `Verification failure: ${input.context.safeFailureExcerpt}`,
    `Runtime receipt markers: ${input.context.runtimeReceiptMarkers.join("; ") || "none"}`,
    `Failed files: ${input.context.failedFileLabels.join("; ") || "none"}`,
    `Changed files: ${input.context.changedFileLabels.join("; ") || "none"}`,
    `Recovery availability: ${input.context.recoveryAvailabilitySummary}`,
    "Return a bounded repair proposal only; do not apply changes.",
  ].join("\n");

  return {
    repairLoopId: input.context.repairLoopId,
    repairContextId: input.context.editRepairContext.repairContextId,
    contextPacketId,
    agentPlanId,
    ...(taskLifecycleId ? { taskLifecycleId } : {}),
    ...(analysisBriefId ? { analysisBriefId } : {}),
    ...(taskExecutionPlanId ? { taskExecutionPlanId } : {}),
    verificationFailureSummary: input.context.safeFailureExcerpt,
    ...(input.context.verificationCommandSafeLabel
      ? { verificationCommandSafeLabel: input.context.verificationCommandSafeLabel }
      : {}),
    verificationOutcome: input.context.verificationOutcome,
    runtimeReceiptMarkers: input.context.runtimeReceiptMarkers,
    failedFileLabels: input.context.failedFileLabels,
    failedHunkSummaries: input.context.failedHunkSummaries.map((hunk) => ({
      hunkId: hunk.hunkId,
      targetLabel: hunk.targetLabel,
      operationSummary: hunk.operationSummary,
      failureSummary: hunk.failureSummary,
    })),
    changedFileLabels: input.context.changedFileLabels,
    recoveryAvailabilitySummary: input.context.recoveryAvailabilitySummary,
    constraints,
    nonGoals,
    verificationRetryExpectation: "review-confirm-apply-rerun",
    mutationAuthority: "not-granted",
    redactionStatus: "redacted-and-budgeted",
    providerPrompt,
    evidence: [
      `verification-repair-prompt:loop:${input.context.repairLoopId}`,
      `verification-repair-prompt:context:${input.context.editRepairContext.repairContextId}`,
      `verification-repair-prompt:context-packet:${contextPacketId}`,
      `verification-repair-prompt:agent-plan:${agentPlanId}`,
      ...(taskLifecycleId ? [`verification-repair-prompt:task-lifecycle:${taskLifecycleId}`] : []),
      ...(analysisBriefId ? [`verification-repair-prompt:analysis-brief:${analysisBriefId}`] : []),
      ...(taskExecutionPlanId ? [`verification-repair-prompt:execution-plan:${taskExecutionPlanId}`] : []),
      `verification-repair-prompt:runtime-receipts:${input.context.runtimeReceiptMarkers.length}`,
      "verification-repair-prompt:redacted-and-budgeted",
      "verification-repair-prompt:raw-full-content-excluded",
      "verification-repair-prompt:mutation-authority:not-granted",
    ],
  };
}

function preflightStoppedPlan(
  context: VerificationRepairContext,
): VerificationRepairPlan | undefined {
  switch (context.status) {
    case "repair-loop-context-created":
      return undefined;
    case "repair-loop-missing-verification":
      return stoppedPlan({
        status: "repair-loop-missing-verification",
        context,
        reason: "Repair loop requires failed verification evidence before provider invocation.",
        nextAction: "Attach a failed verification result or runtime receipt before requesting a repair proposal.",
        evidence: context.evidence,
      });
    case "repair-loop-missing-context":
      return stoppedPlan({
        status: "repair-loop-missing-context",
        context,
        reason: "Repair loop requires context packet and Agent Plan ids before provider invocation.",
        nextAction: "Build targeted context and an Agent Plan, then retry repair planning.",
        evidence: context.evidence,
      });
    case "repair-loop-context-over-budget":
      return stoppedPlan({
        status: "repair-loop-context-over-budget",
        context,
        reason: "Repair loop context exceeded the safe evidence budget.",
        nextAction: "Reduce failed files, failed hunks, or excerpts before repair planning.",
        evidence: context.evidence,
      });
    case "repair-loop-not-needed":
      return stoppedPlan({
        status: "repair-loop-not-needed",
        context,
        reason: "Verification did not fail; no repair loop is needed.",
        nextAction: "Do not create a repair proposal for a passing verification result.",
        evidence: context.evidence,
      });
    case "repair-loop-unsupported":
      return stoppedPlan({
        status: "repair-loop-unsupported",
        context,
        reason: "Repair loop requires a supported failed edit apply or verification context.",
        nextAction: "Create repair context from a supported failed edit apply or verification result.",
        evidence: context.evidence,
      });
  }
}

function classifyProviderAvailability(
  availability: ProviderEditAvailability,
):
  | {
      readonly status:
        | "repair-loop-provider-not-configured"
        | "repair-loop-provider-opt-in-required"
        | "repair-loop-unsupported";
      readonly reason: string;
      readonly nextAction: string;
    }
  | undefined {
  switch (availability.kind) {
    case "available":
      return undefined;
    case "not-configured":
      return {
        status: "repair-loop-provider-not-configured",
        reason: availability.reason ?? "Repair provider is not configured.",
        nextAction: "Configure provider credentials through the approved opt-in flow, then retry.",
      };
    case "opt-in-required":
      return {
        status: "repair-loop-provider-opt-in-required",
        reason: availability.reason ?? "Repair provider proposal generation was not explicitly opted in.",
        nextAction: "Use a deterministic fake provider or explicit repair provider gate.",
      };
    case "unsupported":
    case "request-blocked":
      return {
        status: "repair-loop-unsupported",
        reason: availability.reason ?? "Repair provider proposal request is unsupported or blocked.",
        nextAction: "Resolve the provider readiness blocker before retrying.",
      };
  }
}

function mapEditStoppedStatus(
  status: EditRepairPlan["status"],
): Exclude<
  VerificationRepairPlannerStatus,
  | "repair-loop-proposal-created"
  | "repair-loop-review-required"
  | "repair-loop-ready-for-hunk-set-handoff"
  | "repair-loop-proposal-invalid"
> {
  switch (status) {
    case "repair-not-needed":
      return "repair-loop-not-needed";
    case "repair-context-over-budget":
      return "repair-loop-context-over-budget";
    case "repair-provider-not-configured":
      return "repair-loop-provider-not-configured";
    case "repair-provider-opt-in-required":
      return "repair-loop-provider-opt-in-required";
    case "repair-context-created":
      return "repair-loop-context-created";
    default:
      return "repair-loop-unsupported";
  }
}

function stoppedPlan(input: {
  readonly status: Exclude<
    VerificationRepairPlannerStatus,
    | "repair-loop-proposal-created"
    | "repair-loop-review-required"
    | "repair-loop-ready-for-hunk-set-handoff"
  >;
  readonly context: VerificationRepairContext;
  readonly promptContext?: VerificationRepairPromptContext;
  readonly editRepairPlan?: EditRepairPlan;
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}): VerificationRepairPlan {
  return {
    status: input.status,
    context: input.context,
    ...(input.promptContext ? { promptContext: input.promptContext } : {}),
    ...(input.editRepairPlan ? { editRepairPlan: input.editRepairPlan } : {}),
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: [
      ...input.evidence,
      `verification-repair-planner:status:${input.status}`,
      "verification-repair-planner:provider-call:not-run-or-invalid",
      "verification-repair-planner:no-provider-call-during-apply",
      "verification-repair-planner:mutation:not-run",
      "verification-repair-planner:mutation-authority:not-granted",
      "verification-repair-planner:raw-content-excluded",
    ],
  };
}

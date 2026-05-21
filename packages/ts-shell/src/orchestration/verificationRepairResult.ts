import type { OrchestrationResult } from "./types.js";
import { buildEditRepairResult } from "./editRepairResult.js";
import type { EditProposalApplyResult } from "./editProposalApply.js";
import type { EditProposalReview } from "./editProposalReview.js";
import type { EditProposalSelection } from "./editProposalSelection.js";
import type { VerificationRepairContext } from "./verificationRepairContext.js";
import type { VerificationRepairPlan } from "./verificationRepairPlanner.js";

export type VerificationRepairResultState =
  | "verification-failed-no-repair-context"
  | "repair-context-created"
  | "repair-proposal-created"
  | "repair-review-required"
  | "repair-provider-unavailable"
  | "repair-context-missing"
  | "repair-context-over-budget"
  | "repair-proposal-invalid"
  | "repair-handoff-ready"
  | "repair-applied"
  | "repair-apply-stopped"
  | "repair-apply-partial-failure"
  | "repair-stopped"
  | "repair-failed"
  | "repair-not-needed";

export function buildVerificationRepairResult(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly context: VerificationRepairContext;
  readonly plan?: VerificationRepairPlan;
  readonly review?: EditProposalReview;
  readonly selection?: EditProposalSelection;
  readonly applyResult?: EditProposalApplyResult;
}): OrchestrationResult {
  const editResult = buildEditRepairResult({
    sessionId: input.sessionId,
    prompt: input.prompt,
    context: input.context.editRepairContext,
    plan: input.plan?.editRepairPlan,
    review: input.review,
    selection: input.selection,
    applyResult: input.applyResult,
  });
  const state = projectVerificationRepairResultState(input);
  const extraEvidence = [
    input.context.transcriptSummary,
    ...(input.plan?.promptContext ? [promptSummary(input.plan.promptContext)] : []),
    ...(input.plan?.evidence ?? []),
    `verification-repair-result:state:${state}`,
    `verification-repair-result:loop:${input.context.repairLoopId}`,
    input.context.sourceContextPacketId
      ? `verification-repair-result:context-packet:${input.context.sourceContextPacketId}`
      : "verification-repair-result:context-packet:missing",
    input.context.sourceAgentPlanId
      ? `verification-repair-result:agent-plan:${input.context.sourceAgentPlanId}`
      : "verification-repair-result:agent-plan:missing",
    `verification-repair-result:provider-called:${providerCalled(input.plan) ? "proposal-only" : "no"}`,
    input.applyResult
      ? "verification-repair-result:apply-route:existing-hunk-set-or-exact-lane"
      : "verification-repair-result:no-automatic-repair",
    "verification-repair-result:provider-call-during-apply:not-run",
    "verification-repair-result:mutation-authority:not-granted-until-existing-route",
    "verification-repair-result:raw-content-excluded",
  ];
  const codingResult = editResult.codingResult
    ? {
        ...editResult.codingResult,
        evidence: [...editResult.codingResult.evidence, ...extraEvidence],
        continuation: {
          ...editResult.codingResult.continuation,
          evidence: [
            ...editResult.codingResult.continuation.evidence,
            ...extraEvidence,
            buildContinueSummary({ context: input.context, plan: input.plan, state }),
          ],
        },
        taskSatisfaction: {
          ...editResult.codingResult.taskSatisfaction,
          observedEvidence: [
            ...editResult.codingResult.taskSatisfaction.observedEvidence,
            ...extraEvidence,
          ],
        },
        failureBoundary:
          state === "repair-applied"
            ? editResult.codingResult.failureBoundary
            : `verification-repair-${state}`,
      }
    : undefined;
  return {
    ...editResult,
    ...(state === "repair-applied"
      ? {}
      : {
          status: "stopped_error" as const,
          terminalReason: "stopped_error" as const,
          terminalClassification: "stopped" as const,
          stopReason: input.plan?.nextAction ?? "Create or review repair-loop context before mutation.",
        }),
    finalOutput: [
      editResult.finalOutput,
      "",
      "verification repair loop evaluated.",
      `Repair loop: ${input.context.repairLoopId}`,
      `Repair state: ${state}`,
      `Context packet: ${input.context.sourceContextPacketId ?? "(missing)"}`,
      `Agent Plan: ${input.context.sourceAgentPlanId ?? "(missing)"}`,
      `Provider: ${providerCalled(input.plan) ? "proposal-only" : "not-called"}`,
      `Next: ${input.plan?.nextAction ?? "Attach failed verification, context packet, and Agent Plan before repair planning."}`,
      "Automatic repair: no",
      "Raw content: excluded",
    ].join("\n"),
    ...(codingResult ? { codingResult } : {}),
  };
}

function projectVerificationRepairResultState(input: {
  readonly context: VerificationRepairContext;
  readonly plan?: VerificationRepairPlan;
  readonly applyResult?: EditProposalApplyResult;
}): VerificationRepairResultState {
  if (input.applyResult) {
    switch (input.applyResult.status) {
      case "hunk-set-applied":
      case "single-target-applied":
      case "target-set-applied":
        return "repair-applied";
      case "hunk-set-partial-failure":
      case "target-set-partial-failure":
        return "repair-apply-partial-failure";
      default:
        return "repair-apply-stopped";
    }
  }
  switch (input.plan?.status) {
    case "repair-loop-proposal-created":
      return "repair-proposal-created";
    case "repair-loop-review-required":
      return "repair-review-required";
    case "repair-loop-provider-not-configured":
    case "repair-loop-provider-opt-in-required":
      return "repair-provider-unavailable";
    case "repair-loop-missing-verification":
      return "verification-failed-no-repair-context";
    case "repair-loop-missing-context":
      return "repair-context-missing";
    case "repair-loop-context-over-budget":
      return "repair-context-over-budget";
    case "repair-loop-proposal-invalid":
      return "repair-proposal-invalid";
    case "repair-loop-ready-for-hunk-set-handoff":
      return "repair-handoff-ready";
    case "repair-loop-not-needed":
      return "repair-not-needed";
    case "repair-loop-unsupported":
      return "repair-failed";
    case "repair-loop-context-created":
      return "repair-context-created";
    case undefined:
      switch (input.context.status) {
        case "repair-loop-context-created":
          return "repair-context-created";
        case "repair-loop-missing-verification":
          return "verification-failed-no-repair-context";
        case "repair-loop-missing-context":
          return "repair-context-missing";
        case "repair-loop-context-over-budget":
          return "repair-context-over-budget";
        case "repair-loop-not-needed":
          return "repair-not-needed";
        case "repair-loop-unsupported":
          return "repair-failed";
      }
  }
}

function providerCalled(plan: VerificationRepairPlan | undefined): boolean {
  return Boolean(plan?.evidence.some((entry) => entry === "verification-repair-planner:provider-call:fake-or-opt-in"));
}

function promptSummary(promptContext: VerificationRepairPlan["promptContext"]): string {
  return [
    `verification-repair-prompt loop=${promptContext.repairLoopId}`,
    `context=${promptContext.repairContextId}`,
    `contextPacket=${promptContext.contextPacketId}`,
    `agentPlan=${promptContext.agentPlanId}`,
    `runtimeReceipts=${promptContext.runtimeReceiptMarkers.length}`,
    "mutationAuthority:not-granted",
    "raw-content-excluded",
  ].join("; ");
}

function buildContinueSummary(input: {
  readonly context: VerificationRepairContext;
  readonly plan?: VerificationRepairPlan;
  readonly state: VerificationRepairResultState;
}): string {
  const proposalId =
    input.plan?.editRepairPlan &&
    "manifest" in input.plan.editRepairPlan &&
    input.plan.editRepairPlan.manifest
      ? input.plan.editRepairPlan.manifest.repairProposalId
      : "(none)";
  return [
    `verification-repair-loop id=${input.context.repairLoopId}`,
    `state=${input.state}`,
    `repairContext=${input.context.editRepairContext.repairContextId}`,
    `repairProposal=${proposalId}`,
    `contextPacket=${input.context.sourceContextPacketId ?? "(missing)"}`,
    `agentPlan=${input.context.sourceAgentPlanId ?? "(missing)"}`,
    `verification=${input.context.verificationOutcome}`,
    `runtimeReceipts=${input.context.runtimeReceiptMarkers.length}`,
    `provider=${providerCalled(input.plan) ? "proposal-only" : "not-called"}`,
    `next=${input.plan?.nextAction ?? "create repair context or review proposal"}`,
    "raw-content-excluded",
  ].join("; ");
}

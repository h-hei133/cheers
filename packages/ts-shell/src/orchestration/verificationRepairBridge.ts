import type { AgentPlan } from "./agentPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { EditRepairRawProposal } from "./editRepairProposal.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import type { OrchestrationResult } from "./types.js";
import type { VerificationCommandResult } from "../verification/command/result.js";
import type { VerificationRepairContext } from "./verificationRepairContext.js";
import { buildVerificationRepairContext } from "./verificationRepairContext.js";
import {
  planVerificationRepairLoop,
  type VerificationRepairFakeProvider,
  type VerificationRepairPlan,
} from "./verificationRepairPlanner.js";
import { buildVerificationRepairResult } from "./verificationRepairResult.js";

export type VerificationRepairBridgeStatus =
  | "repair-proposal-created"
  | "repair-review-required"
  | "repair-context-created"
  | "repair-not-eligible"
  | "repair-provider-unavailable"
  | "repair-stopped";

export interface VerificationRepairBridgeResult {
  readonly status: VerificationRepairBridgeStatus;
  readonly commandResult: VerificationCommandResult;
  readonly context?: VerificationRepairContext;
  readonly plan?: VerificationRepairPlan;
  readonly result?: OrchestrationResult;
  readonly changedFiles: readonly [];
  readonly mutation: "not-run";
  readonly mutationAuthority: "not-granted";
  readonly providerCall: "not-run" | "proposal-only";
  readonly evidence: readonly string[];
}

export async function bridgeVerificationCommandToRepairLoop(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly commandResult: VerificationCommandResult;
  readonly contextPacket?: TargetedContextPacket;
  readonly agentPlan?: AgentPlan;
  readonly sourceEditTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly changedFiles?: readonly string[];
  readonly failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason?: string }>;
  readonly availability: ProviderEditAvailability;
  readonly provider?: VerificationRepairFakeProvider;
  readonly rawProposal?: EditRepairRawProposal;
}): Promise<VerificationRepairBridgeResult> {
  if (!input.commandResult.repairEligible) {
    return {
      status: "repair-not-eligible",
      commandResult: input.commandResult,
      changedFiles: [],
      mutation: "not-run",
      mutationAuthority: "not-granted",
      providerCall: "not-run",
      evidence: [
        ...input.commandResult.evidence,
        "verification-repair-bridge:status:repair-not-eligible",
        "verification-repair-bridge:provider-call:not-run",
        "verification-repair-bridge:mutation:not-run",
      ],
    };
  }

  const context = buildVerificationRepairContext({
    sourceEditTransactionId: input.sourceEditTransactionId,
    sourceProposalId: input.sourceProposalId,
    contextPacket: input.contextPacket,
    agentPlan: input.agentPlan,
    verification: input.commandResult.verification,
    failedFiles: input.failedFiles ?? [
      {
        path: "(verification-command)",
        reason: input.commandResult.failureSummary ?? "verification command failed",
      },
    ],
    changedFiles: input.changedFiles ?? [],
    runtimeReceiptMarkers: input.commandResult.runtimeReceiptMarkers,
    failureExcerpt: input.commandResult.failureSummary,
  });
  const plan = await planVerificationRepairLoop({
    context,
    availability: input.availability,
    provider: input.provider,
    rawProposal: input.rawProposal,
  });
  const result = buildVerificationRepairResult({
    sessionId: input.sessionId,
    prompt: input.prompt,
    context,
    plan,
  });
  const status = bridgeStatus(plan.status);
  const providerCall = plan.evidence.some(
    (entry) => entry === "verification-repair-planner:provider-call:fake-or-opt-in",
  )
    ? "proposal-only"
    : "not-run";

  return {
    status,
    commandResult: input.commandResult,
    context,
    plan,
    result,
    changedFiles: [],
    mutation: "not-run",
    mutationAuthority: "not-granted",
    providerCall,
    evidence: [
      ...input.commandResult.evidence,
      ...context.evidence,
      ...plan.evidence,
      `verification-repair-bridge:status:${status}`,
      `verification-repair-bridge:command-result:${input.commandResult.verificationId}`,
      `verification-repair-bridge:repair-loop:${context.repairLoopId}`,
      `verification-repair-bridge:provider-call:${providerCall}`,
      "verification-repair-bridge:no-automatic-repair",
      "verification-repair-bridge:mutation:not-run",
      "verification-repair-bridge:mutation-authority:not-granted",
      "verification-repair-bridge:raw-content-excluded",
    ],
  };
}

function bridgeStatus(status: VerificationRepairPlan["status"]): VerificationRepairBridgeStatus {
  switch (status) {
    case "repair-loop-proposal-created":
      return "repair-proposal-created";
    case "repair-loop-review-required":
      return "repair-review-required";
    case "repair-loop-context-created":
      return "repair-context-created";
    case "repair-loop-provider-not-configured":
    case "repair-loop-provider-opt-in-required":
      return "repair-provider-unavailable";
    default:
      return "repair-stopped";
  }
}

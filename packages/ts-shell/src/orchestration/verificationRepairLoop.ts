import type { AgentPlan } from "./agentPlan.js";
import type { TargetedContextPacket } from "./contextPacket.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import type {
  CodingResultSummary,
  CodingVerificationSummary,
  OrchestrationResult,
} from "./types.js";
import {
  buildVerificationRepairContext,
  buildVerificationRepairContextFromCodingResult,
  type VerificationRepairContext,
} from "./verificationRepairContext.js";
import {
  planVerificationRepairLoop,
  type VerificationRepairFakeProvider,
  type VerificationRepairPlan,
} from "./verificationRepairPlanner.js";
import { buildVerificationRepairResult } from "./verificationRepairResult.js";
import type { EditRepairRawProposal } from "./editRepairProposal.js";

export interface VerificationRepairLoopRun {
  readonly context: VerificationRepairContext;
  readonly plan: VerificationRepairPlan;
  readonly result: OrchestrationResult;
  readonly changedFiles: readonly [];
  readonly mutationAuthority: "not-granted";
  readonly mutation: "not-run";
  readonly evidence: readonly string[];
}

export async function runVerificationRepairLoop(input: {
  readonly sessionId: string;
  readonly prompt: string;
  readonly sourceEditTransactionId?: string;
  readonly sourceProposalId?: string;
  readonly contextPacket?: TargetedContextPacket;
  readonly agentPlan?: AgentPlan;
  readonly verification?: CodingVerificationSummary;
  readonly codingResult?: CodingResultSummary;
  readonly failedFiles?: ReadonlyArray<{ readonly path: string; readonly reason?: string }>;
  readonly changedFiles?: readonly string[];
  readonly runtimeReceiptMarkers?: readonly string[];
  readonly availability: ProviderEditAvailability;
  readonly provider?: VerificationRepairFakeProvider;
  readonly rawProposal?: EditRepairRawProposal;
}): Promise<VerificationRepairLoopRun> {
  const context = input.codingResult
    ? buildVerificationRepairContextFromCodingResult({
        codingResult: input.codingResult,
        sourceEditTransactionId: input.sourceEditTransactionId,
        sourceProposalId: input.sourceProposalId,
        contextPacket: input.contextPacket,
        agentPlan: input.agentPlan,
      })
    : buildVerificationRepairContext({
        sourceEditTransactionId: input.sourceEditTransactionId,
        sourceProposalId: input.sourceProposalId,
        contextPacket: input.contextPacket,
        agentPlan: input.agentPlan,
        verification: input.verification,
        failedFiles: input.failedFiles,
        changedFiles: input.changedFiles,
        runtimeReceiptMarkers: input.runtimeReceiptMarkers,
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
  return {
    context,
    plan,
    result,
    changedFiles: [],
    mutationAuthority: "not-granted",
    mutation: "not-run",
    evidence: [
      ...context.evidence,
      ...plan.evidence,
      "verification-repair-loop:facade",
      "verification-repair-loop:no-automatic-repair",
      "verification-repair-loop:mutation:not-run",
      "verification-repair-loop:mutation-authority:not-granted",
    ],
  };
}

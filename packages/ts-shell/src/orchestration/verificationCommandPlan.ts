import crypto from "node:crypto";

import type { AgentPlan } from "./agentPlan.js";
import {
  blockedCommandReason,
  isAllowlistedFocusedTsShellTestCommand,
  isAllowlistedRunCommand,
} from "./capabilityBoundaryProjection.js";
import { redactProviderEditText } from "./providerEditContext.js";
import type { TestImpactPlan } from "./testImpactPlan.js";
import type { PlanQuality } from "./planQuality.js";
import type { CodeGraphImpact } from "./codeGraphImpact.js";
import type { TaskExecutionPlan } from "./taskExecutionPlan.js";
import type { TaskLifecycle } from "./taskLifecycle.js";
import type { AnalysisQualityGateResult } from "./analysisQualityGate.js";
import type { TaskContextSufficiency } from "./taskContextSufficiency.js";
import { evaluatePlanQualityGate } from "./planQualityGate.js";

export type VerificationCommandPlanState =
  | "ready"
  | "missing-command"
  | "not-allowlisted"
  | "permission-required"
  | "blocked-by-policy"
  | "context-missing"
  | "quality-blocked"
  | "unsupported";

export type VerificationCommandKind =
  | "node-version"
  | "npm-test-help"
  | "npm-build-help"
  | "npm-test-focused"
  | "route-verifier"
  | "unsupported";

export type VerificationCommandSource =
  | "explicit"
  | "agent-plan"
  | "test-impact"
  | "code-graph-impact"
  | "proposal"
  | "edit-result"
  | "none";

export interface VerificationCommandPlan {
  readonly verificationPlanId: string;
  readonly state: VerificationCommandPlanState;
  readonly source: VerificationCommandSource;
  readonly sourceAgentPlanId?: string;
  readonly sourceProposalId?: string;
  readonly sourceEditTransactionId?: string;
  readonly sourceContextPacketId?: string;
  readonly sourceContextGraphId?: string;
  readonly sourceTestImpactPlanId?: string;
  readonly sourceImpactQueryId?: string;
  readonly sourcePlanQualityId?: string;
  readonly sourceContextSufficiencyId?: string;
  readonly sourceAnalysisQualityGateId?: string;
  readonly sourceTaskLifecycleId?: string;
  readonly sourceAnalysisBriefId?: string;
  readonly sourceTaskExecutionPlanId?: string;
  readonly command?: string;
  readonly commandSafeLabel?: string;
  readonly commandKind: VerificationCommandKind;
  readonly cwdSafeLabel: string;
  readonly allowlistStatus: "allowlisted" | "not-allowlisted" | "not-applicable";
  readonly permissionRequirement:
    | "checked-by-existing-runtime"
    | "explicit-approval-required"
    | "blocked-by-policy"
    | "not-applicable";
  readonly expectedEvidence: readonly string[];
  readonly timeoutBudgetMs: number;
  readonly stdoutBudgetChars: number;
  readonly stderrBudgetChars: number;
  readonly redactionStatus: "redacted-and-budgeted";
  readonly executionReadiness: "ready" | "not-ready";
  readonly reason: string;
  readonly nextAction: string;
  readonly evidence: readonly string[];
}

export function buildVerificationCommandPlan(input: {
  readonly agentPlan?: AgentPlan;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly planQuality?: PlanQuality;
  readonly taskContextSufficiency?: TaskContextSufficiency;
  readonly analysisQualityGate?: AnalysisQualityGateResult;
  readonly taskLifecycle?: TaskLifecycle;
  readonly taskExecutionPlan?: TaskExecutionPlan;
  readonly explicitCommand?: string;
  readonly proposalVerificationCommand?: string;
  readonly editResultVerificationCommand?: string;
  readonly sourceProposalId?: string;
  readonly sourceEditTransactionId?: string;
  readonly sourceContextPacketId?: string;
  readonly cwdLabel?: string;
  readonly requireContext?: boolean;
  readonly permissionState?: "runtime-check" | "approval-required" | "blocked";
  readonly expectedEvidence?: readonly string[];
  readonly timeoutBudgetMs?: number;
  readonly stdoutBudgetChars?: number;
  readonly stderrBudgetChars?: number;
}): VerificationCommandPlan {
  const candidate = selectCommandCandidate(input);
  const command = candidate.command?.trim();
  const commandSafeLabel = command ? safeLabel(command, 180) : undefined;
  const sourceContextPacketId =
    input.sourceContextPacketId ?? input.agentPlan?.contextPacketIds[0];
  const sourceContextGraphId =
    input.testImpactPlan?.graphId ?? input.agentPlan?.contextGraphIds?.[0];
  const permissionState = input.permissionState ?? "runtime-check";
  const cwdSafeLabel = safeLabel(input.cwdLabel ?? "workspace-root", 180);
  const commandKind = classifyCommandKind(command);
  const timeoutBudgetMs = input.timeoutBudgetMs ?? 120_000;
  const stdoutBudgetChars = input.stdoutBudgetChars ?? 240;
  const stderrBudgetChars = input.stderrBudgetChars ?? 240;
  const expectedEvidence = input.expectedEvidence ?? [
    "runtime receipt marker",
    "verification command outcome",
  ];

  const state = classifyPlanState({
    command,
    commandKind,
    requireContext: input.requireContext === true,
    hasContext: Boolean(sourceContextPacketId && input.agentPlan?.planId),
    permissionState,
  });
  const qualityGate = input.planQuality
    ? evaluatePlanQualityGate({
        planQuality: input.planQuality,
        action: "verification-command-plan",
      })
    : undefined;
  const analysisBlocked =
    input.analysisQualityGate && !input.analysisQualityGate.allowed;
  const contextBlocksVerification =
    input.taskContextSufficiency?.verificationPlanningReadiness === "blocked";
  const gatedState: VerificationCommandPlanState =
    qualityGate && !qualityGate.allowed || analysisBlocked || contextBlocksVerification
      ? "quality-blocked"
      : state;
  const allowlistStatus = command
    ? isAllowlistedRunCommand(command)
      ? "allowlisted"
      : "not-allowlisted"
    : "not-applicable";
  const permissionRequirement = classifyPermissionRequirement(gatedState, permissionState);
  const executionReadiness = gatedState === "ready" ? "ready" : "not-ready";
  const reason =
    qualityGate && !qualityGate.allowed
      ? qualityGate.reason
      : buildReason({ state: gatedState, command, commandSafeLabel });
  const nextAction =
    qualityGate && !qualityGate.allowed
      ? qualityGate.nextAction
      : buildNextAction({ state: gatedState, command });
  const verificationPlanId = buildPlanId({
    source: candidate.source,
    sourceAgentPlanId: input.agentPlan?.planId,
    sourceProposalId: input.sourceProposalId,
    sourceEditTransactionId: input.sourceEditTransactionId,
    sourceContextPacketId,
    sourceContextGraphId,
    sourceTestImpactPlanId: input.testImpactPlan?.impactPlanId,
    sourceImpactQueryId: input.codeGraphImpact?.impactQueryId,
    sourcePlanQualityId: input.planQuality?.qualityId,
    sourceContextSufficiencyId: input.taskContextSufficiency?.sufficiencyId,
    sourceAnalysisQualityGateId: input.analysisQualityGate?.gateId,
    sourceTaskLifecycleId: input.taskLifecycle?.lifecycleId ?? input.agentPlan?.taskLifecycleId,
    sourceAnalysisBriefId: input.planQuality?.analysisBriefId ?? input.agentPlan?.analysisBriefId,
    sourceTaskExecutionPlanId:
      input.taskExecutionPlan?.executionPlanId ?? input.agentPlan?.taskExecutionPlanId,
    commandSafeLabel,
    state: gatedState,
  });

  return {
    verificationPlanId,
    state: gatedState,
    source: candidate.source,
    ...(input.agentPlan?.planId ? { sourceAgentPlanId: input.agentPlan.planId } : {}),
    ...(input.sourceProposalId ? { sourceProposalId: input.sourceProposalId } : {}),
    ...(input.sourceEditTransactionId ? { sourceEditTransactionId: input.sourceEditTransactionId } : {}),
    ...(sourceContextPacketId ? { sourceContextPacketId } : {}),
    ...(sourceContextGraphId ? { sourceContextGraphId } : {}),
    ...(input.testImpactPlan?.impactPlanId
      ? { sourceTestImpactPlanId: input.testImpactPlan.impactPlanId }
      : {}),
    ...(input.codeGraphImpact?.impactQueryId
      ? { sourceImpactQueryId: input.codeGraphImpact.impactQueryId }
      : {}),
    ...(input.planQuality?.qualityId
      ? { sourcePlanQualityId: input.planQuality.qualityId }
      : {}),
    ...(input.taskContextSufficiency?.sufficiencyId
      ? { sourceContextSufficiencyId: input.taskContextSufficiency.sufficiencyId }
      : {}),
    ...(input.analysisQualityGate?.gateId
      ? { sourceAnalysisQualityGateId: input.analysisQualityGate.gateId }
      : {}),
    ...(input.taskLifecycle?.lifecycleId ?? input.agentPlan?.taskLifecycleId
      ? { sourceTaskLifecycleId: input.taskLifecycle?.lifecycleId ?? input.agentPlan?.taskLifecycleId }
      : {}),
    ...(input.planQuality?.analysisBriefId ?? input.agentPlan?.analysisBriefId
      ? { sourceAnalysisBriefId: input.planQuality?.analysisBriefId ?? input.agentPlan?.analysisBriefId }
      : {}),
    ...(input.taskExecutionPlan?.executionPlanId ?? input.agentPlan?.taskExecutionPlanId
      ? { sourceTaskExecutionPlanId: input.taskExecutionPlan?.executionPlanId ?? input.agentPlan?.taskExecutionPlanId }
      : {}),
    ...(command ? { command } : {}),
    ...(commandSafeLabel ? { commandSafeLabel } : {}),
    commandKind,
    cwdSafeLabel,
    allowlistStatus,
    permissionRequirement,
    expectedEvidence: expectedEvidence.map((entry) => safeLabel(entry, 180)),
    timeoutBudgetMs,
    stdoutBudgetChars,
    stderrBudgetChars,
    redactionStatus: "redacted-and-budgeted",
    executionReadiness,
    reason,
    nextAction,
    evidence: [
      `verification-command-plan:state:${gatedState}`,
      `verification-command-plan:id:${verificationPlanId}`,
      `verification-command-plan:source:${candidate.source}`,
      ...(input.testImpactPlan
        ? [`verification-command-plan:test-impact:${input.testImpactPlan.impactPlanId}`]
        : []),
      ...(input.codeGraphImpact
        ? [`verification-command-plan:impact-query:${input.codeGraphImpact.impactQueryId}`]
        : []),
      ...(input.planQuality
        ? [`verification-command-plan:plan-quality:${input.planQuality.qualityId}`]
        : []),
      ...(input.taskContextSufficiency
        ? [`verification-command-plan:context-sufficiency:${input.taskContextSufficiency.sufficiencyId}`]
        : []),
      ...(input.analysisQualityGate
        ? [`verification-command-plan:analysis-quality-gate:${input.analysisQualityGate.gateId}`]
        : []),
      ...(input.taskLifecycle
        ? [`verification-command-plan:task-lifecycle:${input.taskLifecycle.lifecycleId}`]
        : input.agentPlan?.taskLifecycleId
          ? [`verification-command-plan:task-lifecycle:${input.agentPlan.taskLifecycleId}`]
          : []),
      ...(input.planQuality?.analysisBriefId ?? input.agentPlan?.analysisBriefId
        ? [`verification-command-plan:analysis-brief:${input.planQuality?.analysisBriefId ?? input.agentPlan?.analysisBriefId}`]
        : []),
      ...(input.taskExecutionPlan?.executionPlanId ?? input.agentPlan?.taskExecutionPlanId
        ? [`verification-command-plan:execution-plan:${input.taskExecutionPlan?.executionPlanId ?? input.agentPlan?.taskExecutionPlanId}`]
        : []),
      ...(qualityGate ? [`verification-command-plan:quality-gate:${qualityGate.decision}`] : []),
      ...(input.analysisQualityGate ? [`verification-command-plan:analysis-gate:${input.analysisQualityGate.decision}`] : []),
      `verification-command-plan:kind:${commandKind}`,
      `verification-command-plan:allowlist:${allowlistStatus}`,
      `verification-command-plan:permission:${permissionRequirement}`,
      `verification-command-plan:readiness:${executionReadiness}`,
      "verification-command-plan:mutation:not-run",
      "verification-command-plan:provider-call:not-run",
      "verification-command-plan:redacted-and-budgeted",
      "verification-command-plan:raw-content-excluded",
      ...(qualityGate?.evidence ?? []),
    ],
  };
}

function selectCommandCandidate(input: {
  readonly agentPlan?: AgentPlan;
  readonly testImpactPlan?: TestImpactPlan;
  readonly codeGraphImpact?: CodeGraphImpact;
  readonly explicitCommand?: string;
  readonly proposalVerificationCommand?: string;
  readonly editResultVerificationCommand?: string;
}): { readonly source: VerificationCommandSource; readonly command?: string } {
  if (input.explicitCommand?.trim()) {
    return { source: "explicit", command: input.explicitCommand };
  }
  const agentPlanCommand = input.agentPlan?.suggestedVerification.find((entry) =>
    Boolean(entry.trim()),
  );
  if (agentPlanCommand) {
    return { source: "agent-plan", command: agentPlanCommand };
  }
  const testImpactCommand = input.testImpactPlan?.likelyVerificationCommandCandidates.find(
    (entry) => entry.readiness === "ready" && Boolean(entry.command.trim()),
  );
  if (testImpactCommand) {
    return { source: "test-impact", command: testImpactCommand.command };
  }
  const impactCommand = input.codeGraphImpact?.suggestedVerification.find((entry) =>
    Boolean(entry.trim()) && isAllowlistedRunCommand(entry),
  );
  if (impactCommand) {
    return { source: "code-graph-impact", command: impactCommand };
  }
  if (input.proposalVerificationCommand?.trim()) {
    return { source: "proposal", command: input.proposalVerificationCommand };
  }
  if (input.editResultVerificationCommand?.trim()) {
    return { source: "edit-result", command: input.editResultVerificationCommand };
  }
  return { source: "none" };
}

function classifyPlanState(input: {
  readonly command?: string;
  readonly commandKind: VerificationCommandKind;
  readonly requireContext: boolean;
  readonly hasContext: boolean;
  readonly permissionState: "runtime-check" | "approval-required" | "blocked";
}): VerificationCommandPlanState {
  if (input.requireContext && !input.hasContext) {
    return "context-missing";
  }
  if (!input.command) {
    return "missing-command";
  }
  if (input.commandKind === "unsupported" || !isAllowlistedRunCommand(input.command)) {
    return "not-allowlisted";
  }
  if (input.permissionState === "blocked") {
    return "blocked-by-policy";
  }
  if (input.permissionState === "approval-required") {
    return "permission-required";
  }
  return "ready";
}

function classifyPermissionRequirement(
  state: VerificationCommandPlanState,
  permissionState: "runtime-check" | "approval-required" | "blocked",
): VerificationCommandPlan["permissionRequirement"] {
  if (
    state === "missing-command" ||
    state === "not-allowlisted" ||
    state === "context-missing" ||
    state === "quality-blocked"
  ) {
    return "not-applicable";
  }
  if (permissionState === "blocked" || state === "blocked-by-policy") {
    return "blocked-by-policy";
  }
  if (permissionState === "approval-required" || state === "permission-required") {
    return "explicit-approval-required";
  }
  return "checked-by-existing-runtime";
}

function classifyCommandKind(command: string | undefined): VerificationCommandKind {
  if (command && isAllowlistedFocusedTsShellTestCommand(command)) {
    return "npm-test-focused";
  }
  switch (command) {
    case "node --version":
      return "node-version";
    case "npm test -- --help":
      return "npm-test-help";
    case "npm run build -- --help":
      return "npm-build-help";
    case "npm run verify:route219-real-task-quality-benchmark":
      return "route-verifier";
    default:
      return "unsupported";
  }
}

function buildReason(input: {
  readonly state: VerificationCommandPlanState;
  readonly command?: string;
  readonly commandSafeLabel?: string;
}): string {
  switch (input.state) {
    case "ready":
      return `Verification command is allowlisted and ready for existing runtime execution: ${input.commandSafeLabel}`;
    case "missing-command":
      return "No verification command candidate was provided by plan, proposal, or edit result.";
    case "not-allowlisted":
      return blockedCommandReason(input.command ?? "missing command");
    case "permission-required":
      return "Verification command requires explicit approval before existing runtime execution.";
    case "blocked-by-policy":
      return "Verification command execution is blocked by policy before runtime dispatch.";
    case "context-missing":
      return "Verification command repair flow requires context packet and Agent Plan ids.";
    case "quality-blocked":
      return "Plan quality gate blocked verification command planning before runtime dispatch.";
    case "unsupported":
      return "Verification command candidate is unsupported.";
  }
}

function buildNextAction(input: {
  readonly state: VerificationCommandPlanState;
  readonly command?: string;
}): string {
  switch (input.state) {
    case "ready":
      return "Run through the existing runtime dispatcher and capture receipt evidence.";
    case "missing-command":
      return "Attach an allowlisted verification command candidate before execution.";
    case "not-allowlisted":
      return blockedCommandReason(input.command ?? "missing command");
    case "permission-required":
      return "Ask for explicit approval, then dispatch through the existing runtime boundary.";
    case "blocked-by-policy":
      return "Resolve the policy blocker or choose a supported allowlisted verification command.";
    case "context-missing":
      return "Build targeted context and an Agent Plan before repair-loop bridging.";
    case "quality-blocked":
      return "Resolve plan quality blockers before creating the verification command plan.";
    case "unsupported":
      return "Use a supported allowlisted verification command.";
  }
}

function safeLabel(value: string, maxChars: number): string {
  return redactProviderEditText(value).replace(/\s+/g, " ").trim().slice(0, maxChars);
}

function buildPlanId(input: {
  readonly source: VerificationCommandSource;
  readonly sourceAgentPlanId?: string;
  readonly sourceProposalId?: string;
  readonly sourceEditTransactionId?: string;
  readonly sourceContextPacketId?: string;
  readonly sourceContextGraphId?: string;
  readonly sourceTestImpactPlanId?: string;
  readonly sourceImpactQueryId?: string;
  readonly sourcePlanQualityId?: string;
  readonly sourceContextSufficiencyId?: string;
  readonly sourceAnalysisQualityGateId?: string;
  readonly sourceTaskLifecycleId?: string;
  readonly sourceAnalysisBriefId?: string;
  readonly sourceTaskExecutionPlanId?: string;
  readonly commandSafeLabel?: string;
  readonly state: VerificationCommandPlanState;
}): string {
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex")
    .slice(0, 12);
  return `verification-command-plan-${hash}`;
}

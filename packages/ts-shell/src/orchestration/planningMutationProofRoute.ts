import type { ClaimLedgerEvidenceSource } from "../evidence/projection/claim/ledger.js";
import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { PlanningMutationHandoffProjection } from "../planning/handoff/mutation.js";
import {
  buildPlanningMutationProposalBridge,
  type PlanningMutationProposalBridge,
} from "../planning/handoff/bridge.js";
import {
  runPlanningMutationProofHandoff,
  type PlanningMutationProofConfirmation,
  type PlanningMutationProofHandoff,
  type PlanningMutationProofWorkspace,
} from "./planningMutationProofHandoff.js";
import {
  verifyPlanningMutationProofHandoff,
  type PlanningMutationProofVerification,
} from "./planningMutationProofVerification.js";
import {
  projectRuntimeCodingOutcome,
  type RuntimeOutcomeProjection,
} from "./runtimeOutcomeProjection.js";
import type {
  CodingTaskKind,
  CodingTaskSatisfactionVerdict,
  CodingVerificationSummary,
} from "./types.js";

export type PlanningMutationProofRouteState =
  | "planning-only"
  | "proposal-prepared"
  | "confirmation-required"
  | "applied-unverified"
  | "verified"
  | "repair-ready"
  | "stopped"
  | "unsupported";

export interface PlanningMutationProofRoute {
  readonly routeId: string;
  readonly state: PlanningMutationProofRouteState;
  readonly bridge: PlanningMutationProposalBridge;
  readonly proofHandoff: PlanningMutationProofHandoff;
  readonly verification: PlanningMutationProofVerification;
  readonly changedFiles: readonly string[];
  readonly verifiedFiles: readonly string[];
  readonly unverifiedFiles: readonly string[];
  readonly failedFiles: readonly string[];
  readonly terminalState: PlanningMutationProofVerification["terminalState"];
  readonly terminalResult: PlanningMutationProofVerification["terminalResult"];
  readonly liveSuccess: boolean;
  readonly providerCallDuringApply: false;
  readonly runtimeOutcome: RuntimeOutcomeProjection;
  readonly output: string;
  readonly transcriptSummary: string;
  readonly evidence: readonly string[];
}

export async function runPlanningMutationProofRoute(input: {
  readonly requestId: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly rawProposal?: ProviderEditRawProposal | null;
  readonly currentContentByTargetPath?: ReadonlyMap<string, string>;
  readonly staleTargetPaths?: readonly string[];
  readonly inWorkspaceTargetPaths?: readonly string[];
  readonly proposalEvidenceSource?: PlanningMutationProposalBridge["evidenceSource"];
  readonly confirmation?: PlanningMutationProofConfirmation;
  readonly workspace?: PlanningMutationProofWorkspace;
  readonly readVerifiedFile?: (relativePath: string) => string | undefined;
  readonly expectedContentByTargetPath?: ReadonlyMap<string, string>;
  readonly evidenceSource?: ClaimLedgerEvidenceSource;
  readonly providerKind?: string;
  readonly providerCalled?: boolean;
  readonly liveOptIn?: boolean;
  readonly taskKind?: CodingTaskKind;
}): Promise<PlanningMutationProofRoute> {
  const bridge = buildPlanningMutationProposalBridge({
    requestId: input.requestId,
    handoff: input.handoff,
    rawProposal: input.rawProposal,
    evidenceSource: input.proposalEvidenceSource,
    currentContentByTargetPath: input.currentContentByTargetPath,
    staleTargetPaths: input.staleTargetPaths,
    inWorkspaceTargetPaths: input.inWorkspaceTargetPaths,
  });
  const proofHandoff = await runPlanningMutationProofHandoff({
    bridge,
    confirmation: input.confirmation,
    workspace: input.workspace,
  });
  const verification = verifyPlanningMutationProofHandoff({
    bridge,
    proofHandoff,
    verificationIntent: input.handoff.verificationIntent,
    readVerifiedFile: input.readVerifiedFile,
    expectedContentByTargetPath: input.expectedContentByTargetPath,
    evidenceSource: input.evidenceSource,
    providerKind: input.providerKind,
    providerCalled: input.providerCalled,
    liveOptIn: input.liveOptIn,
  });
  const state = classifyRouteState({ bridge, proofHandoff, verification });
  const routeId = buildRouteId({
    requestId: input.requestId,
    bridgeId: bridge.bridgeId,
    proofHandoffId: proofHandoff.proofHandoffId,
    verificationId: verification.verificationId,
    state,
  });
  const evidence = unique([
    `planning-mutation-proof-route:id:${routeId}`,
    `planning-mutation-proof-route:handoff:${input.handoff.handoffId}`,
    `planning-mutation-proof-route:bridge:${bridge.bridgeId}`,
    `planning-mutation-proof-route:proof-handoff:${proofHandoff.proofHandoffId}`,
    `planning-mutation-proof-route:verification:${verification.verificationId}`,
    `planning-mutation-proof-route:state:${state}`,
    `planning-mutation-proof-route:apply:${proofHandoff.applyState}`,
    `planning-mutation-proof-route:verification-state:${verification.verificationState}`,
    `planning-mutation-proof-route:terminal:${verification.terminalState}`,
    `planning-mutation-proof-route:terminal-result:${verification.terminalResult}`,
    `planning-mutation-proof-route:changed-count:${verification.changedFiles.length}`,
    `planning-mutation-proof-route:unexpected-changed-count:${verification.unexpectedChangedFiles.length}`,
    `planning-mutation-proof-route:provider-called:${input.providerCalled === true}`,
    "planning-mutation-proof-route:provider-call-during-apply:false",
    "planning-mutation-proof-route:mutation-authority:not-granted",
    "planning-mutation-proof-route:raw-content-excluded",
    ...bridge.evidence,
    ...proofHandoff.evidence,
    ...verification.evidence,
  ]);
  const output = formatRouteOutput({
    routeId,
    state,
    bridge,
    proofHandoff,
    verification,
  });
  const runtimeOutcome = projectRuntimeCodingOutcome({
    taskKind: input.taskKind ?? "edit-file",
    changedFiles: [...verification.changedFiles],
    failedFiles: failedFilesFor({ handoff: input.handoff, verification }),
    patches: [],
    verifiedFiles: [...verification.verifiedFiles],
    unverifiedFiles: verification.unverifiedFiles.map((targetPath) => ({
      path: targetPath,
      reason: verification.reason,
    })),
    verification: verificationSummaryFor(verification),
    repairNotes: repairNotesFor(verification),
    evidence: [...evidence],
    taskVerdict: taskVerdictFor(verification),
    taskReasons: taskReasonsFor(verification),
    userFacingOutput: output,
  });

  return {
    routeId,
    state,
    bridge,
    proofHandoff,
    verification,
    changedFiles: verification.changedFiles,
    verifiedFiles: verification.verifiedFiles,
    unverifiedFiles: verification.unverifiedFiles,
    failedFiles: verification.failedFiles,
    terminalState: verification.terminalState,
    terminalResult: verification.terminalResult,
    liveSuccess: verification.liveSuccess,
    providerCallDuringApply: false,
    runtimeOutcome,
    output,
    transcriptSummary: [
      `planning-mutation-proof-route route=${routeId}`,
      `state=${state}`,
      `bridge=${bridge.state}`,
      `handoff=${proofHandoff.state}`,
      `apply=${proofHandoff.applyState}`,
      `verification=${verification.verificationState}`,
      `terminal=${verification.terminalState}`,
      "providerCallDuringApply=false",
      "raw-content-excluded",
    ].join("; "),
    evidence,
  };
}

function classifyRouteState(input: {
  readonly bridge: PlanningMutationProposalBridge;
  readonly proofHandoff: PlanningMutationProofHandoff;
  readonly verification: PlanningMutationProofVerification;
}): PlanningMutationProofRouteState {
  if (input.verification.state === "verified") return "verified";
  if (input.verification.state === "repair-ready") return "repair-ready";
  if (input.proofHandoff.state === "confirmation-required") return "confirmation-required";
  if (input.proofHandoff.state === "applied") return "applied-unverified";
  if (input.proofHandoff.state === "stopped") return "stopped";
  if (input.bridge.state === "planning-only") return "planning-only";
  if (input.bridge.state === "proposal-prepared") return "proposal-prepared";
  return "unsupported";
}

function verificationSummaryFor(
  verification: PlanningMutationProofVerification,
): CodingVerificationSummary {
  if (
    verification.verificationState === "succeeded" &&
    verification.terminalResult === "verification-succeeded"
  ) {
    return {
      status: "passed",
      reason: verification.reason,
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      nextAction: verification.nextAction,
    };
  }
  if (verification.verificationState === "failed") {
    return {
      status: "failed",
      reason: verification.reason,
      selectionScope: "focused",
      selectionSource: "auto-from-changes",
      nextAction: verification.nextAction,
    };
  }
  return {
    status: "skipped",
    reason: verification.reason,
    selectionScope: "none",
    selectionSource: "not-requested",
    nextAction: verification.nextAction,
  };
}

function taskVerdictFor(
  verification: PlanningMutationProofVerification,
): CodingTaskSatisfactionVerdict {
  if (verification.terminalState === "verified-success") return "satisfied";
  if (verification.terminalResult === "verification-succeeded") {
    return "completed-with-caveats";
  }
  return "insufficient-evidence";
}

function taskReasonsFor(verification: PlanningMutationProofVerification): string[] {
  return [
    verification.reason,
    `claim-ledger-terminal=${verification.terminalState}`,
    `claim-ledger-result=${verification.terminalResult}`,
    `live-success=${verification.liveSuccess}`,
  ];
}

function repairNotesFor(verification: PlanningMutationProofVerification): string[] {
  if (verification.state === "repair-ready") {
    return [
      verification.reason,
      "planning-mutation-proof-route:repair-ready",
    ];
  }
  return [
    verification.nextAction,
    `planning-mutation-proof-route:terminal:${verification.terminalState}`,
  ];
}

function failedFilesFor(input: {
  readonly handoff: PlanningMutationHandoffProjection;
  readonly verification: PlanningMutationProofVerification;
}): Array<{ path: string; reason: string }> {
  if (
    input.verification.terminalResult === "verification-succeeded" &&
    input.verification.failedFiles.length === 0
  ) {
    return [];
  }
  if (input.verification.failedFiles.length > 0) {
    return input.verification.failedFiles.map((path) => ({
      path,
      reason: input.verification.reason,
    }));
  }
  const targetPaths = input.handoff.targetPaths.length > 0
    ? input.handoff.targetPaths
    : ["(planning-mutation-proof-route)"];
  return targetPaths.map((path) => ({
    path,
    reason: input.verification.reason,
  }));
}

function formatRouteOutput(input: {
  readonly routeId: string;
  readonly state: PlanningMutationProofRouteState;
  readonly bridge: PlanningMutationProposalBridge;
  readonly proofHandoff: PlanningMutationProofHandoff;
  readonly verification: PlanningMutationProofVerification;
}): string {
  return [
    "Planning mutation proof route",
    `Route id: ${input.routeId}`,
    `State: ${input.state}`,
    `Bridge: ${input.bridge.state}`,
    `Anchor: ${input.bridge.anchorState}`,
    `Confirmation: ${input.proofHandoff.confirmationState}`,
    `Backend: ${input.proofHandoff.backendLane}`,
    `Apply: ${input.proofHandoff.applyState}`,
    `Verification: ${input.verification.verificationState}`,
    `Changed: ${input.verification.changedFiles.join(", ") || "none"}`,
    `Unexpected changed: ${input.verification.unexpectedChangedFiles.join(", ") || "none"}`,
    `Verified: ${input.verification.verifiedFiles.join(", ") || "none"}`,
    `Unverified: ${input.verification.unverifiedFiles.join(", ") || "none"}`,
    `Claim ledger: ${input.verification.claimLedger.ledgerId}`,
    `Claim terminal: ${input.verification.terminalState}`,
    `Claim result: ${input.verification.terminalResult}`,
    `Claim live success: ${input.verification.liveSuccess ? "yes" : "no"}`,
    "Provider call during apply: false",
    "mutationAuthority=not-granted",
    "raw-content-excluded",
    `Reason: ${input.verification.reason}`,
    `Next: ${input.verification.nextAction}`,
  ].join("\n");
}

function buildRouteId(input: object): string {
  return `planning-proof-route-${hashContent(JSON.stringify(input)).slice(0, 12)}`;
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

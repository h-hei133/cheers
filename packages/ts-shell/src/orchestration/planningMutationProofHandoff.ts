import { applyEditProposalSelection, type EditProposalApplyResult } from "./editProposalApply.js";
import { selectEditProposalHunks, type EditProposalSelection } from "./editProposalSelection.js";
import type { FencedEditReplacementRouteOptions } from "./fencedEditRoute.js";
import type { PlanningMutationProposalBridge } from "./planningMutationProposalBridge.js";
import { hashContent } from "./patchRecovery/recoveryAuthorityStore.js";
import type { TargetSetEditRouteOptions } from "./targetSetEditRoute.js";

export type PlanningMutationProofHandoffState =
  | "confirmation-required"
  | "applied"
  | "partial-failure"
  | "stopped"
  | "unsupported";

export type PlanningMutationProofConfirmation =
  | {
      readonly state: "not-confirmed";
    }
  | {
      readonly state: "trusted-confirmed";
    };

export type PlanningMutationProofWorkspace =
  | {
      readonly scope: "none";
    }
  | {
      readonly scope: "controlled-temp-workspace";
      readonly targetPathByLabel?: ReadonlyMap<string, string>;
      readonly fencedOptions: Omit<FencedEditReplacementRouteOptions, "targetPath" | "mapping">;
      readonly targetSetOptions?: Omit<
        TargetSetEditRouteOptions,
        "manifest" | "confirmedTargetSet" | "mapping"
      >;
    }
  | {
      readonly scope: "selected-workspace";
      readonly targetPathByLabel?: ReadonlyMap<string, string>;
      readonly fencedOptions: Omit<FencedEditReplacementRouteOptions, "targetPath" | "mapping">;
      readonly targetSetOptions?: Omit<
        TargetSetEditRouteOptions,
        "manifest" | "confirmedTargetSet" | "mapping"
      >;
    };

export interface PlanningMutationProofHandoff {
  readonly proofHandoffId: string;
  readonly sourceBridgeId: string;
  readonly state: PlanningMutationProofHandoffState;
  readonly backendLane:
    | "existing-proof-carrying-mutation-backend"
    | "not-run";
  readonly bridgeState: PlanningMutationProposalBridge["state"];
  readonly anchorState: PlanningMutationProposalBridge["anchorState"];
  readonly confirmationState: PlanningMutationProofConfirmation["state"] | "unsupported";
  readonly selectionState?: EditProposalSelection["state"];
  readonly applyState: EditProposalApplyResult["status"] | "not-run";
  readonly verificationState: "not-run";
  readonly workspaceScope: PlanningMutationProofWorkspace["scope"];
  readonly changedFiles: readonly string[];
  readonly providerCallDuringApply: false;
  readonly planningMutationAuthority: "not-granted";
  readonly controlledWriteAuthority:
    | "not-requested"
    | "required"
    | "trusted-controlled-workspace"
    | "trusted-selected-workspace";
  readonly reason: string;
  readonly nextAction: string;
  readonly applyResult?: EditProposalApplyResult;
  readonly evidence: readonly string[];
  readonly transcriptSummary: string;
}

export async function runPlanningMutationProofHandoff(input: {
  readonly bridge: PlanningMutationProposalBridge;
  readonly confirmation?: PlanningMutationProofConfirmation;
  readonly workspace?: PlanningMutationProofWorkspace;
}): Promise<PlanningMutationProofHandoff> {
  const confirmation = input.confirmation ?? { state: "not-confirmed" };
  const workspace = input.workspace ?? { scope: "none" };
  const exactReady =
    input.bridge.state === "confirmation-required" &&
    input.bridge.anchorState === "exact-ready" &&
    input.bridge.anchoredReview &&
    input.bridge.anchoredProposal &&
    input.bridge.anchoredMappingByHunkId;

  if (!exactReady) {
    return stoppedProofHandoff({
      bridge: input.bridge,
      confirmationState:
        input.bridge.confirmationState === "unsupported"
          ? "unsupported"
          : confirmation.state,
      workspaceScope: workspace.scope,
      state: "unsupported",
      controlledWriteAuthority: "not-requested",
      reason: "Planning proposal bridge is not exact-ready for proof backend handoff.",
      nextAction: input.bridge.nextAction,
      extraEvidence: [
        "planning-mutation-proof-handoff:bridge-not-exact-ready",
        "planning-mutation-proof-handoff:apply:not-run",
      ],
    });
  }

  const selection = selectEditProposalHunks({
    review: input.bridge.anchoredReview,
    action: "select-all-exact",
    explicitConfirmation: confirmation.state === "trusted-confirmed",
  });

  if (confirmation.state !== "trusted-confirmed") {
    return stoppedProofHandoff({
      bridge: input.bridge,
      confirmationState: confirmation.state,
      workspaceScope: workspace.scope,
      state: "confirmation-required",
      selectionState: selection.state,
      controlledWriteAuthority: "not-requested",
      reason: "Exact-ready planning proposal requires explicit trusted confirmation before apply.",
      nextAction: "Review and explicitly confirm exact hunks in a controlled workspace before backend handoff.",
      extraEvidence: [
        ...selection.evidence,
        "planning-mutation-proof-handoff:explicit-confirmation-required",
        "planning-mutation-proof-handoff:apply:not-run",
      ],
    });
  }

  if (
    workspace.scope !== "controlled-temp-workspace" &&
    workspace.scope !== "selected-workspace"
  ) {
    return stoppedProofHandoff({
      bridge: input.bridge,
      confirmationState: confirmation.state,
      workspaceScope: workspace.scope,
      state: "stopped",
      selectionState: selection.state,
      controlledWriteAuthority: "required",
      reason: "Trusted confirmation is present, but explicit workspace authority was not provided.",
      nextAction: "Provide controlled-temp or selected-workspace fenced route options; do not write the production workspace by default.",
      extraEvidence: [
        ...selection.evidence,
        "planning-mutation-proof-handoff:controlled-workspace-required",
        "planning-mutation-proof-handoff:workspace-authority-required",
        "planning-mutation-proof-handoff:apply:not-run",
      ],
    });
  }

  if (
    workspace.targetSetOptions &&
    workspace.targetSetOptions.workspaceRoot !== workspace.fencedOptions.workspaceRoot
  ) {
    return stoppedProofHandoff({
      bridge: input.bridge,
      confirmationState: confirmation.state,
      workspaceScope: workspace.scope,
      state: "stopped",
      selectionState: selection.state,
      controlledWriteAuthority: "required",
      reason: "Workspace authority options disagree on workspace root.",
      nextAction: "Use one explicit workspace authority for fenced and target-set apply options.",
      extraEvidence: [
        ...selection.evidence,
        "planning-mutation-proof-handoff:workspace-root-mismatch",
        "planning-mutation-proof-handoff:apply:not-run",
      ],
    });
  }

  if (
    selection.state !== "confirmed-exact-single-target" &&
    selection.state !== "confirmed-exact-target-set"
  ) {
    return stoppedProofHandoff({
      bridge: input.bridge,
      confirmationState: confirmation.state,
      workspaceScope: workspace.scope,
      state: "stopped",
      selectionState: selection.state,
      controlledWriteAuthority: workspaceAuthorityState(workspace.scope),
      reason: selection.reason,
      nextAction: selection.nextAction,
      extraEvidence: [
        ...selection.evidence,
        "planning-mutation-proof-handoff:selection-not-applyable",
        "planning-mutation-proof-handoff:apply:not-run",
      ],
    });
  }

  const applyResult = await applyEditProposalSelection({
    selection,
    mappingByHunkId: input.bridge.anchoredMappingByHunkId,
    targetPathByLabel: workspace.targetPathByLabel,
    fencedOptions: workspace.fencedOptions,
    ...(workspace.targetSetOptions ? { targetSetOptions: workspace.targetSetOptions } : {}),
  });

  return {
    proofHandoffId: buildProofHandoffId({
      bridgeId: input.bridge.bridgeId,
      confirmation: confirmation.state,
      workspaceScope: workspace.scope,
      applyState: applyResult.status,
      changedFiles: applyResult.changedFiles,
    }),
    sourceBridgeId: input.bridge.bridgeId,
    state: classifyAppliedState(applyResult),
    backendLane: "existing-proof-carrying-mutation-backend",
    bridgeState: input.bridge.state,
    anchorState: input.bridge.anchorState,
    confirmationState: confirmation.state,
    selectionState: selection.state,
    applyState: applyResult.status,
    verificationState: "not-run",
    workspaceScope: workspace.scope,
    changedFiles: applyResult.changedFiles,
    providerCallDuringApply: false,
    planningMutationAuthority: "not-granted",
    controlledWriteAuthority: workspaceAuthorityState(workspace.scope),
    reason: classifyApplyReason(applyResult),
    nextAction:
      applyResult.changedFiles.length > 0
        ? "Run readback verification before claiming task success."
        : "Inspect the stopped backend result before retrying.",
    applyResult,
    evidence: unique([
      ...baseEvidence({
        bridge: input.bridge,
        state: classifyAppliedState(applyResult),
        confirmationState: confirmation.state,
        workspaceScope: workspace.scope,
        backendLane: "existing-proof-carrying-mutation-backend",
        applyState: applyResult.status,
      }),
      ...selection.evidence,
      ...applyResult.evidence,
      "planning-mutation-proof-handoff:existing-backend-consumed",
      workspace.scope === "selected-workspace"
        ? "planning-mutation-proof-handoff:selected-workspace-authority:explicit"
        : "planning-mutation-proof-handoff:controlled-workspace-authority:explicit",
      "planning-mutation-proof-handoff:no-new-writer",
      "planning-mutation-proof-handoff:no-fuzzy-apply",
      "planning-mutation-proof-handoff:no-provider-call-during-apply",
      "planning-mutation-proof-handoff:verification:not-run",
    ]),
    transcriptSummary: buildTranscriptSummary({
      bridgeId: input.bridge.bridgeId,
      state: classifyAppliedState(applyResult),
      applyState: applyResult.status,
      changedFiles: applyResult.changedFiles,
      workspaceScope: workspace.scope,
    }),
  };
}

function workspaceAuthorityState(
  scope: PlanningMutationProofWorkspace["scope"],
): PlanningMutationProofHandoff["controlledWriteAuthority"] {
  if (scope === "selected-workspace") {
    return "trusted-selected-workspace";
  }
  if (scope === "controlled-temp-workspace") {
    return "trusted-controlled-workspace";
  }
  return "required";
}

function stoppedProofHandoff(input: {
  readonly bridge: PlanningMutationProposalBridge;
  readonly confirmationState: PlanningMutationProofHandoff["confirmationState"];
  readonly workspaceScope: PlanningMutationProofWorkspace["scope"];
  readonly state: PlanningMutationProofHandoffState;
  readonly selectionState?: EditProposalSelection["state"];
  readonly controlledWriteAuthority: PlanningMutationProofHandoff["controlledWriteAuthority"];
  readonly reason: string;
  readonly nextAction: string;
  readonly extraEvidence: readonly string[];
}): PlanningMutationProofHandoff {
  return {
    proofHandoffId: buildProofHandoffId({
      bridgeId: input.bridge.bridgeId,
      confirmation: input.confirmationState,
      workspaceScope: input.workspaceScope,
      applyState: "not-run",
      state: input.state,
    }),
    sourceBridgeId: input.bridge.bridgeId,
    state: input.state,
    backendLane: "not-run",
    bridgeState: input.bridge.state,
    anchorState: input.bridge.anchorState,
    confirmationState: input.confirmationState,
    ...(input.selectionState ? { selectionState: input.selectionState } : {}),
    applyState: "not-run",
    verificationState: "not-run",
    workspaceScope: input.workspaceScope,
    changedFiles: [],
    providerCallDuringApply: false,
    planningMutationAuthority: "not-granted",
    controlledWriteAuthority: input.controlledWriteAuthority,
    reason: input.reason,
    nextAction: input.nextAction,
    evidence: unique([
      ...baseEvidence({
        bridge: input.bridge,
        state: input.state,
        confirmationState: input.confirmationState,
        workspaceScope: input.workspaceScope,
        backendLane: "not-run",
        applyState: "not-run",
      }),
      ...input.extraEvidence,
      "planning-mutation-proof-handoff:no-new-writer",
      "planning-mutation-proof-handoff:no-fuzzy-apply",
      "planning-mutation-proof-handoff:no-provider-call-during-apply",
      "planning-mutation-proof-handoff:verification:not-run",
    ]),
    transcriptSummary: buildTranscriptSummary({
      bridgeId: input.bridge.bridgeId,
      state: input.state,
      applyState: "not-run",
      changedFiles: [],
      workspaceScope: input.workspaceScope,
    }),
  };
}

function baseEvidence(input: {
  readonly bridge: PlanningMutationProposalBridge;
  readonly state: PlanningMutationProofHandoffState;
  readonly confirmationState: PlanningMutationProofHandoff["confirmationState"];
  readonly workspaceScope: PlanningMutationProofWorkspace["scope"];
  readonly backendLane: PlanningMutationProofHandoff["backendLane"];
  readonly applyState: PlanningMutationProofHandoff["applyState"];
}): readonly string[] {
  return [
    `planning-mutation-proof-handoff:bridge:${input.bridge.bridgeId}`,
    `planning-mutation-proof-handoff:state:${input.state}`,
    `planning-mutation-proof-handoff:bridge-state:${input.bridge.state}`,
    `planning-mutation-proof-handoff:anchor:${input.bridge.anchorState}`,
    `planning-mutation-proof-handoff:confirmation:${input.confirmationState}`,
    `planning-mutation-proof-handoff:workspace:${input.workspaceScope}`,
    `planning-mutation-proof-handoff:backend:${input.backendLane}`,
    `planning-mutation-proof-handoff:apply:${input.applyState}`,
    "planning-mutation-proof-handoff:planning-mutation-authority:not-granted",
    "planning-mutation-proof-handoff:raw-content-excluded",
    ...input.bridge.evidence,
  ];
}

function classifyAppliedState(
  applyResult: EditProposalApplyResult,
): PlanningMutationProofHandoffState {
  if (
    applyResult.status === "single-target-applied" ||
    applyResult.status === "target-set-applied" ||
    applyResult.status === "hunk-set-applied"
  ) {
    return "applied";
  }
  if (applyResult.status.includes("partial-failure")) {
    return "partial-failure";
  }
  if (applyResult.status === "unsupported-for-apply") {
    return "unsupported";
  }
  return "stopped";
}

function classifyApplyReason(applyResult: EditProposalApplyResult): string {
  if ("reason" in applyResult) {
    return applyResult.reason;
  }
  return applyResult.transcriptSummary;
}

function buildProofHandoffId(input: object): string {
  return `planning-proof-handoff-${hashContent(JSON.stringify(input)).slice(0, 12)}`;
}

function buildTranscriptSummary(input: {
  readonly bridgeId: string;
  readonly state: PlanningMutationProofHandoffState;
  readonly applyState: PlanningMutationProofHandoff["applyState"];
  readonly changedFiles: readonly string[];
  readonly workspaceScope: PlanningMutationProofWorkspace["scope"];
}): string {
  return [
    `planning-mutation-proof-handoff bridge=${input.bridgeId}`,
    `state=${input.state}`,
    `apply=${input.applyState}`,
    `changed=${input.changedFiles.join(", ") || "none"}`,
    `workspace=${input.workspaceScope}`,
    "providerCallDuringApply=false",
    "planningMutationAuthority=not-granted",
    "raw-content-excluded",
  ].join("; ");
}

function unique(values: readonly string[]): readonly string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

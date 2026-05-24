import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { ProviderEditAvailability } from "./providerEditPlanner.js";
import type { PlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
import type {
  PlanningRuntimeProductProposalPreparation,
  PlanningRuntimeProductProposalSource,
} from "./planningRuntimeProductProposal.js";
import type { LiveProviderReadinessStatus } from "./liveProviderAdapterApproval.js";
import type { RealProviderProposalDryRunProvider } from "./realProviderProposalDryRun.js";
import {
  type PlanningMutationProofConfirmation,
  type PlanningMutationProofWorkspace,
} from "./planningMutationProofHandoff.js";
import { createWorkspaceWriteAuthority } from "./patchResult/workspaceAuthority.js";

export interface PlanningRuntimeProductControlledWorkspace {
  readonly scope: "controlled-temp-workspace";
  readonly source: "runtime-option" | "cli-flag" | "benchmark";
  readonly allowedRoot?: string;
}

export interface PlanningRuntimeProductSelectedWorkspace {
  readonly scope: "selected-workspace";
  readonly source: "runtime-option" | "cli-flag" | "benchmark";
  readonly explicitWorkspaceAuthority: true;
  readonly allowedRoot?: string;
}

export interface PlanningRuntimeProductVerificationCommand {
  readonly command: string;
  readonly approval: "explicit";
  readonly source: "runtime-option" | "cli-flag" | "benchmark";
}

export interface PlanningRuntimeProductLiveProviderAttempt {
  readonly role: "primary" | "fallback";
  readonly providerSafeLabel: string;
  readonly providerConfigSource: string;
  readonly providerAvailability: ProviderEditAvailability;
  readonly readinessStatus?: LiveProviderReadinessStatus;
  readonly evidenceSource?: "live-provider" | "fake-provider";
  readonly provider?: RealProviderProposalDryRunProvider;
}

export interface PlanningRuntimeProductLiveProviderProposal {
  readonly optIn: true;
  readonly source: "runtime-option" | "cli-flag" | "benchmark";
  readonly attempts?: readonly PlanningRuntimeProductLiveProviderAttempt[];
  readonly fallbackPolicy?: {
    readonly enabled: boolean;
    readonly reason: string;
  };
}

export interface PlanningRuntimeProductExecutionOptions {
  readonly confirmation?: PlanningMutationProofConfirmation;
  readonly rawProposal?: ProviderEditRawProposal | null;
  readonly controlledWorkspace?: PlanningRuntimeProductControlledWorkspace;
  readonly selectedWorkspace?: PlanningRuntimeProductSelectedWorkspace;
  readonly verificationCommand?: PlanningRuntimeProductVerificationCommand;
  readonly liveProviderProposal?: PlanningRuntimeProductLiveProviderProposal;
  readonly expectedContentByTargetPath?: ReadonlyMap<string, string>;
  readonly readVerifiedFile?: (relativePath: string) => string | undefined;
}

export interface PlanningRuntimeProductProofInputs {
  readonly confirmation?: PlanningMutationProofConfirmation;
  readonly rawProposal?: ProviderEditRawProposal | null;
  readonly currentContentByTargetPath?: ReadonlyMap<string, string>;
  readonly workspace?: PlanningMutationProofWorkspace;
  readonly readVerifiedFile?: (relativePath: string) => string | undefined;
  readonly expectedContentByTargetPath?: ReadonlyMap<string, string>;
  readonly executionEvidence: readonly string[];
  readonly confirmationState: PlanningMutationProofConfirmation["state"];
  readonly exactProposalState: "provided" | "missing";
  readonly exactProposalSource: PlanningRuntimeProductProposalSource | "none";
  readonly providerCalled: boolean;
  readonly liveOptIn: boolean;
  readonly liveProviderEvidenceSource:
    | "live-provider"
    | "fake-provider"
    | "default-safe"
    | "not-proven";
  readonly proposalPreparation?: PlanningRuntimeProductProposalPreparation;
  readonly controlledWorkspaceState:
    | "trusted-controlled-temp-workspace"
    | "missing"
    | "rejected";
  readonly controlledWorkspaceReason: string;
  readonly selectedWorkspaceState:
    | "trusted-selected-workspace"
    | "missing"
    | "rejected";
  readonly selectedWorkspaceReason: string;
}

export function buildPlanningRuntimeProductProofInputs(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly execution?: PlanningRuntimeProductExecutionOptions;
  readonly proposalPreparation?: PlanningRuntimeProductProposalPreparation;
}): PlanningRuntimeProductProofInputs {
  const confirmation = input.execution?.confirmation;
  const rawProposal =
    input.execution?.rawProposal ?? input.proposalPreparation?.rawProposal ?? null;
  const confirmationState = confirmation?.state ?? "not-confirmed";
  const exactProposalState = rawProposal ? "provided" : "missing";
  const exactProposalSource = rawProposal
    ? input.execution?.rawProposal
      ? "manual-proposal-json"
      : input.proposalPreparation?.source ?? "planning-handoff-summary"
    : "none";
  const controlledWorkspace = classifyControlledWorkspace({
    workspaceRoot: input.workspaceRoot,
    controlledWorkspace: input.execution?.controlledWorkspace,
  });
  const selectedWorkspace = classifySelectedWorkspace({
    workspaceRoot: input.workspaceRoot,
    selectedWorkspace: input.execution?.selectedWorkspace,
  });
  const currentContentByTargetPath = rawProposal
    ? readCurrentContentByTargetPath({
        workspaceRoot: input.workspaceRoot,
        rawProposal,
      })
    : undefined;
  const expectedContentByTargetPath =
    input.execution?.expectedContentByTargetPath ??
    (rawProposal && currentContentByTargetPath
      ? buildExpectedContentByTargetPath({
          rawProposal,
          currentContentByTargetPath,
        })
      : undefined);
  const authority =
    controlledWorkspace.state === "trusted-controlled-temp-workspace"
      ? createWorkspaceWriteAuthority(input.workspaceRoot)
      : selectedWorkspace.state === "trusted-selected-workspace"
      ? createWorkspaceWriteAuthority(input.workspaceRoot)
      : undefined;
  const workspace: PlanningMutationProofWorkspace | undefined = authority
    ? {
        scope: selectedWorkspace.state === "trusted-selected-workspace"
          ? "selected-workspace"
          : "controlled-temp-workspace",
        fencedOptions: workspaceOptions(input.workspaceRoot, authority),
        targetSetOptions: workspaceOptions(input.workspaceRoot, authority),
      }
    : undefined;
  const readVerifiedFile =
    input.execution?.readVerifiedFile ?? authority?.readVerifiedFile;

  return {
    ...(confirmation ? { confirmation } : {}),
    ...(rawProposal ? { rawProposal } : {}),
    ...(currentContentByTargetPath ? { currentContentByTargetPath } : {}),
    ...(workspace ? { workspace } : {}),
    ...(readVerifiedFile ? { readVerifiedFile } : {}),
    ...(expectedContentByTargetPath ? { expectedContentByTargetPath } : {}),
    executionEvidence: [
      `planning-runtime-product:confirmation:${confirmationState}`,
      `planning-runtime-product:exact-proposal:${exactProposalState}`,
      `planning-runtime-product:exact-proposal-source:${exactProposalSource}`,
      `planning-runtime-product:provider-called:${input.proposalPreparation?.providerCalled ?? false}`,
      `planning-runtime-product:live-opt-in:${input.proposalPreparation?.liveOptIn ?? false}`,
      `planning-runtime-product:live-provider-evidence-source:${input.proposalPreparation?.liveEvidenceSource ?? "default-safe"}`,
      `planning-runtime-product:controlled-workspace:${controlledWorkspace.state}`,
      `planning-runtime-product:controlled-workspace-source:${input.execution?.controlledWorkspace?.source ?? "none"}`,
      `planning-runtime-product:controlled-workspace-reason:${controlledWorkspace.reason}`,
      `planning-runtime-product:selected-workspace:${selectedWorkspace.state}`,
      `planning-runtime-product:selected-workspace-source:${input.execution?.selectedWorkspace?.source ?? "none"}`,
      `planning-runtime-product:selected-workspace-reason:${selectedWorkspace.reason}`,
      `planning-runtime-product:verification-command:${input.execution?.verificationCommand ? "explicit" : "not-run"}`,
      ...(input.execution?.verificationCommand
        ? [
            `planning-runtime-product:verification-command-source:${input.execution.verificationCommand.source}`,
            "planning-runtime-product:verification-command-approval:explicit",
          ]
        : []),
      ...(input.proposalPreparation?.evidence ?? []),
      "planning-runtime-product:confirmation-from-prompt:false",
      "planning-runtime-product:provider-call-during-confirmation:false",
      "planning-runtime-product:command-dispatch-during-confirmation:false",
      ...input.handoff.targetPaths.map((targetPath) =>
        `planning-runtime-product:review-target:${targetPath}`,
      ),
    ],
    confirmationState,
    exactProposalState,
    exactProposalSource,
    providerCalled: input.proposalPreparation?.providerCalled ?? false,
    liveOptIn: input.proposalPreparation?.liveOptIn ?? false,
    liveProviderEvidenceSource: input.proposalPreparation?.liveEvidenceSource ?? "default-safe",
    ...(input.proposalPreparation ? { proposalPreparation: input.proposalPreparation } : {}),
    controlledWorkspaceState: controlledWorkspace.state,
    controlledWorkspaceReason: controlledWorkspace.reason,
    selectedWorkspaceState: selectedWorkspace.state,
    selectedWorkspaceReason: selectedWorkspace.reason,
  };
}

function classifyControlledWorkspace(input: {
  readonly workspaceRoot: string;
  readonly controlledWorkspace?: PlanningRuntimeProductControlledWorkspace;
}): {
  readonly state: PlanningRuntimeProductProofInputs["controlledWorkspaceState"];
  readonly reason: string;
} {
  if (!input.controlledWorkspace) {
    return {
      state: "missing",
      reason: "controlled workspace authority was not requested",
    };
  }

  const workspaceRoot = path.resolve(input.workspaceRoot);
  const allowedRoots = [
    input.controlledWorkspace.allowedRoot,
    process.env.PRIVATE_AGENTS_TEST_ROOT,
    os.tmpdir(),
  ]
    .filter((entry): entry is string => Boolean(entry?.trim()))
    .map((entry) => path.resolve(entry));
  const matchedRoot = allowedRoots.find((root) =>
    isSameOrInside(workspaceRoot, root),
  );
  if (!matchedRoot) {
    return {
      state: "rejected",
      reason:
        "controlled workspace authority is limited to explicit temp/test roots",
    };
  }
  return {
    state: "trusted-controlled-temp-workspace",
    reason: `controlled workspace is under ${safeRootLabel(matchedRoot)}`,
  };
}

function classifySelectedWorkspace(input: {
  readonly workspaceRoot: string;
  readonly selectedWorkspace?: PlanningRuntimeProductSelectedWorkspace;
}): {
  readonly state: PlanningRuntimeProductProofInputs["selectedWorkspaceState"];
  readonly reason: string;
} {
  if (!input.selectedWorkspace) {
    return {
      state: "missing",
      reason: "selected workspace authority was not requested",
    };
  }
  if (input.selectedWorkspace.explicitWorkspaceAuthority !== true) {
    return {
      state: "rejected",
      reason: "selected workspace authority must be explicit",
    };
  }

  const workspaceRoot = path.resolve(input.workspaceRoot);
  const allowedRoot = path.resolve(
    input.selectedWorkspace.allowedRoot ?? input.workspaceRoot,
  );
  if (!isSameOrInside(workspaceRoot, allowedRoot)) {
    return {
      state: "rejected",
      reason: "selected workspace root is outside the explicit allowed root",
    };
  }
  return {
    state: "trusted-selected-workspace",
    reason: "selected workspace authority was explicit for the active workspace",
  };
}

function readCurrentContentByTargetPath(input: {
  readonly workspaceRoot: string;
  readonly rawProposal: ProviderEditRawProposal;
}): ReadonlyMap<string, string> {
  const contentByPath = new Map<string, string>();
  for (const target of input.rawProposal.targets ?? []) {
    const relativePath = normalizeRelativePath(target.path);
    if (!relativePath) continue;
    const absolutePath = path.resolve(input.workspaceRoot, relativePath);
    if (!isSameOrInside(absolutePath, input.workspaceRoot)) continue;
    try {
      contentByPath.set(relativePath, fs.readFileSync(absolutePath, "utf8"));
    } catch {
      // Missing or unreadable targets are classified by the existing backend.
    }
  }
  return contentByPath;
}

function buildExpectedContentByTargetPath(input: {
  readonly rawProposal: ProviderEditRawProposal;
  readonly currentContentByTargetPath: ReadonlyMap<string, string>;
}): ReadonlyMap<string, string> | undefined {
  const expected = new Map<string, string>();
  for (const target of input.rawProposal.targets ?? []) {
    const relativePath = normalizeRelativePath(target.path);
    if (!relativePath || !target.oldText || target.newText === undefined) {
      continue;
    }
    const current = input.currentContentByTargetPath.get(relativePath);
    if (current === undefined || !current.includes(target.oldText)) {
      continue;
    }
    expected.set(relativePath, current.replace(target.oldText, target.newText));
  }
  return expected.size > 0 ? expected : undefined;
}

function workspaceOptions(
  workspaceRoot: string,
  authority: ReturnType<typeof createWorkspaceWriteAuthority>,
) {
  return {
    workspaceRoot,
    explicitRuntimeOptIn: true,
    explicitWorkspaceWriteOptIn: true,
    requestedUserDecision: "approved" as const,
    defaultProductionRejectionUnchanged: true as const,
    readFile: authority.readFile,
    readVerifiedFile: authority.readVerifiedFile,
    validateWriteTarget: authority.validateWriteTarget,
    writeFile: authority.writeFile,
  };
}

function normalizeRelativePath(value: string): string | undefined {
  const normalized = value.replace(/\\/g, "/").replace(/^\.\/+/, "");
  if (!normalized || normalized.startsWith("../") || path.isAbsolute(normalized)) {
    return undefined;
  }
  return normalized;
}

function isSameOrInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function safeRootLabel(root: string): string {
  if (root === path.resolve(os.tmpdir())) return "system-temp";
  if (process.env.PRIVATE_AGENTS_TEST_ROOT && root === path.resolve(process.env.PRIVATE_AGENTS_TEST_ROOT)) {
    return "PRIVATE_AGENTS_TEST_ROOT";
  }
  return "explicit-allowed-root";
}

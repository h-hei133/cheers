import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import type { ProviderEditRawProposal } from "./providerEditProposal.js";
import type { PlanningMutationHandoffProjection } from "./planningMutationHandoffProjection.js";
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

export interface PlanningRuntimeProductExecutionOptions {
  readonly confirmation?: PlanningMutationProofConfirmation;
  readonly rawProposal?: ProviderEditRawProposal | null;
  readonly controlledWorkspace?: PlanningRuntimeProductControlledWorkspace;
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
  readonly controlledWorkspaceState:
    | "trusted-controlled-temp-workspace"
    | "missing"
    | "rejected";
  readonly controlledWorkspaceReason: string;
}

export function buildPlanningRuntimeProductProofInputs(input: {
  readonly workspaceRoot: string;
  readonly handoff: PlanningMutationHandoffProjection;
  readonly execution?: PlanningRuntimeProductExecutionOptions;
}): PlanningRuntimeProductProofInputs {
  const confirmation = input.execution?.confirmation;
  const rawProposal = input.execution?.rawProposal ?? null;
  const confirmationState = confirmation?.state ?? "not-confirmed";
  const exactProposalState = rawProposal ? "provided" : "missing";
  const controlledWorkspace = classifyControlledWorkspace({
    workspaceRoot: input.workspaceRoot,
    controlledWorkspace: input.execution?.controlledWorkspace,
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
      : undefined;
  const workspace: PlanningMutationProofWorkspace | undefined = authority
    ? {
        scope: "controlled-temp-workspace",
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
      `planning-runtime-product:controlled-workspace:${controlledWorkspace.state}`,
      `planning-runtime-product:controlled-workspace-source:${input.execution?.controlledWorkspace?.source ?? "none"}`,
      `planning-runtime-product:controlled-workspace-reason:${controlledWorkspace.reason}`,
      "planning-runtime-product:confirmation-from-prompt:false",
      "planning-runtime-product:provider-call-during-confirmation:false",
      "planning-runtime-product:command-dispatch-during-confirmation:false",
      ...input.handoff.targetPaths.map((targetPath) =>
        `planning-runtime-product:review-target:${targetPath}`,
      ),
    ],
    confirmationState,
    exactProposalState,
    controlledWorkspaceState: controlledWorkspace.state,
    controlledWorkspaceReason: controlledWorkspace.reason,
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

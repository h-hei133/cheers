import fs from "node:fs";
import path from "node:path";

import type { ProviderEditRawProposal } from "../orchestration/providerEditProposal.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import type { CliOptions } from "./cliArgs.js";

export function buildCliPlanningMutationExecutionOptions(input: {
  readonly options: CliOptions;
  readonly workspaceRoot: string;
}): PlanningRuntimeProductExecutionOptions | undefined {
  if (
    !input.options.planningMutationConfirm &&
    !input.options.planningMutationControlledWorkspace &&
    !input.options.planningMutationProposalPath
  ) {
    return undefined;
  }

  const rawProposal = input.options.planningMutationProposalPath
    ? readProposalFile({
        proposalPath: input.options.planningMutationProposalPath,
        workspaceRoot: input.workspaceRoot,
      })
    : undefined;

  return {
    confirmation: {
      state: input.options.planningMutationConfirm
        ? "trusted-confirmed"
        : "not-confirmed",
    },
    ...(rawProposal ? { rawProposal } : {}),
    ...(input.options.planningMutationControlledWorkspace
      ? {
          controlledWorkspace: {
            scope: "controlled-temp-workspace" as const,
            source: "cli-flag" as const,
          },
        }
      : {}),
  };
}

function readProposalFile(input: {
  readonly proposalPath: string;
  readonly workspaceRoot: string;
}): ProviderEditRawProposal {
  const absolutePath = path.resolve(input.workspaceRoot, input.proposalPath);
  if (!isSameOrInside(absolutePath, input.workspaceRoot)) {
    throw new Error(
      "--planning-mutation-proposal must point to a JSON file inside the selected workspace.",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  } catch (error) {
    throw new Error(
      `Failed to read --planning-mutation-proposal JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!isProviderEditRawProposal(parsed)) {
    throw new Error(
      "Invalid --planning-mutation-proposal JSON: expected an exact proposal object with operationKind and targets.",
    );
  }
  return parsed;
}

function isProviderEditRawProposal(value: unknown): value is ProviderEditRawProposal {
  if (!value || typeof value !== "object") return false;
  const proposal = value as {
    operationKind?: unknown;
    targets?: unknown;
  };
  if (
    proposal.operationKind !== "exact-fenced-replacement" &&
    proposal.operationKind !== "generated-replacement" &&
    proposal.operationKind !== "broad-refactor" &&
    proposal.operationKind !== "fuzzy-replacement"
  ) {
    return false;
  }
  if (proposal.targets !== undefined && !Array.isArray(proposal.targets)) {
    return false;
  }
  return true;
}

function isSameOrInside(candidate: string, root: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

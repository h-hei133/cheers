import fs from "node:fs";
import path from "node:path";

import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
import type { ProviderEditRawProposal } from "../orchestration/providerEditProposal.js";
import type { PlanningRuntimeProductExecutionOptions } from "../orchestration/planningRuntimeProductExecution.js";
import { approveLiveProviderAdapter } from "../orchestration/liveProviderAdapterApproval.js";
import { createOpenAICompatibleAnchoredSmokeAdapter } from "../orchestration/openAICompatibleAnchoredSmokeAdapter.js";
import type { CliOptions } from "./cliArgs.js";

export function buildCliPlanningMutationExecutionOptions(input: {
  readonly options: CliOptions;
  readonly workspaceRoot: string;
  readonly prompt?: string;
  readonly providerCredentialResolution?: ProviderCredentialResolution;
  readonly providerModeEnv?: string;
  readonly realProviderSmokeOptIn?: boolean;
}): PlanningRuntimeProductExecutionOptions | undefined {
  if (
    !input.options.planningMutationConfirm &&
    !input.options.planningMutationControlledWorkspace &&
    !input.options.planningMutationSelectedWorkspace &&
    !input.options.planningMutationLiveProviderProposal &&
    !input.options.planningMutationProposalPath &&
    !input.options.planningMutationVerifyCommand
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
    ...(input.options.planningMutationSelectedWorkspace
      ? {
          selectedWorkspace: {
            scope: "selected-workspace" as const,
            source: "cli-flag" as const,
            explicitWorkspaceAuthority: true as const,
            allowedRoot: input.workspaceRoot,
          },
        }
      : {}),
    ...(input.options.planningMutationVerifyCommand
      ? {
          verificationCommand: {
            command: input.options.planningMutationVerifyCommand,
            approval: "explicit" as const,
            source: "cli-flag" as const,
          },
        }
      : {}),
    ...(input.options.planningMutationLiveProviderProposal
      ? {
          liveProviderProposal: {
            optIn: true as const,
            source: "cli-flag" as const,
            ...buildLiveProviderProposalOptions(input),
          },
        }
      : {}),
  };
}

function buildLiveProviderProposalOptions(input: {
  readonly prompt?: string;
  readonly providerCredentialResolution?: ProviderCredentialResolution;
  readonly providerModeEnv?: string;
  readonly realProviderSmokeOptIn?: boolean;
}): Pick<
  NonNullable<PlanningRuntimeProductExecutionOptions["liveProviderProposal"]>,
  "attempts" | "fallbackPolicy" | "taskEvidence"
> {
  const resolution = input.providerCredentialResolution;
  const credential = resolution?.credential;
  const providerKind = resolution?.provider ?? "unknown";
  const providerSafeLabel =
    providerKind === "openai-compatible" ? "openai-compatible" : providerKind;
  const configSource = credential?.source
    ? `resolved-${credential.source}`
    : "not-configured";
  const providerAvailability = credential
    ? { kind: "available" as const, providerKindLabel: providerSafeLabel }
    : { kind: "not-configured" as const, reason: "resolved credential missing" };
  const approval = approveLiveProviderAdapter({
    explicitLiveSmokeOptIn: true,
    realProviderSmokeOptIn: input.realProviderSmokeOptIn === true,
    providerReadinessStatus:
      credential && input.providerModeEnv !== "synthetic" ? "ready" : "not-ready",
    providerKind,
    providerSafeLabel,
    providerConfigSource: configSource,
    providerAvailability,
    privateConfigManualRead: false,
    fixtureSafetyStatus: "safe",
    redactionStatus: "redacted-and-budgeted",
  });

  const provider =
    approval.approved &&
    credential?.authMode === "api-key" &&
    credential.apiKey &&
    credential.baseUrl &&
    credential.model &&
    providerKind === "openai-compatible"
      ? createOpenAICompatibleAnchoredSmokeAdapter({
          apiKey: credential.apiKey,
          baseUrl: credential.baseUrl,
          model: credential.model,
          providerSafeLabel,
          promptMode: "context-only",
        })
      : undefined;

  return {
    attempts: [
      {
        role: "primary",
        providerSafeLabel,
        providerConfigSource: configSource,
        providerAvailability,
        readinessStatus: approval.approved ? "ready" : "not-ready",
        evidenceSource: approval.approved ? "live-provider" : "fake-provider",
        ...(provider ? { provider } : {}),
      },
    ],
    fallbackPolicy: {
      enabled: false,
      reason: "CLI live-provider product path runs one configured provider profile per process.",
    },
    taskEvidence: {
      mode: "single-file-exact-patch",
      targetContentMaxChars: 6000,
      ...(input.prompt?.trim()
        ? { taskIntentSummary: input.prompt.trim().slice(0, 600) }
        : {}),
    },
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

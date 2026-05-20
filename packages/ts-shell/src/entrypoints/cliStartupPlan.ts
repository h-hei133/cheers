import type { ProviderCredentialResolution } from "../core/shell/providerCredentials.js";
import type { StdinTransportMode } from "../core/shell/printPromptInput.js";
import type { WorkspaceRootMode } from "../session/SessionManager.js";
import type { CliOptions } from "./cliArgs.js";
import type { CliModePlan } from "./cliModeDispatch.js";
import {
  projectCliProviderProjection,
  type CliProviderProjection,
} from "./cliProviderProjection.js";

export type CliPromptSource =
  | "replay-file"
  | "stdin-stream"
  | "print-argument"
  | "stdin-batch"
  | "interactive";
export type CliSessionStartupMode = "requested-session" | "default-selection";
export type CliRuntimeInvocationShape =
  | "replay-runtime"
  | "stdin-stream-runtime"
  | "print-runtime"
  | "stdin-batch-runtime"
  | "interactive-runtime";

export interface CliWorkspaceStartupSummary {
  readonly launchCwd: string;
  readonly runtimeBaseDir: string;
  readonly workspaceRoot: string;
  readonly projectRoot: string;
  readonly rootMode?: WorkspaceRootMode;
}

export interface CliApprovalStartupSummary {
  readonly nonInteractiveApproval:
    | NonNullable<CliOptions["nonInteractiveApproval"]>
    | "default";
  readonly summaryLabel: string;
}

export interface CliStartupPlanInput {
  readonly options: CliOptions;
  readonly cliModePlan: CliModePlan;
  readonly stdinTransportMode: StdinTransportMode;
  readonly nonInteractivePromptCount: number;
  readonly launchCwd: string;
  readonly runtimeBaseDir: string;
  readonly workspaceRoot: string;
  readonly projectRoot: string;
  readonly rootMode?: WorkspaceRootMode;
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly providerModeEnv?: string;
  readonly maxTurns: number;
}

export interface CliStartupPlan {
  readonly requestedMode: CliModePlan["kind"];
  readonly promptSource: CliPromptSource;
  readonly sessionMode: CliSessionStartupMode;
  readonly workspace: CliWorkspaceStartupSummary;
  readonly approval: CliApprovalStartupSummary;
  readonly provider: CliProviderProjection;
  readonly runtimeInvocationShape: CliRuntimeInvocationShape;
  readonly stdinTransportMode: StdinTransportMode;
  readonly nonInteractivePromptCount: number;
  readonly maxTurns: number;
}

export function projectCliStartupPlan(
  input: CliStartupPlanInput,
): CliStartupPlan {
  return {
    requestedMode: input.cliModePlan.kind,
    promptSource: projectPromptSource(input),
    sessionMode: input.options.sessionId
      ? "requested-session"
      : "default-selection",
    workspace: {
      launchCwd: input.launchCwd,
      runtimeBaseDir: input.runtimeBaseDir,
      workspaceRoot: input.workspaceRoot,
      projectRoot: input.projectRoot,
      rootMode: input.rootMode,
    },
    approval: projectCliApprovalStartupSummary(input.options),
    provider: projectCliProviderProjection({
      providerCredentialResolution: input.providerCredentialResolution,
      providerModeEnv: input.providerModeEnv,
    }),
    runtimeInvocationShape: projectRuntimeInvocationShape(input.cliModePlan),
    stdinTransportMode: input.stdinTransportMode,
    nonInteractivePromptCount: input.nonInteractivePromptCount,
    maxTurns: input.maxTurns,
  };
}

export function projectCliApprovalStartupSummary(
  options: Pick<CliOptions, "nonInteractiveApproval">,
): CliApprovalStartupSummary {
  const nonInteractiveApproval = options.nonInteractiveApproval ?? "default";
  return {
    nonInteractiveApproval,
    summaryLabel:
      nonInteractiveApproval === "default"
        ? "default non-interactive deny"
        : `explicit ${nonInteractiveApproval}`,
  };
}

function projectPromptSource(input: CliStartupPlanInput): CliPromptSource {
  if (input.cliModePlan.kind === "replay") {
    return "replay-file";
  }
  if (input.cliModePlan.kind === "stdin-stream") {
    return "stdin-stream";
  }
  if (input.cliModePlan.kind === "print") {
    return "print-argument";
  }
  if (input.cliModePlan.kind === "stdin-batch") {
    return "stdin-batch";
  }
  return "interactive";
}

function projectRuntimeInvocationShape(
  cliModePlan: CliModePlan,
): CliRuntimeInvocationShape {
  switch (cliModePlan.kind) {
    case "replay":
      return "replay-runtime";
    case "stdin-stream":
      return "stdin-stream-runtime";
    case "print":
      return "print-runtime";
    case "stdin-batch":
      return "stdin-batch-runtime";
    case "interactive":
      return "interactive-runtime";
  }
}

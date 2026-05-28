import type { ProviderCredentialResolution } from "../../core/shell/providerCredentials.js";
import type { CliProviderRuntimeBridge } from "../provider/cliProviderRuntimeBridge.js";
import type { CliOptions } from "../../entrypoints/cliArgs.js";
import { buildCliPlanningMutationExecutionOptions } from "../../entrypoints/cliPlanningMutationExecution.js";
import type { PlanningRuntimeProductExecutionOptions } from "../../orchestration/planningRuntimeProductExecution.js";

export function buildCliRuntimePlanningMutationOptions(input: {
  readonly options: CliOptions;
  readonly workspaceRoot: string;
  readonly prompt: string;
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly providerRuntimeBridge: CliProviderRuntimeBridge;
}): PlanningRuntimeProductExecutionOptions | undefined {
  return buildCliPlanningMutationExecutionOptions({
    options: input.options,
    workspaceRoot: input.workspaceRoot,
    prompt: input.prompt,
    providerCredentialResolution: input.providerCredentialResolution,
    providerModeEnv: input.providerRuntimeBridge.providerModeEnv(),
    realProviderSmokeOptIn: input.providerRuntimeBridge.realProviderSmokeOptIn(),
  });
}

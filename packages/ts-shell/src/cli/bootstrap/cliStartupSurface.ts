import {
  renderStartupSurface,
} from "../../core/shell/startupSurfaceRenderer.js";
import type { StdinTransportMode } from "../../core/shell/printPromptInput.js";
import type { ProviderCredentialResolution } from "../../core/shell/providerCredentials.js";
import type { CliOptions } from "../options/cliOptions.js";
import type { CliModePlan } from "../../entrypoints/cliModeDispatch.js";
import {
  projectCliStartupPlan,
  type CliStartupPlan,
} from "../../entrypoints/cliStartupPlan.js";
import type {
  CliBootstrapRuntimeContext,
} from "./cliBootstrapContext.js";
import { supportsFullScreenSurface } from "../interactive/surfaceCapability.js";

export interface CliStartupSurfaceProjection {
  readonly startupPlan: CliStartupPlan;
  readonly showStartupSurface: boolean;
}

export interface ProjectAndRenderCliStartupSurfaceInput {
  readonly options: CliOptions;
  readonly stdin?: NodeJS.ReadStream;
  readonly stdout?: NodeJS.WriteStream;
  readonly cliModePlan: CliModePlan;
  readonly stdinTransportMode: StdinTransportMode;
  readonly nonInteractivePromptCount: number;
  readonly launchCwd: string;
  readonly bootstrapRuntime: CliBootstrapRuntimeContext;
  readonly providerCredentialResolution: ProviderCredentialResolution;
  readonly providerModeEnv?: string;
}

export function projectAndRenderCliStartupSurface(
  input: ProjectAndRenderCliStartupSurfaceInput,
): CliStartupSurfaceProjection {
  const startupPlan = projectCliStartupPlan({
    options: input.options,
    cliModePlan: input.cliModePlan,
    stdinTransportMode: input.stdinTransportMode,
    nonInteractivePromptCount: input.nonInteractivePromptCount,
    launchCwd: input.launchCwd,
    runtimeBaseDir: input.bootstrapRuntime.runtimeBaseDir,
    workspaceRoot: input.bootstrapRuntime.workspaceRoot,
    projectRoot: input.bootstrapRuntime.runtimeContext.projectRoot,
    rootMode: input.bootstrapRuntime.runtimeContext.rootMode,
    providerCredentialResolution: input.providerCredentialResolution,
    providerModeEnv: input.providerModeEnv,
    maxTurns: input.bootstrapRuntime.runtimeContext.runtimeConfig.maxTurns,
  });
  // The full-screen host draws its own intro inside the frame, so printing the
  // console startup surface too would scroll unmanaged text under it. Only a
  // real terminal gets that host: over a pipe the surface is the only intro
  // there is, and harnesses wait on it for readiness.
  const fullScreenHost =
    !input.options.printMode &&
    !input.options.replayFile &&
    input.nonInteractivePromptCount === 0 &&
    supportsFullScreenSurface(input.stdin, input.stdout);
  const showStartupSurface =
    !fullScreenHost && input.stdinTransportMode !== "capture-batch";
  if (showStartupSurface) {
    renderStartupSurface(input.bootstrapRuntime.renderer, {
      runtimeContext: input.bootstrapRuntime.runtimeContext,
      sessionManager: input.bootstrapRuntime.sessionManager,
      lifecycleNotices: input.bootstrapRuntime.bootstrap.lifecycleNotices,
      recoveryCandidate: input.bootstrapRuntime.recoveryCandidate,
      recoveryCandidateSummary:
        input.bootstrapRuntime.recoveryCandidateSummary ?? undefined,
      recoveryBlockedNotice:
        input.bootstrapRuntime.recoveryBlockedNotice ?? undefined,
      provider: startupPlan.provider.provider,
      model: startupPlan.provider.model,
      maxTurns: startupPlan.maxTurns,
      executionPath: "ts-local",
      stdinTransportMode: startupPlan.stdinTransportMode,
    });
  }

  return {
    startupPlan,
    showStartupSurface,
  };
}

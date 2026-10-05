import { projectSessionModel } from "../../session/model/projection.js";
import process from "node:process";

import { getRuntimeConfig } from "../../config/runtimeConfig.js";
import {
  resolveProviderCredential,
  type ProviderCredentialResolution,
} from "../../core/shell/providerCredentials.js";
import type { CliOptions } from "../options/cliOptions.js";

export interface CliProviderRuntimeBridge {
  readonly resolveCredentialSnapshot: () => ProviderCredentialResolution;
  readonly providerModeEnv: () => string | undefined;
  readonly realProviderSmokeOptIn: () => boolean;
}

export function createCliProviderRuntimeBridge(input: {
  readonly projectRoot: string;
  readonly currentSession?: () => { readonly id: string; readonly projectRoot: string };
  readonly options: Pick<CliOptions, "provider" | "apiKey">;
  readonly env?: NodeJS.ProcessEnv;
}): CliProviderRuntimeBridge {
  const env = input.env ?? process.env;
  return {
    resolveCredentialSnapshot: () => {
      const session = input.currentSession?.();
      return resolveProviderCredential({
        runtimeConfig: projectSessionModel(getRuntimeConfig(session?.projectRoot ?? input.projectRoot), session?.id),
        cliProvider: input.options.provider,
        cliApiKey: input.options.apiKey,
        env,
      });
    },
    providerModeEnv: () => env.CHEERS_PROVIDER_MODE,
    realProviderSmokeOptIn: () =>
      env.CHEERS_REAL_PROVIDER_SMOKE?.trim() === "1",
  };
}

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
  readonly options: Pick<CliOptions, "provider" | "apiKey">;
  readonly env?: NodeJS.ProcessEnv;
}): CliProviderRuntimeBridge {
  const env = input.env ?? process.env;
  return {
    resolveCredentialSnapshot: () =>
      resolveProviderCredential({
        runtimeConfig: getRuntimeConfig(input.projectRoot),
        cliProvider: input.options.provider,
        cliApiKey: input.options.apiKey,
      }),
    providerModeEnv: () => env.PRIVATE_AGENTS_PROVIDER_MODE,
    realProviderSmokeOptIn: () =>
      env.PRIVATE_AGENTS_REAL_PROVIDER_SMOKE?.trim() === "1",
  };
}

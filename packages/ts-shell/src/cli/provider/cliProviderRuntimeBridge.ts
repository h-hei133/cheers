import process from "node:process";

import type { RuntimeConfig } from "../../config/runtimeConfig.js";
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

/** Configuration validation and request dispatch resolve the same target. */
export function resolveCliCredential(runtimeConfig: RuntimeConfig, options: Pick<CliOptions, 'provider' | 'apiKey'>,
  env: NodeJS.ProcessEnv = process.env, sessionId?: string): ProviderCredentialResolution {
  return resolveProviderCredential({ runtimeConfig, cliProvider: options.provider, cliApiKey: options.apiKey, env,
    ...(sessionId ? { pool: { sessionId } } : {}) });
}

export function createCliProviderRuntimeBridge(input: {
  readonly runtimeConfig: () => RuntimeConfig;
  readonly options: Pick<CliOptions, "provider" | "apiKey">;
  readonly env?: NodeJS.ProcessEnv;
  readonly sessionId?: () => string | undefined;
}): CliProviderRuntimeBridge {
  const env = input.env ?? process.env;
  return {
    resolveCredentialSnapshot: () => {
      return resolveCliCredential(input.runtimeConfig(), input.options, env, input.sessionId?.());
    },
    providerModeEnv: () => env.CHEERS_PROVIDER_MODE,
    realProviderSmokeOptIn: () =>
      env.CHEERS_REAL_PROVIDER_SMOKE?.trim() === "1",
  };
}

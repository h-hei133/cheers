import process from "node:process";

import { isRuntimeProvider, type RuntimeConfig, type RuntimeProvider } from "../../config/runtimeConfig.js";
import { thinkingSyntax } from "../../core/commands/thinking/syntax.js";
import type { ThinkingPreference } from "../../core/models/effort.js";
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
function parseThinkingOption(level: string | undefined): ThinkingPreference | undefined {
  if (!level) return undefined;
  const action = thinkingSyntax.actions.find(
    (item) => item.name === level || item.aliases?.includes(level),
  );
  return action?.effort;
}

function parseCliModelOption(
  rawModel: string | undefined,
  explicitProvider: RuntimeProvider | undefined,
): { readonly provider?: RuntimeProvider; readonly model?: string; readonly thinking?: string } {
  if (!rawModel) return { provider: explicitProvider };
  let spec = rawModel.trim();
  let inlineThinking: string | undefined;
  const colonIdx = spec.lastIndexOf(":");
  if (colonIdx > 0) {
    const suffix = spec.slice(colonIdx + 1).trim().toLowerCase();
    if (parseThinkingOption(suffix) !== undefined) {
      inlineThinking = suffix;
      spec = spec.slice(0, colonIdx);
    }
  }
  let provider = explicitProvider;
  const slashIdx = spec.indexOf("/");
  if (slashIdx > 0 && !provider) {
    const prefix = spec.slice(0, slashIdx).trim().toLowerCase();
    if (isRuntimeProvider(prefix)) {
      provider = prefix;
      spec = spec.slice(slashIdx + 1);
    }
  }
  return { provider, model: spec || undefined, thinking: inlineThinking };
}

/** Configuration validation and request dispatch resolve the same target. */
export function resolveCliCredential(
  runtimeConfig: RuntimeConfig,
  options: Pick<CliOptions, "provider" | "apiKey" | "model" | "thinking">,
  env: NodeJS.ProcessEnv = process.env,
  sessionId?: string,
): ProviderCredentialResolution {
  const parsedModel = parseCliModelOption(options.model, options.provider);
  const cliThinkingEffort = parseThinkingOption(options.thinking ?? parsedModel.thinking);
  return resolveProviderCredential({
    runtimeConfig,
    cliProvider: parsedModel.provider,
    cliApiKey: options.apiKey,
    cliModel: parsedModel.model,
    cliThinkingEffort,
    env,
    ...(sessionId ? { pool: { sessionId } } : {}),
  });
}

export function createCliProviderRuntimeBridge(input: {
  readonly runtimeConfig: () => RuntimeConfig;
  readonly options: Pick<CliOptions, "provider" | "apiKey" | "model" | "thinking">;
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

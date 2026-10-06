import { preferredEffort, isThinkingPreference, type ThinkingPreference } from '../../models/effort.js';
import { captureThinkingPreference } from '../../models/preference.js';
import type { RuntimeConfig } from '../../../config/runtimeConfig.js';

export function parseEffortFlag(value: string | true | undefined): ThinkingPreference | undefined {
  return value === undefined ? undefined : isThinkingPreference(value) ? value : null;
}

export function currentModelPreference(config: Partial<Pick<RuntimeConfig, "provider" | "providerConnections" | "providerCredentials" | "activeProviderConnectionId">>, root: string) {
  const connection = config.providerConnections?.find(item => item.id.trim() === config.activeProviderConnectionId?.trim());
  const provider = connection?.provider ?? config.provider ?? 'openai';
  const profile = config.providerCredentials?.[provider];
  return { model: connection?.model?.trim() || profile?.model?.trim() || undefined,
    ...captureThinkingPreference(root, preferredEffort(connection, profile)) };
}

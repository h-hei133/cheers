import { randomUUID } from 'node:crypto';
import {
  CONFIG_FIELDS, getUserAuthPath, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile,
  type ProviderConnectionConfig, type RuntimeConfigFile,
} from '../../../config/runtimeConfig.js';
import { persistConfigEdit, type ConfigEdit } from '../../../config/persistence.js';
import { OAuthExchangeError } from '../../auth/oauth/flow.js';
import { loginOpenRouter } from '../../auth/oauth/openrouter/flow.js';
import { OPENROUTER_BASE_URL } from '../../auth/oauth/openrouter/policy.js';
import { endpointLabel } from '../../models/availability.js';
import { maskApiKey } from '../../shell/providerCredentials.js';
import type { CommandContext } from '../types.js';
import { buildConnectionId, normalizeConnections } from './preset.js';
import type { ConnectPreset } from './types.js';

interface KeyConnectionOptions {
  readonly activate?: boolean;
  readonly signal?: AbortSignal;
  readonly onProgress?: CommandContext['signInProgress'];
}

interface KeyConnection {
  readonly target: ConnectPreset;
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly model?: string;
  readonly label?: string;
  readonly activate?: boolean;
  readonly onPersisted?: () => void;
}

/** Publish browser grants and manually entered keys through the same config owner. */
export function saveKeyConnection(input: KeyConnection, grant?: { edit: ConfigEdit<RuntimeConfigFile>; signal?: AbortSignal }): string {
  const { target, apiKey, baseUrl, model, activate } = input;
  const now = new Date().toISOString();
  const connection: ProviderConnectionConfig = {
    id: grant ? `${target.id}-${randomUUID()}` : buildConnectionId(target.provider),
    provider: target.provider,
    authType: grant ? 'oauth-api-key' : 'api-key',
    ...(activate === false ? { autoSelect: false } : {}),
    label: input.label?.trim() || target.label,
    apiKey,
    ...(baseUrl ? { baseUrl } : {}),
    ...(model ? { model } : {}),
    status: 'connected',
    createdAt: now,
    updatedAt: now,
  };
  const edit = grant?.edit ?? readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  const { values } = edit;
  const next: RuntimeConfigFile = {
    ...values,
    providerConnections: [connection, ...(grant ? values.providerConnections ?? [] : normalizeConnections(values))],
    ...(activate !== false ? { provider: target.provider, activeProviderConnectionId: connection.id } : {}),
  };
  const configPath = getUserAuthPath();
  if (grant) {
    persistConfigEdit(getUserRuntimeConfigPath(), next, edit, CONFIG_FIELDS, current =>
      !grant.signal?.aborted && (activate === false || (
        current.provider === values.provider && current.activeProviderConnectionId === values.activeProviderConnectionId
      )));
  } else {
    writeUserRuntimeConfigFile(next, edit);
  }
  input.onPersisted?.();
  const display = endpointLabel(baseUrl);
  return [
    grant ? `Connected ${target.label} with a browser-authorized API key.` : `Connected provider ${target.provider}.`,
    `Connection ID: ${connection.id}`,
    `Connection type: ${connection.authType}`,
    `Saved key: ${grant ? 'redacted' : maskApiKey(apiKey)}`,
    ...(display ? [`Endpoint: ${display}`] : []),
    ...(model ? [`Model: ${model}`] : []),
    activate === false ? 'Connection saved. Select a model to enable it.' : `Stored provider default: ${target.provider}.`,
    `Stored at: ${configPath}`,
    'Use /connect status to inspect active connection details.',
  ].join('\n');
}

export async function connectOpenRouter(target: ConnectPreset, label: string | undefined, onPersisted: (() => void) | undefined,
  options: KeyConnectionOptions): Promise<string> {
  if (target.id !== 'openrouter' || target.provider !== 'openai-compatible' || target.defaultBaseUrl !== OPENROUTER_BASE_URL) {
    throw new Error('OpenRouter browser authorization requires its native connection preset.');
  }
  if (options.signal?.aborted) return cancelledLogin();
  const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
  let apiKey: string;
  try {
    apiKey = await loginOpenRouter({ signal: options.signal, onProgress: options.onProgress });
  } catch (error) {
    const reason = error instanceof OAuthExchangeError ? error.message : 'Browser authorization failed.';
    return `${reason}\nNo local connection was published.`;
  }
  if (options.signal?.aborted) return cancelledLogin();
  return saveKeyConnection({ target, apiKey, label, baseUrl: OPENROUTER_BASE_URL, model: target.defaultModel,
    activate: options.activate, onPersisted }, { edit, signal: options.signal });
}

function cancelledLogin(): string {
  return 'OpenRouter: sign-in cancelled.\nNo local connection was published.';
}

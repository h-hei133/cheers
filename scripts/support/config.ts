import fs from 'node:fs';
import path from 'node:path';
import { getRuntimeConfig, getUserRuntimeConfigPath, getUserAuthPath, readRuntimeConfigEditAt } from '../../packages/ts-shell/src/config/runtimeConfig.js';
import { configEditStorage } from '../../packages/ts-shell/src/config/persistence.js';
import { createProfileContext, withProfile } from '../../packages/ts-shell/src/core/paths/profile/context.js';
import { profileName } from '../../packages/ts-shell/src/core/paths/profile/name.js';
import { resolveProviderCredential } from '../../packages/ts-shell/src/core/shell/providerCredentials.js';
import { loadCatalog } from '../../packages/ts-shell/src/core/models/catalogStore.js';
import { providerCredentialBaseUrl } from '../../packages/ts-shell/src/core/auth/account/target.js';
import { providerFetchFor } from '../../packages/ts-shell/src/provider/request/fetch.js';
import { providerAuthorization } from '../../packages/ts-shell/src/provider/request/authorization.js';
import { needsUserEndpoint } from '../../packages/ts-shell/src/core/providers/facts.js';

interface Input {
  readonly workspace: string;
  readonly operation: 'inspect' | 'baseline';
  readonly expectedBaseUrl?: string;
  readonly expectedModel?: string;
}

/** The process already has its explicit HOME; no profile directories are created. */
export async function inspect(input: Input): Promise<object> {
  const id = profileName(process.env.CHEERS_PROFILE);
  if (id === 'default') return inspectOwned(input);
  const profile = createProfileContext({ name: id, mode: 'existing', env: process.env });
  return withProfile(profile, () => inspectOwned(input));
}

async function inspectOwned(input: Input): Promise<object> {
  if (!fs.statSync(process.env.USERPROFILE!).isDirectory()) throw new Error();
  const source = getUserRuntimeConfigPath();
  const edit = readRuntimeConfigEditAt(source);
  const storage = configEditStorage(edit);
  const present = fs.existsSync(source) || fs.existsSync(getUserAuthPath());
  const workspace = path.resolve(input.workspace);
  const config = getRuntimeConfig(workspace);
  if (!config.configValidation.valid) throw new Error();
  const resolution = resolveProviderCredential({ runtimeConfig: config, env: process.env });
  const catalog = loadCatalog();
  const baseUrl = providerCredentialBaseUrl(catalog, resolution);
  const publication = capturePublication(config, catalog);
  const credential = resolution.credential;
  const current = (): void => {
    if (getUserRuntimeConfigPath() !== source) throw new Error();
    const latest = readRuntimeConfigEditAt(source);
    if (latest.revision !== edit.revision || JSON.stringify(configEditStorage(latest)) !== JSON.stringify(storage)) throw new Error();
    configEditStorage(edit);
    if (capturePublication(getRuntimeConfig(workspace), loadCatalog()) !== publication) throw new Error();
  };
  current();
  if (input.operation === 'baseline') {
    if (resolution.blocked || resolution.provider !== 'openai-compatible' || credential?.authMode !== 'api-key'
      || !credential.apiKey || !baseUrl || baseUrl.replace(/\/+$/, '') !== input.expectedBaseUrl?.replace(/\/+$/, '')
      || !resolution.model || resolution.model !== input.expectedModel) {
      return { ok: false, status: 'config-failure', reason: 'The resolved provider, endpoint, model or credential differs from the requested baseline.' };
    }
    current();
    return baseline(baseUrl, resolution.model, credential.apiKey, config, current);
  }
  return { ok: true, present, provider: resolution.provider, activeConnectionId: config.activeProviderConnectionId ?? null,
    credentialSource: credential?.source ?? 'missing', authMode: credential?.authMode ?? 'none',
    hasCredential: Boolean(credential?.apiKey || credential?.accountAuth?.accessToken),
    endpointPresent: Boolean(baseUrl), modelPresent: Boolean(resolution.model), requiresModel: needsUserEndpoint(resolution.provider),
    blocked: Boolean(resolution.blocked) };
}

/** Missing legacy timestamps are generated per read; physical revisions still fence saved fields. */
function capturePublication(config: ReturnType<typeof getRuntimeConfig>, catalog: ReturnType<typeof loadCatalog>): string {
  return JSON.stringify({ config: { ...config, providerConnections: config.providerConnections.map(
    ({ createdAt, updatedAt, ...connection }) => connection) }, catalog });
}

/** Credentials stay in this process; only status and body presence cross the bridge. */
async function baseline(baseUrl: string, model: string, apiKey: string, config: Parameters<typeof providerFetchFor>[0], current: () => void): Promise<object> {
  let response: Response;
  try {
    response = await providerFetchFor(config)(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { 'content-type': 'application/json', ...providerAuthorization({ apiKey, endpoint: 'openai-compatible' }).headers },
      body: JSON.stringify({ model, stream: true, messages: [{ role: 'user', content: 'hello / 你是什么模型' }] }),
    });
  } catch { return { ok: false, status: 'provider-network-inconclusive', reason: 'The baseline request did not return an HTTP response.' }; }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return { ok: false, status: 'config-failure', httpStatus: response.status, reason: 'The baseline endpoint refused the request.' };
  }
  const reader = response.body?.getReader();
  let responseBodyPresent = false;
  try {
    while (reader) {
      const chunk = await reader.read();
      if (chunk.done) break;
      responseBodyPresent ||= Boolean(chunk.value.byteLength);
    }
  }
  catch { return { ok: false, status: 'provider-network-inconclusive', reason: 'The baseline response stream did not complete.' }; }
  finally { await reader?.cancel().catch(() => undefined); }
  current();
  return { ok: true, status: 'pass', httpStatus: response.status, responseBodyPresent };
}

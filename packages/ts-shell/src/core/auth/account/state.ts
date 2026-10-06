import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_FIELDS, getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt,
  type AccountAuthConfig, type RuntimeConfig, type RuntimeConfigFile } from '../../../config/runtimeConfig.js';
import { persistConfigEdit, type ConfigEdit } from '../../../config/persistence.js';
import { ConfigWriteError } from '../../../config/outcome.js';
import { normalizeConnectionId, sameValue } from '../../../config/values.js';
import { resolveProviderCredential, type ProviderCredentialResolution } from '../../shell/providerCredentials.js';
import { accountAuthKey } from '../../providers/facts.js';
import { identifyProject } from '../../security/trust/identity.js';
import { freezeDeep } from '../../values/freeze.js';

interface Snapshot {
  readonly source: string;
  readonly edit: ConfigEdit<RuntimeConfigFile>;
  readonly config: RuntimeConfig;
  readonly resolution: ProviderCredentialResolution;
}

export interface AccountEdit {
  readonly workspaceRoot: string;
  readonly snapshot: Snapshot;
  readonly resolution: ProviderCredentialResolution;
  readonly mirror: boolean;
}

function authority(source: string, target: string): boolean {
  try { return path.resolve(getUserRuntimeConfigPath()) === source && fs.realpathSync(source) === target; }
  catch { return false; }
}

function snapshot(workspaceRoot: string, selected: ProviderCredentialResolution): Snapshot {
  const source = path.resolve(getUserRuntimeConfigPath());
  const edit = readRuntimeConfigEditAt(fs.realpathSync(source));
  const config = getRuntimeConfig(workspaceRoot);
  if (!config.configValidation.valid || !authority(source, edit.path) || readRuntimeConfigEditAt(edit.path).revision !== edit.revision) {
    throw new ConfigWriteError('conflict', 'unchanged');
  }
  const resolution = resolveProviderCredential({ runtimeConfig: config,
    cliProvider: selected.selection?.provider, cliBaseUrl: selected.selection?.baseUrl });
  return { source, edit, config, resolution };
}

function identity(resolution: ProviderCredentialResolution): object {
  const credential = resolution.credential;
  return { provider: resolution.provider, connectionId: credential?.connectionId,
    source: credential?.source, authMode: credential?.authMode, apiKey: credential?.apiKey,
    accountAuth: credential?.accountAuth, baseUrl: resolution.baseUrl ?? credential?.baseUrl };
}

/** Model preference edits are not account identity; fallback ordering and auth are. */
function selectors(value: Readonly<RuntimeConfigFile>, provider: ProviderCredentialResolution['provider']): object {
  const profile = value.providerCredentials?.[provider];
  const { model: _model, thinkingEffort: _effort, ...credential } = profile ?? {};
  return { provider: value.provider, active: normalizeConnectionId(value.activeProviderConnectionId), credential,
    topology: value.providerConnections?.map(connection => ({ id: normalizeConnectionId(connection.id), provider: connection.provider })),
    connections: value.providerConnections?.filter(connection => connection.provider === provider).map(connection => {
      const { model, thinkingEffort, label, ...binding } = connection;
      return binding;
    }) };
}

export function sameAccountIdentity(before: AccountAuthConfig, after: AccountAuthConfig): boolean {
  const { accessToken: _a, refreshToken: _r, expiresAt: _e, ...first } = before;
  const { accessToken: _b, refreshToken: _s, expiresAt: _f, ...second } = after;
  return sameValue(first, second);
}

/** Capture the actual source before spending its refresh token. */
export function captureAccountEdit(workspaceRoot: string, resolution: ProviderCredentialResolution): AccountEdit {
  const root = identifyProject(workspaceRoot);
  const current = snapshot(root, resolution);
  const credential = resolution.credential;
  const slot = accountAuthKey(resolution.provider);
  const selectedId = credential?.connectionId ?? normalizeConnectionId(current.config.activeProviderConnectionId);
  if (!slot || !credential?.accountAuth || (credential.source !== 'connection' && credential.source !== 'config')
    || (credential.source === 'connection' && !credential.connectionId)
    || (selectedId && current.config.providerConnections.filter(connection => connection.id === selectedId).length > 1)
    || !sameValue(identity(current.resolution), identity(resolution))) {
    throw new ConfigWriteError('conflict', 'unchanged');
  }
  const mirror = credential.source === 'connection'
    && sameValue(current.config.providerCredentials[resolution.provider]?.accountAuth?.[slot], credential.accountAuth);
  return freezeDeep({ workspaceRoot: root, snapshot: current, resolution: structuredClone(resolution), mirror });
}

function rotatedAuth(original: AccountAuthConfig | undefined, accountAuth: AccountAuthConfig): AccountAuthConfig {
  if (!original) throw new ConfigWriteError('conflict', 'unchanged');
  return { ...original, accessToken: accountAuth.accessToken, refreshToken: accountAuth.refreshToken, expiresAt: accountAuth.expiresAt };
}

function rotated(edit: AccountEdit, accountAuth: AccountAuthConfig): RuntimeConfigFile {
  const before = edit.snapshot.edit.values;
  const { provider, credential } = edit.resolution;
  const slot = accountAuthKey(provider)!;
  const profile = before.providerCredentials?.[provider];
  const connections = credential?.source === 'connection' ? before.providerConnections?.map(connection =>
    connection.provider === provider && normalizeConnectionId(connection.id) === credential.connectionId
      ? { ...connection, accountAuth: { ...connection.accountAuth, [slot]: rotatedAuth(connection.accountAuth?.[slot], accountAuth) } } : connection) : before.providerConnections;
  return { ...before,
    ...(connections ? { providerConnections: connections } : {}),
    ...(credential?.source === 'config' || edit.mirror ? { providerCredentials: { ...before.providerCredentials,
      [provider]: { ...profile, accountAuth: { ...profile?.accountAuth, [slot]: rotatedAuth(profile?.accountAuth?.[slot], accountAuth) } } } } : {}),
  };
}

/** Save only the captured owner and an exact-identity mirror, then verify its use. */
export function persistAccountEdit(edit: AccountEdit, accountAuth: AccountAuthConfig): { accountAuth: AccountAuthConfig; writeState: 'unchanged' | 'persisted' } {
  const { resolution, snapshot: captured } = edit;
  const original = resolution.credential?.accountAuth;
  if (!original || !sameAccountIdentity(original, accountAuth)) throw new ConfigWriteError('conflict', 'unchanged');
  const expected = { ...resolution, credential: { ...resolution.credential!, accountAuth } };
  const current = snapshot(edit.workspaceRoot, resolution);
  if (current.source !== captured.source || current.edit.path !== captured.edit.path
    || (!sameValue(identity(current.resolution), identity(resolution)) && !sameValue(identity(current.resolution), identity(expected)))) {
    throw new ConfigWriteError('conflict', 'unchanged');
  }
  const desired = rotated(edit, accountAuth);
  let writeState: 'unchanged' | 'persisted' = 'unchanged';
  persistConfigEdit(captured.edit.path, desired, captured.edit, CONFIG_FIELDS, locked => {
    const alreadySaved = sameValue(selectors(locked, resolution.provider), selectors(desired, resolution.provider));
    writeState = alreadySaved ? 'unchanged' : 'persisted';
    return authority(captured.source, captured.edit.path)
      && (alreadySaved || sameValue(selectors(locked, resolution.provider), selectors(captured.edit.values, resolution.provider)));
  });
  try {
    const saved = snapshot(edit.workspaceRoot, resolution);
    if (saved.source !== captured.source || saved.edit.path !== captured.edit.path
      || !sameValue(selectors(saved.edit.values, resolution.provider), selectors(desired, resolution.provider))
      || !sameValue(identity(saved.resolution), identity(expected))) throw new Error('mismatch');
    return { accountAuth: saved.resolution.credential!.accountAuth!, writeState };
  } catch { throw new ConfigWriteError('verification-failed', writeState); }
}

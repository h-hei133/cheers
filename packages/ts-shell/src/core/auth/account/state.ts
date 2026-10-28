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
import type { AccountRotation } from './contract.js';
import { accountGeneration, credentialDigest } from './lineage.js';
import type { RefreshBinding } from './lease/model.js';

interface Snapshot {
  readonly source: string;
  readonly edit: ConfigEdit<RuntimeConfigFile>;
  readonly config: RuntimeConfig;
  readonly resolution: ProviderCredentialResolution;
}

export interface AccountEdit {
  readonly workspaceRoot: string;
  readonly sessionId?: string;
  readonly snapshot: Snapshot;
  readonly resolution: ProviderCredentialResolution;
  readonly mirror: boolean;
}

function authority(source: string, target: string): boolean {
  try { return path.resolve(getUserRuntimeConfigPath()) === source && fs.realpathSync(source) === target; }
  catch { return false; }
}

function snapshot(workspaceRoot: string, selected: ProviderCredentialResolution, sessionId?: string): Snapshot {
  const source = path.resolve(getUserRuntimeConfigPath());
  const edit = readRuntimeConfigEditAt(fs.realpathSync(source));
  const config = getRuntimeConfig(workspaceRoot);
  if (!config.configValidation.valid || !authority(source, edit.path) || readRuntimeConfigEditAt(edit.path).revision !== edit.revision) {
    throw new ConfigWriteError('conflict', 'unchanged');
  }
  const selectedId = selected.selection?.connectionId;
  const target = selected.selection?.credentialScope === 'provider'
    ? { ...config, provider: selected.provider, activeProviderConnectionId: undefined,
      sessionConnection: { scope: 'provider' as const, provider: selected.provider } }
    : selectedId ? { ...config, activeProviderConnectionId: selectedId,
    sessionConnection: { id: selectedId, provider: selected.provider } } : config;
  const resolution = resolveProviderCredential({ runtimeConfig: target,
    cliProvider: selected.selection?.provider, cliBaseUrl: selected.selection?.baseUrl,
    ...(sessionId ? { pool: { sessionId } } : {}) });
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
export function captureAccountEdit(workspaceRoot: string, resolution: ProviderCredentialResolution, sessionId?: string): AccountEdit {
  const root = identifyProject(workspaceRoot);
  const current = snapshot(root, resolution, sessionId);
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
  return freezeDeep({ workspaceRoot: root, ...(sessionId ? { sessionId } : {}), snapshot: current,
    resolution: structuredClone(resolution), mirror });
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

/** Storage ownership excludes rotating fields, while generation includes the complete credential. */
export function accountBinding(edit: AccountEdit, accountAuth = edit.resolution.credential!.accountAuth!): RefreshBinding {
  const { resolution, snapshot: captured } = edit;
  const { accessToken: _access, refreshToken: _refresh, expiresAt: _expiry, ...metadata } = accountAuth;
  const expected = { ...resolution, credential: { ...resolution.credential!, accountAuth } };
  return { owner: credentialDigest([captured.source, captured.edit.path, resolution.provider, resolution.credential?.source,
    resolution.credential?.connectionId, edit.mirror, resolution.baseUrl ?? resolution.credential?.baseUrl, metadata]),
    generation: accountGeneration(accountAuth),
    storage: credentialDigest([selectors(rotated(edit, accountAuth), resolution.provider), identity(expected)]) };
}

/** A peer's saved rotation must still belong to the exact captured owner. */
export function readAccountRotation(edit: AccountEdit): AccountAuthConfig | undefined {
  return readAccountRotationReceipt(edit)?.accountAuth;
}

export function readAccountRotationReceipt(edit: AccountEdit): AccountRotation | undefined {
  const current = snapshot(edit.workspaceRoot, edit.resolution, edit.sessionId);
  const original = edit.resolution.credential?.accountAuth;
  const accountAuth = current.resolution.credential?.accountAuth;
  if (!current.edit.revision || !edit.snapshot.edit.revision || !original || !accountAuth || sameValue(original, accountAuth) || accountAuth.expiresAt <= Date.now()
    || !sameAccountIdentity(original, accountAuth)) return undefined;
  const expected = { ...edit.resolution, credential: { ...edit.resolution.credential!, accountAuth } };
  if (current.source !== edit.snapshot.source || current.edit.path !== edit.snapshot.edit.path
    || !sameValue(identity(current.resolution), identity(expected))
    || !sameValue(selectors(current.edit.values, edit.resolution.provider), selectors(rotated(edit, accountAuth), edit.resolution.provider))) return undefined;
  return { resolution: edit.resolution, accountAuth, storage: { source: current.source, path: current.edit.path,
    previousRevision: edit.snapshot.edit.revision, revision: current.edit.revision } };
}

/** Save only the captured owner and an exact-identity mirror, then verify its use. */
export function persistAccountEdit(edit: AccountEdit, accountAuth: AccountAuthConfig): { accountAuth: AccountAuthConfig; writeState: 'unchanged' | 'persisted' } {
  const { resolution, snapshot: captured } = edit;
  const original = resolution.credential?.accountAuth;
  if (!original || !sameAccountIdentity(original, accountAuth)) throw new ConfigWriteError('conflict', 'unchanged');
  const expected = { ...resolution, credential: { ...resolution.credential!, accountAuth } };
  const current = snapshot(edit.workspaceRoot, resolution, edit.sessionId);
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
    const saved = snapshot(edit.workspaceRoot, resolution, edit.sessionId);
    if (saved.source !== captured.source || saved.edit.path !== captured.edit.path
      || !sameValue(selectors(saved.edit.values, resolution.provider), selectors(desired, resolution.provider))
      || !sameValue(identity(saved.resolution), identity(expected))) throw new Error('mismatch');
    return { accountAuth: saved.resolution.credential!.accountAuth!, writeState };
  } catch { throw new ConfigWriteError('verification-failed', writeState); }
}

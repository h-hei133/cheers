import { CONFIG_FIELDS, type RuntimeConfig } from '../../config/runtimeConfig.js';
import { projectAccepted, type ConfigPublication } from '../../config/state.js';
import { sameValue } from '../../config/values.js';
import type { AccountRotation, AccountPublication } from '../../core/auth/account/contract.js';
import { sameAccountIdentity } from '../../core/auth/account/state.js';
import { accountAuthKey } from '../../core/providers/facts.js';
import { schemaChildren, type ConfigOrigin } from '../../config/provenance/model.js';
import type { ConfigFileOrigin } from '../../config/provenance/files.js';
import { projectAccountAuth } from '../../core/auth/account/projection.js';

function fileAfter(file: ConfigFileOrigin, rotation: AccountRotation): ConfigFileOrigin {
  const { storage } = rotation;
  if (storage.documents) {
    const document = storage.documents.find(item => file.source === 'user' && (file.path === item.source || file.path === item.path)
      && file.revision === item.previousRevision);
    return document?.revision ? { ...file, revision: document.revision } : file;
  }
  return file.source === 'user' && (file.path === storage.source || file.path === storage.path)
    && file.revision === storage.previousRevision ? { ...file, revision: storage.revision } : file;
}

function originAfter(node: ConfigOrigin, rotation: AccountRotation, path: readonly string[], tokens: readonly string[]): ConfigOrigin {
  const token = tokens.includes(path.join('.'));
  const { environmentReference, ...base } = node;
  return { ...base, ...(!token && environmentReference !== undefined ? { environmentReference } : {}),
    ...Object.fromEntries(['files', 'shadowedFiles', 'rejectedFiles'].flatMap(key => {
      const files = node[key as 'files'];
      return files ? [[key, files.map(file => fileAfter(file, rotation))]] : [];
    })),
    ...(node.children ? { children: Object.fromEntries(Object.entries(node.children).map(([key, child]) =>
      [key, originAfter(child, rotation, [...path, key], tokens)])) } : {}),
  };
}

function rotated(config: RuntimeConfig, rotation: AccountRotation): RuntimeConfig {
  const { provider, credential } = rotation.resolution;
  const slot = accountAuthKey(provider)!;
  const profile = config.providerCredentials[provider];
  const mirrored = sameValue(profile?.accountAuth?.[slot], credential?.accountAuth);
  const connection = config.providerConnections.findIndex(item => item.id === credential?.connectionId && item.provider === provider);
  const profileKey = schemaChildren(config.providerCredentials, CONFIG_FIELDS.providerCredentials.schema).find(child => child.value === profile)?.key;
  const roots = [...(credential?.source === 'connection' && connection >= 0 ? [`providerConnections.${connection}`] : []),
    ...(credential?.source === 'config' || mirrored ? [`providerCredentials.${profileKey}`] : [])];
  const tokens = roots.flatMap(root => ['accessToken', 'refreshToken'].map(key => `${root}.accountAuth.${slot}.${key}`));
  return { ...projectAccountAuth(config, rotation.resolution, rotation.accountAuth),
    configProvenance: Object.fromEntries(Object.entries(config.configProvenance).map(([key, node]) => [key, originAfter(node, rotation, [key], tokens)])),
    ...(config.configScopes ? { configScopes: { ...config.configScopes, layers: config.configScopes.layers.map(layer => ({ ...layer,
      ...(layer.file ? { file: fileAfter(layer.file, rotation) } : {}),
      origins: Object.fromEntries(Object.entries(layer.origins).map(([key, node]) => [key, originAfter(node, rotation, [key], tokens)])),
      rules: layer.rules.map(rule => ({ ...rule, origins: Object.fromEntries(Object.entries(rule.origins)
        .map(([key, node]) => [key, originAfter(node, rotation, [key], [])])) })),
    })) } } : {}),
  };
}

/** Accept only the verified owner's token fields; all other publication content is fixed. */
export function accountPublicationMatches(before: ConfigPublication, after: ConfigPublication, rotation: AccountRotation): boolean {
  const original = rotation.resolution.credential?.accountAuth;
  if (!original || !accountAuthKey(rotation.resolution.provider) || !sameAccountIdentity(original, rotation.accountAuth)
    || sameValue(original, rotation.accountAuth) || rotation.accountAuth.expiresAt <= Date.now()
    || after.admissionBlocked || after.revision !== before.revision + 1) return false;
  const requested = rotated(before.requested, rotation);
  return sameValue({ ...before, revision: after.revision, config: projectAccepted(before.config, rotated(before.config, rotation)), requested }, after);
}

/** An observer can adopt the receipt, but cannot prevent or repeat its publication. */
export function publishAccountRotation(rotation: AccountRotation | undefined, publish: () => boolean | void,
  observer?: AccountPublication): void {
  let outcome: { value: boolean | void } | { error: unknown } | undefined;
  const once = () => {
    if (!outcome) {
      try { outcome = { value: publish() }; }
      catch (error) { outcome = { error }; }
    }
    if ('error' in outcome) throw outcome.error;
    return outcome.value;
  };
  if (observer) {
    try { observer(rotation, once); }
    catch { /* Observer failure cannot prevent the main request's publication. */ }
  }
  once();
}

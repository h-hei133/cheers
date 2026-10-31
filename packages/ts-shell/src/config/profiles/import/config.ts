import path from 'node:path';
import { CONFIG_FIELDS, type ProviderConnectionConfig, type ProviderCredentialConfig, type RuntimeConfigFile, type RuntimeProvider } from '../../runtimeConfig.js';
import { parseConfigText } from '../../syntax.js';
import { serializeConfigDocument } from '../../document.js';
import type { PathRule } from '../../scope/contract.js';

/** Reject credential-bearing URL forms without reporting the input. */
export function nonsecretUrl(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new Error('Imported endpoint requires an explicit HTTP URL.'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /\$\{|[\x00-\x20]/.test(value)) {
    throw new Error('Imported endpoint contains unsupported or secret-bearing URL components.');
  }
  return value;
}

/** Validate raw declared values without resolving any source environment references. */
export function importConfig(text: string, sourcePath: string, auth?: { readonly content: string; readonly path: string }): string {
  if (!path.isAbsolute(sourcePath)) throw new Error('Imported configuration requires its captured source path.');
  const settings = parseConfigText(text);
  const credentials = auth ? parseConfigText(auth.content) : {};
  if (auth && !path.isAbsolute(auth.path)) throw new Error('Imported configuration requires its captured source path.');
  for (const document of [settings, credentials]) {
    for (const [name, value] of Object.entries(document)) {
      const field = Object.hasOwn(CONFIG_FIELDS, name) ? CONFIG_FIELDS[name as keyof typeof CONFIG_FIELDS] : undefined;
      if (field?.sources.includes('user') && !field.validate(value)) throw new Error('Imported configuration contains an invalid declared field.');
    }
  }
  const raw = { ...settings, ...credentials };
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    const field = Object.hasOwn(CONFIG_FIELDS, name) ? CONFIG_FIELDS[name as keyof typeof CONFIG_FIELDS] : undefined;
    if (!field || !field.sources.includes('user')) continue;
    if (!field.validate(value)) throw new Error('Imported configuration contains an invalid declared field.');
    if (name === 'providerCredentials') continue;
    // Moving a declaration must not retarget its restrictions to the new profile.
    result[name] = name === 'pathRules'
      ? (value as readonly PathRule[]).map(rule => ({ ...rule, path: path.resolve(path.dirname(auth && Object.hasOwn(credentials, name) ? auth.path : sourcePath), rule.path) }))
      : value;
  }
  const connections = [...(result.providerConnections as ProviderConnectionConfig[] | undefined ?? [])];
  for (const [provider, value] of Object.entries(raw.providerCredentials as Record<string, ProviderCredentialConfig> | undefined ?? {})) {
    if (connections.some(item => item.provider === provider)) continue;
    connections.push({ ...value, id: `import-${provider}`, provider: provider as RuntimeProvider, authType: 'api-key', createdAt: '', updatedAt: '' });
  }
  if (typeof result.provider === 'string' && !connections.some(item => item.provider === result.provider)) {
    connections.push({ id: `import-${result.provider}`, provider: result.provider as RuntimeProvider, authType: 'api-key', createdAt: '', updatedAt: '' });
  }
  if (connections.length) result.providerConnections = connections;
  if (result.providerConnections) {
    if (new Set(connections.map(item => item.id)).size !== connections.length) throw new Error('Imported connection identities are ambiguous.');
    result.providerConnections = connections.map(item => ({ id: item.id, provider: item.provider, authType: item.authType ?? 'api-key', status: 'pending',
      ...(item.label ? { label: item.label } : {}), ...(item.baseUrl ? { baseUrl: nonsecretUrl(item.baseUrl) } : {}),
      ...(item.model ? { model: item.model } : {}), ...(item.thinkingEffort !== undefined ? { thinkingEffort: item.thinkingEffort } : {}),
      ...(item.serviceTier ? { serviceTier: item.serviceTier } : {}),
      ...(item.createdAt ? { createdAt: item.createdAt } : {}), ...(item.updatedAt ? { updatedAt: item.updatedAt } : {}) }));
  }
  if (typeof result.activeProviderConnectionId === 'string' && !(result.providerConnections as ProviderConnectionConfig[] | undefined)?.some(item => item.id === result.activeProviderConnectionId)) {
    delete result.activeProviderConnectionId;
  }
  if (result.accountPool) {
    result.accountPool = Object.fromEntries(Object.entries(result.accountPool as NonNullable<RuntimeConfigFile['accountPool']>).map(([provider, pool]) =>
      [provider, { connections: pool.connections, ...(pool.baseUrl ? { baseUrl: nonsecretUrl(pool.baseUrl) } : {}) }]));
  }
  return serializeConfigDocument(result) + '\n';
}

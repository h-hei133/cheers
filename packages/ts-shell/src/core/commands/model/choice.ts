import { createHash } from 'node:crypto';
import type { CommandContext } from '../types.js';
import { readFreshConfiguration } from '../configuration.js';
import { getUserRuntimeConfigPath, type RuntimeConfig } from '../../../config/runtimeConfig.js';
import { readSessionModelEdit } from '../../../session/model/state.js';
import { projectSessionModel } from '../../../session/model/projection.js';
import { loadCatalog, loadCatalogSnapshot } from '../../models/catalogStore.js';
import { captureProfileIdentity } from '../../paths/profile/context.js';
import { getProviderApiKeyEnvVarName } from '../../shell/providerCredentials.js';
import { connectionSnapshot } from './identity.js';

/** A displayed choice remains bound to its session, profile and accepted inputs. */
export function captureModelChoice(context: CommandContext) {
  const publication = context.readConfiguration?.();
  const fresh = readFreshConfiguration(context);
  const config = publication?.config ?? context.runtimeConfig ?? projectSessionModel(fresh, context.sessionId);
  const diskCatalog = loadCatalogSnapshot();
  const catalog = publication?.catalog ?? diskCatalog.providers;
  const catalogDiagnostics = publication ? publication.catalogDiagnostics ?? [] : diskCatalog.diagnostics;
  const baseline = context.sessionId ? readSessionModelEdit(context.sessionId) : undefined;
  const identity = fingerprint({ path: getUserRuntimeConfigPath(), profile: captureProfileIdentity(),
    session: context.sessionId, root: context.projectRoot ?? context.cwd, baseline,
    fresh: configIdentity(fresh), accepted: configIdentity(config), catalog, diskCatalog: diskCatalog.providers,
    binding: publication?.binding, revision: publication?.revision, env: credentialEnvironment(config) });
  return { config, catalog, catalogDiagnostics, baseline, admission: (): string | undefined => {
    try {
      if (context.admission?.()) return 'Model selection expired. Reopen the model picker.';
      const current = context.readConfiguration?.();
      const fresh = readFreshConfiguration(context);
      const config = current?.config ?? context.runtimeConfig ?? projectSessionModel(fresh, context.sessionId);
      const next = fingerprint({ path: getUserRuntimeConfigPath(), profile: captureProfileIdentity(),
        session: context.sessionId, root: context.projectRoot ?? context.cwd,
        baseline: context.sessionId ? readSessionModelEdit(context.sessionId) : undefined,
        fresh: configIdentity(fresh), accepted: configIdentity(config), catalog: current?.catalog ?? loadCatalog(), diskCatalog: loadCatalog(),
        binding: current?.binding, revision: current?.revision, env: credentialEnvironment(config) });
      return identity === next ? undefined : 'Model selection expired. Reopen the model picker.';
    } catch { return 'Model selection expired. Reopen the model picker.'; }
  } };
}

function configIdentity(config: RuntimeConfig) {
  return { ...config, providerConnections: connectionSnapshot(config.providerConnections) };
}

function credentialEnvironment(config: RuntimeConfig) {
  const providers = new Set([config.provider, ...config.providerConnections.map(connection => connection.provider)]);
  return [...providers].map(provider => [provider, process.env[getProviderApiKeyEnvVarName(provider)]]);
}

/** The captured comparison token cannot expose configuration credentials. */
function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

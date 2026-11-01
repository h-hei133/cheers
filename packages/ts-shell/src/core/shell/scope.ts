import type { ShellRuntimeContext } from './runtimeContext.js';
import { configurationAdmission, ConfigurationRefusalError, configurationRefusalCauses } from './configuration.js';
import { scopedRuntimeConfig } from '../../config/scope/projection.js';
import { constrainRuntimeConfig } from '../../config/constraints.js';
import { resolveProviderCredential } from './providerCredentials.js';

/** One explicit operation value; inspecting another path never changes the installation. */
export function configurationOperation(context: Pick<ShellRuntimeContext, 'configuration' | 'projectRoot' | 'cwd' | 'session'> &
  Partial<Pick<ShellRuntimeContext, 'profile' | 'resolveConfigTarget' | 'runtimeConfig' | 'workspaceRevision' | 'workspaceIssue' | 'workspaceAdmission' | 'runtimeConfigOverrides'>>) {
  const publication = context.configuration.current;
  const admission = configurationAdmission(context);
  const refused = admission();
  // A refusal caused by the configuration itself is the one case where nobody
  // can recover by trying again: the same values will be refused the same way.
  // It travels as a typed error so the startup boundary can print the causes
  // rather than a stack trace ending in this line.
  if (refused) throw publication.admissionBlocked ? new ConfigurationRefusalError(configurationRefusalCauses(publication)) : new Error(refused);
  let config = scopedRuntimeConfig(publication.config, context.cwd);
  if (config !== publication.config) {
    const target = context.resolveConfigTarget?.(config, context.session.id)
      ?? resolveProviderCredential({ runtimeConfig: config, pool: { sessionId: context.session.id } });
    config = constrainRuntimeConfig(config, target, publication.catalog);
    if (!config.configValidation.valid) throw new ConfigurationRefusalError(configurationRefusalCauses({ ...publication, diagnostics: config.configDiagnostics }));
  }
  return { publication, config, admission, identity: Object.freeze({
    profile: context.profile?.root ?? config.configScopes?.home,
    sessionId: context.session.id, workspaceRoot: publication.binding.workspaceRoot,
    publication: publication.revision, trustRevision: publication.binding.trustRevision,
    ruleRevision: config.configScopes?.revision, scopePath: context.cwd,
  }) };
}

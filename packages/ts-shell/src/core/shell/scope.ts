import type { ShellRuntimeContext } from './runtimeContext.js';
import { configurationAdmission } from './configuration.js';
import { scopedRuntimeConfig } from '../../config/scope/projection.js';
import { constrainRuntimeConfig } from '../../config/constraints.js';
import { resolveProviderCredential } from './providerCredentials.js';

/** One explicit operation value; inspecting another path never changes the installation. */
export function configurationOperation(context: Pick<ShellRuntimeContext, 'configuration' | 'projectRoot' | 'cwd' | 'session'> &
  Partial<Pick<ShellRuntimeContext, 'profile' | 'resolveConfigTarget' | 'runtimeConfig' | 'workspaceRevision' | 'workspaceIssue' | 'workspaceAdmission' | 'runtimeConfigOverrides'>>) {
  const publication = context.configuration.current;
  const admission = configurationAdmission(context);
  const refused = admission();
  if (refused) throw new Error(refused);
  let config = scopedRuntimeConfig(publication.config, context.cwd);
  if (config !== publication.config) {
    const target = context.resolveConfigTarget?.(config) ?? resolveProviderCredential({ runtimeConfig: config });
    config = constrainRuntimeConfig(config, target, publication.catalog);
    if (!config.configValidation.valid) throw new Error('Configuration scope settings do not satisfy the selected model limits. Inspect Settings and reload a valid rule.');
  }
  return { publication, config, admission, identity: Object.freeze({
    profile: context.profile?.root ?? config.configScopes?.home,
    sessionId: context.session.id, workspaceRoot: publication.binding.workspaceRoot,
    publication: publication.revision, trustRevision: publication.binding.trustRevision,
    ruleRevision: config.configScopes?.revision, scopePath: context.cwd,
  }) };
}

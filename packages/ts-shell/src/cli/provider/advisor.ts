import { createHash } from 'node:crypto';
import type { AdvisorTarget } from '../../advisor/model.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertScopedModel } from '../../config/scope/projection.js';
import { credentialIdentityFor } from '../../core/auth/account/pool.js';
import { catalogBaseUrl, catalogModel, providerEndpoint, type CatalogProvider } from '../../core/models/catalog.js';
import { effortCapability } from '../../core/models/capability.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import { delegatedTarget } from './target.js';

/** Resolve without sending; both dispatch and publication recheck this captured identity. */
export function resolveAdvisorSelection(input: {
  readonly target?: string;
  readonly config: RuntimeConfig;
  readonly catalog: readonly CatalogProvider[];
  readonly main: ProviderCredentialResolution;
  readonly revision: string;
}): AdvisorTarget {
  const role = input.target ? undefined : input.config.sessionModelRoles?.advisor;
  const target = input.target ?? role;
  if (!target) throw new Error('Advisor role is unavailable.');
  const selected = delegatedTarget(target, input.main, input.config);
  assertScopedModel(input.config, selected);
  if (selected.provider === input.main.provider && selected.model === input.main.model) throw new Error('Advisor requires an independent model.');
  const model = catalogModel(input.catalog, selected.provider, selected.model!, catalogBaseUrl(input.catalog, selected.provider, selected.baseUrl));
  if (role && (!model || effortCapability(input.catalog, role.provider, role.model, role.thinkingEffort ?? null, selected.baseUrl) === 'unsupported')) {
    throw new Error('Advisor role model or effort is unavailable.');
  }
  const identity = createHash('sha256').update(JSON.stringify([input.revision, target, selected.provider, selected.model,
    catalogBaseUrl(input.catalog, selected.provider, selected.baseUrl), credentialIdentityFor(selected.provider, selected.credential), model, providerEndpoint(input.catalog, selected.provider, selected.baseUrl)])).digest('hex');
  return { identity, label: input.target ?? `${role!.connectionId}/${role!.model}${role!.thinkingEffort ? `@${role!.thinkingEffort}` : ''}`,
    ...(input.target ? { model: input.target } : { modelRole: { name: 'advisor', identity: JSON.stringify(role) } }) };
}

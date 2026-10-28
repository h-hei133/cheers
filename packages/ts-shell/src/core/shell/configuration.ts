import { ConfigState, type ConfigBinding, type ConfigReloadResult } from '../../config/state.js';
import { getRuntimeConfig, type RuntimeConfigOverrides } from '../../config/runtimeConfig.js';
import { projectSessionModel } from '../../session/model/projection.js';
import { prepareThemeSelection } from '../../presentation/theme/selection.js';
import { projectTrust } from '../security/projectTrust.js';
import { identifyProject } from '../security/trust/identity.js';
import { configTrustMatches } from '../../config/trust.js';
import { constrainRuntimeConfig, type ConfigModelTarget } from '../../config/constraints.js';
import { loadCatalog } from '../models/catalogStore.js';
import type { CatalogProvider } from '../models/catalog.js';
import { resolveProviderCredential } from './providerCredentials.js';
import type { RuntimeConfig } from '../../config/runtimeConfig.js';
import { assertCurrentProfile, type ProfileContext } from '../paths/profile/context.js';
import { ConfigInputError } from '../../config/inputs/model.js';
import { scopeAdmission } from '../../config/scope/admission.js';

interface ConfigurationContext {
  readonly profile?: ProfileContext;
  readonly workspaceRevision?: number;
  readonly workspaceIssue?: string;
  readonly workspaceAdmission?: () => string | undefined;
  readonly configuration: ConfigState;
  readonly runtimeConfig?: RuntimeConfig;
  readonly projectRoot: string;
  readonly cwd?: string;
  readonly session: { readonly id: string };
  readonly runtimeConfigOverrides?: RuntimeConfigOverrides;
  readonly resolveConfigTarget?: (config: RuntimeConfig, sessionId?: string) => ConfigModelTarget;
  readonly themePaths?: readonly string[];
}

export function configurationBinding(context: Omit<ConfigurationContext, 'configuration'>): ConfigBinding {
  return { workspaceRoot: identifyProject(context.projectRoot), sessionId: context.session.id,
    trustRevision: projectTrust.revision(), overrides: context.runtimeConfigOverrides ?? {},
    ...(context.runtimeConfig?.configInputs ? { inputs: context.runtimeConfig.configInputs } : {}) };
}

/** Initial values retain the identity used to filter them, including across resume. */
export function initialConfiguration(context: Omit<ConfigurationContext, 'configuration'> & { readonly runtimeConfig: RuntimeConfig }): ConfigState {
  let candidate = context.runtimeConfig;
  if (!candidate.configTrust || !configTrustMatches(candidate.configTrust, context.projectRoot, projectTrust.revision())) {
    candidate = getRuntimeConfig(context.projectRoot, context.runtimeConfigOverrides, candidate.configInputs);
  }
  const binding = { ...configurationBinding(context), workspaceRoot: candidate.configTrust.workspaceRoot,
    trustRevision: candidate.configTrust.revision };
  const catalog = loadCatalog();
  return new ConfigState(validateCandidate(candidate, context, catalog), binding, catalog);
}

function validateCandidate(config: RuntimeConfig, context: Pick<ConfigurationContext, 'session' | 'resolveConfigTarget'>, catalog: readonly CatalogProvider[]): RuntimeConfig {
  const candidate = projectSessionModel(config, context.session.id);
  const target = context.resolveConfigTarget?.(candidate, context.session.id)
    ?? resolveProviderCredential({ runtimeConfig: candidate, pool: { sessionId: context.session.id } });
  return constrainRuntimeConfig(candidate, target, catalog);
}

/** Ordinary settings stay pinned; safety revocation and substrate changes do not. */
export function configurationAdmission(context: ConfigurationContext): () => string | undefined {
  try { if (context.profile) assertCurrentProfile(context.profile); }
  catch { return () => 'Profile storage or identity changed; restart in the owning profile before starting new actions.'; }
  const binding = configurationBinding(context);
  const substrate = context.configuration.substrateRevision;
  const workspaceRevision = context.workspaceRevision;
  const scoped = scopeAdmission(context.configuration.current.config.configScopes, context.cwd ?? context.projectRoot);
  return () => {
    if (context.profile) {
      try { assertCurrentProfile(context.profile); }
      catch { return 'Profile storage or identity changed; restart in the owning profile before starting new actions.'; }
    }
    if (context.workspaceIssue) return context.workspaceIssue;
    const scopeBlocked = scoped();
    if (scopeBlocked) return scopeBlocked;
    if (workspaceRevision !== context.workspaceRevision) return 'Workspace roots changed; start a new operation.';
    const workspaceBlocked = context.workspaceAdmission?.();
    if (workspaceBlocked) return workspaceBlocked;
    if (context.configuration.current.admissionBlocked) return 'Configuration safety validation failed; reload a valid configuration before starting new actions.';
    const actual = configurationBinding(context);
    if (context.configuration.current.binding.trustRevision !== actual.trustRevision || context.configuration.current.binding.workspaceRoot !== actual.workspaceRoot) {
      return 'Project trust changed; reload configuration before starting new actions.';
    }
    if (substrate !== context.configuration.substrateRevision || binding.workspaceRoot !== actual.workspaceRoot || binding.sessionId !== actual.sessionId || binding.trustRevision !== actual.trustRevision) {
      return 'Session, workspace or trust changed; start a new operation.';
    }
    return undefined;
  };
}

/** Prepare all fallible resources before publishing the next immutable settings. */
export function refreshConfiguration(context: ConfigurationContext, scope?: 'catalog'): ConfigReloadResult {
  const state = context.configuration;
  const ticket = state.begin(configurationBinding(context));
  const catalog = loadCatalog();
  if (scope === 'catalog') {
    const refusal = configurationAdmission(context)();
    if (refusal) return state.rejectCandidate(ticket, configurationBinding(context), [refusal], true);
    const accepted = state.current.requested;
    const target = context.resolveConfigTarget?.(accepted, context.session.id)
      ?? resolveProviderCredential({ runtimeConfig: accepted, pool: { sessionId: context.session.id } });
    return state.publish(ticket, constrainRuntimeConfig(accepted, target, catalog), configurationBinding(context), undefined, catalog);
  }
  let candidate: RuntimeConfig;
  try { candidate = validateCandidate(getRuntimeConfig(context.projectRoot, context.runtimeConfigOverrides, ticket.binding.inputs), context, catalog); }
  catch (error) {
    if (!(error instanceof ConfigInputError)) throw error;
    return state.rejectCandidate(ticket, configurationBinding(context), [error.message], error.admissionBlocked);
  }
  const loadedBinding = configurationBinding(context);
  if (!configTrustMatches(candidate.configTrust, loadedBinding.workspaceRoot, loadedBinding.trustRevision)) {
    return state.rejectCandidate(ticket, loadedBinding, ['Project trust or workspace changed while reading configuration; reload again.']);
  }
  if (!candidate.configValidation.valid) return state.publish(ticket, candidate, configurationBinding(context));
  let apply: (() => void) | undefined;
  try { if (candidate.theme) apply = prepareThemeSelection(candidate.theme, context.projectRoot, context.themePaths); }
  catch { return state.rejectCandidate(ticket, configurationBinding(context), ['Configured theme could not be prepared; current settings and theme were retained.']); }
  const actual = configurationBinding(context);
  if (!configTrustMatches(candidate.configTrust, actual.workspaceRoot, actual.trustRevision)) {
    return state.rejectCandidate(ticket, actual, ['Project trust or workspace changed while preparing configuration; reload again.']);
  }
  return state.publish(ticket, candidate, actual, apply, catalog);
}

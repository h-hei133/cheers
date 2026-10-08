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

interface ConfigurationContext {
  readonly workspaceRevision?: number;
  readonly workspaceIssue?: string;
  readonly workspaceAdmission?: () => string | undefined;
  readonly configuration: ConfigState;
  readonly projectRoot: string;
  readonly session: { readonly id: string };
  readonly runtimeConfigOverrides?: RuntimeConfigOverrides;
  readonly resolveConfigTarget?: (config: RuntimeConfig) => ConfigModelTarget;
  readonly themePaths?: readonly string[];
}

export function configurationBinding(context: Omit<ConfigurationContext, 'configuration'>): ConfigBinding {
  return { workspaceRoot: identifyProject(context.projectRoot), sessionId: context.session.id,
    trustRevision: projectTrust.revision(), overrides: context.runtimeConfigOverrides ?? {} };
}

/** Initial values retain the identity used to filter them, including across resume. */
export function initialConfiguration(context: Omit<ConfigurationContext, 'configuration'> & { readonly runtimeConfig: RuntimeConfig }): ConfigState {
  let candidate = context.runtimeConfig;
  if (!candidate.configTrust || !configTrustMatches(candidate.configTrust, context.projectRoot, projectTrust.revision())) {
    candidate = getRuntimeConfig(context.projectRoot, context.runtimeConfigOverrides);
  }
  const binding = { ...configurationBinding(context), workspaceRoot: candidate.configTrust.workspaceRoot,
    trustRevision: candidate.configTrust.revision };
  const catalog = loadCatalog();
  return new ConfigState(validateCandidate(candidate, context, catalog), binding, catalog);
}

function validateCandidate(config: RuntimeConfig, context: Pick<ConfigurationContext, 'session' | 'resolveConfigTarget'>, catalog: readonly CatalogProvider[]): RuntimeConfig {
  const candidate = projectSessionModel(config, context.session.id);
  const target = context.resolveConfigTarget?.(candidate) ?? resolveProviderCredential({ runtimeConfig: candidate });
  return constrainRuntimeConfig(candidate, target, catalog);
}

/** Ordinary settings stay pinned; safety revocation and substrate changes do not. */
export function configurationAdmission(context: ConfigurationContext): () => string | undefined {
  const binding = configurationBinding(context);
  const substrate = context.configuration.substrateRevision;
  const workspaceRevision = context.workspaceRevision;
  return () => {
    if (context.workspaceIssue) return context.workspaceIssue;
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
export function refreshConfiguration(context: ConfigurationContext): ConfigReloadResult {
  const state = context.configuration;
  const ticket = state.begin(configurationBinding(context));
  const catalog = loadCatalog();
  const candidate = validateCandidate(getRuntimeConfig(context.projectRoot, context.runtimeConfigOverrides), context, catalog);
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

import { ConfigState, type ConfigBinding, type ConfigPublication, type ConfigReloadResult } from '../../config/state.js';
import { getRuntimeConfig, type RuntimeConfigOverrides } from '../../config/runtimeConfig.js';
import { projectSessionModel } from '../../session/model/projection.js';
import { prepareThemeSelection } from '../../presentation/theme/selection.js';
import { projectTrust } from '../security/projectTrust.js';
import { identifyProject } from '../security/trust/identity.js';
import { configTrustMatches } from '../../config/trust.js';
import { constrainRuntimeConfig, type ConfigModelTarget } from '../../config/constraints.js';
import { loadCatalogSnapshot } from '../models/catalogStore.js';
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
  const catalog = loadCatalogSnapshot();
  return new ConfigState(validateCandidate(candidate, context, catalog.providers), binding, catalog.providers, catalog.diagnostics);
}

function validateCandidate(config: RuntimeConfig, context: Pick<ConfigurationContext, 'session' | 'resolveConfigTarget'>, catalog: readonly CatalogProvider[]): RuntimeConfig {
  const candidate = projectSessionModel(config, context.session.id);
  const target = context.resolveConfigTarget?.(candidate, context.session.id)
    ?? resolveProviderCredential({ runtimeConfig: candidate, pool: { sessionId: context.session.id } });
  return constrainRuntimeConfig(candidate, target, catalog);
}

/**
 * A configuration refusal that a surface can render instead of a stack trace.
 *
 * Admission refusals travel as plain strings because most of them answer a
 * question about a running operation ("start a new operation"). The one raised
 * while the runtime is still being assembled is different: nobody is running
 * yet, so a caller cannot recover by retrying, and the user needs the causes.
 * Carrying the causes in a typed error is what lets the startup boundary print
 * them without also printing where they were thrown.
 */
export class ConfigurationRefusalError extends Error {
  readonly causes: readonly string[];

  constructor(causes: readonly string[]) {
    super(configurationRefusalText(causes));
    this.name = 'ConfigurationRefusalError';
    this.causes = causes;
  }
}

function configurationRefusalText(causes: readonly string[]): string {
  const head = 'Configuration cannot be used for requests: it fails its own validation.';
  return causes.length === 0 ? `${head} Inspect /settings for the rejected value, correct it, and restart.`
    : `${head}\n${causes.map(cause => `  - ${cause}`).join('\n')}\nCorrect the listed values and restart.`;
}

/**
 * The causes a publication carries, or none when it was blocked without naming one.
 *
 * Two kinds block: a constraint the selected target cannot satisfy, and a
 * security field that failed validation (the loader marks those `tools
 * blocked`). A rejected or invalid ordinary field is different — the loader
 * ignored the value, so what remains is valid without it. Listing that next to
 * the reasons requests cannot be sent would tell the user to fix something that
 * is not in the way; those stay in the ordinary startup notices, where the
 * wording already says "value ignored".
 */
export function configurationRefusalCauses(publication: ConfigPublication): readonly string[] {
  return publication.diagnostics.filter(message => message.startsWith('Config constraint:')
    || message.endsWith('; tools blocked.'));
}

/**
 * Why admission is refused, with the constraint that caused it.
 *
 * The bare sentence this replaces told the user to "reload a valid
 * configuration" without saying what made it invalid, while the same
 * publication already carried the specific reason in its diagnostics. A user
 * blocked at startup could not act on either half: not on the instruction,
 * because reloading changes nothing, and not on the cause, because it was never
 * shown.
 */
export function configurationRefusal(publication: ConfigPublication): string {
  return configurationRefusalText(configurationRefusalCauses(publication));
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
    if (context.configuration.current.admissionBlocked) return configurationRefusal(context.configuration.current);
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
  const snapshot = loadCatalogSnapshot();
  const catalog = snapshot.providers;
  if (scope === 'catalog') {
    const refusal = configurationAdmission(context)();
    if (refusal) return state.rejectCandidate(ticket, configurationBinding(context), [refusal], true);
    const accepted = state.current.requested;
    const target = context.resolveConfigTarget?.(accepted, context.session.id)
      ?? resolveProviderCredential({ runtimeConfig: accepted, pool: { sessionId: context.session.id } });
    return state.publish(ticket, constrainRuntimeConfig(accepted, target, catalog), configurationBinding(context), undefined, catalog, snapshot.diagnostics);
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
  return state.publish(ticket, candidate, actual, apply, catalog, snapshot.diagnostics);
}

import { ConfigState, type ConfigBinding, type ConfigReloadResult } from '../../config/state.js';
import { getRuntimeConfig, type RuntimeConfigOverrides } from '../../config/runtimeConfig.js';
import { projectSessionModel } from '../../session/model/projection.js';
import { prepareThemeSelection } from '../../presentation/theme/selection.js';
import { projectTrust } from '../security/projectTrust.js';

interface ConfigurationContext {
  readonly configuration: ConfigState;
  readonly projectRoot: string;
  readonly session: { readonly id: string };
  readonly runtimeConfigOverrides?: RuntimeConfigOverrides;
  readonly themePaths?: readonly string[];
}

export function configurationBinding(context: Omit<ConfigurationContext, 'configuration'>): ConfigBinding {
  return { workspaceRoot: context.projectRoot, sessionId: context.session.id,
    trustRevision: projectTrust.revision(), overrides: context.runtimeConfigOverrides ?? {} };
}

/** Ordinary settings stay pinned; safety revocation and substrate changes do not. */
export function configurationAdmission(context: ConfigurationContext): () => string | undefined {
  const binding = configurationBinding(context);
  const substrate = context.configuration.substrateRevision;
  return () => {
    if (context.configuration.current.admissionBlocked) return 'Configuration safety validation failed; reload a valid configuration before starting new actions.';
    const actual = configurationBinding(context);
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
  const candidate = projectSessionModel(getRuntimeConfig(context.projectRoot, context.runtimeConfigOverrides), context.session.id);
  if (!candidate.configValidation.valid) return state.publish(ticket, candidate, configurationBinding(context));
  let apply: (() => void) | undefined;
  try { if (candidate.theme) apply = prepareThemeSelection(candidate.theme, context.projectRoot, context.themePaths); }
  catch { return state.rejectCandidate(ticket, configurationBinding(context), ['Configured theme could not be prepared; current settings and theme were retained.']); }
  return state.publish(ticket, candidate, configurationBinding(context), apply);
}

import type { RuntimeProvider } from '../../../../config/runtimeConfig.js';
import type { CommandContext } from '../../../../core/commands/types.js';
import { captureModelChoice } from '../../../../core/commands/model/choice.js';
import { pickerSelection } from '../selection/state.js';
import type { Picker } from '../../overlay.js';
import { BUILTIN_PROVIDERS, type CatalogProvider } from '../../../../core/models/catalog.js';
import { resolveProviderAuthContract } from '../../../../core/auth/providerAuthRuntime.js';
import { providerFacts } from '../../../../core/providers/facts.js';
import { readFreshConfiguration } from '../../../../core/commands/configuration.js';

/** Credentials are input-only; the host returns only current context and safe outcome text. */
export interface ModelKey {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly label: string;
}
export type ModelSignIn = (provider: RuntimeProvider, key?: ModelKey) => Promise<{ readonly context: CommandContext; readonly note: string }>;

/** Native account login never authenticates a custom relay sharing the same runtime. */
export function modelAccountSignIn(provider: CatalogProvider, model: string, endpoint = provider.baseUrl): boolean {
  const builtin = BUILTIN_PROVIDERS.find(entry => entry.id === provider.runtime);
  const allowed = providerFacts(provider.runtime).accountAuthAllowedModels;
  return provider.id === provider.runtime && provider.baseUrl === builtin?.baseUrl
    && Boolean(endpoint && builtin?.baseUrl && endpoint.replace(/\/+$/, '') === builtin.baseUrl.replace(/\/+$/, ''))
    && Boolean(resolveProviderAuthContract(provider.runtime)) && (!allowed || allowed.includes(model));
}

/** Keep saved-vs-applied failures visible before long native diagnostics are truncated. */
export function modelSignInStatus(note: string): string {
  const lines = note.split('\n');
  return [...lines.slice(1).filter(line => /^Configuration |^Explicit config input /.test(line)), lines[0]].filter(Boolean).join(' ');
}

export function modelSignInPicker(context: CommandContext, provider: RuntimeProvider, signIn: ModelSignIn,
  back: (current: CommandContext, note?: string, connectionId?: string) => Picker): Picker {
  const attempt = modelAuthentication(context, provider, signIn, back);
  return {
    title: 'Confirm account sign-in', form: 'panel', empty: '', filterable: false,
    initialSelection: 'cancel', exclusive: true, holdInput: true,
    back: () => back(context),
    previewEnd: attempt.close,
    footer: 'Start uses native sign-in and saves its connection. Cancel returns to the model.',
    async load() { attempt.offer(); return [{ id: 'cancel', label: 'Cancel' }, { id: 'start', label: `Sign in to ${provider}` }]; },
    async apply(ids) {
      if (ids.length !== 1) return undefined;
      return ids[0] === 'cancel' ? attempt.cancel() : ids[0] === 'start' ? attempt.start() : undefined;
    },
  };
}

/** Both credential routes retain the same admission, identity and return contract. */
export function modelAuthentication(context: CommandContext, provider: RuntimeProvider, signIn: ModelSignIn,
  back: (current: CommandContext, note?: string, connectionId?: string) => Picker) {
  const choice = captureModelChoice(context);
  const owner = pickerSelection(context);
  let offered = false, used = false;
  return {
    offer: () => { offered = true; },
    close: () => { offered = false; owner.release(); },
    cancel: () => { if (!offered || used) return undefined; used = true; return { next: back(context) }; },
    async start(key?: ModelKey) {
      if (!offered || used) return undefined;
      const refusal = choice.admission();
      if (refusal) return { note: refusal };
      owner.check(); used = true;
      const result = await signIn(provider, key);
      const current = result.context;
      // Authentication may publish configuration and may be cancelled. Those changes
      // do not authorize reopening on another session, workspace or physical profile.
      if (!owner.isCurrent() || current.sessionId !== context.sessionId || current.cwd !== context.cwd
        || current.projectRoot !== context.projectRoot) return { note: result.note };
      const config = current.readConfiguration?.().config ?? current.runtimeConfig ?? readFreshConfiguration(current);
      const previous = new Set(choice.config.providerConnections.map(connection => connection.id));
      const added = config?.providerConnections.filter(connection => connection.provider === provider && !previous.has(connection.id)) ?? [];
      return { note: result.note, next: back(current, result.note, added.length === 1 ? added[0]!.id : undefined) };
    },
  };
}

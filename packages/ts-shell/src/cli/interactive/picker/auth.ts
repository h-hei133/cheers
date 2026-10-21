import { CONNECT_PRESETS } from '../../../core/commands/connect/preset.js';
import { captureConnectionSelection, type ConnectionSelection } from '../../../core/commands/connect/selection.js';
import { resolveProviderAuthContract } from '../../../core/auth/providerAuthRuntime.js';
import type { CommandContext } from '../../../core/commands/types.js';
import type { Picker } from '../overlay.js';

/** Account sign-in uses the ordinary command host, including progress and cancellation. */
export type SignInCommand = (args: readonly string[]) => Promise<undefined>;

export function authPicker(context: CommandContext, action: 'login' | 'logout', signIn?: SignInCommand): Picker {
  let selection: ConnectionSelection | undefined;
  const targets = [...CONNECT_PRESETS.map(preset => ({ id: preset.id as string, label: preset.label, provider: preset.provider })),
    { id: 'openai-compatible', label: 'Custom compatible endpoint', provider: 'openai-compatible' as const }];
  return {
    title: action === 'login' ? 'Log in — select provider' : 'Log out — saved connections',
    form: 'panel',
    empty: action === 'login' ? 'No providers to show.' : 'No connections to show.',
    loadError: 'Connection configuration is unavailable. Close and reopen this chooser.',
    footer: action === 'login' ? 'Choose a provider, then an authentication method. Esc cancels.'
      : 'Choose one saved connection to review removal. Opening or closing this view changes nothing.',
    status(visible, query) {
      if (selection && !visible.length && query?.trim()) return 'No matches for this search.';
      if (action === 'logout' && selection && !selection.connections.length) return 'No connections saved in the primary configuration.';
      return undefined;
    },
    async load(signal) {
      selection = undefined;
      signal?.throwIfAborted();
      const captured = captureConnectionSelection(context);
      signal?.throwIfAborted();
      selection = captured;
      return action === 'login'
        ? targets.map(target => ({ id: target.id, label: target.label, detail: target.provider }))
        : captured.connections.map(connection => ({ id: connection.key, label: connection.label, detail: connection.detail,
          note: connection.status, disabled: connection.disabled }));
    },
    async apply(ids) {
      if (ids.length !== 1 || !selection) return undefined;
      const blocked = selection.admission();
      if (blocked) return { note: blocked };
      if (action === 'logout') {
        const target = selection.connections.find(connection => connection.key === ids[0] && !connection.disabled);
        return target ? { next: logoutConfirmation(selection, target.key) } : undefined;
      }
      const target = targets.find(candidate => candidate.id === ids[0]);
      return target ? { next: loginMethods(selection, target, signIn) } : undefined;
    },
  };
}

function loginMethods(selection: ConnectionSelection, target: { readonly id: string; readonly label: string; readonly provider: Parameters<typeof resolveProviderAuthContract>[0] }, signIn?: SignInCommand): Picker {
  let offered = false;
  const account = resolveProviderAuthContract(target.provider) !== undefined;
  return {
    title: `Log in — ${target.label}`, form: 'panel', empty: '', filterable: false,
    footer: 'Account sign-in starts only after confirmation. API key selection prepares a command.',
    async load() {
      offered = true;
      return [{ id: 'key', label: 'API key', detail: 'Prepare the existing login command; supply the key explicitly.' },
        ...(account ? [{ id: 'account', label: 'Account sign-in', detail: 'Use the native account flow with cancellable sign-in instructions.',
          disabled: !signIn, note: signIn ? undefined : 'Interactive authentication host unavailable' }] : [])];
    },
    async apply(ids) {
      if (!offered || ids.length !== 1) return undefined;
      const blocked = selection.admission();
      if (blocked) return { note: blocked };
      if (ids[0] === 'key') return { draft: `/login ${target.id} --api-key ` };
      return ids[0] === 'account' && account && signIn
        ? { next: loginConfirmation(selection, target, signIn) } : undefined;
    },
  };
}

function loginConfirmation(selection: ConnectionSelection, target: { readonly id: string; readonly label: string }, signIn: SignInCommand): Picker {
  let offered = false, used = false;
  return {
    title: `Confirm sign-in — ${target.label}`, form: 'panel', empty: '', filterable: false,
    exclusive: true, holdInput: true, initialSelection: 'cancel',
    footer: 'Start opens native authentication and saves its pending/result state. Cancel leaves configuration unchanged.',
    async load() { offered = true; return [{ id: 'cancel', label: 'Cancel' }, { id: 'start', label: `Start ${target.label} account sign-in` }]; },
    async apply(ids) {
      if (!offered || used || ids.length !== 1) return undefined;
      if (ids[0] === 'cancel') { used = true; return undefined; }
      if (ids[0] !== 'start') return undefined;
      const blocked = selection.admission();
      if (blocked) return { note: blocked };
      used = true;
      await signIn(['login', target.id, '--account']);
      return undefined;
    },
  };
}

function logoutConfirmation(selection: ConnectionSelection, key: string): Picker {
  const target = selection.connections.find(connection => connection.key === key)!;
  let offered = false, used = false;
  return {
    title: 'Confirm connection removal', form: 'panel', empty: '', filterable: false,
    exclusive: true, holdInput: true, initialSelection: 'cancel',
    footer: 'Removes this local saved connection through /connect. Remote account access is not revoked.',
    async load() { offered = true; return [{ id: 'cancel', label: 'Cancel' },
      { id: 'remove', label: `Remove ${target.label}`, detail: target.detail }]; },
    async apply(ids) {
      if (!offered || used || ids.length !== 1) return undefined;
      if (ids[0] === 'cancel') { used = true; return undefined; }
      if (ids[0] !== 'remove') return undefined;
      used = true;
      return { note: await selection.logout(key) };
    },
  };
}

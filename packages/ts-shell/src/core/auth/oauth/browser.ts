import { spawn } from 'node:child_process';
import type { SignInProgress } from '../providerAuthContract.js';
import { startCallbackServer, type CallbackOptions } from './callback.js';
import { waitForLogin } from './lifetime.js';
import { createPkcePair, createState } from './pkce.js';

interface BrowserInteraction {
  readonly openBrowser?: (url: string) => Promise<void> | void;
  readonly onAuthorizeUrl?: (url: string) => void;
  readonly onProgress?: (progress: SignInProgress) => void;
}

export async function authorizeLoopback(callback: Omit<CallbackOptions, 'expectedState'> & { readonly stateInPath?: boolean },
  authorize: (input: { redirectUri: string; state: string; challenge: string }) => string,
  interaction: BrowserInteraction) {
  callback.signal?.throwIfAborted();
  const state = createState();
  const pkce = createPkcePair();
  const { stateInPath, ...listener } = callback;
  // Bind issuers that return only a code to an unguessable path on this listener.
  const binding = stateInPath ? { path: `${listener.path}/${state}`, requireState: false } : {};
  const server = await startCallbackServer({ ...listener, ...binding, expectedState: state });
  try {
    callback.signal?.throwIfAborted();
    const authorizeUrl = authorize({ redirectUri: server.redirectUri, state, challenge: pkce.challenge });
    interaction.onAuthorizeUrl?.(authorizeUrl);
    callback.signal?.throwIfAborted();
    interaction.onProgress?.({ authorizeUrl });
    callback.signal?.throwIfAborted();
    await waitForLogin((interaction.openBrowser ?? openInBrowser)(authorizeUrl), callback.signal);
    const { code } = await waitForLogin(server.received, callback.signal);
    return { code, verifier: pkce.verifier, authorizeUrl, redirectUri: server.redirectUri };
  } finally { server.close(); }
}

function openInBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore' });
    child.once('error', () => undefined);
    child.unref();
  } catch { /* The sign-in URL can still be opened manually. */ }
}

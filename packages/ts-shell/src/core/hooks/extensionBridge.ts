export type ExtensionEventRunner = (
  event: string,
  payload: unknown,
  aliases?: readonly string[],
  signal?: AbortSignal,
) => Promise<unknown>;

type ExtensionEventProvider = (root: string, sessionId?: string) => readonly ExtensionEventRunner[];

let activeProvider: ExtensionEventProvider | undefined;

/** Installed by catalog contributions so HookDispatcher avoids importing core/catalog directly. */
export function registerExtensionEventProvider(provider: ExtensionEventProvider): void {
  activeProvider = provider;
}

export function getExtensionEventRunners(root: string, sessionId?: string): readonly ExtensionEventRunner[] {
  return activeProvider ? activeProvider(root, sessionId) : [];
}

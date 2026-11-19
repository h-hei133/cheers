import type { ExtensionHostBridge } from '../../extensions/runtime/inProcessLoader.js';
import type { ResourceGeneration } from './contract.js';

/** Extensions retain only their own generation's host, including an unbound fallback. */
export function resourceHost(generation: ResourceGeneration): ExtensionHostBridge {
  const currentHost = (): ExtensionHostBridge | undefined => {
    generation.controller.signal.throwIfAborted();
    return generation.host;
  };
  return {
    get ui() { return currentHost()?.ui; },
    getActiveTools: () => currentHost()?.getActiveTools?.() ?? [],
    getAllTools: () => currentHost()?.getAllTools?.() ?? [],
    getCommands: () => currentHost()?.getCommands?.() ?? [],
    sendMessage: message => {
      const host = currentHost();
      if (!host?.sendMessage) throw new Error('Extension message host is unavailable.');
      return host.sendMessage(message);
    },
    appendEntry: (type, data) => {
      const host = currentHost();
      if (!host?.appendEntry) throw new Error('Extension entry storage is unavailable.');
      return host.appendEntry(type, data);
    },
  };
}

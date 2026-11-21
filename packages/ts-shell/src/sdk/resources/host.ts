import type { ExtensionHostBridge } from '../../extensions/runtime/inProcessLoader.js';
import { ExtensionThinkingError } from '../../extensions/runtime/model.js';
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
    setActiveTools: (names, owner, signal) => {
      const host = currentHost();
      if (!host?.setActiveTools) throw new Error('Session tool selection is unavailable from this host.');
      host.setActiveTools(names, owner, signal);
    },
    getAllTools: () => currentHost()?.getAllTools?.() ?? [],
    getCommands: () => currentHost()?.getCommands?.() ?? [],
    setThinkingLevel: (level, signal) => {
      const host = currentHost();
      if (!host?.setThinkingLevel) throw new ExtensionThinkingError('Session thinking level is unavailable from this host.');
      return host.setThinkingLevel(level, signal);
    },
    setModel: (model, signal) => {
      const host = currentHost();
      if (!host?.setModel) throw new ExtensionThinkingError('Session model selection is unavailable from this host.');
      return host.setModel(model, signal);
    },
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

import {registerCatalogContribution} from '../../core/catalog/contributions.js';
import type {CatalogProvider} from '../../core/models/catalog.js';
import type {ExtensionUiHost} from '../../extensions/runtime/ui.js';
import {runExtensionInvocation} from '../../extensions/runtime/context.js';
import {runEventHandlers} from '../../extensions/events/dispatch.js';
import type {LoadExtensionsResult} from '../resourceLoader.js';

/** Loader contributions retire independently of caller-owned tools. */
export function registerSdkExtensions(root: string, sessionId: string, resources: LoadExtensionsResult,
  ui: () => ExtensionUiHost | undefined, catalog: readonly CatalogProvider[]): Array<() => void> {
  const cleanups: Array<() => void> = [];
  try {
    for (const loaded of resources.extensions) {
      const ext = loaded.extension;
      const onEvent = ext.handlers.size > 0
        ? async (event: string, payload: unknown, aliases?: readonly string[], signal?: AbortSignal) => runExtensionInvocation(ui(), signal,
          () => runEventHandlers({handlers:ext.handlers, event, payload, aliases, signal, ownerSignal:ext.signal}))
        : undefined;
      cleanups.push(registerCatalogContribution({root, sessionId, commands:ext.commands, tools:ext.tools,
        virtualModels:ext.virtualModels, signal:ext.signal, skills:() => [], ...(onEvent ? {onEvent} : {})}, catalog));
    }
    return cleanups;
  } catch (error) {
    cleanups.splice(0).forEach(unregister => unregister());
    throw error;
  }
}

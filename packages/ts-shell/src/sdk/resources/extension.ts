import { types } from 'node:util';
import type { CommandDefinition } from '../../core/commands/types.js';
import type { LoadedInProcessExtension } from '../../extensions/runtime/inProcessLoader.js';
import type { ToolDefinition } from '../../tools/types.js';
import { resourceArray, resourceFields, resourceRecord, resourceText } from './data.js';

const TOOL_CALLBACKS = ['nestedToolCatalog', 'resultAdmission', 'onRefusal', 'validateArguments', 'prepare', 'execute'];
const COMMAND_CALLBACKS = ['preparePrompt', 'getArgumentCompletions', 'execute'];
const handlerMaps = new WeakMap<object, Map<string, readonly ((payload: unknown) => unknown | Promise<unknown>)[]>>();

function captureCommand(value: unknown, depth = 0): CommandDefinition {
  if (depth > 8) throw new Error('Resource command metadata exceeds its depth limit.');
  const fields = resourceFields(value);
  if (fields.composition !== undefined) fields.composition = resourceRecord(fields.composition, ['prepare']);
  if (fields.invocations !== undefined) fields.invocations = Object.freeze(resourceArray(fields.invocations)
    .map(invocation => captureCommand(invocation, depth + 1)));
  return resourceRecord<CommandDefinition>(fields, COMMAND_CALLBACKS, ['composition', 'invocations']);
}

function captureHandlers(value: unknown): LoadedInProcessExtension['handlers'] {
  if (!value || typeof value !== 'object' || types.isProxy(value)) throw new Error('Resource handlers require a native map.');
  const source = handlerMaps.get(value) ?? value;
  if (!types.isMap(source)) throw new Error('Resource handlers require a native map.');
  const captured = new Map<string, readonly ((payload: unknown) => unknown | Promise<unknown>)[]>();
  for (const [key, listeners] of Map.prototype.entries.call(source) as Iterable<[unknown, unknown]>) {
    if (captured.size >= 4096) throw new Error('Resource handler count exceeds its limit.');
    const callbacks = resourceArray(listeners).map(listener => {
      if (typeof listener !== 'function') throw new Error('Resource handler callback is invalid.');
      return listener as (payload: unknown) => unknown | Promise<unknown>;
    });
    captured.set(resourceText(key), Object.freeze(callbacks));
  }
  // A frozen Map still permits set/delete/clear; this facade exposes only captured reads.
  const view: LoadedInProcessExtension['handlers'] = {
    size: captured.size,
    get: key => captured.get(key),
    has: key => captured.has(key),
    entries: () => captured.entries(),
    keys: () => captured.keys(),
    values: () => captured.values(),
    forEach: (callback, thisArg) => captured.forEach((listeners, key) => Reflect.apply(callback, thisArg, [listeners, key, view])),
    [Symbol.iterator]: () => captured.entries(),
  };
  handlerMaps.set(view, captured);
  return Object.freeze(view);
}

/** Copy visible registrations while retaining the existing executable wrappers and lifetimes. */
export function captureExtension(value: unknown): LoadedInProcessExtension {
  const fields = resourceFields(value);
  fields.tools = Object.freeze(resourceArray(fields.tools).map(tool => resourceRecord<ToolDefinition>(tool, TOOL_CALLBACKS)));
  fields.commands = Object.freeze(resourceArray(fields.commands).map(command => captureCommand(command)));
  if (fields.virtualModels !== undefined) fields.virtualModels = Object.freeze(resourceArray(fields.virtualModels)
    .map(model => resourceRecord(model, ['route'])));
  if (fields.messageRenderers !== undefined) fields.messageRenderers = Object.freeze(resourceArray(fields.messageRenderers)
    .map(renderer => resourceRecord(renderer, ['render'])));
  fields.shortcuts = Object.freeze(resourceArray(fields.shortcuts).map(shortcut => resourceRecord(shortcut, ['run'])));
  fields.flags = Object.freeze(resourceArray(fields.flags).map(flag => resourceRecord(flag)));
  fields.handlers = captureHandlers(fields.handlers);
  const events = resourceFields(fields.events);
  fields.events = resourceRecord(events, Reflect.ownKeys(events) as string[]);
  // Module exports are opaque executable capabilities, outside immutable registration metadata.
  // Keep their captured reference; classes and nested callbacks are valid non-JSON exports.
  if (fields.signal !== undefined) AbortSignal.prototype.throwIfAborted.call(fields.signal);
  return resourceRecord<LoadedInProcessExtension>(fields, ['readWorkspaceFile'],
    ['tools', 'commands', 'virtualModels', 'messageRenderers', 'signal', 'shortcuts', 'flags', 'handlers', 'events', 'exports']);
}

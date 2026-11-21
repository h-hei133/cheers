import { createDataSnapshot } from '../../core/values/data.js';
import { createTreeResultCapture } from '../events/tree.js';
import { createCompactResultCapture } from '../events/compact.js';
import { createToolResultCapture, createToolResultReducer } from '../events/result.js';
import { createMessageResultCapture, projectMessageEnd } from '../events/message.js';
import { createInputEventCapture, createInputEventProjection, createInputHookPayloadCapture, createInputHookReducer, createInputHookResultCapture, createInputResultCapture, InputRefusal } from '../events/input.js';
import { createCallbackResultCapture } from '../../core/values/promise.js';
import { createShortcutCapture, MAX_SHORTCUTS } from './shortcut.js';
import { createSessionCancellationCapture } from '../events/decision.js';
import { createFlagCapture, EXTENSION_FLAG_NAME } from './flag.js';
import { normalizeKey } from '../../presentation/tui/input/keyId.js';
import { MAX_RENDER_TEXT_BYTES } from './renderer.js';

export const EXTENSION_WORKER_SOURCE = `
const vm = require('node:vm');
const { parentPort, workerData } = require('node:worker_threads');
const { types } = require('node:util');
// Compiled named functions retain this pure name decorator in their serialized bodies.
const __name = (target, value) => Object.defineProperty(target, 'name', { value, configurable: true });

// Use the same pure capture factories; their dependencies are explicit parameters.
const captureData = (${createDataSnapshot.toString()})(types.isProxy);
const captureTree = (${createTreeResultCapture.toString()})(captureData);
const captureCancellation = (${createSessionCancellationCapture.toString()})(captureData);
const captureCompact = (${createCompactResultCapture.toString()})(captureData);
const captureTool = (${createToolResultCapture.toString()})(captureData);
const captureMessage = (${createMessageResultCapture.toString()})(captureData);
const InputRefusal = ${InputRefusal.toString()};
const captureInput = (${createInputResultCapture.toString()})(captureData, InputRefusal);
const captureInputHook = (${createInputHookResultCapture.toString()})(captureData, InputRefusal);
const captureInputHookPayload = (${createInputHookPayloadCapture.toString()})(captureData, InputRefusal);
const captureInputEvent = (${createInputEventCapture.toString()})(captureData, captureInput, InputRefusal);
const projectInput = (${createInputEventProjection.toString()})(InputRefusal);
const beforeTree = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureTree(value) }); }
  catch { return '{"ok":false}'; }
}, null);
const compactResult = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureCompact(value) }); }
  catch { return '{"ok":false}'; }
}, null);
const sessionCancellation = Object.setPrototypeOf(value => {
  try { return captureCancellation(value) ? 1 : 0; }
  catch { return -1; }
}, null);
const inputResult = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureInput(value) }); }
  catch { return '{"ok":false}'; }
}, null);
const toolResult = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureTool(value) }); }
  catch { return '{"ok":false}'; }
}, null);
const messageResult = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureMessage(value) }); }
  catch { return '{"ok":false}'; }
}, null);
const inputEvent = Object.setPrototypeOf((value, result) => {
  try { return JSON.stringify({ ok: true, value: projectInput(captureInputEvent(value), captureInput(result)) }); }
  catch { return '{"ok":false}'; }
}, null);
const inputHookResult = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureInputHook(value) }); }
  catch { return '{"ok":false}'; }
}, null);
const inputHookPayload = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureInputHookPayload(value) }); }
  catch { return '{"ok":false}'; }
}, null);
const promiseBrand = Object.setPrototypeOf(value => { try { return types.isPromise(value); } catch { return false; } }, null);
const proxyBrand = Object.setPrototypeOf(value => { try { return types.isProxy(value); } catch { return true; } }, null);
const normalizeShortcut = Object.setPrototypeOf(value => typeof value === 'string'
  ? (${normalizeKey.toString()})(value) : undefined, null);
const qualify = workerData.invoke?.kind === 'qualify';
const render = workerData.invoke?.kind === 'render';
const isolated = qualify || render;
const declaredRenderers = new Set(workerData.rendererTypes ?? []);
const registeredRenderers = new Map();
let rendererFailed = false;
const captureRenderer = Object.setPrototypeOf((name, callback) => {
  if (!declaredRenderers.has(name) || registeredRenderers.has(name) || typeof callback !== 'function' || types.isProxy(callback)) {
    rendererFailed = true;
    return false;
  }
  registeredRenderers.set(name, callback);
  return true;
}, null);
const selectRenderer = Object.setPrototypeOf(name => registeredRenderers.get(name), null);
const rendered = [];
const collectText = Object.setPrototypeOf(value => {
  if (rendered.length >= workerData.invoke.messages.length) return;
  rendered.push(typeof value === 'string' && value.length <= ${MAX_RENDER_TEXT_BYTES}
    && Buffer.byteLength(value) <= ${MAX_RENDER_TEXT_BYTES} ? value : null);
}, null);
const declaredProviders = new Map((workerData.providers ?? []).map(entry => [entry.name, entry]));
const registeredProviders = new Map();
let providerFailed = false;
const captureProvider = Object.setPrototypeOf((name, input) => {
  try {
    const declared = declaredProviders.get(name);
    if (!declared || registeredProviders.has(name)) throw new Error('Provider declaration unavailable.');
    const definition = captureData(input, { bytes: 128 * 1024, nodes: 8192, depth: 4, allowCrossRealm: true });
    if (!definition || definition.runtime !== declared.runtime || typeof definition.baseUrl !== 'string'
      || definition.baseUrl.length > 2048 || new URL(definition.baseUrl).href.replace(/\\/+$/, '') !== declared.baseUrl) {
      throw new Error('Provider declaration changed.');
    }
    registeredProviders.set(name, definition);
    return true;
  } catch { providerFailed = true; return false; }
}, null);

const vmCtx = vm.createContext(Object.create(null), {
  name: 'extension-worker',
  codeGeneration: { strings: false, wasm: false },
});

const sendBridge = Object.setPrototypeOf((kind, jsonPayload) => {
  if (isolated) return;
  parentPort.postMessage({ kind: String(kind), json: String(jsonPayload ?? '') });
}, null);

let dispatchReply = null;
const registerReceiver = Object.setPrototypeOf((fn) => {
  dispatchReply = fn;
}, null);

Object.defineProperty(vmCtx, '__send', { value: sendBridge, enumerable: false });
Object.defineProperty(vmCtx, '__onReply', { value: registerReceiver, enumerable: false });
Object.defineProperty(vmCtx, '__ARGV', { value: JSON.stringify(workerData.argv), enumerable: false });
Object.defineProperty(vmCtx, '__ROOT', { value: String(workerData.workspaceRoot), enumerable: false });
Object.defineProperty(vmCtx, '__INVOKE', { value: workerData.invoke ? JSON.stringify(workerData.invoke) : '', enumerable: false });
Object.defineProperty(vmCtx, '__SHORTCUT_INVOKE', { value: workerData.invoke?.kind === 'command' && workerData.invoke.shortcutKey !== undefined
  ? JSON.stringify(workerData.invoke) : '', enumerable: false });
Object.defineProperty(vmCtx, '__NORMALIZE_SHORTCUT', { value: normalizeShortcut, enumerable: false });
Object.defineProperty(vmCtx, '__TREE_RESULT', { value: beforeTree, enumerable: false });
Object.defineProperty(vmCtx, '__COMPACT_RESULT', { value: compactResult, enumerable: false });
Object.defineProperty(vmCtx, '__SESSION_CANCELLATION', { value: sessionCancellation, enumerable: false });
Object.defineProperty(vmCtx, '__EVENT_NOTIFICATION', { value: workerData.notification === true, enumerable: false });
Object.defineProperty(vmCtx, '__EVENT_TRANSITION', { value: workerData.transition === true, enumerable: false });
Object.defineProperty(vmCtx, '__WORKER_FLAGS', { value: JSON.stringify(workerData.flags ?? []), enumerable: false });
Object.defineProperty(vmCtx, '__ISOLATED', { value: isolated, enumerable: false });
Object.defineProperty(vmCtx, '__CAPTURE_PROVIDER', { value: captureProvider, enumerable: false });
Object.defineProperty(vmCtx, '__CAPTURE_RENDERER', { value: captureRenderer, enumerable: false, configurable: true });
Object.defineProperty(vmCtx, '__SELECT_RENDERER', { value: selectRenderer, enumerable: false, configurable: true });
Object.defineProperty(vmCtx, '__COLLECT_TEXT', { value: collectText, enumerable: false, configurable: true });
Object.defineProperty(vmCtx, '__TOOL_RESULT', { value: toolResult, enumerable: false });
Object.defineProperty(vmCtx, '__MESSAGE_RESULT', { value: messageResult, enumerable: false });
Object.defineProperty(vmCtx, '__INPUT_RESULT', { value: inputResult, enumerable: false });
Object.defineProperty(vmCtx, '__INPUT_EVENT', { value: inputEvent, enumerable: false });
Object.defineProperty(vmCtx, '__INPUT_HOOK_RESULT', { value: inputHookResult, enumerable: false });
Object.defineProperty(vmCtx, '__INPUT_HOOK_PAYLOAD', { value: inputHookPayload, enumerable: false });
Object.defineProperty(vmCtx, '__PROMISE_BRAND', { value: promiseBrand, enumerable: false });
Object.defineProperty(vmCtx, '__PROXY_BRAND', { value: proxyBrand, enumerable: false });

const bootstrap = new vm.Script(\`
(() => {
  const send = globalThis.__send;
  const onReply = globalThis.__onReply;
  const promiseBrand = globalThis.__PROMISE_BRAND;
  const proxyBrand = globalThis.__PROXY_BRAND;
  const captureRenderer = globalThis.__CAPTURE_RENDERER;
  const selectRenderer = globalThis.__SELECT_RENDERER;
  const collectText = globalThis.__COLLECT_TEXT;
  delete globalThis.__send;
  delete globalThis.__onReply;
  delete globalThis.__PROMISE_BRAND;
  delete globalThis.__PROXY_BRAND;
  delete globalThis.__CAPTURE_RENDERER;
  delete globalThis.__SELECT_RENDERER;
  delete globalThis.__COLLECT_TEXT;
  const parse = JSON.parse, keys = Object.keys, freeze = Object.freeze;
  const then = Promise.prototype.then, apply = Reflect.apply;
  const __name = (target, value) => Object.defineProperty(target, 'name', { value, configurable: true });
  const captureShortcut = (${createShortcutCapture.toString()})(proxyBrand);
  const shortcutInvocation = globalThis.__SHORTCUT_INVOKE ? JSON.parse(globalThis.__SHORTCUT_INVOKE) : undefined;
  const normalizeShortcut = globalThis.__NORMALIZE_SHORTCUT;
  const captureFlag = (${createFlagCapture.toString()})(proxyBrand, new RegExp(${JSON.stringify(EXTENSION_FLAG_NAME.source)}));
  const captureCallback = (${createCallbackResultCapture.toString()})(proxyBrand, promiseBrand, Promise, Promise);
  const captureInput = value => {
    const envelope = JSON.parse(globalThis.__INPUT_RESULT(value));
    if (!envelope.ok) throw new Error('Extension input was refused.');
    return envelope.value;
  };
  const captureInputHook = value => {
    const envelope = JSON.parse(globalThis.__INPUT_HOOK_RESULT(value));
    if (!envelope.ok) throw new Error('Extension input was refused.');
    return envelope.value;
  };
  const captureCompact = value => {
    const envelope = JSON.parse(globalThis.__COMPACT_RESULT(value));
    if (!envelope.ok) throw new Error('Extension compaction result was refused.');
    return envelope.value;
  };
  const captureCancellation = value => {
    const status = globalThis.__SESSION_CANCELLATION(value);
    if (status === -1) throw new Error('Extension session result was refused.');
    return status === 1;
  };
  const captureTool = value => {
    const envelope = JSON.parse(globalThis.__TOOL_RESULT(value));
    if (!envelope.ok) throw new Error('Extension tool result was refused.');
    return envelope.value;
  };
  const captureMessage = value => {
    const envelope = JSON.parse(globalThis.__MESSAGE_RESULT(value));
    if (!envelope.ok) throw new Error('Extension message result was refused.');
    return envelope.value;
  };
  const reduceInputHook = (${createInputHookReducer.toString().replaceAll('\\', '\\\\')})(captureInputHook);
  const freezeData = value => {
    if (value && typeof value === 'object') {
      const fields = keys(value);
      for (let index = 0; index < fields.length; index++) freezeData(value[fields[index]]);
      freeze(value);
    }
    return value;
  };
  globalThis.__reduceInputHook = reduceInputHook;
  globalThis.__captureInputHookPayload = value => {
    const envelope = JSON.parse(globalThis.__INPUT_HOOK_PAYLOAD(value));
    if (!envelope.ok) throw new Error('Extension input was refused.');
    return freezeData(envelope.value);
  };
  globalThis.__captureInputCallback = (operation, legacy) => captureCallback(operation, legacy ? captureInputHook : captureInput, {
    invalid: () => new Error('Extension input was refused.'),
    failed: () => new Error('Extension input was refused.'),
    cancelled: () => new Error('Extension input was refused.'),
  });
  globalThis.__captureCompactCallback = operation => captureCallback(operation, captureCompact);
  globalThis.__captureCancellationCallback = operation => captureCallback(operation, captureCancellation);
  globalThis.__captureNotificationCallback = operation => captureCallback(operation, () => undefined);
  globalThis.__captureToolCallback = operation => captureCallback(operation, captureTool);
  globalThis.__captureMessageCallback = operation => captureCallback(operation, captureMessage);
  globalThis.__projectMessageEnd = (${projectMessageEnd.toString()});
  globalThis.__reduceToolResult = (${createToolResultReducer.toString()})();
  globalThis.__freezeCompactPayload = freezeData;
  // Install completion observers before user handlers can change this realm's Promise hooks.
  globalThis.__finishInputRunner = (operation, event) => {
    const capture = event === 'tool_result' ? captureTool : event === 'message_end' ? captureMessage : captureInputHook;
    const completed = captureCallback(operation, capture, {
      invalid: () => new Error('Extension input was refused.'),
      failed: () => new Error('Extension input was refused.'),
      cancelled: () => new Error('Extension input was refused.'),
    });
    completed.then(envelope => {
      try { send('done', envelope.value === undefined ? '' : JSON.stringify(envelope.value)); }
      catch { send('error', 'Extension input was refused.'); }
    }, () => send('error', 'Extension input was refused.'));
  };

  let seq = 0;
  const pending = new Map();
  onReply((id, ok, json) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(json === '' ? undefined : JSON.parse(json));
    else entry.reject(new Error(json || 'Extension host call failed.'));
  });

  function rpc(op, payload) {
    if (globalThis.__ISOLATED) return Promise.reject(new Error('Isolated extension callbacks have no host privileges.'));
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send('rpc', JSON.stringify({ id, op, payload }));
    });
  }

  globalThis.exports = {};
  globalThis.module = { exports: globalThis.exports };
  globalThis.require = (specifier) => {
    if (specifier === '@cheers/extension-api') {
      return { defineExtension: (factory) => factory };
    }
    throw new Error("Extension module import '" + specifier + "' is not in VIRTUAL_MODULES.");
  };
  const registeredTools = new Map();
  const registeredCommands = new Map();
  const registeredHandlers = new Map();
  let actualShortcutCommand;
  let registeredShortcutCommand;
  let shortcutCount = 0;
  const registeredFlags = new Map();
  const declaredFlags = new Map(JSON.parse(globalThis.__WORKER_FLAGS).map(entry => [entry.definition.name, entry]));
  const flagValues = new Map();
  let flagError = false;
  const busListeners = new Map();
  globalThis.__registeredTools = registeredTools;
  globalThis.__registeredCommands = registeredCommands;
  globalThis.__registeredHandlers = registeredHandlers;
  Object.defineProperty(globalThis, '__runInstalledShortcut', { value: shortcutInvocation ? () => {
    if (actualShortcutCommand !== shortcutInvocation.name || !registeredShortcutCommand) {
      throw new Error('The installed shortcut binding changed.');
    }
    return registeredShortcutCommand.execute(shortcutInvocation.args || [], { workspaceRoot: globalThis.__ROOT, ui });
  } : undefined });
  Object.defineProperty(globalThis, '__checkWorkerFlags', { value: () => {
    if (flagError || [...declaredFlags].some(([name]) => !registeredFlags.has(name))) throw new Error('Installed flag declarations changed.');
  } });

  const eventsBus = Object.freeze({
    on: (channel, listener) => {
      const key = String(channel);
      const set = busListeners.get(key) ?? new Set();
      set.add(listener);
      busListeners.set(key, set);
      return () => set.delete(listener);
    },
    once: (channel, listener) => {
      const off = eventsBus.on(channel, (data) => {
        off();
        return listener(data);
      });
      return off;
    },
    off: (channel, listener) => {
      busListeners.get(String(channel))?.delete(listener);
    },
    emit: (channel, data) => {
      for (const fn of [...(busListeners.get(String(channel)) ?? [])]) {
        fn(data);
      }
    },
  });

  const ui = Object.freeze({
    select: (title, options, opts) => rpc('ui.select', { title: String(title ?? ''), options: Array.isArray(options) ? options.map(String) : [], timeout: opts && opts.timeout }),
    confirm: (title, message, opts) => rpc('ui.confirm', { title: String(title ?? ''), message: String(message ?? ''), timeout: opts && opts.timeout }),
    input: (title, placeholder, opts) => rpc('ui.input', { title: String(title ?? ''), placeholder: placeholder === undefined ? undefined : String(placeholder), timeout: opts && opts.timeout }),
    editor: (title, prefill, opts) => rpc('ui.editor', { title: String(title ?? ''), prefill: prefill === undefined ? undefined : String(prefill), timeout: opts && opts.timeout }),
    notify: (message, notifyType) => rpc('ui.notify', { message: String(message ?? ''), notifyType }),
    setStatus: (statusKey, statusText) => rpc('ui.setStatus', { statusKey: String(statusKey ?? ''), statusText }),
    setWidget: (widgetKey, widgetLines, widgetPlacement) => rpc('ui.setWidget', { widgetKey: String(widgetKey ?? ''), widgetLines, widgetPlacement }),
    setTitle: (title) => rpc('ui.setTitle', { title: String(title ?? '') }),
    setEditorText: (text) => rpc('ui.setEditorText', { text: String(text ?? '') }),
  });

  globalThis.api = {
    workspaceRoot: globalThis.__ROOT,
    events: eventsBus,
    ui,
    registerVirtualModel: () => { throw new Error('Virtual model registration is unavailable in worker extensions. Use a session extension.'); },
    registerMessageRenderer: (name, callback) => {
      if (!captureRenderer(name, callback)) throw new Error('Message renderer registration is unavailable without a matching unique installed declaration.');
    },
    registerMcpServer: () => { throw new Error('MCP server registration is unavailable in worker extensions. Use a session extension.'); },
    registerProvider: (name, definition) => {
      if (!globalThis.__CAPTURE_PROVIDER(name, definition)) throw new Error('Provider registration is unavailable without a matching unique installed declaration.');
    },
    registerTool: (tool) => {
      if (!tool || typeof tool.name !== 'string' || !tool.name.trim() || typeof tool.execute !== 'function') {
        throw new Error('Extension registerTool requires { name, execute }.');
      }
      registeredTools.set(tool.name, tool);
      send('registerTool', JSON.stringify({
        name: tool.name,
        description: String(tool.description ?? ''),
        argsSchema: tool.argsSchema ?? { type: 'object' },
      }));
    },
    registerCommand: (cmd) => {
      if (!cmd || typeof cmd.name !== 'string' || !cmd.name.trim() || typeof cmd.execute !== 'function') {
        throw new Error('Extension registerCommand requires { name, execute }.');
      }
      registeredCommands.set(cmd.name, cmd);
      if (shortcutInvocation?.name === cmd.name) registeredShortcutCommand = cmd;
      send('registerCommand', JSON.stringify({
        name: cmd.name,
        description: String(cmd.description ?? ''),
        aliases: Array.isArray(cmd.aliases) ? cmd.aliases.map(String) : [],
      }));
    },
    registerShortcut: (shortcut) => {
      if (shortcutCount >= ${MAX_SHORTCUTS}) throw new Error('Shortcut registration limit exceeded.');
      const { key, description, command } = captureShortcut(shortcut);
      shortcutCount++;
      if (shortcutInvocation && command !== undefined && normalizeShortcut(key) === shortcutInvocation.shortcutKey) {
        actualShortcutCommand = command;
      }
      send('registerShortcut', JSON.stringify({ key, description: description ?? '', command }));
    },
    registerFlag: (flag) => {
      try {
        const captured = captureFlag(flag);
        const declared = declaredFlags.get(captured.name);
        if (registeredFlags.size >= 32 || registeredFlags.has(captured.name)
          || declared && (captured.type !== declared.definition.type || captured.default !== declared.definition.default)) {
          throw new Error('Installed flag declarations changed.');
        }
        registeredFlags.set(captured.name, captured);
        flagValues.set(captured.name, declared?.value ?? captured.default);
        send('registerFlag', JSON.stringify(captured));
      } catch (error) { flagError = true; throw error; }
    },
    getFlag: (name) => flagValues.get(String(name ?? '')),
    on: (event, handler) => {
      if (typeof event !== 'string' || !event.trim() || typeof handler !== 'function') {
        throw new Error('Extension on(event, handler) requires an event name and function.');
      }
      const list = registeredHandlers.get(event) ?? [];
      list.push(handler);
      registeredHandlers.set(event, list);
      send('registerEvent', JSON.stringify({ event }));
    },
    readWorkspaceFile: (rel) => rpc('readWorkspaceFile', { path: String(rel ?? '') }),
    getActiveTools: () => rpc('host.getActiveTools', {}),
    getAllTools: () => rpc('host.getAllTools', {}),
    getCommands: () => rpc('host.getCommands', {}),
    setThinkingLevel: async () => { throw new Error('Installed extension scripts have no session model control.'); },
    setActiveTools: async () => { throw new Error('Installed extension scripts have no session tool selection control.'); },
    setModel: async () => { throw new Error('Installed extension scripts have no session model control.'); },
    sendMessage: (msg) => rpc('host.sendMessage', { msg }),
    appendEntry: (customType, data) => rpc('host.appendEntry', { customType: String(customType ?? ''), data }),
  };
  return () => {
    const messages = parse(globalThis.__INVOKE).messages;
    for (let index = 0; index < messages.length; index++) {
      const message = freezeData(messages[index]);
      let text;
      try {
        const callback = selectRenderer(message.customType);
        const value = callback?.(message);
        if (promiseBrand(value)) apply(then, value, [undefined, () => undefined]);
        else if (typeof value === 'string') text = value;
      } catch {}
      collectText(text);
    }
  };
})();
\`, { filename: 'extension-bootstrap.js' });

const renderBatch = bootstrap.runInContext(vmCtx);

parentPort.on('message', (msg) => {
  if (msg && msg.kind === 'reply' && typeof dispatchReply === 'function') {
    dispatchReply(msg.id, msg.ok, msg.json);
  }
});

(async () => {
  try {
    const script = new vm.Script(workerData.code, { filename: workerData.filename });
    script.runInContext(vmCtx, { timeout: 5000 });
    const invokeEvent = workerData.invoke?.kind === 'event' ? workerData.invoke.event : undefined;
    const guardedInvoke = workerData.transition === true || ['input', 'UserPromptSubmit', 'session_before_compact', 'tool_result', 'message_end'].includes(invokeEvent);
    const runner = new vm.Script((guardedInvoke ? 'globalThis.__finishInputRunner(() => (' : '') + \`
      (async () => {
        const exp = module.exports || {};
        if (typeof exp.default === 'function') await exp.default(api);
        else if (typeof exp.activate === 'function') await exp.activate(api);
        globalThis.__checkWorkerFlags();
        if (globalThis.__ISOLATED) return;
        if (globalThis.__runInstalledShortcut) return await globalThis.__runInstalledShortcut();
        const invoke = globalThis.__INVOKE ? JSON.parse(globalThis.__INVOKE) : null;
        if (invoke && invoke.kind === 'tool') {
          const tool = globalThis.__registeredTools.get(invoke.name);
          if (tool) return await tool.execute(invoke.args || {}, { workspaceRoot: globalThis.__ROOT, ui: api.ui });
        } else if (invoke && invoke.kind === 'command') {
          const cmd = globalThis.__registeredCommands.get(invoke.name);
          if (cmd) return await cmd.execute(invoke.args || [], { workspaceRoot: globalThis.__ROOT, ui: api.ui });
        } else if (invoke && invoke.kind === 'event') {
          const aliases = Array.isArray(invoke.aliases) ? invoke.aliases : [];
          const names = [invoke.event, ...aliases];
          let decision;
          const tree = invoke.event === 'session_before_tree';
          const compact = invoke.event === 'session_before_compact';
          const notification = globalThis.__EVENT_NOTIFICATION;
          const transition = globalThis.__EVENT_TRANSITION;
          const tool = invoke.event === 'tool_result';
          let toolPayload = tool ? globalThis.__freezeCompactPayload(invoke.payload) : undefined;
          const messageEnd = invoke.event === 'message_end';
          let messagePayload = messageEnd ? globalThis.__freezeCompactPayload(invoke.payload) : undefined;
          const nativeInput = invoke.event === 'input';
          const guardedInput = nativeInput || invoke.event === 'UserPromptSubmit';
          const legacyInput = invoke.event === 'UserPromptSubmit';
          let inputPayload, transformed = false;
          const freezeInput = value => Object.freeze({ ...value,
            ...(value.images === undefined ? {} : { images: Object.freeze(value.images.map(image => Object.freeze(image))) }) });
          if (nativeInput) {
            const envelope = JSON.parse(globalThis.__INPUT_EVENT(invoke.payload, { action: 'continue' }));
            if (!envelope.ok) throw new Error('Extension input was refused.');
            inputPayload = freezeInput(envelope.value);
          }
          const payload = legacyInput ? globalThis.__captureInputHookPayload(invoke.payload)
            : tree || compact || notification || transition ? globalThis.__freezeCompactPayload(invoke.payload) : invoke.payload;
          const context = { workspaceRoot: globalThis.__ROOT, ui: api.ui };
          for (const eventName of names) {
            const list = globalThis.__registeredHandlers.get(eventName) || [];
            for (const handler of list) {
              let next;
              try {
                next = guardedInput ? (await globalThis.__captureInputCallback(
                  () => handler(nativeInput ? inputPayload : payload, { workspaceRoot: globalThis.__ROOT, ui: api.ui }), !nativeInput)).value
                  : compact ? (await globalThis.__captureCompactCallback(() => handler(payload, { workspaceRoot: globalThis.__ROOT, ui: api.ui }))).value
                  : tool ? (await globalThis.__captureToolCallback(() => handler(toolPayload, { workspaceRoot: globalThis.__ROOT, ui: api.ui }))).value
                  : messageEnd ? (await globalThis.__captureMessageCallback(() => handler(messagePayload, { workspaceRoot: globalThis.__ROOT, ui: api.ui }))).value
                  : transition ? (await globalThis.__captureCancellationCallback(() => handler(payload, context))).value
                  : notification ? await globalThis.__captureNotificationCallback(() => handler(payload, context))
                  : await handler(tree ? payload : decision ?? invoke.payload, context);
              }
              catch (error) {
                if (guardedInput) throw new Error('Extension input was refused.');
                if (tool || notification) continue;
                throw error;
              }
              if (nativeInput) {
                const envelope = JSON.parse(globalThis.__INPUT_RESULT(next));
                if (!envelope.ok) throw new Error('Extension input was refused.');
                const captured = envelope.value;
                if (captured.action === 'handled') return Object.freeze({ action: 'handled' });
                const projected = JSON.parse(globalThis.__INPUT_EVENT(inputPayload, captured));
                if (!projected.ok) throw new Error('Extension input was refused.');
                inputPayload = freezeInput(projected.value);
                transformed ||= captured.action === 'transform';
                continue;
              }
              if (legacyInput) {
                const reduced = globalThis.__reduceInputHook(decision, next);
                decision = reduced.result;
                if (reduced.stop) return decision;
                continue;
              }
              if (compact) {
                if (next?.cancel) return Object.freeze(Object.assign(Object.create(null), { cancel: true }));
                if (next?.summary !== undefined) decision = Object.freeze(Object.assign(Object.create(null), { summary: next.summary }));
                continue;
              }
              if (tool) {
                const reduced = globalThis.__reduceToolResult(toolPayload, decision, next);
                toolPayload = reduced.event;
                decision = reduced.result;
                continue;
              }
              if (messageEnd) {
                if (messagePayload.canReplace && next?.message) {
                  messagePayload = globalThis.__projectMessageEnd(messagePayload, next);
                  decision = next;
                }
                continue;
              }
              if (notification) continue;
              if (transition) {
                if (next === true) return Object.freeze({ cancel: true });
                continue;
              }
              if (tree && next !== undefined) {
                const envelope = JSON.parse(globalThis.__TREE_RESULT(next));
                if (!envelope.ok) throw new Error('Extension tree result must contain inert data.');
                const captured = envelope.value;
                if (captured.cancel) return Object.freeze({ cancel: true });
                decision = Object.freeze({ ...decision, ...captured, cancel: false });
              } else if (next !== undefined) decision = next;
            }
          }
          if (nativeInput) return transformed
            ? Object.freeze({ action: 'transform', text: inputPayload.text, ...(inputPayload.images === undefined ? {} : { images: inputPayload.images }) })
            : Object.freeze({ action: 'continue' });
          return transition ? Object.freeze({ cancel: false }) : decision;
        }
        if (typeof exp.run === 'function') {
          return await exp.run({ args: JSON.parse(globalThis.__ARGV), workspaceRoot: globalThis.__ROOT, api });
        }
        return 'Loaded extension successfully.';
      })()
    \` + (guardedInvoke ? '), ' + JSON.stringify(invokeEvent) + ')' : ''), { filename: 'extension-runner.js' });
    if (guardedInvoke) { runner.runInContext(vmCtx, { timeout: 5000 }); return; }
    const value = await Promise.resolve(runner.runInContext(vmCtx, { timeout: 5000 }));
    const isEventInvoke = Boolean(workerData.invoke && workerData.invoke.kind === 'event');
    if (qualify) {
      if (providerFailed) throw new Error('Installed extension provider registration was refused.');
      if (rendererFailed) throw new Error('Installed message renderer registration was refused.');
      parentPort.postMessage({ kind: 'done', json: JSON.stringify({ providers: [...registeredProviders], renderers: [...registeredRenderers.keys()] }) });
    } else if (render) {
      if (providerFailed || rendererFailed || workerData.invoke.messages.some(message => !registeredRenderers.has(message.customType))) {
        throw new Error('Installed message renderer changed.');
      }
      Object.defineProperty(vmCtx, '__renderBatch', { value: renderBatch });
      new vm.Script('__renderBatch()').runInContext(vmCtx, { timeout: 100 });
      parentPort.postMessage({ kind: 'done', json: JSON.stringify(rendered) });
    } else if (!isEventInvoke && value && typeof value === 'object' && typeof value.output === 'string' && typeof value.success === 'boolean') {
      parentPort.postMessage({ kind: value.success ? 'done' : 'error', json: value.output });
    } else {
      parentPort.postMessage({
        kind: 'done',
        json: isEventInvoke ? (value === undefined ? '' : JSON.stringify(value)) : (typeof value === 'string' ? value : JSON.stringify(value ?? '')),
      });
    }
  } catch (err) {
    parentPort.postMessage({ kind: 'error', json: isolated ? 'Isolated extension invocation failed.' : err instanceof Error ? err.message : String(err) });
  }
})();
`;

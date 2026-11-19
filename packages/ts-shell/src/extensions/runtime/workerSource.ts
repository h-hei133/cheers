import { createDataSnapshot } from '../../core/values/data.js';
import { createTreeResultCapture } from '../events/tree.js';
import { createInputEventCapture, createInputEventProjection, createInputHookPayloadCapture, createInputHookReducer, createInputHookResultCapture, createInputResultCapture, InputRefusal } from '../events/input.js';
import { createCallbackResultCapture } from '../../core/values/promise.js';

export const EXTENSION_WORKER_SOURCE = `
const vm = require('node:vm');
const { parentPort, workerData } = require('node:worker_threads');
const { types } = require('node:util');
// Compiled named functions retain this pure name decorator in their serialized bodies.
const __name = (target, value) => Object.defineProperty(target, 'name', { value, configurable: true });

// Use the same pure capture factories; their dependencies are explicit parameters.
const captureData = (${createDataSnapshot.toString()})(types.isProxy);
const captureTree = (${createTreeResultCapture.toString()})(captureData);
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
const inputResult = Object.setPrototypeOf(value => {
  try { return JSON.stringify({ ok: true, value: captureInput(value) }); }
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

const vmCtx = vm.createContext(Object.create(null), {
  name: 'extension-worker',
  codeGeneration: { strings: false, wasm: false },
});

const sendBridge = Object.setPrototypeOf((kind, jsonPayload) => {
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
Object.defineProperty(vmCtx, '__TREE_RESULT', { value: beforeTree, enumerable: false });
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
  delete globalThis.__send;
  delete globalThis.__onReply;
  delete globalThis.__PROMISE_BRAND;
  delete globalThis.__PROXY_BRAND;
  const __name = (target, value) => Object.defineProperty(target, 'name', { value, configurable: true });
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
  const reduceInputHook = (${createInputHookReducer.toString().replaceAll('\\', '\\\\')})(captureInputHook);
  const freezeData = value => {
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) freezeData(value[key]);
      Object.freeze(value);
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
  // Install completion observers before user handlers can change this realm's Promise hooks.
  globalThis.__finishInputRunner = operation => {
    const completed = captureCallback(operation, captureInputHook, {
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
  const registeredShortcuts = new Map();
  const registeredFlags = new Map();
  const flagValues = new Map();
  const busListeners = new Map();
  globalThis.__registeredTools = registeredTools;
  globalThis.__registeredCommands = registeredCommands;
  globalThis.__registeredHandlers = registeredHandlers;
  globalThis.__registeredShortcuts = registeredShortcuts;
  globalThis.__registeredFlags = registeredFlags;

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
      send('registerCommand', JSON.stringify({
        name: cmd.name,
        description: String(cmd.description ?? ''),
        aliases: Array.isArray(cmd.aliases) ? cmd.aliases.map(String) : [],
      }));
    },
    registerShortcut: (shortcut) => {
      if (!shortcut || typeof shortcut.key !== 'string' || !shortcut.key.trim()) {
        throw new Error('Extension registerShortcut requires { key }.');
      }
      registeredShortcuts.set(shortcut.key, shortcut);
      send('registerShortcut', JSON.stringify({ key: shortcut.key, description: String(shortcut.description ?? '') }));
    },
    registerFlag: (flag) => {
      if (!flag || typeof flag.name !== 'string' || !flag.name.trim()) {
        throw new Error('Extension registerFlag requires { name }.');
      }
      registeredFlags.set(flag.name, flag);
      if (!flagValues.has(flag.name) && 'default' in flag) flagValues.set(flag.name, flag.default);
      send('registerFlag', JSON.stringify({ name: flag.name, type: flag.type ?? 'string', description: String(flag.description ?? '') }));
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
    sendMessage: (msg) => rpc('host.sendMessage', { msg }),
    appendEntry: (customType, data) => rpc('host.appendEntry', { customType: String(customType ?? ''), data }),
  };
})();
\`, { filename: 'extension-bootstrap.js' });

bootstrap.runInContext(vmCtx);

parentPort.on('message', (msg) => {
  if (msg && msg.kind === 'reply' && typeof dispatchReply === 'function') {
    dispatchReply(msg.id, msg.ok, msg.json);
  }
});

(async () => {
  try {
    const script = new vm.Script(workerData.code, { filename: workerData.filename });
    script.runInContext(vmCtx, { timeout: 5000 });
    const guardedInputInvoke = Boolean(workerData.invoke && workerData.invoke.kind === 'event'
      && (workerData.invoke.event === 'input' || workerData.invoke.event === 'UserPromptSubmit'));
    const runner = new vm.Script((guardedInputInvoke ? 'globalThis.__finishInputRunner(() => (' : '') + \`
      (async () => {
        const exp = module.exports || {};
        if (typeof exp.default === 'function') await exp.default(api);
        else if (typeof exp.activate === 'function') await exp.activate(api);
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
          const payload = legacyInput ? globalThis.__captureInputHookPayload(invoke.payload) : tree ? Object.freeze(invoke.payload) : invoke.payload;
          for (const eventName of names) {
            const list = globalThis.__registeredHandlers.get(eventName) || [];
            for (const handler of list) {
              let next;
              try {
                next = guardedInput ? (await globalThis.__captureInputCallback(
                  () => handler(nativeInput ? inputPayload : payload, { workspaceRoot: globalThis.__ROOT, ui: api.ui }), !nativeInput)).value
                  : await handler(tree ? payload : decision ?? invoke.payload, { workspaceRoot: globalThis.__ROOT, ui: api.ui });
              }
              catch (error) { if (guardedInput) throw new Error('Extension input was refused.'); throw error; }
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
          return decision;
        }
        if (typeof exp.run === 'function') {
          return await exp.run({ args: JSON.parse(globalThis.__ARGV), workspaceRoot: globalThis.__ROOT, api });
        }
        return 'Loaded extension successfully.';
      })()
    \` + (guardedInputInvoke ? '))' : ''), { filename: 'extension-runner.js' });
    if (guardedInputInvoke) { runner.runInContext(vmCtx, { timeout: 5000 }); return; }
    const value = await Promise.resolve(runner.runInContext(vmCtx, { timeout: 5000 }));
    const isEventInvoke = Boolean(workerData.invoke && workerData.invoke.kind === 'event');
    if (!isEventInvoke && value && typeof value === 'object' && typeof value.output === 'string' && typeof value.success === 'boolean') {
      parentPort.postMessage({ kind: value.success ? 'done' : 'error', json: value.output });
    } else {
      parentPort.postMessage({
        kind: 'done',
        json: isEventInvoke ? (value === undefined ? '' : JSON.stringify(value)) : (typeof value === 'string' ? value : JSON.stringify(value ?? '')),
      });
    }
  } catch (err) {
    parentPort.postMessage({ kind: 'error', json: err instanceof Error ? err.message : String(err) });
  }
})();
`;

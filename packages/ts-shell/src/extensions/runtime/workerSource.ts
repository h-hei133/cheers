export const EXTENSION_WORKER_SOURCE = `
const vm = require('node:vm');
const { parentPort, workerData } = require('node:worker_threads');

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

const bootstrap = new vm.Script(\`
(() => {
  const send = globalThis.__send;
  const onReply = globalThis.__onReply;
  delete globalThis.__send;
  delete globalThis.__onReply;

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
    editor: (title, prefill) => rpc('ui.editor', { title: String(title ?? ''), prefill: prefill === undefined ? undefined : String(prefill) }),
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
    const runner = new vm.Script(\`
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
          for (const eventName of names) {
            const list = globalThis.__registeredHandlers.get(eventName) || [];
            for (const handler of list) {
              const next = await handler(decision ?? invoke.payload, { workspaceRoot: globalThis.__ROOT, ui: api.ui });
              if (next !== undefined) decision = next;
            }
          }
          return decision;
        }
        if (typeof exp.run === 'function') {
          return await exp.run({ args: JSON.parse(globalThis.__ARGV), workspaceRoot: globalThis.__ROOT, api });
        }
        return 'Loaded extension successfully.';
      })()
    \`, { filename: 'extension-runner.js' });
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

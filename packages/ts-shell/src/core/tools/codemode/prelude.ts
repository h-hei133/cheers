export const CODEMODE_WORKER_SOURCE = `
const vm = require('node:vm');
const { parentPort, workerData } = require('node:worker_threads');

const vmCtx = vm.createContext(Object.create(null), {
  name: 'codemode-sandbox',
  codeGeneration: { strings: false, wasm: false },
});

const sendBridge = Object.setPrototypeOf((kind, jsonPayload) => {
  parentPort.postMessage({ kind: String(kind), json: String(jsonPayload ?? '') });
}, null);

let dispatchReply = null;
const registerReceiver = Object.setPrototypeOf((fn) => {
  dispatchReply = fn;
}, null);
let pendingCounter = () => 0;
const registerPending = Object.setPrototypeOf((fn) => {
  pendingCounter = fn;
}, null);
let snapshotWrites = () => ({});
const registerWrites = Object.setPrototypeOf((fn) => {
  snapshotWrites = fn;
}, null);

Object.defineProperty(vmCtx, '__send', { value: sendBridge, enumerable: false });
Object.defineProperty(vmCtx, '__onReply', { value: registerReceiver, enumerable: false });
Object.defineProperty(vmCtx, '__registerPending', { value: registerPending, enumerable: false });
Object.defineProperty(vmCtx, '__registerWrites', { value: registerWrites, enumerable: false });
Object.defineProperty(vmCtx, '__ALL_TOOLS_JSON', { value: JSON.stringify(workerData.allTools), enumerable: false });
Object.defineProperty(vmCtx, '__STORE_JSON', { value: JSON.stringify(workerData.initialStore || {}), enumerable: false });
Object.defineProperty(vmCtx, '__MODELS_JSON', { value: JSON.stringify(workerData.models || []), enumerable: false });
Object.defineProperty(vmCtx, '__MAX_OUTPUT_CHARS', { value: Number(workerData.maxOutputChars || 65536), enumerable: false });
Object.defineProperty(vmCtx, '__MAX_STORE_VALUE', { value: Number(workerData.maxStoreValueChars || 262144), enumerable: false });
Object.defineProperty(vmCtx, '__MAX_STORE_TOTAL', { value: Number(workerData.maxStoreTotalChars || 1048576), enumerable: false });

const bootstrap = new vm.Script(\`
(() => {
  const send = globalThis.__send;
  const onReply = globalThis.__onReply;
  const registerPending = globalThis.__registerPending;
  const registerWrites = globalThis.__registerWrites;
  const allToolsList = JSON.parse(globalThis.__ALL_TOOLS_JSON);
  const storeMap = new Map(Object.entries(JSON.parse(globalThis.__STORE_JSON)));
  const writesMap = new Map();
  const modelsCatalog = Object.freeze(JSON.parse(globalThis.__MODELS_JSON));
  const MAX_OUT = globalThis.__MAX_OUTPUT_CHARS;
  const MAX_VAL = globalThis.__MAX_STORE_VALUE;
  const MAX_TOT = globalThis.__MAX_STORE_TOTAL;
  delete globalThis.__send;
  delete globalThis.__onReply;
  delete globalThis.__registerPending;
  delete globalThis.__registerWrites;
  delete globalThis.__ALL_TOOLS_JSON;
  delete globalThis.__STORE_JSON;
  delete globalThis.__MODELS_JSON;
  delete globalThis.__MAX_OUTPUT_CHARS;
  delete globalThis.__MAX_STORE_VALUE;
  delete globalThis.__MAX_STORE_TOTAL;

  let seq = 0;
  let emittedChars = 0;
  let emittedItems = 0;
  const MAX_ITEMS = 10000;
  const pending = new Map();
  registerPending(() => pending.size);
  registerWrites(() => Object.fromEntries(writesMap.entries()));

  onReply((id, ok, json) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) entry.resolve(json === '' ? undefined : JSON.parse(json));
    else entry.reject(new Error(json || 'Nested call failed.'));
  });

  function rpc(op, payload) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send('rpc', JSON.stringify({ id, op, payload }));
    });
  }

  function emitBounded(kind, payload) {
    emittedItems += 1;
    if (emittedItems > MAX_ITEMS) throw new Error('Exceeded maximum codemode output item count.');
    emittedChars += payload.length;
    if (emittedChars > MAX_OUT * 4) throw new Error('Exceeded codemode in-VM output buffer limit.');
    send(kind, payload);
  }

  class ExitSignal extends Error {
    constructor() { super('CODEMODE_EXIT'); }
  }
  globalThis.__ExitSignal = ExitSignal;

  function fmt(v) {
    if (typeof v === 'string') return v;
    if (v === undefined) return '';
    try { return JSON.stringify(v, null, 2); } catch { return String(v); }
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 4;
    const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
    for (let j = 1; j <= b.length; j += 1) {
      let prev = dp[0];
      dp[0] = j;
      for (let i = 1; i <= a.length; i += 1) {
        const next = dp[i];
        dp[i] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[i], dp[i - 1]);
        prev = next;
      }
    }
    return dp[a.length];
  }

  function suggest(target, candidates) {
    const lower = target.toLowerCase();
    const maxDist = Math.max(1, Math.min(3, Math.floor(lower.length / 3) + 1));
    return candidates.filter(c => {
      const lc = c.toLowerCase();
      return lc.includes(lower) || lower.includes(lc) || editDistance(lower, lc) <= maxDist;
    }).slice(0, 5);
  }

  const toolsObj = Object.create(null);
  for (const toolName of allToolsList) {
    Object.defineProperty(toolsObj, toolName, {
      value: Object.freeze((args) => rpc('call', { name: toolName, args })),
      enumerable: true,
    });
  }

  globalThis.ALL_TOOLS = Object.freeze([...allToolsList]);
  globalThis.tools = new Proxy(toolsObj, {
    get(target, prop) {
      if (typeof prop !== 'string') return undefined;
      if (Object.prototype.hasOwnProperty.call(target, prop)) return target[prop];
      const hints = suggest(prop, allToolsList);
      const suffix = hints.length ? ' Did you mean: ' + hints.join(', ') + '?' : '';
      throw new TypeError('Unknown tool: tools.' + prop + '.' + suffix);
    },
  });

  globalThis.text = (v) => { const s = fmt(v); if (s) emitBounded('text', s); };
  globalThis.image = (item) => rpc('image', { item });
  globalThis.console = Object.freeze({
    log: (...a) => emitBounded('console', a.map(fmt).join(' ')),
    info: (...a) => emitBounded('console', a.map(fmt).join(' ')),
    warn: (...a) => emitBounded('console', a.map(fmt).join(' ')),
    error: (...a) => emitBounded('console', a.map(fmt).join(' ')),
  });

  globalThis.store = (key, value) => {
    if (typeof key !== 'string' || !key) throw new Error('store(key, value) requires a string key.');
    if (value === undefined) {
      storeMap.delete(key);
      writesMap.set(key, null);
      return;
    }
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') throw new Error('store(key, value) value must be JSON-serializable.');
    if (serialized.length > MAX_VAL) throw new Error('store(key, value) value exceeds maximum size.');
    let total = 0;
    for (const [k, v] of storeMap.entries()) total += k.length + v.length;
    const prev = storeMap.get(key);
    const nextTotal = total - (prev ? key.length + prev.length : 0) + key.length + serialized.length;
    if (nextTotal > MAX_TOT) throw new Error('store() exceeded total session storage limit.');
    storeMap.set(key, serialized);
    writesMap.set(key, serialized);
  };

  globalThis.load = (key) => {
    if (typeof key !== 'string' || !key) return undefined;
    const raw = storeMap.get(key);
    return raw === undefined ? undefined : JSON.parse(raw);
  };

  globalThis.searchTools = (query, opts) => rpc('searchTools', {
    query: String(query ?? ''),
    limit: opts && opts.limit,
    namespace: opts && opts.namespace,
  });
  globalThis.describeTool = (name) => rpc('describeTool', { name: String(name ?? '') });
  globalThis.describeNamespace = (name) => rpc('describeNamespace', { name: String(name ?? '') });
  globalThis.models = Object.freeze({
    list: (provider) => provider
      ? modelsCatalog.filter(m => m.provider === String(provider))
      : modelsCatalog,
    get: (provider, id) => modelsCatalog.find(m => m.provider === String(provider) && m.id === String(id)) ?? null,
  });
  globalThis.exit = () => { throw new ExitSignal(); };

  // Prototype & global lockdown (with allowOverride for Error subclasses)
  const OVERRIDABLE = new Set(['constructor', 'name', 'message', 'toString', 'toLocaleString', 'valueOf', 'toJSON']);
  const frozen = new WeakSet();
  function freezeProto(obj) {
    if (!obj || (typeof obj !== 'object' && typeof obj !== 'function') || frozen.has(obj)) return;
    frozen.add(obj);
    for (const key of Reflect.ownKeys(obj)) {
      if (typeof key === 'string' && OVERRIDABLE.has(key)) {
        const desc = Object.getOwnPropertyDescriptor(obj, key);
        if (desc && desc.configurable && 'value' in desc && desc.writable) {
          let current = desc.value;
          Object.defineProperty(obj, key, {
            enumerable: desc.enumerable,
            configurable: false,
            get() { return current; },
            set(v) {
              if (this === obj) throw new TypeError('Cannot assign to read-only property ' + String(key));
              Object.defineProperty(this, key, { value: v, writable: true, enumerable: true, configurable: true });
            },
          });
        }
      }
    }
    try { Object.freeze(obj); } catch {}
  }
  const AsyncFn = (async () => {}).constructor;
  const GenFn = (function* () {}).constructor;
  for (const proto of [
    Object.prototype, Array.prototype, Function.prototype, String.prototype, Number.prototype,
    Boolean.prototype, RegExp.prototype, Date.prototype, Promise.prototype, Map.prototype, Set.prototype,
    Error.prototype, TypeError.prototype, RangeError.prototype, SyntaxError.prototype,
    AsyncFn && AsyncFn.prototype, GenFn && GenFn.prototype, JSON, Math,
  ]) {
    freezeProto(proto);
  }
})();
\`, { filename: 'codemode-bootstrap.js' });

bootstrap.runInContext(vmCtx);

parentPort.on('message', (msg) => {
  if (msg && msg.kind === 'reply' && typeof dispatchReply === 'function') {
    dispatchReply(msg.id, msg.ok, msg.json);
  }
});

(async () => {
  let settled = false;
  try {
    // Line 1 wrapper keeps user line numbers 1:1 with input script.
    const script = new vm.Script('(async () => {"use strict";' + workerData.code + '\\n})()', {
      filename: 'codemode-script.js',
    });
    const runPromise = Promise.resolve(script.runInContext(vmCtx, { timeout: 5000 }));
    let idleTicks = 0;
    const stallPoll = () => {
      if (settled) return;
      if (pendingCounter() === 0) {
        idleTicks += 1;
        if (idleTicks >= 2) {
          settled = true;
          parentPort.postMessage({ kind: 'error', json: 'Script stalled: top-level promise did not settle with no pending operations.' });
          return;
        }
      } else {
        idleTicks = 0;
      }
      setTimeout(stallPoll, 20).unref?.();
    };
    setImmediate(stallPoll);
    const val = await runPromise;
    if (settled) return;
    settled = true;
    let returnJson = '';
    if (val !== undefined) {
      returnJson = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    }
    parentPort.postMessage({ kind: 'done', json: JSON.stringify({ returnJson, writes: snapshotWrites() }) });
  } catch (err) {
    if (settled) return;
    settled = true;
    if (err && err.message === 'CODEMODE_EXIT') {
      parentPort.postMessage({ kind: 'exit', json: JSON.stringify({ writes: snapshotWrites() }) });
    } else {
      parentPort.postMessage({ kind: 'error', json: err instanceof Error ? err.message : String(err) });
    }
  }
})();
`;

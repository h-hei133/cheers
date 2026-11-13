import { Worker } from 'node:worker_threads'
import type { ToolDefinition } from '../../../tools/types.js'
import { rankToolsByBm25 } from '../discovery/ranker.js'
import { approvedResult, deniedResult } from '../toolResultLifecycle.js'
import { NestedToolCallRunner } from './nestedCalls.js'

export const CODEMODE_TOOL_NAME = 'codemode'
const DEFAULT_SCRIPT_TIMEOUT_MS = 30_000
const MAX_SCRIPT_TIMEOUT_MS = 120_000
const MAX_STORED_SESSIONS = 64

const sessionStores = new Map<string, Map<string, string>>()

export function clearCodemodeStore(sessionId: string): void {
  sessionStores.delete(sessionId)
}

function getSessionStore(sessionId: string): Map<string, string> {
  let store = sessionStores.get(sessionId)
  if (!store) {
    if (sessionStores.size >= MAX_STORED_SESSIONS) {
      const oldest = sessionStores.keys().next().value
      if (oldest !== undefined) sessionStores.delete(oldest)
    }
    store = new Map()
    sessionStores.set(sessionId, store)
  }
  return store
}

function parseScriptOptions(code: string): { readonly timeoutMs: number } {
  const firstLine = code.split('\n', 1)[0]?.trim() ?? ''
  if (!firstLine.startsWith('// @options:')) {
    return { timeoutMs: DEFAULT_SCRIPT_TIMEOUT_MS }
  }
  try {
    const parsed: unknown = JSON.parse(firstLine.slice('// @options:'.length).trim())
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'timeout_ms' in parsed &&
      typeof parsed.timeout_ms === 'number' &&
      Number.isFinite(parsed.timeout_ms)
    ) {
      return {
        timeoutMs: Math.max(100, Math.min(MAX_SCRIPT_TIMEOUT_MS, Math.trunc(parsed.timeout_ms))),
      }
    }
  } catch {
    // Ignore malformed option comment and use default timeout.
  }
  return { timeoutMs: DEFAULT_SCRIPT_TIMEOUT_MS }
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return value
  if (value === undefined) return ''
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatCodemodeOutput(
  header: string,
  textItems: readonly string[],
  consoleLines: readonly string[],
  errorMessage?: string,
): string {
  const parts: string[] = [header]
  if (textItems.length === 1) {
    parts.push(textItems[0]!)
  } else if (textItems.length > 1) {
    textItems.forEach((item, idx) => {
      parts.push(`==> text ${idx + 1}/${textItems.length} <==\n${item}`)
    })
  }
  if (consoleLines.length > 0) {
    parts.push(`<console_output>\n${consoleLines.join('\n')}\n</console_output>`)
  }
  if (errorMessage) {
    parts.push(`Script error: ${errorMessage}`)
  }
  return parts.join('\n\n')
}

const CODEMODE_WORKER_SOURCE = `
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

Object.defineProperty(vmCtx, '__send', { value: sendBridge, enumerable: false });
Object.defineProperty(vmCtx, '__onReply', { value: registerReceiver, enumerable: false });
Object.defineProperty(vmCtx, '__ALL_TOOLS_JSON', { value: JSON.stringify(workerData.allTools), enumerable: false });

const bootstrap = new vm.Script(\`
(() => {
  const send = globalThis.__send;
  const onReply = globalThis.__onReply;
  const allToolsJson = globalThis.__ALL_TOOLS_JSON;
  delete globalThis.__send;
  delete globalThis.__onReply;
  delete globalThis.__ALL_TOOLS_JSON;

  let seq = 0;
  const pending = new Map();
  onReply((id, ok, json) => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    if (ok) {
      entry.resolve(json === '' ? undefined : JSON.parse(json));
    } else {
      entry.reject(new Error(json || 'Nested call failed.'));
    }
  });

  function rpc(op, payload) {
    const id = ++seq;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      send('rpc', JSON.stringify({ id, op, payload }));
    });
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

  globalThis.ALL_TOOLS = Object.freeze(JSON.parse(allToolsJson));
  globalThis.tools = new Proxy(Object.create(null), {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      return (args) => rpc('call', { name: prop, args });
    },
  });
  globalThis.text = (v) => { const s = fmt(v); if (s) send('text', s); };
  globalThis.console = Object.freeze({
    log: (...a) => send('console', a.map(fmt).join(' ')),
    info: (...a) => send('console', a.map(fmt).join(' ')),
    warn: (...a) => send('console', a.map(fmt).join(' ')),
    error: (...a) => send('console', a.map(fmt).join(' ')),
  });
  globalThis.store = (key, value) => {
    if (typeof key !== 'string' || !key) throw new Error('store(key, value) requires a string key.');
    return rpc('store', { key, valueJson: value === undefined ? null : JSON.stringify(value) });
  };
  globalThis.load = (key) => {
    if (typeof key !== 'string' || !key) return undefined;
    return rpc('load', { key });
  };
  globalThis.searchTools = (query, opts) => rpc('searchTools', { query: String(query ?? ''), limit: opts && opts.limit });
  globalThis.describeTool = (name) => rpc('describeTool', { name: String(name ?? '') });
  globalThis.exit = () => { throw new ExitSignal(); };
})();
\`, { filename: 'codemode-bootstrap.js' });

bootstrap.runInContext(vmCtx);

parentPort.on('message', (msg) => {
  if (msg && msg.kind === 'reply' && typeof dispatchReply === 'function') {
    dispatchReply(msg.id, msg.ok, msg.json);
  }
});

(async () => {
  try {
    const script = new vm.Script('(async () => {\\n' + workerData.code + '\\n})()', {
      filename: 'codemode-script.js',
    });
    const val = await Promise.resolve(script.runInContext(vmCtx, { timeout: 5000 }));
    let returnJson = '';
    if (val !== undefined) {
      returnJson = typeof val === 'string' ? val : JSON.stringify(val, null, 2);
    }
    parentPort.postMessage({ kind: 'done', json: returnJson });
  } catch (err) {
    if (err && err.message === 'CODEMODE_EXIT') {
      parentPort.postMessage({ kind: 'exit', json: '' });
    } else {
      parentPort.postMessage({ kind: 'error', json: err instanceof Error ? err.message : String(err) });
    }
  }
})();
`

type WorkerInbound =
  | { readonly kind: 'rpc'; readonly json: string }
  | { readonly kind: 'text'; readonly json: string }
  | { readonly kind: 'console'; readonly json: string }
  | { readonly kind: 'done'; readonly json: string }
  | { readonly kind: 'exit'; readonly json: string }
  | { readonly kind: 'error'; readonly json: string }

/**
 * Sandboxed JavaScript tool composition (`codemode`).
 *
 * Executes user JS inside an isolated Node Worker (`env: {}`, bounded heap,
 * terminable on async timeout/abort) + strict `node:vm` context with
 * `codeGeneration: { strings: false, wasm: false }` and zero host-realm builtins.
 */
export function createCodemodeToolDefinition(
  resolveTools: () => ReadonlyMap<string, ToolDefinition>,
): ToolDefinition {
  return {
    name: CODEMODE_TOOL_NAME,
    description:
      'Run JavaScript in an isolated sandbox to compose, batch (Promise.allSettled), chain, and filter tool calls in a single turn without intermediate context pollution. Globals: `await tools.<name>(args)`, `ALL_TOOLS`, `text(value)`, `console.log(...)`, `await store(key, value)`, `await load(key)`, `await searchTools(query, { limit? })`, `await describeTool(name)`, `exit()`, and top-level `return`.',
    argsSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description:
            'Raw JavaScript async function body (top-level await and return supported). Optional first line: // @options: {"timeout_ms": 30000}',
        },
      },
    },
    async execute(args, context) {
      const code = typeof args.code === 'string' ? args.code : ''
      if (!code.trim()) {
        return deniedResult('Error: codemode requires a non-empty `code` string.')
      }
      if (context.abortSignal?.aborted) {
        return deniedResult('Script failed\n\nScript error: Operation aborted.')
      }
      const { timeoutMs } = parseScriptOptions(code)
      const catalog = resolveTools()
      const runner = new NestedToolCallRunner({
        parentToolCallId: context.taskId || 'codemode',
        resolveTool: name => catalog.get(name),
        context,
      })

      const textItems: string[] = []
      const consoleLines: string[] = []
      const kvStore = context.sessionId ? getSessionStore(context.sessionId) : new Map<string, string>()
      const allToolsList = [...catalog.keys()].filter(name => name !== CODEMODE_TOOL_NAME)

      const worker = new Worker(CODEMODE_WORKER_SOURCE, {
        eval: true,
        env: {},
        resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
        workerData: { code, allTools: allToolsList },
      })

      const handleRpc = async (raw: string): Promise<{ ok: boolean; json: string }> => {
        try {
          const parsed = JSON.parse(raw) as { id: number; op: string; payload: Record<string, unknown> }
          const { op, payload } = parsed
          if (op === 'call') {
            const out = await runner.call(String(payload.name ?? ''), payload.args)
            return { ok: true, json: JSON.stringify(out) }
          }
          if (op === 'searchTools') {
            const limit = Math.max(1, Math.min(20, Math.trunc(Number(payload.limit ?? 8) || 8)))
            const candidates = [...catalog.values()].filter(t => t.name !== CODEMODE_TOOL_NAME)
            const matches = rankToolsByBm25(String(payload.query ?? ''), candidates, limit).map(t => ({
              name: t.name,
              description: t.description.split('\n')[0]!.slice(0, 240),
            }))
            return { ok: true, json: JSON.stringify(matches) }
          }
          if (op === 'describeTool') {
            const found = catalog.get(String(payload.name ?? ''))
            if (!found || found.name === CODEMODE_TOOL_NAME) return { ok: true, json: 'null' }
            return {
              ok: true,
              json: JSON.stringify({ name: found.name, description: found.description, parameters: found.argsSchema }),
            }
          }
          if (op === 'store') {
            const key = String(payload.key ?? '')
            if (!key) throw new Error('store(key, value) requires a string key.')
            if (payload.valueJson === null) kvStore.delete(key)
            else kvStore.set(key, String(payload.valueJson))
            return { ok: true, json: '' }
          }
          if (op === 'load') {
            const rawVal = kvStore.get(String(payload.key ?? ''))
            return { ok: true, json: rawVal === undefined ? '' : rawVal }
          }
          throw new Error(`Unknown codemode RPC op: ${op}`)
        } catch (err) {
          return { ok: false, json: err instanceof Error ? err.message : String(err) }
        }
      }

      try {
        const result = await new Promise<{ readonly ok: boolean; readonly error?: string }>((resolve) => {
          let settled = false
          const finish = (outcome: { readonly ok: boolean; readonly error?: string }) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            context.abortSignal?.removeEventListener('abort', onAbort)
            resolve(outcome)
          }
          const onAbort = () => {
            void worker.terminate()
            finish({ ok: false, error: 'Operation aborted.' })
          }
          const timer = setTimeout(() => {
            void worker.terminate()
            finish({ ok: false, error: `Script timed out after ${timeoutMs}ms.` })
          }, timeoutMs)
          timer.unref?.()
          context.abortSignal?.addEventListener('abort', onAbort, { once: true })

          worker.on('message', (msg: WorkerInbound) => {
            if (msg.kind === 'text') {
              if (msg.json) textItems.push(msg.json)
            } else if (msg.kind === 'console') {
              consoleLines.push(msg.json)
            } else if (msg.kind === 'done') {
              const formatted = formatValue(msg.json)
              if (formatted) textItems.push(formatted)
              finish({ ok: true })
            } else if (msg.kind === 'exit') {
              finish({ ok: true })
            } else if (msg.kind === 'error') {
              finish({ ok: false, error: msg.json })
            } else if (msg.kind === 'rpc') {
              const parsed = JSON.parse(msg.json) as { id: number }
              void handleRpc(msg.json).then(reply => {
                if (!settled) {
                  worker.postMessage({ kind: 'reply', id: parsed.id, ok: reply.ok, json: reply.json })
                }
              })
            }
          })
          worker.on('error', err => finish({ ok: false, error: err instanceof Error ? err.message : String(err) }))
          worker.on('exit', code => {
            if (!settled) finish({ ok: false, error: `Sandbox worker exited unexpectedly (${code}).` })
          })
        })

        const nestedCalls = runner.recorder.snapshot()
        return result.ok
          ? approvedResult(
              formatCodemodeOutput('Script completed', textItems, consoleLines),
              nestedCalls ? { nestedCalls } : undefined,
            )
          : deniedResult(
              formatCodemodeOutput('Script failed', textItems, consoleLines, result.error),
              nestedCalls ? { nestedCalls } : undefined,
            )
      } finally {
        await worker.terminate().catch(() => {})
      }
    },
  }
}

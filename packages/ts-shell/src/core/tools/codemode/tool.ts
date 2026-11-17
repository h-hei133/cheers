import { Worker } from 'node:worker_threads'
import type { ToolDefinition } from '../../../tools/types.js'
import { rankToolsByBm25 } from '../discovery/ranker.js'
import { approvedResult, deniedResult } from '../toolResultLifecycle.js'
import { NestedToolCallRunner } from './nestedCalls.js'
import { renderToolSample, toolNamespace } from './declarations.js'
import { CodemodeOutput } from './output.js'
import { parseCodemodeScript } from './options.js'
import { CODEMODE_WORKER_SOURCE } from './prelude.js'
import { loadCodemodeStore, MAX_STORE_TOTAL_CHARS, MAX_STORE_VALUE_CHARS } from './store.js'
import { CodemodeStoreError, type CodemodeStoreStatus } from './state.js'
import { runCodemodeWorker, type ScriptRpc } from './execution.js'
import { projectCallableCatalog } from './catalog.js'
import { projectCodemodeModels } from './models.js'

export const CODEMODE_TOOL_NAME = 'codemode'
const MAX_CONCURRENT_WORKERS = 4
let activeWorkers = 0
const workerQueue: Array<() => void> = []

function acquireWorkerSlot(signal?: AbortSignal): Promise<() => void> {
  if (signal?.aborted) return Promise.reject(new Error('Operation aborted.'))
  if (activeWorkers < MAX_CONCURRENT_WORKERS) {
    activeWorkers += 1
    let released = false
    return Promise.resolve(() => {
      if (released) return
      released = true
      activeWorkers = Math.max(0, activeWorkers - 1)
      workerQueue.shift()?.()
    })
  }
  return new Promise((resolve, reject) => {
    const start = () => {
      signal?.removeEventListener('abort', onAbort)
      activeWorkers += 1
      let released = false
      resolve(() => {
        if (released) return
        released = true
        activeWorkers = Math.max(0, activeWorkers - 1)
        workerQueue.shift()?.()
      })
    }
    const onAbort = () => {
      const idx = workerQueue.indexOf(start)
      if (idx >= 0) workerQueue.splice(idx, 1)
      reject(new Error('Operation aborted.'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    workerQueue.push(start)
  })
}

/**
 * Sandboxed JavaScript tool composition (`codemode`).
 *
 * Runs inside an isolated Worker (`env: {}`, bounded heap) + locked-down `node:vm`
 * context (`codeGeneration: { strings: false, wasm: false }`) with TS declaration
 * discovery, magic-byte `image()`, branch-scoped `store`/`load`, and stall detection.
 */
export function createCodemodeToolDefinition(resolveTools: () => ReadonlyMap<string, ToolDefinition>): ToolDefinition {
  return {
    name: CODEMODE_TOOL_NAME,
    description:
      'Run JavaScript in an isolated sandbox to compose, batch (Promise.allSettled), chain, and filter tool calls in a single turn. Globals: `await tools.<name>(args)`, `ALL_TOOLS`, `text(value)`, `await image(dataUriOrObj)`, `console.log(...)`, `store(key, value)` / `load(key)` (branch-scoped), `await searchTools(query, { limit?, namespace? })`, `await describeTool(name)`, `await describeNamespace(name)`, `models.list()` / `models.get(provider, id)`, `exit()`, and top-level `return`.',
    argsSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description: 'Raw JavaScript async function body. Optional line 1: // @options: {"timeout_ms": 30000, "max_output_tokens": 16000}',
        },
      },
    },
    async execute(args, context) {
      const code = typeof args.code === 'string' ? args.code : ''
      if (!code.trim()) return deniedResult('Error: codemode requires a non-empty `code` string.')
      if (context.abortSignal?.aborted) return deniedResult('Script failed\n\nScript error: Operation aborted.')

      let parsedScript: ReturnType<typeof parseCodemodeScript>
      try {
        parsedScript = parseCodemodeScript(code)
      } catch (err) {
        return deniedResult(`Script failed\n\nScript error: ${err instanceof Error ? err.message : String(err)}`)
      }

      const releaseSlot = await acquireWorkerSlot(context.abortSignal).catch(err => err as Error)
      if (releaseSlot instanceof Error) return deniedResult(`Script failed\n\nScript error: ${releaseSlot.message}`)

      let catalog: ReadonlyMap<string, ToolDefinition>
      let runner: NestedToolCallRunner
      let storeHandle: ReturnType<typeof loadCodemodeStore>
      let allToolsList: string[]
      let worker: Worker
      const output = new CodemodeOutput(parsedScript.maxOutputChars)
      const scriptController = new AbortController()
      let callable: ReturnType<typeof projectCallableCatalog>
      try {
        catalog = context.toolCatalog ?? this.nestedToolCatalog?.() ?? resolveTools()
        callable = projectCallableCatalog([...catalog.keys()].filter(name => name !== CODEMODE_TOOL_NAME))
        runner = new NestedToolCallRunner({
          parentToolCallId: context.taskId || 'codemode',
          resolveTool: name => catalog.get(name),
          context: { ...context, abortSignal: scriptController.signal },
        })
        storeHandle = loadCodemodeStore(context.sessionId, context.workspaceRoot)
        allToolsList = [...catalog.keys()].filter(name => name !== CODEMODE_TOOL_NAME)
        worker = new Worker(CODEMODE_WORKER_SOURCE, {
          eval: true,
          env: {},
          resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
          workerData: {
            code: parsedScript.strippedCode,
            allTools: allToolsList,
            callableTools: callable.tools,
            initialStore: storeHandle.initial,
            models: projectCodemodeModels(context.modelCatalog),
            maxOutputChars: parsedScript.maxOutputChars,
            maxStoreValueChars: MAX_STORE_VALUE_CHARS,
            maxStoreTotalChars: MAX_STORE_TOTAL_CHARS,
          },
        })
      } catch (err) {
        releaseSlot()
        if (err instanceof CodemodeStoreError) return deniedResult(`Script failed\n\n${err.message}`, {
          codemodeStore: { status: err.status, reason: err.reason },
        })
        throw err
      }

      const handleRpc = async ({ op, payload }: ScriptRpc): Promise<{ ok: boolean; json: string; terminate?: boolean }> => {
        try {
          if (op === 'call') {
            return { ok: true, json: JSON.stringify(await runner.call(String(payload.name ?? ''), payload.args)),
              ...(runner.terminate ? { terminate: true } : {}) }
          }
          if (op === 'searchTools') {
            const limit = Math.max(1, Math.min(20, Math.trunc(Number(payload.limit ?? 8) || 8)))
            const nsFilter = typeof payload.namespace === 'string' ? payload.namespace : undefined
            const candidates = [...catalog.values()].filter(t => t.name !== CODEMODE_TOOL_NAME && (!nsFilter || toolNamespace(t.name) === nsFilter))
            const matches = rankToolsByBm25(String(payload.query ?? ''), candidates, limit).map(t => ({
              name: t.name,
              namespace: toolNamespace(t.name),
              description: renderToolSample(t, callable.tools.find(value => value.name === t.name)?.expression),
            }))
            return { ok: true, json: JSON.stringify(matches) }
          }
          if (op === 'describeTool') {
            const found = catalog.get(callable.lookup[String(payload.name ?? '')] ?? '')
            if (!found || found.name === CODEMODE_TOOL_NAME) return { ok: true, json: 'null' }
            return { ok: true, json: JSON.stringify(renderToolSample(found, callable.tools.find(value => value.name === found.name)?.expression)) }
          }
          if (op === 'describeNamespace') {
            const ns = String(payload.name ?? '')
            const toolsInNs = allToolsList.filter(name => toolNamespace(name) === ns)
            return { ok: true, json: JSON.stringify(toolsInNs.length ? { name: ns, tools: toolsInNs } : null) }
          }
          if (op === 'image') {
            const item = payload.item
            if (item && typeof item === 'object' && Array.isArray((item as { images?: unknown }).images)) {
              const images = (item as { images: unknown[] }).images
              if (images.length > 4) throw new Error('image() received too many nested images.')
              for (const image of images) output.image(image)
            } else output.image(item)
            return { ok: true, json: '' }
          }
          throw new Error(`Unknown codemode RPC op: ${op}`)
        } catch (err) {
          return { ok: false, json: err instanceof Error ? err.message : String(err),
            ...(runner.terminate ? { terminate: true } : {}) }
        }
      }

      try {
        const result = await runCodemodeWorker(worker, scriptController, {
          signal: context.abortSignal, timeoutMs: parsedScript.timeoutMs,
          onText: (kind, value) => output.text(kind, value),
          onRpc: handleRpc,
        })

        const nestedCalls = runner.recorder.snapshot()
        let storeStatus: CodemodeStoreStatus = 'unchanged'
        if (result.ok && result.writes) {
          try {
            storeStatus = storeHandle.commit(result.writes, () => {
              context.abortSignal?.throwIfAborted()
              if (context.admission?.()) throw new CodemodeStoreError('conflict')
            })
          } catch (error) {
            const failure = error instanceof CodemodeStoreError ? error : new CodemodeStoreError('unavailable', 'unknown')
            const projected = output.result('Script failed',
              failure.message + (nestedCalls?.calls.some(call => call.status === 'ok') ? ' Completed nested tool effects were not rolled back.' : ''))
            return { ...deniedResult(projected.text, { ...projected.metadata,
              ...(nestedCalls ? { nestedCalls } : {}), codemodeStore: { status: failure.status, reason: failure.reason },
            }), ...(runner.terminate ? { terminate: true } : {}), ...(projected.images ? { images: projected.images } : {}) }
          }
        }
        const projected = output.result(result.ok ? 'Script completed' : 'Script failed', result.error)
        const metadata = { ...projected.metadata, ...(nestedCalls ? { nestedCalls } : {}), codemodeStore: { status: storeStatus } }
        return { ...(result.ok ? approvedResult(projected.text, metadata) : deniedResult(projected.text, metadata)),
          ...(result.terminate || runner.terminate ? { terminate: true } : {}), ...(projected.images ? { images: projected.images } : {}) }
      } finally {
        scriptController.abort()
        await worker.terminate().catch(() => {})
        worker.unref()
        releaseSlot()
      }
    },
  }
}

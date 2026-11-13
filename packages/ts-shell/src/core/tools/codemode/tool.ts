import { Worker } from 'node:worker_threads'
import type { ImageContent } from '../../../model-adapters/multimodal.js'
import type { ToolDefinition } from '../../../tools/types.js'
import { loadCatalog } from '../../models/catalogStore.js'
import { rankToolsByBm25 } from '../discovery/ranker.js'
import { approvedResult, deniedResult } from '../toolResultLifecycle.js'
import { NestedToolCallRunner } from './nestedCalls.js'
import { renderToolSample, toolNamespace } from './declarations.js'
import { validateCodemodeImage } from './image.js'
import { parseCodemodeScript } from './options.js'
import { CODEMODE_WORKER_SOURCE } from './prelude.js'
import { clearCodemodeStore, loadCodemodeStore, MAX_STORE_TOTAL_CHARS, MAX_STORE_VALUE_CHARS } from './store.js'

export { clearCodemodeStore }
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

type WorkerInbound =
  | { readonly kind: 'rpc'; readonly json: string }
  | { readonly kind: 'text'; readonly json: string }
  | { readonly kind: 'console'; readonly json: string }
  | { readonly kind: 'done'; readonly json: string }
  | { readonly kind: 'exit'; readonly json: string }
  | { readonly kind: 'error'; readonly json: string }

function isWorkerInbound(value: unknown): value is WorkerInbound {
  if (!value || typeof value !== 'object') return false
  const rec = value as Record<string, unknown>
  return typeof rec.json === 'string' && ['rpc', 'text', 'console', 'done', 'exit', 'error'].includes(String(rec.kind))
}

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  const half = Math.max(128, Math.floor((maxChars - 80) / 2))
  return `${text.slice(0, half)}\n\n... [truncated ${text.length - maxChars} chars] ...\n\n${text.slice(-half)}`
}

function formatCodemodeOutput(
  header: string,
  textItems: readonly string[],
  consoleLines: readonly string[],
  maxOutputChars: number,
  errorMessage?: string,
): string {
  const parts: string[] = [header]
  if (textItems.length === 1) parts.push(textItems[0]!)
  else if (textItems.length > 1) textItems.forEach((item, idx) => parts.push(`==> text ${idx + 1}/${textItems.length} <==\n${item}`))
  if (consoleLines.length > 0) parts.push(`<console_output>\n${consoleLines.join('\n')}\n</console_output>`)
  if (errorMessage) parts.push(`Script error: ${errorMessage}`)
  return truncateText(parts.join('\n\n'), maxOutputChars)
}

function safeCatalogModels() {
  return loadCatalog().flatMap(provider => provider.models.map(model => ({
    provider: provider.id,
    id: model.id,
    contextWindow: model.contextWindow,
    maxTokens: model.maxTokens,
    reasoning: model.reasoning === true,
  })))
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
      const textItems: string[] = []
      const consoleLines: string[] = []
      const outputImages: ImageContent[] = []
      try {
        catalog = resolveTools()
        runner = new NestedToolCallRunner({
          parentToolCallId: context.taskId || 'codemode',
          resolveTool: name => catalog.get(name),
          context,
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
            initialStore: storeHandle.initial,
            models: safeCatalogModels(),
            maxOutputChars: parsedScript.maxOutputChars,
            maxStoreValueChars: MAX_STORE_VALUE_CHARS,
            maxStoreTotalChars: MAX_STORE_TOTAL_CHARS,
          },
        })
        worker.once('exit', releaseSlot)
      } catch (err) {
        releaseSlot()
        throw err
      }

      const handleRpc = async (raw: string): Promise<{ ok: boolean; json: string }> => {
        try {
          const parsed = JSON.parse(raw) as { id: number; op: string; payload: Record<string, unknown> }
          const { op, payload } = parsed
          if (op === 'call') {
            return { ok: true, json: JSON.stringify(await runner.call(String(payload.name ?? ''), payload.args)) }
          }
          if (op === 'searchTools') {
            const limit = Math.max(1, Math.min(20, Math.trunc(Number(payload.limit ?? 8) || 8)))
            const nsFilter = typeof payload.namespace === 'string' ? payload.namespace : undefined
            const candidates = [...catalog.values()].filter(t => t.name !== CODEMODE_TOOL_NAME && (!nsFilter || toolNamespace(t.name) === nsFilter))
            const matches = rankToolsByBm25(String(payload.query ?? ''), candidates, limit).map(t => ({
              name: t.name,
              namespace: toolNamespace(t.name),
              description: renderToolSample(t),
            }))
            return { ok: true, json: JSON.stringify(matches) }
          }
          if (op === 'describeTool') {
            const found = catalog.get(String(payload.name ?? ''))
            if (!found || found.name === CODEMODE_TOOL_NAME) return { ok: true, json: 'null' }
            return { ok: true, json: JSON.stringify(renderToolSample(found)) }
          }
          if (op === 'describeNamespace') {
            const ns = String(payload.name ?? '')
            const toolsInNs = allToolsList.filter(name => toolNamespace(name) === ns)
            return { ok: true, json: JSON.stringify(toolsInNs.length ? { name: ns, tools: toolsInNs } : null) }
          }
          if (op === 'image') {
            outputImages.push(validateCodemodeImage(payload.item))
            return { ok: true, json: '' }
          }
          throw new Error(`Unknown codemode RPC op: ${op}`)
        } catch (err) {
          return { ok: false, json: err instanceof Error ? err.message : String(err) }
        }
      }

      try {
        const result = await new Promise<{ readonly ok: boolean; readonly error?: string; readonly writes?: Record<string, string | null> }>((resolve) => {
          let settled = false
          const finish = (outcome: { readonly ok: boolean; readonly error?: string; readonly writes?: Record<string, string | null> }) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            context.abortSignal?.removeEventListener('abort', onAbort)
            resolve(outcome)
          }
          const onAbort = () => {
            void worker.terminate()
            worker.unref()
            finish({ ok: false, error: 'Operation aborted.' })
          }
          const timer = setTimeout(() => {
            void worker.terminate()
            worker.unref()
            finish({ ok: false, error: `Script timed out after ${parsedScript.timeoutMs}ms.` })
          }, parsedScript.timeoutMs)
          timer.unref?.()
          context.abortSignal?.addEventListener('abort', onAbort, { once: true })

          worker.on('message', (msg: unknown) => {
            if (!isWorkerInbound(msg)) {
              finish({ ok: false, error: 'BridgeError: invalid worker message frame.' })
              return
            }
            if (msg.kind === 'text') {
              if (msg.json) textItems.push(msg.json)
            } else if (msg.kind === 'console') {
              consoleLines.push(msg.json)
            } else if (msg.kind === 'done') {
              try {
                const payload = JSON.parse(msg.json) as { returnJson?: string; writes?: Record<string, string | null> }
                if (payload.returnJson) textItems.push(payload.returnJson)
                finish({ ok: true, writes: payload.writes })
              } catch {
                finish({ ok: false, error: 'BridgeError: malformed completion payload.' })
              }
            } else if (msg.kind === 'exit') {
              try {
                const payload = JSON.parse(msg.json) as { writes?: Record<string, string | null> }
                finish({ ok: true, writes: payload.writes })
              } catch {
                finish({ ok: false, error: 'BridgeError: malformed exit payload.' })
              }
            } else if (msg.kind === 'error') {
              finish({ ok: false, error: msg.json })
            } else if (msg.kind === 'rpc') {
              try {
                const parsed = JSON.parse(msg.json) as { id: number }
                void handleRpc(msg.json).then(reply => {
                  if (!settled) worker.postMessage({ kind: 'reply', id: parsed.id, ok: reply.ok, json: reply.json })
                })
              } catch {
                finish({ ok: false, error: 'BridgeError: malformed RPC request payload.' })
              }
            }
          })
          worker.on('error', err => finish({ ok: false, error: err instanceof Error ? err.message : String(err) }))
          worker.on('exit', codeExit => {
            if (!settled) finish({ ok: false, error: `Sandbox worker exited unexpectedly (${codeExit}).` })
          })
        })

        if (result.ok && result.writes) {
          storeHandle.commit(result.writes)
        }
        const nestedCalls = runner.recorder.snapshot()
        const metadata = nestedCalls ? { nestedCalls } : undefined
        return result.ok
          ? {
              ...approvedResult(formatCodemodeOutput('Script completed', textItems, consoleLines, parsedScript.maxOutputChars), metadata),
              ...(outputImages.length ? { images: outputImages } : {}),
            }
          : deniedResult(formatCodemodeOutput('Script failed', textItems, consoleLines, parsedScript.maxOutputChars, result.error), metadata)
      } finally {
        void worker.terminate().catch(() => {})
        worker.unref()
      }
    },
  }
}

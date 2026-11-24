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
import { runCodemodeWorker, type ScriptReply, type ScriptRpc } from './execution.js'
import { projectCallableCatalog } from './catalog.js'
import { isModelDispatchTool, projectCodemodeModels } from './models.js'
import { parseReplayMode, prepareReplay, REPLAY_ID_PATTERN, replayFailure, settleReplay, type ReplayRun } from './replay/index.js'

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
      'Run JavaScript in an isolated sandbox to compose, batch (Promise.allSettled), chain, and filter tool calls in a single turn. Globals: `await tools.<name>(args)`, `ALL_TOOLS`, `text(value)`, `await image(dataUriOrObj)`, `console.log(...)`, `store(key, value)` / `load(key)` (branch-scoped), `await searchTools(query, { limit?, namespace? })`, `await describeTool(name)`, `await describeNamespace(name)`, `models.list()` / `models.get(provider, id)`, `await models.generateImages(model, { prompt, references? })`, `await models.classify(model, { state, questions, images? })` for admitted models, `exit()`, and top-level `return`. The literal-only shell tag $`command` uses the same bash permission gate and supports .text(), .json(), and .nothrow().',
    argsSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code'],
      properties: {
        code: {
          type: 'string',
          description: 'Raw JavaScript async function body. Optional line 1: // @options: {"timeout_ms": 30000, "max_output_tokens": 16000}',
        },
        record: {
          type: 'boolean',
          description: 'Record a read-only script in the current saved session and return its replay ID. Date and Math.random are reproducible. Cannot be used with replay_id.',
        },
        replay_id: {
          type: 'string',
          pattern: REPLAY_ID_PATTERN.source,
          description: 'Verify a recording on this session branch with the original code. Recording and replay allow local computation, load(), and catalogue queries.',
        },
      },
    },
    async execute(args, context) {
      const code = typeof args.code === 'string' ? args.code : ''
      if (!code.trim()) return deniedResult('Error: codemode requires a non-empty `code` string.')
      if (context.abortSignal?.aborted) return deniedResult('Script failed\n\nScript error: Operation aborted.')
      if (context.agentMode === 'plan' && args.record === true) return deniedResult('Plan mode prohibits recording scripts.')

      let parsedScript: ReturnType<typeof parseCodemodeScript>
      let replayMode: ReturnType<typeof parseReplayMode>
      try {
        parsedScript = parseCodemodeScript(code)
        replayMode = parseReplayMode(args)
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
      let replay: ReplayRun | undefined
      const output = new CodemodeOutput(parsedScript.maxOutputChars)
      const scriptController = new AbortController()
      let callable: ReturnType<typeof projectCallableCatalog>
      try {
        catalog = context.toolCatalog ?? this.nestedToolCatalog?.() ?? resolveTools()
        callable = projectCallableCatalog([...catalog.keys()].filter(name => name !== CODEMODE_TOOL_NAME))
        runner = new NestedToolCallRunner({
          parentToolCallId: context.taskId || 'codemode',
          context: { ...context, abortSignal: scriptController.signal },
        })
        storeHandle = loadCodemodeStore(context.sessionId, context.workspaceRoot)
        allToolsList = [...catalog.keys()].filter(name => name !== CODEMODE_TOOL_NAME)
        const workerInputs = {
          allTools: allToolsList,
          callableTools: callable.tools,
          initialStore: storeHandle.initial,
          models: projectCodemodeModels(context.modelCatalog),
          maxOutputChars: parsedScript.maxOutputChars,
          maxStoreValueChars: MAX_STORE_VALUE_CHARS,
          maxStoreTotalChars: MAX_STORE_TOTAL_CHARS,
          readOnly: context.agentMode === 'plan',
        }
        if (replayMode) replay = prepareReplay(replayMode, context, code, workerInputs)
        worker = new Worker(CODEMODE_WORKER_SOURCE, {
          eval: true,
          env: {},
          execArgv: [],
          resourceLimits: { maxOldGenerationSizeMb: 64, maxYoungGenerationSizeMb: 16 },
          workerData: {
            code: parsedScript.strippedCode,
            ...workerInputs,
            determinism: replay?.clock,
          },
        })
      } catch (err) {
        releaseSlot()
        if (replayMode) return replayFailure(err, context.abortSignal)
        if (err instanceof CodemodeStoreError) return deniedResult(`Script failed\n\n${err.message}`, {
          codemodeStore: { status: err.status, reason: err.reason },
        })
        throw err
      }

      const handleRpc = async ({ op, payload }: ScriptRpc, beginApprovalWait: () => () => void): Promise<ScriptReply> => {
        try {
          if (op === 'call') {
            return { ok: true, json: JSON.stringify(await runner.call(String(payload.name ?? ''), payload.args, beginApprovalWait)),
              ...(runner.terminate ? { terminate: true } : {}) }
          }
          if (op === 'shell') {
            const command = payload.command
            if (typeof command !== 'string' || !catalog.has('bash')) throw new Error('The shell tool is unavailable in this script.')
            return { ok: true, json: JSON.stringify(await runner.shell(command, beginApprovalWait)),
              ...(runner.terminate ? { terminate: true } : {}) }
          }
          if (op === 'generateImages') {
            if (!context.executeNestedTool || !isModelDispatchTool(catalog.get('generate_image'))) {
              throw new Error('Image generation is unavailable in this script.')
            }
            return { ok: true, json: JSON.stringify(await runner.call('generate_image', { model: payload.model, prompt: payload.prompt,
              ...(payload.references !== undefined ? { references: payload.references } : {}) }, beginApprovalWait)),
              ...(runner.terminate ? { terminate: true } : {}) }
          }
          if (op === 'classify') {
            if (!context.executeNestedTool || !isModelDispatchTool(catalog.get('classify'))) {
              throw new Error('Classification is unavailable in this script.')
            }
            const result = await runner.call('classify', { model: payload.model, state: payload.state, questions: payload.questions,
              ...(payload.images !== undefined ? { images: payload.images } : {}) }, beginApprovalWait)
            if (typeof result !== 'string') throw new Error('Classification result could not be verified.')
            return { ok: true, json: JSON.stringify(JSON.parse(result)),
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
            ...(runner.stop ? { stop: runner.stop } : {}),
            ...(runner.terminate ? { terminate: true } : {}) }
        }
      }

      try {
        const result = await runCodemodeWorker(worker, scriptController, {
          signal: context.abortSignal, timeoutMs: parsedScript.timeoutMs,
          onText: (kind, value) => output.text(kind, value),
          onRpc: handleRpc,
          observer: replay?.observer,
        })

        if (replay) return settleReplay(replay, result, output, storeHandle.assertCurrent, context.abortSignal)

        const nestedCalls = runner.recorder.snapshot()
        const stop = result.stop ?? runner.stop
        let storeStatus: CodemodeStoreStatus = 'unchanged'
        if (result.ok && !stop && result.writes) {
          try {
            storeStatus = storeHandle.commit(result.writes, () => {
              context.abortSignal?.throwIfAborted()
              if (context.admission?.()) throw new CodemodeStoreError('conflict')
            })
          } catch (error) {
            const failure = error instanceof CodemodeStoreError ? error : new CodemodeStoreError('unavailable', 'unknown')
            const projected = output.result('Script failed',
              failure.message + (nestedCalls?.calls.some(call => call.status === 'ok') ? ' Completed nested tool effects were not rolled back.' : ''))
            const metadata = { ...projected.metadata,
              ...(nestedCalls ? { nestedCalls } : {}), codemodeStore: { status: failure.status, reason: failure.reason },
            }
            output.observe(metadata)
            return { ...deniedResult(projected.text, metadata), ...(runner.terminate ? { terminate: true } : {}),
              ...(projected.images ? { images: projected.images } : {}) }
          }
        }
        const projected = output.result(result.ok && !stop ? 'Script completed' : 'Script failed', result.error)
        const metadata = { ...projected.metadata, ...(nestedCalls ? { nestedCalls } : {}), codemodeStore: { status: storeStatus } }
        output.observe(metadata)
        return { ...(result.ok && !stop ? approvedResult(projected.text, metadata) : deniedResult(projected.text, metadata)),
          ...(stop ? { stop } : {}),
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

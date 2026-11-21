import type { Worker } from 'node:worker_threads'

export interface ScriptOutcome {
  readonly ok: boolean
  readonly error?: string
  readonly writes?: Record<string, string | null>
  readonly terminate?: boolean
}

const SCRIPT_OPERATIONS = ['call', 'searchTools', 'describeTool', 'describeNamespace', 'image', 'generateImages', 'classify'] as const
export const READ_ONLY_SCRIPT_OPERATIONS = ['searchTools', 'describeTool', 'describeNamespace'] as const
export const READ_ONLY_SCRIPT_ERROR = 'Script recording and replay only allow read-only catalogue operations and local computation.'
export const MAX_SCRIPT_RPC = 512

export interface ScriptRpc {
  readonly id: number
  readonly op: typeof SCRIPT_OPERATIONS[number]
  readonly payload: Record<string, unknown>
}

export interface ScriptReply {
  readonly ok: boolean
  readonly json: string
  readonly terminate?: boolean
}

export interface ScriptObserver {
  readonly ready: (environment: string) => void
  readonly request: (rpc: ScriptRpc) => void
  readonly reply: (rpc: ScriptRpc, reply: ScriptReply) => void
  readonly text: (kind: 'text' | 'console', value: string) => void
}

interface WorkerFrame { readonly kind: string; readonly json: string }

function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function frame(value: unknown): WorkerFrame {
  if (!object(value) || typeof value.json !== 'string' || typeof value.kind !== 'string'
    || !['rpc', 'text', 'console', 'done', 'exit', 'error', 'ready', 'effect'].includes(value.kind)) {
    throw new Error('BridgeError: invalid worker message frame.')
  }
  return { kind: value.kind, json: value.json }
}

function completion(json: string, kind: string): ScriptOutcome & { readonly returnJson?: string } {
  const parsed: unknown = JSON.parse(json)
  if (!object(parsed) || (kind === 'done' && typeof parsed.returnJson !== 'string')
    || !object(parsed.writes) || Object.values(parsed.writes).some(value => value !== null && typeof value !== 'string')) {
    throw new Error('BridgeError: malformed completion payload.')
  }
  return { ok: true, writes: parsed.writes as Record<string, string | null>,
    ...(kind === 'done' ? { returnJson: parsed.returnJson as string } : {}) }
}

function request(json: string): ScriptRpc {
  if (json.length > 6 * 1024 * 1024) throw new Error('BridgeError: RPC request exceeds the buffer limit.')
  const parsed: unknown = JSON.parse(json)
  if (!object(parsed) || !Number.isSafeInteger(parsed.id) || (parsed.id as number) < 1
    || !SCRIPT_OPERATIONS.some(operation => operation === parsed.op)
    || !object(parsed.payload)) throw new Error('BridgeError: malformed RPC request payload.')
  return parsed as unknown as ScriptRpc
}

/** The original worker transport owns retirement and observes every admitted host operation. */
export function runCodemodeWorker(worker: Worker, controller: AbortController, options: {
  readonly signal?: AbortSignal
  readonly timeoutMs: number
  readonly onText: (kind: 'text' | 'console', value: string) => void
  readonly onRpc: (rpc: ScriptRpc) => Promise<ScriptReply>
  readonly observer?: ScriptObserver
}): Promise<ScriptOutcome> {
  return new Promise(resolve => {
    let retired = false
    let lastId = 0
    let ready = options.observer === undefined
    const pending = new Set<Promise<void>>()
    const finish = (outcome: ScriptOutcome): void => {
      if (retired) return
      retired = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', onAbort)
      const unfinished = pending.size > 0
      controller.abort(new Error(outcome.error ?? 'Script lifetime ended.'))
      const accepted = outcome.ok && unfinished
        ? { ok: false, error: 'Script ended with outstanding nested operations; they were cancelled.' }
        : outcome
      void Promise.allSettled([worker.terminate(), ...pending]).then(settlement => {
        worker.removeListener('message', onMessage)
        worker.removeListener('error', onError)
        worker.removeListener('exit', onExit)
        worker.unref()
        resolve(settlement.some(result => result.status === 'rejected')
          ? { ...accepted, ok: false, error: 'Sandbox retirement outcome is unverified.' } : accepted)
      })
    }
    const onAbort = (): void => finish({ ok: false, error: 'Operation aborted.' })
    const timer = setTimeout(() => finish({ ok: false, error: `Script timed out after ${options.timeoutMs}ms.` }), options.timeoutMs)
    timer.unref?.()
    const onError = (error: Error): void => finish({ ok: false, error: error.message })
    const onExit = (code: number): void => finish({ ok: false, error: `Sandbox worker exited unexpectedly (${code}).` })
    const fail = (error: unknown): void => {
      finish({ ok: false, error: error instanceof Error ? error.message : 'BridgeError: invalid worker payload.' })
    }
    const onText = (kind: 'text' | 'console', value: string): void => {
      options.onText(kind, value)
      options.observer?.text(kind, value)
    }
    const onMessage = (message: unknown): void => {
      if (retired) return
      try {
        const received = frame(message)
        if (received.kind === 'error') {
          finish({ ok: false, error: received.json.slice(0, 2000) })
        } else if (received.kind === 'ready' && !ready && options.observer) {
          options.observer.ready(received.json)
          ready = true
        } else if (!ready || received.kind === 'ready') {
          throw new Error('BridgeError: invalid worker startup sequence.')
        } else if (received.kind === 'effect') {
          finish({ ok: false, error: READ_ONLY_SCRIPT_ERROR })
        } else if (received.kind === 'text' || received.kind === 'console') {
          onText(received.kind, received.json)
        } else if (received.kind === 'done' || received.kind === 'exit') {
          const outcome = completion(received.json, received.kind)
          if (outcome.returnJson) onText('text', outcome.returnJson)
          finish(outcome)
        } else {
          const rpc = request(received.json)
          if (rpc.id <= lastId || rpc.id > MAX_SCRIPT_RPC) throw new Error('BridgeError: RPC request identity or call limit is invalid.')
          lastId = rpc.id
          options.observer?.request(rpc)
          const operation = options.onRpc(rpc).then(reply => {
            pending.delete(operation)
            if (retired) return
            if (reply.terminate) {
              finish({ ok: false, error: 'A nested tool requires this run to end.', terminate: true })
            } else {
              options.observer?.reply(rpc, reply)
              worker.postMessage({ kind: 'reply', id: rpc.id, ok: reply.ok, json: reply.json })
            }
          }, () => finish({ ok: false, error: 'BridgeError: nested RPC settlement failed.' })).catch(fail)
          pending.add(operation)
          void operation.then(() => pending.delete(operation))
        }
      } catch (error) {
        fail(error)
      }
    }
    worker.on('message', onMessage)
    worker.on('error', onError)
    worker.on('exit', onExit)
    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.signal?.aborted) onAbort()
  })
}

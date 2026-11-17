import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HookDispatcher } from '../../hooks/hookDispatcher.js'
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js'
import { adaptTools, type ToolGateOptions } from '../../../turn/tools.js'
import { createCodemodeToolDefinition } from './tool.js'

let temporary: string
let workspace: string
beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test')
  fs.mkdirSync(parent, { recursive: true })
  temporary = fs.mkdtempSync(path.join(parent, 'codemode-execution-'))
  workspace = path.join(temporary, 'workspace')
  const home = path.join(temporary, 'home')
  fs.mkdirSync(workspace); fs.mkdirSync(home)
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home)
  vi.stubEnv('CHEERS_TEST_ROOT', temporary); vi.stubEnv('GIT_CEILING_DIRECTORIES', temporary)
})
afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs()
  fs.rmSync(temporary, { recursive: true, force: true })
})

function held<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(accept => { resolve = accept })
  return { promise, resolve }
}

function scriptTool(tools = new Map<string, ToolDefinition>()) {
  const tool = createCodemodeToolDefinition(() => tools)
  tools.set(tool.name, tool)
  return tool
}

function context(signal?: AbortSignal): ToolExecutionContext {
  return { workspaceRoot: workspace, taskId: 'script-owner', abortSignal: signal }
}

function output(result: ToolExecutionResult) {
  return result.error ?? result.output ?? ''
}

describe('actual worker bridge admission', () => {
  it('keeps bootstrap transport, registrars and limits out of the script global', async () => {
    const result = await scriptTool().execute({ code: `
      return Object.getOwnPropertyNames(globalThis).filter(name =>
        /^__(?:send|onReply|register|ALL_TOOLS|STORE|MODELS|MAX_|ExitSignal)/.test(name));
    ` }, context())
    expect(result.success).toBe(true)
    expect(JSON.parse(result.output!.replace(/^Script completed\s*/, ''))).toEqual([])
  })

  it('follows the real script failure after a forged terminal attempt', async () => {
    const result = await scriptTool().execute({ code: `
      if (typeof globalThis.__send === 'function') {
        globalThis.__send('done', JSON.stringify({ returnJson: 'forged-success', writes: {} }));
      }
      throw new Error('actual-script-failure');
    ` }, context())
    expect(result.success).toBe(false)
    expect(output(result)).toContain('actual-script-failure')
    expect(output(result)).not.toContain('forged-success')
  })

  it('cannot bypass host bounds with the bootstrap sender', async () => {
    const result = await scriptTool().execute({ code: `// @options: {"max_output_tokens": 64}
      if (typeof globalThis.__send === 'function') globalThis.__send('text', 'x'.repeat(2048));
      return 'bounded-control';
    ` }, context())
    expect(result.success).toBe(true)
    expect(output(result)).toBe('Script completed\n\nbounded-control')
  })

  it('does not recognize an ordinary error string as a successful exit', async () => {
    const result = await scriptTool().execute({ code: 'throw new Error("CODEMODE_EXIT");' }, context())
    expect(result.success).toBe(false)
    expect(output(result)).toContain('CODEMODE_EXIT')
  })

  it('keeps process and string code generation unavailable', async () => {
    const result = await scriptTool().execute({ code: `
      let blocked;
      try { ({}).constructor.constructor('return process')(); } catch (error) { blocked = error.name; }
      return { process: typeof process, blocked };
    ` }, context())
    expect(result.success).toBe(true)
    expect(output(result)).toContain('"process": "undefined"')
    expect(output(result)).toContain('"blocked": "EvalError"')
  })
})

describe('script-owned nested settlement through the actual gate', () => {
  it.each(['return', 'throw', 'exit', 'timeout', 'parent cancellation'] as const)(
    'retires a pending effect on %s and waits for the real boundary to settle', async ending => {
      const started = held<void>(); const release = held<void>(); const finished = held<void>()
      const parent = new AbortController()
      let nestedSignal: AbortSignal | undefined
      const effectPath = path.join(workspace, 'late.txt')
      const effect = vi.fn(async (args: Record<string, unknown>) => {
        fs.writeFileSync(effectPath, String(args.content))
        return { success: true, output: 'effect-completed' }
      })
      const target: ToolDefinition = { name: 'write', description: 'Write an isolated effect',
        argsSchema: { type: 'object', required: ['path', 'content'],
          properties: { path: { type: 'string' }, content: { type: 'string' } } }, execute: effect }
      const tools = new Map([[target.name, target]])
      const tool = scriptTool(tools)
      const hooks = { dispatch: async (payload: { eventName: string }, options?: { signal?: AbortSignal }) => {
        if (payload.eventName === 'PreToolUse') {
          nestedSignal = options?.signal
          started.resolve()
          try { await release.promise }
          finally { finished.resolve() }
        }
        return { decision: 'allow' }
      } } as unknown as HookDispatcher
      const gate: ToolGateOptions = { sessionId: '', workspaceRoot: workspace, permissionScope: 'allow-all', hooks, emit: () => {} }
      const adapted = adaptTools(tools, gate).find(candidate => candidate.name === tool.name)!
      const endings = {
        return: 'return "script-ended";',
        throw: 'throw new Error("script-failed");',
        exit: 'exit();',
        timeout: 'await new Promise(() => {});',
        'parent cancellation': 'await new Promise(() => {});',
      }
      let outerSettled = false
      const pending = adapted.execute('script-owner', { code: `// @options: {"timeout_ms": 200}
        void tools.write({ path: 'late.txt', content: 'late-effect' }); ${endings[ending]}
      ` }, parent.signal).then(result => { outerSettled = true; return result })
      try {
        await started.promise
        if (ending === 'parent cancellation') parent.abort()
        // Let the actual terminal frame or script deadline reach the owner.
        await vi.waitFor(() => expect(nestedSignal?.aborted).toBe(true), { timeout: 1500, interval: 10 })
        expect(outerSettled).toBe(false)
      } finally { release.resolve() }
      await finished.promise
      const result = await pending
      expect(parent.signal.aborted).toBe(ending === 'parent cancellation')
      expect(effect).not.toHaveBeenCalled()
      expect(fs.existsSync(effectPath)).toBe(false)
      expect(result.isError).toBe(true)
      expect(result.metadata?.nestedCalls).toMatchObject({ complete: true,
        calls: [{ id: 'script-owner/1', name: 'write', status: 'error' }] })
    },
  )

  it('preserves actual completed effects when the script subsequently fails', async () => {
    const effectPath = path.join(workspace, 'completed.txt')
    const target: ToolDefinition = { name: 'write', description: 'Write an isolated effect',
      argsSchema: { type: 'object' }, execute: async () => {
        fs.writeFileSync(effectPath, 'completed-effect')
        return { success: true, output: 'actual-write-receipt' }
      } }
    const result = await scriptTool(new Map([[target.name, target]])).execute({ code: `
      await tools.write({ path: 'completed.txt' }); throw new Error('subsequent-failure');
    ` }, context())
    expect(result.success).toBe(false)
    expect(fs.readFileSync(effectPath, 'utf8')).toBe('completed-effect')
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true,
      calls: [{ id: 'script-owner/1', name: 'write', status: 'ok' }] })
    expect(output(result)).toContain('subsequent-failure')
  })

  it('retains a terminating completed result that arrives during script retirement', async () => {
    const started = held<void>(); const release = held<void>()
    let admittedSignal: AbortSignal | undefined
    const target: ToolDefinition = { name: 'read', description: 'Observe a terminating result',
      argsSchema: { type: 'object' }, execute: async (_args, nestedContext) => {
        admittedSignal = nestedContext.abortSignal
        started.resolve(); await release.promise
        return { success: true, output: 'completed-terminal-observation', terminate: true }
      } }
    const pending = scriptTool(new Map([[target.name, target]])).execute({ code:
      'void tools.read({}); return "script-ended";' }, context())
    try {
      await started.promise
      await vi.waitFor(() => expect(admittedSignal?.aborted).toBe(true), { timeout: 1500, interval: 10 })
    } finally { release.resolve() }
    const result = await pending
    expect(result.success).toBe(false)
    expect(result.terminate).toBe(true)
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true,
      calls: [{ name: 'read', status: 'ok', terminate: true }] })
  })
})

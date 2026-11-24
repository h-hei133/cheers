import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import type { Worker } from 'node:worker_threads'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HookDispatcher } from '../../hooks/hookDispatcher.js'
import type { QueryEvent } from '../../query/runtime/events.js'
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js'
import { adaptTools, type ToolGateOptions } from '../../../turn/tools.js'
import { runTurn } from '../../../turn/session.js'
import { createCodemodeToolDefinition } from './tool.js'
import { runCodemodeWorker } from './execution.js'

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
  vi.useRealTimers()
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

it('charges script time on both sides of overlapping approval waits', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  const worker = new EventEmitter() as EventEmitter & { terminate: () => Promise<number>; unref: () => void }
  worker.terminate = async () => { worker.emit('test-settle'); return 0 }
  worker.unref = () => {}
  const resume: Array<() => void> = []
  const settlement = runCodemodeWorker(worker as unknown as Worker, new AbortController(), {
    timeoutMs: 600, onText() {},
    onRpc: async (_rpc, beginWait) => {
      resume.push(beginWait())
      return await new Promise(accept => {
        worker.once('test-settle', () => accept({ ok: true, json: 'null' }))
      })
    },
  })
  let retired = false
  void settlement.then(() => { retired = true })
  await vi.advanceTimersByTimeAsync(300)
  for (const id of [1, 2]) worker.emit('message', { kind: 'rpc', json: JSON.stringify({ id, op: 'call', payload: {} }) })
  await vi.advanceTimersByTimeAsync(1_000)
  resume[0]!()
  await vi.advanceTimersByTimeAsync(1_000)
  expect(retired).toBe(false)
  resume[1]!()
  await vi.advanceTimersByTimeAsync(299)
  expect(retired).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  await expect(settlement).resolves.toEqual({ ok: false, error: 'Script timed out after 600ms.' })
})

describe('actual worker bridge admission', () => {
  it('reuses one foreground shell result across all tag views and rejects interpolations', async () => {
    const executeNestedTool = vi.fn(async (): Promise<ToolExecutionResult> => ({ success: true,
      output: '{"value":7}\n\n[sandbox] fixture', metadata: { outputNotice: '[sandbox] fixture' } }));
    const tool = scriptTool(new Map([['bash', { name: 'bash', description: 'Inert shell fixture', argsSchema: {},
      execute: async () => { throw new Error('Host gate bypass'); } }]]));
    const result = await tool.execute({ code: `
      const command = $\`fixture a\\ b\`;
      const values = await Promise.all([command, command.text(), command.json(), command.nothrow().text()]);
      try { $\`unsafe \${'fixture'}\`; } catch (error) { values.push(error.name); }
      return values;
    ` }, { ...context(), executeNestedTool });
    expect(result.success, output(result)).toBe(true);
    expect(JSON.parse(output(result).replace(/^Script completed\s*/, ''))).toEqual(['{"value":7}', '{"value":7}', { value: 7 }, '{"value":7}', 'TypeError']);
    expect(executeNestedTool).toHaveBeenCalledOnce();
    expect(executeNestedTool).toHaveBeenCalledWith('bash', { command: 'fixture a\\ b' }, 'script-owner/1',
      expect.any(AbortSignal), expect.any(Function));
  });

  it('marks promoted shell output incomplete and preserves the session job identity', async () => {
    const executeNestedTool = vi.fn(async (): Promise<ToolExecutionResult> => ({ success: true,
      output: 'Moved to the background as bg_1 after 5 seconds.', metadata: { backgroundJobId: 'bg_1' } }));
    const tool = scriptTool(new Map([['bash', { name: 'bash', description: 'Inert shell fixture', argsSchema: {},
      execute: async () => { throw new Error('Host gate bypass'); } }]]));
    const result = await tool.execute({ code: `
      const command = $\`fixture\`;
      let jsonRejected = false;
      try { await command.json(); } catch (error) { jsonRejected = error.message.includes('incomplete shell output'); }
      return { text: await command.text(), jsonRejected };
    ` }, { ...context(), executeNestedTool });
    expect(result.success, output(result)).toBe(true);
    expect(JSON.parse(output(result).replace(/^Script completed\s*/, ''))).toEqual({
      text: 'Moved to the background as bg_1 after 5 seconds.',
      jsonRejected: true,
    });
    expect(executeNestedTool).toHaveBeenCalledOnce();
    expect(executeNestedTool).toHaveBeenCalledWith('bash', { command: 'fixture' }, 'script-owner/1',
      expect.any(AbortSignal), expect.any(Function));
  });

  it.each(['exit', 'timeout', 'denial', 'unverified-cleanup'] as const)('keeps .nothrow scoped to a settled shell exit (%s)', async outcome => {
    const error = 'Fixture command failed';
    const executeNestedTool = vi.fn(async (): Promise<ToolExecutionResult> => ({ success: false, error,
      ...(outcome === 'exit' || outcome === 'unverified-cleanup' ? { metadata: { status: 'failed', exitCode: 7,
        executionPath: 'ts-local', failureKind: 'execution_failure', ...(outcome === 'unverified-cleanup' ? { terminationFailed: true } : {}) } }
        : outcome === 'timeout' ? { metadata: { status: 'timeout', exitCode: 7, executionPath: 'ts-local', failureKind: 'timeout' } }
          : { stop: 'approval-denied', denial: 'without-feedback' }) }));
    const tool = scriptTool(new Map([['bash', { name: 'bash', description: 'Inert shell fixture', argsSchema: {},
      execute: async () => { throw new Error('Host gate bypass'); } }]]));
    const result = await tool.execute({ code: `
      const command = $\`fixture\`;
      try { await command.text(); } catch (error) { text(error.message); }
      return await command.nothrow().text();
    ` }, { ...context(), executeNestedTool });
    expect(executeNestedTool).toHaveBeenCalledOnce();
    expect(result.success).toBe(outcome === 'exit');
    expect(result.stop).toBe(outcome === 'denial' ? 'approval-denied' : undefined);
    expect(output(result)).toContain(error);
    expect(result.metadata?.nestedCalls).toMatchObject({ calls: [{ name: 'bash', status: 'error' }] });
  });

  it('keeps bootstrap transport, registrars and limits out of the script global', async () => {
    const result = await scriptTool().execute({ code: `
      return Object.getOwnPropertyNames(globalThis).filter(name =>
        /^__(?:send|onReply|register|ALL_TOOLS|STORE|MODELS|MAX_|READ_ONLY|ExitSignal)/.test(name));
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
  it('requires a host gate for nested calls while retaining local computation and discovery', async () => {
    const execute = vi.fn(async () => ({ success: true, output: 'unexpected observation' }))
    const target = { name: 'write', description: 'An inert action', argsSchema: {}, execute }
    const tool = scriptTool(new Map([[target.name, target]]))
    const result = await tool.execute({ code: 'return await tools.write({});' }, context())
    expect(result.success).toBe(false)
    expect(execute).not.toHaveBeenCalled()
    expect(output(result)).toContain('require a host permission gate')
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true, calls: [{ name: 'write', status: 'error' }] })
    const discovery = await tool.execute({ code: 'return (await describeTool("write")).includes("An inert action");' }, context())
    expect(discovery.success).toBe(true)
    expect(output(discovery)).toContain('true')
  })

  it('keeps a plan-mode script local while refusing nested effects and script storage', async () => {
    const effect = vi.fn(async () => ({ success: true, output: 'effect happened' }))
    const target: ToolDefinition = { name: 'write', description: 'Inert action', argsSchema: { type: 'object' }, execute: effect }
    const tools = new Map<string, ToolDefinition>([[target.name, target]])
    scriptTool(tools)
    let steps = 0
    const persisted: Array<{ role: string; content: unknown; metadata?: Record<string, unknown>; tool_call_id?: string }> = []
    const run = runTurn({ sessionId: '', workspaceRoot: workspace, prompt: 'Plan safely.', history: [], maxSteps: 4,
      agentMode: 'plan', permissionScope: 'allow-all', tools,
      hooks: { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher,
      step: async () => ++steps === 1 ? { text: '', stopReason: 'stop' as const, toolCalls: [{
        id: 'plan-script', name: 'codemode', args: { code: `
          let nestedDenied = false, storeDenied = false;
          try { await tools.write({ path: 'plan.txt' }); } catch { nestedDenied = true; }
          try { store('plan', 'must not persist'); } catch { storeDenied = true; }
          return { nestedDenied, storeDenied };
        ` },
      }] } : { text: 'Plan ready.', stopReason: 'stop' as const, toolCalls: [] },
      onMessage: message => persisted.push(message), signal: new AbortController().signal })
    for await (const _event of run.events) { /* Capture the public turn result. */ }
    expect(effect).not.toHaveBeenCalled()
    const result = persisted.find(message => message.tool_call_id === 'plan-script')
    expect(result?.metadata?.nestedCalls).toMatchObject({ calls: [{ name: 'write', status: 'error' }] })
    expect(result?.content).toContain('"nestedDenied": true')
    expect(result?.content).toContain('"storeDenied": true')
  })

  it.each([undefined, 'Use the existing observation.'])('settles an explicit nested denial with feedback %s', async feedback => {
    const action = vi.fn(async () => ({ success: true, output: 'observed' }))
    const target: ToolDefinition = { name: 'write', description: 'Inert action', argsSchema: { type: 'object' }, execute: action }
    const tools: Map<string, ToolDefinition> = new Map([[target.name, target]]);
    scriptTool(tools);
    const hooks = { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher
    const calls: string[] = []
    const ask: NonNullable<ToolGateOptions['escalationPromptHandler']> = async (prompt, interaction) => {
      calls.push(`${prompt.context.toolName}:${String(prompt.context.target)}`)
      if (prompt.context.toolName === 'codemode') expect(prompt.context.preview).toContain('tools.write')
      else if (prompt.context.target !== 'paired.txt') expect(interaction?.beginWait).toBeTypeOf('function')
      return {
        promptId: prompt.id, respondedAt: 1,
        ...(prompt.context.toolName === 'write' && prompt.context.target === 'denied.txt'
          ? { decision: 'deny', ...(feedback ? { denialFeedback: feedback } : {}) }
          : { decision: 'allow-once' }),
      }
    }
    let steps = 0
    const step = async () => ++steps === 1 ? {
      text: '', stopReason: 'stop' as const, toolCalls: [{
        id: 'script-owner', name: 'codemode', args: { code: `
          await tools.write({ path: 'first.txt' });
          try { await tools.write({ path: 'denied.txt' }); } catch (error) { text(error.message); }
          await tools.write({ path: 'last.txt' });
        ` },
      }, { id: 'paired', name: 'write', args: { path: 'paired.txt' } }],
    } : { text: 'Recovered.', stopReason: 'stop' as const, toolCalls: [] }
    const events: QueryEvent[] = []
    const messages: Array<{ role: string; metadata?: Record<string, unknown>; tool_call_id?: string }> = []
    const run = runTurn({ sessionId: '', workspaceRoot: workspace, prompt: 'Observe.', history: [], maxSteps: 5,
      permissionScope: 'ask', tools, hooks, step, onMessage: message => { messages.push(message) },
      signal: new AbortController().signal, escalationPromptHandler: ask })
    for await (const event of run.events) events.push(event)
    expect(action.mock.calls.length).toBe(feedback ? 3 : 1)
    expect(calls).toEqual(feedback
      ? ['codemode:codemode', 'write:first.txt', 'write:denied.txt', 'write:last.txt', 'write:paired.txt']
      : ['codemode:codemode', 'write:first.txt', 'write:denied.txt'])
    expect(steps).toBe(feedback ? 2 : 1)
    const result = messages.find(message => message.tool_call_id === 'script-owner')
    expect(result?.metadata).toMatchObject({ nestedCalls: { complete: true, calls: [
      { name: 'write', status: 'ok' },
      { name: 'write', status: 'error', denial: feedback ? 'with-feedback' : 'without-feedback' },
      ...(feedback ? [{ name: 'write', status: 'ok' }] : []),
    ] } })
    expect(result?.metadata?.toolStop).toBe(feedback ? undefined : 'approval-denied')
    expect(events).toContainEqual(expect.objectContaining({ type: 'query.completed',
      result: expect.objectContaining({ status: feedback ? 'completed' : 'stopped_error' }) }))
  })

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
    ` }, { ...context(), executeNestedTool: (_name, args, taskId, abortSignal) => target.execute(args, { ...context(abortSignal), taskId }) })
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
      'void tools.read({}); return "script-ended";' },
      { ...context(), executeNestedTool: (_name, args, taskId, abortSignal) => target.execute(args, { ...context(abortSignal), taskId }) })
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

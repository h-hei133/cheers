import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { RuntimeConfig } from '../../../config/runtimeConfig.js'
import type { ToolDefinition, ToolExecutionResult } from '../../../tools/types.js'
import { SessionManager } from '../../../session/SessionManager.js'
import type { SessionMessage } from '../../../session/schema/sessionMessage.js'
import { adaptTools, type ToolGateOptions } from '../../../turn/tools.js'
import { runTurn } from '../../../turn/session.js'
import { createSubagentRunner } from '../../../turn/subagent.js'
import type { StepFunction } from '../../../turn/step.js'
import type { AgentMessage } from '../../agent/state.js'
import { registerCatalogContribution } from '../../catalog/contributions.js'
import type { HookDispatcher } from '../../hooks/hookDispatcher.js'
import type { QueryEvent } from '../../query/runtime/events.js'
import { loadToolCatalog } from '../catalog.js'
import { createCodemodeToolDefinition } from './tool.js'
import type { NestedToolCallsSnapshot } from './nestedCalls.js'

const SESSION_ID = 'codemode-composition'
const CONSUMERS = ['adapted', 'direct'] as const
type Consumer = typeof CONSUMERS[number]
const quietHooks = { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher

let temporary: string
let workspace: string
let manager: SessionManager
let unregister: Array<() => void>

beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test')
  fs.mkdirSync(parent, { recursive: true })
  temporary = fs.mkdtempSync(path.join(parent, 'codemode-composition-'))
  workspace = path.join(temporary, 'workspace')
  const home = path.join(temporary, 'home')
  fs.mkdirSync(workspace)
  fs.mkdirSync(home)
  vi.stubEnv('HOME', home)
  vi.stubEnv('USERPROFILE', home)
  vi.stubEnv('CHEERS_TEST_ROOT', temporary)
  vi.stubEnv('GIT_CEILING_DIRECTORIES', temporary)
  manager = new SessionManager()
  manager.createNewWithId(SESSION_ID, workspace)
  unregister = []
})

afterEach(() => {
  for (const retire of unregister.reverse()) retire()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  fs.rmSync(temporary, { recursive: true, force: true })
})

function fixtureTool(name: string, execute?: ToolDefinition['execute']): ToolDefinition {
  return {
    name,
    description: `Look up the isolated ${name} composition fixture.`,
    argsSchema: { type: 'object', additionalProperties: false, required: ['query'],
      properties: { query: { type: 'string', description: 'Captured query contract.' } } },
    execute: execute ?? (async args => ({ success: true, output: `${name}:${String(args.query)}` })),
  }
}

function contribute(tool: ToolDefinition, sessionId = SESSION_ID) {
  unregister.push(registerCatalogContribution({ root: workspace, sessionId, commands: [],
    tools: [tool], skills: () => [] }))
}

function config(settings: Partial<RuntimeConfig> = {}): RuntimeConfig {
  return { toolDiscovery: 'dynamic', disabledTools: [], hiddenToolPrefixes: [], ...settings } as RuntimeConfig
}

async function executeScript(tools: ReadonlyMap<string, ToolDefinition>, consumer: Consumer, code: string,
  hooks = quietHooks, signal?: AbortSignal): Promise<ToolExecutionResult> {
  if (consumer === 'direct') {
    return tools.get('codemode')!.execute({ code }, { workspaceRoot: workspace, sessionId: SESSION_ID,
      taskId: 'composition-owner', abortSignal: signal })
  }
  const gate: ToolGateOptions = { sessionId: SESSION_ID, workspaceRoot: workspace,
    permissionScope: 'allow-all', hooks, emit: () => {} }
  const adapted = adaptTools(tools, gate).find(tool => tool.name === 'codemode')!
  const result = await adapted.execute('composition-owner', { code }, signal)
  return { success: !result.isError, output: result.output, metadata: result.metadata }
}

function scriptJson<T>(result: ToolExecutionResult): T {
  expect(result.success, result.error ?? result.output).toBe(true)
  expect(result.output).toMatch(/^Script completed\s/)
  return JSON.parse(result.output!.replace(/^Script completed\s*/, '')) as T
}

function held() {
  let resolve!: () => void
  const promise = new Promise<void>(accept => { resolve = accept })
  return { promise, resolve }
}

describe('the composed catalog consumed by the actual codemode worker', () => {
  it('records and verifies read-only code through the normal tool gate', async () => {
    const tools = new Map<string, ToolDefinition>()
    tools.set('lookup', fixtureTool('lookup'))
    tools.set('codemode', createCodemodeToolDefinition(() => tools))
    const gate: ToolGateOptions = { sessionId: SESSION_ID, workspaceRoot: workspace,
      permissionScope: 'allow-all', hooks: quietHooks, emit: () => {} }
    const script = adaptTools(tools, gate).find(tool => tool.name === 'codemode')!
    const code = 'return { namespace: await describeNamespace("core"), time: Date.now() };'
    const recorded = await script.execute('record-script', { code, record: true })
    expect(recorded.isError, recorded.output).toBeFalsy()
    expect(recorded.metadata?.codemodeReplay).toMatchObject({ status: 'recorded', id: expect.any(String) })
    const { id } = recorded.metadata!.codemodeReplay as { id: string }
    expect(recorded.output).toContain(`Replay ID ${id}`)
    const replayed = await script.execute('replay-script', { code, replay_id: id })
    expect(replayed.isError, replayed.output).toBeFalsy()
    expect(replayed.metadata?.codemodeReplay).toEqual({ status: 'verified', id })
    expect(replayed.output).toBe(recorded.output)
  })

  it.each(['mutable', 'frozen'] as const)('keeps %s caller definitions isolated across catalog composition', async kind => {
    const registry = new Map<string, ToolDefinition>()
    const original = createCodemodeToolDefinition(() => registry)
    registry.set(original.name, kind === 'frozen' ? Object.freeze(original) : original)
    const effectA = vi.fn(async () => ({ success: true, output: 'first-owner' }))
    const effectB = vi.fn(async () => ({ success: true, output: 'second-owner' }))
    const compose = (tool: ToolDefinition) => loadToolCatalog({ workspaceRoot: workspace, sessionId: SESSION_ID,
      sdkSkills: new Map(), featureTools: [tool] }, () => registry)
    let first: Awaited<ReturnType<typeof compose>> | undefined
    let second: Awaited<ReturnType<typeof compose>> | undefined
    let error: unknown
    try {
      first = await compose(fixtureTool('first_lookup', effectA))
      second = await compose(fixtureTool('second_lookup', effectB))
    } catch (failure) { error = failure }
    expect(error).toBeUndefined()
    expect(original.nestedToolCatalog).toBeUndefined()
    expect(first!.tools.get('codemode')).not.toBe(second!.tools.get('codemode'))
    for (const [catalog, own, foreign, value] of [
      [first!, 'first_lookup', 'second_lookup', 'first-owner'],
      [second!, 'second_lookup', 'first_lookup', 'second-owner'],
    ] as const) {
      const result = scriptJson<{ names: string[]; value: string }>(await executeScript(catalog.tools, 'direct', `
        return { names: ALL_TOOLS, value: await tools[${JSON.stringify(own)}]({ query: 'owned' }) };
      `))
      expect(result.names).toContain(own)
      expect(result.names).not.toContain(foreign)
      expect(result.value).toBe(value)
    }
    expect(effectA).toHaveBeenCalledOnce()
    expect(effectB).toHaveBeenCalledOnce()
  })

  it.each(CONSUMERS)('discovers and calls feature and session tools through the %s consumer', async consumer => {
    const featureEffect = vi.fn(async (args: Record<string, unknown>) => ({ success: true, output: `feature:${String(args.query)}` }))
    const sessionEffect = vi.fn(async (args: Record<string, unknown>) => ({ success: true, output: `session:${String(args.query)}` }))
    const feature = fixtureTool('feature_lookup', featureEffect)
    contribute(fixtureTool('session_lookup', sessionEffect))
    contribute(fixtureTool('other_session_lookup'), 'other-session')
    const catalog = await loadToolCatalog({ workspaceRoot: workspace, sessionId: SESSION_ID,
      sdkSkills: new Map(), featureTools: [feature] })
    expect(catalog.tools.has(feature.name)).toBe(true)
    expect(catalog.tools.has('session_lookup')).toBe(true)
    expect(catalog.tools.has('other_session_lookup')).toBe(false)

    const result = await executeScript(catalog.tools, consumer, `
      return {
        names: ALL_TOOLS,
        matches: (await searchTools('feature_lookup session_lookup', { limit: 20 })).map(tool => tool.name),
        featureDescription: await describeTool('feature_lookup'),
        sessionDescription: await describeTool('session_lookup'),
        feature: await tools.feature_lookup({ query: 'first' }),
        session: await tools.session_lookup({ query: 'second' }),
      };
    `)
    const value = scriptJson<{ names: string[]; matches: string[]; featureDescription: string;
      sessionDescription: string; feature: string; session: string }>(result)
    expect(value.names).toEqual(expect.arrayContaining(['feature_lookup', 'session_lookup']))
    expect(value.names).not.toContain('other_session_lookup')
    expect(value.names).not.toContain('codemode')
    expect(value.matches).toEqual(expect.arrayContaining(['feature_lookup', 'session_lookup']))
    expect(value.matches).not.toContain('other_session_lookup')
    expect(value.featureDescription).toContain('tools.feature_lookup(args:')
    expect(value.sessionDescription).toContain('tools.session_lookup(args:')
    expect(value.feature).toBe('feature:first')
    expect(value.session).toBe('session:second')
    expect(featureEffect).toHaveBeenCalledOnce()
    expect(sessionEffect).toHaveBeenCalledOnce()
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true, calls: [
      { id: 'composition-owner/1', name: 'feature_lookup', status: 'ok' },
      { id: 'composition-owner/2', name: 'session_lookup', status: 'ok' },
    ] })
  })

  const restrictions: Array<{ label: string; settings: Partial<RuntimeConfig> }> = [
    { label: 'allowlist', settings: { allowedTools: ['codemode', 'read', 'tool_search', 'tool_load'] } },
    { label: 'disabled tools', settings: { disabledTools: ['glob', 'hidden_contribution'] } },
    { label: 'hidden prefixes', settings: { hiddenToolPrefixes: ['glob', 'hidden_'] } },
  ]
  it.each(restrictions.flatMap(restriction => CONSUMERS.map(consumer => ({ ...restriction, consumer }))))(
    'keeps $label effective for nested discovery and calls through the $consumer consumer', async ({ settings, consumer }) => {
      const effectPath = path.join(workspace, 'excluded-effect.txt')
      const excludedEffect = vi.fn(async () => {
        fs.writeFileSync(effectPath, 'must-not-run')
        return { success: true, output: 'excluded-effect' }
      })
      contribute(fixtureTool('hidden_contribution', excludedEffect))
      fs.writeFileSync(path.join(workspace, 'allowed.txt'), 'permitted-read-control')
      const catalog = await loadToolCatalog({ workspaceRoot: workspace, sessionId: SESSION_ID,
        sdkSkills: new Map(), discover: true, initialTools: ['codemode'], runtimeConfig: config(settings) })
      expect(catalog.tools.has('codemode')).toBe(true)
      for (const name of ['glob', 'hidden_contribution']) {
        expect(catalog.tools.has(name)).toBe(false)
        expect(catalog.discovery!.catalog.has(name)).toBe(false)
      }

      const result = await executeScript(catalog.tools, consumer, `
        const excluded = ['glob', 'hidden_contribution'];
        const attempts = [];
        for (const name of excluded) {
          try { await tools[name](name === 'glob' ? { pattern: '**/*.txt' } : { query: 'forbidden' });
            attempts.push('fulfilled');
          } catch { attempts.push('rejected'); }
        }
        return {
          advertised: excluded.filter(name => ALL_TOOLS.includes(name)),
          described: await Promise.all(excluded.map(name => describeTool(name))),
          searched: (await searchTools('glob hidden_contribution', { limit: 20 })).map(tool => tool.name),
          attempts,
          permitted: await tools.read({ path: 'allowed.txt' }),
        };
      `)
      const value = scriptJson<{ advertised: string[]; described: unknown[]; searched: string[];
        attempts: string[]; permitted: string }>(result)
      expect(value.advertised).toEqual([])
      expect(value.described).toEqual([null, null])
      expect(value.searched).not.toContain('glob')
      expect(value.searched).not.toContain('hidden_contribution')
      expect(value.attempts).toEqual(['rejected', 'rejected'])
      expect(value.permitted).toContain('permitted-read-control')
      expect(excludedEffect).not.toHaveBeenCalled()
      expect(fs.existsSync(effectPath)).toBe(false)
    },
  )

  it.each(CONSUMERS)('calls an admitted deferred tool without loading its outer schema through the %s consumer', async consumer => {
    const effect = vi.fn(async (args: Record<string, unknown>) => ({ success: true, output: `deferred:${String(args.query)}` }))
    contribute(fixtureTool('session_deferred', effect))
    const catalog = await loadToolCatalog({ workspaceRoot: workspace, sessionId: SESSION_ID,
      sdkSkills: new Map(), featureTools: [fixtureTool('feature_loaded')], discover: true,
      initialTools: ['codemode'], runtimeConfig: config() })
    const discovery = catalog.discovery!
    const outerNames = [...discovery.snapshot().keys()]
    const generation = discovery.generation
    const load = vi.spyOn(discovery, 'load')
    expect(outerNames).toContain('codemode')
    expect(outerNames).toContain('feature_loaded')
    expect(outerNames).not.toContain('session_deferred')
    expect(discovery.search('session_deferred').find(tool => tool.name === 'session_deferred'))
      .toMatchObject({ loaded: false, pinned: false })

    const result = await executeScript(catalog.tools, consumer, `
      return {
        admitted: ALL_TOOLS.includes('session_deferred'),
        matches: (await searchTools('session_deferred')).map(tool => tool.name),
        description: await describeTool('session_deferred'),
        value: await tools.session_deferred({ query: 'without-load' }),
      };
    `)
    const value = scriptJson<{ admitted: boolean; matches: string[]; description: string; value: string }>(result)
    expect(value.admitted).toBe(true)
    expect(value.matches).toContain('session_deferred')
    expect(value.description).toContain('tools.session_deferred(args:')
    expect(value.value).toBe('deferred:without-load')
    expect(effect).toHaveBeenCalledOnce()
    expect(load).not.toHaveBeenCalled()
    expect([...discovery.snapshot().keys()]).toEqual(outerNames)
    expect(discovery.generation).toBe(generation)
    expect(discovery.search('session_deferred').find(tool => tool.name === 'session_deferred'))
      .toMatchObject({ loaded: false, pinned: false })
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true,
      calls: [{ id: 'composition-owner/1', name: 'session_deferred', status: 'ok' }] })
  })
})

describe('captured nested contracts in the real composed gate', () => {
  it.each([
    { change: 'schema mutation', deferred: false },
    { change: 'definition replacement', deferred: false },
    { change: 'removal', deferred: false },
    { change: 'unchanged control', deferred: false },
    { change: 'unrelated change control', deferred: false },
    { change: 'schema mutation', deferred: true },
    { change: 'definition replacement', deferred: true },
  ])('settles $change with deferred=$deferred before the captured effect', async ({ change, deferred }) => {
    const effectPath = path.join(workspace, 'captured-effect.txt')
    const effect = vi.fn(async () => {
      fs.writeFileSync(effectPath, 'captured-effect')
      return { success: true, output: 'captured-effect-receipt' }
    })
    const successorEffect = vi.fn(async () => {
      fs.writeFileSync(effectPath, 'successor-effect')
      return { success: true, output: 'successor-effect-receipt' }
    })
    const target = fixtureTool('session_effect', effect)
    contribute(target)
    const catalog = await loadToolCatalog({ workspaceRoot: workspace, sessionId: SESSION_ID,
      sdkSkills: new Map(), discover: true, runtimeConfig: config(),
      initialTools: ['codemode', ...(deferred ? [] : [target.name])] })
    const livePool = catalog.discovery!.catalog as Map<string, ToolDefinition>
    const generation = catalog.discovery!.generation
    const release = held()
    const parent = new AbortController()
    let entered = false
    const hooks = { dispatch: async (payload: { eventName: string; toolName?: string }) => {
      if (payload.eventName === 'PreToolUse' && payload.toolName === target.name) {
        entered = true
        await release.promise
      }
      return { decision: 'allow' }
    } } as unknown as HookDispatcher
    const pending = executeScript(catalog.tools, 'adapted', `
      return await tools.session_effect({ query: 'same-valid-arguments' });
    `, hooks, parent.signal)
    try {
      await vi.waitFor(() => expect(entered).toBe(true), { timeout: 1500, interval: 10 })
      expect(effect).not.toHaveBeenCalled()
      if (change === 'schema mutation') {
        // The args stay valid: refusal must come from the captured contract, not validation.
        const properties = target.argsSchema.properties as Record<string, Record<string, unknown>>
        properties.query!.description = 'Changed after original gate admission.'
      } else if (change === 'definition replacement') {
        livePool.set(target.name, fixtureTool(target.name, successorEffect))
      } else if (change === 'removal') {
        livePool.delete(target.name)
      } else if (change === 'unrelated change control') {
        livePool.set('unrelated_tool', fixtureTool('unrelated_tool'))
      }
    } finally {
      if (!entered) parent.abort()
      release.resolve()
      await pending
    }
    const result = await pending
    const unchanged = change.endsWith('control')
    expect(result.success, result.error ?? result.output).toBe(unchanged)
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true,
      calls: [{ id: 'composition-owner/1', name: target.name, status: unchanged ? 'ok' : 'error' }] })
    expect(successorEffect).not.toHaveBeenCalled()
    if (unchanged) {
      expect(effect).toHaveBeenCalledOnce()
      expect(fs.readFileSync(effectPath, 'utf8')).toBe('captured-effect')
    } else {
      expect(effect).not.toHaveBeenCalled()
      expect(fs.existsSync(effectPath)).toBe(false)
      expect(result.error ?? result.output).toContain('older discovery generation')
    }
    // The catalogue digest captures declarations. Replacement with the same
    // declaration keeps that digest; the per-definition identity guard above
    // must still retire the original executor before its effect.
    if (change === 'definition replacement' || change === 'unchanged control') {
      expect(catalog.discovery!.generation).toBe(generation)
    } else expect(catalog.discovery!.generation).not.toBe(generation)
    if (change === 'schema mutation' || change === 'definition replacement') {
      const fresh = await executeScript(catalog.discovery!.snapshot(), 'adapted', `
        return await tools.session_effect({ query: 'same-valid-arguments' });
      `)
      expect(fresh.success, fresh.error ?? fresh.output).toBe(true)
      expect(fs.readFileSync(effectPath, 'utf8')).toBe(change === 'schema mutation' ? 'captured-effect' : 'successor-effect')
      expect(effect).toHaveBeenCalledTimes(change === 'schema mutation' ? 1 : 0)
      expect(successorEffect).toHaveBeenCalledTimes(change === 'definition replacement' ? 1 : 0)
      if (deferred) expect(catalog.discovery!.snapshot().has(target.name)).toBe(false)
    }
  })
})

it('persists one filtered parent result after two real builtin reads in runTurn', async () => {
  const discarded = ['discarded-intermediate-alpha-fact', 'discarded-intermediate-beta-fact']
  fs.writeFileSync(path.join(workspace, 'first.txt'), `${discarded[0]}\nKEEP:alpha\n`)
  fs.writeFileSync(path.join(workspace, 'second.txt'), `${discarded[1]}\nKEEP:beta\n`)
  const catalog = await loadToolCatalog({ workspaceRoot: workspace, sessionId: SESSION_ID,
    sdkSkills: new Map(), discover: true, initialTools: ['codemode'], runtimeConfig: config() })
  const code = `
    const first = await tools.read({ path: 'first.txt' });
    const second = await tools.read({ path: 'second.txt' });
    const selected = [first, second].flatMap(output => output.split('\\n').flatMap(line => {
      const match = /KEEP:([a-z]+)/.exec(line);
      return match ? [match[1]] : [];
    }));
    return selected.join(', ');
  `
  const persisted: SessionMessage[] = []
  let modelCalls = 0
  let nextHistory: readonly AgentMessage[] = []
  const step: StepFunction = async (messages, _signal, listener) => {
    modelCalls += 1
    if (modelCalls === 1) return { text: '', stopReason: 'stop',
      toolCalls: [{ id: 'read-composition', name: 'codemode', args: { code } }] }
    nextHistory = messages
    listener.onText?.('Selected records summarized.')
    return { text: 'Selected records summarized.', toolCalls: [], stopReason: 'stop' }
  }
  const events: QueryEvent[] = []
  const run = runTurn({ sessionId: SESSION_ID, prompt: 'Summarize the selected records.',
    workspaceRoot: workspace, permissionScope: 'allow-all', history: [],
    onMessage: message => { persisted.push(message); manager.addTurn(SESSION_ID, message) },
    step, tools: catalog.tools, toolSnapshot: () => catalog.discovery!.snapshot(),
    hooks: quietHooks, maxSteps: 5, signal: new AbortController().signal, retry: { enabled: false } })
  for await (const event of run.events) events.push(event)

  expect(modelCalls).toBe(2)
  const outerResults = events.filter(event => event.type === 'tool.result')
  expect(outerResults).toHaveLength(1)
  expect(outerResults[0]).toMatchObject({ taskId: 'read-composition', toolName: 'codemode', success: true })
  const toolMessages = persisted.filter(message => message.role === 'tool')
  expect(toolMessages).toHaveLength(1)
  expect(toolMessages[0]).toMatchObject({ tool_call_id: 'read-composition', content: 'Script completed\n\nalpha, beta' })
  const nested = toolMessages[0]!.metadata?.nestedCalls as NestedToolCallsSnapshot | undefined
  expect(nested).toMatchObject({ complete: true, calls: [
    { id: 'read-composition/1', name: 'read', status: 'ok', arguments: { path: 'first.txt' } },
    { id: 'read-composition/2', name: 'read', status: 'ok', arguments: { path: 'second.txt' } },
  ] })
  for (const call of nested!.calls) expect(call).not.toHaveProperty('output')
  const requestResults = nextHistory.filter(message => message.role === 'tool')
  expect(requestResults).toHaveLength(1)
  expect(requestResults[0]).toMatchObject({ tool_call_id: 'read-composition', content: 'Script completed\n\nalpha, beta' })
  manager.saveCompleted(SESSION_ID)
  const reopened = new SessionManager().resume(SESSION_ID, workspace)
  const durableResults = reopened.turns.filter(message => message.role === 'tool')
  expect(durableResults).toHaveLength(1)
  expect(durableResults[0]).toMatchObject({ tool_call_id: 'read-composition', content: 'Script completed\n\nalpha, beta',
    metadata: { nestedCalls: nested } })
  for (const marker of discarded) {
    expect(JSON.stringify(nextHistory)).not.toContain(marker)
    expect(JSON.stringify(reopened.turns)).not.toContain(marker)
  }
})

it.each(['declared allowlist', 'declared denylist'] as const)('keeps the %s effective in an actual child script', async restriction => {
  const effectPath = path.join(workspace, 'child-forbidden.txt')
  const deniedEffect = vi.fn(async () => {
    fs.writeFileSync(effectPath, 'forbidden-child-effect')
    return { success: true, output: 'forbidden-child-effect' }
  })
  const allowedEffect = vi.fn(async () => ({ success: true, output: 'child-allowed-control' }))
  const registry = new Map<string, ToolDefinition>([
    ['child_allowed', fixtureTool('child_allowed', allowedEffect)],
    ['child_forbidden', fixtureTool('child_forbidden', deniedEffect)],
  ])
  registry.set('codemode', createCodemodeToolDefinition(() => registry))
  const catalog = await loadToolCatalog({ workspaceRoot: workspace, sessionId: SESSION_ID,
    sdkSkills: new Map(), discover: true, initialTools: ['codemode'], runtimeConfig: config() }, () => registry)
  const code = `
    const names = ALL_TOOLS;
    const description = await describeTool('child_forbidden');
    const matches = await searchTools('child_forbidden', { limit: 20 });
    const allowed = await tools.child_allowed({ query: 'allowed' });
    let refused = false;
    try { await tools.child_forbidden({ query: 'forbidden' }); } catch { refused = true; }
    return { names, description, matches: matches.map(tool => tool.name), allowed, refused };
  `
  let feedback: AgentMessage | undefined
  const step: StepFunction = async messages => {
    const result = messages.find(message => message.role === 'tool')
    if (result) { feedback = result; return { text: 'Child completed.', toolCalls: [], stopReason: 'stop' } }
    return { text: '', toolCalls: [{ id: 'child-script', name: 'codemode', args: { code } }], stopReason: 'stop' }
  }
  const run = createSubagentRunner({ step, defaultMaxSteps: 3 }, catalog.tools, {
    sessionId: SESSION_ID, workspaceRoot: workspace, agentMode: 'build', permissionScope: 'allow-all',
    hooks: quietHooks, emit: () => {},
  })
  const result = await run({ definition: { name: 'child-fixture', description: 'Scoped composition.', source: 'builtin',
    systemPrompt: 'Respect the explicit tool boundary.', permissionMode: 'default',
    ...(restriction === 'declared allowlist' ? { tools: ['codemode', 'child_allowed'] }
      : { disallowedTools: ['child_forbidden'] }) }, prompt: 'Inspect scoped tools.', workspace,
    signal: new AbortController().signal })
  expect(result.failed).toBe(false)
  expect(feedback?.is_error).not.toBe(true)
  const value = JSON.parse(String(feedback!.content).replace(/^Script completed\s*/, '')) as {
    names: string[]; description: string | null; matches: string[]; allowed: string; refused: boolean
  }
  expect(value.refused).toBe(true)
  expect(value.names).toContain('child_allowed')
  expect(value.names).not.toContain('child_forbidden')
  expect(value.matches).not.toContain('child_forbidden')
  expect(value.description).toBeNull()
  expect(value.allowed).toBe('child-allowed-control')
  expect(allowedEffect).toHaveBeenCalledOnce()
  expect(deniedEffect).not.toHaveBeenCalled()
  expect(fs.existsSync(effectPath)).toBe(false)
})

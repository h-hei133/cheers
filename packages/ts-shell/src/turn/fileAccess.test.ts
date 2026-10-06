import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCoreToolRegistry } from '../core/tools/registry.js'
import { adaptTools, createToolHooks, type ToolGateOptions } from './tools.js'

let root: string
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'turn-files-'))
  fs.mkdirSync(path.join(root, 'private'))
  for (const name of ['plain.txt', 'file name.txt', 'tab\tname.txt']) {
    fs.writeFileSync(path.join(root, 'private', name), 'PRIVATE_FIXTURE')
  }
  fs.writeFileSync(path.join(root, 'public.txt'), 'public')
})
afterEach(() => { vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }) })

it.each(['native', 'fallback'])('enforces glob path denials through the real turn adapter in %s enumeration', async mode => {
  if (mode === 'native') execFileSync('git', ['init', '-q', root])
  else {
    const empty = path.join(root, 'empty-bin')
    fs.mkdirSync(empty)
    vi.stubEnv('PATH', empty)
  }
  const registry = createCoreToolRegistry()
  for (const scope of ['ask', 'accept-edits', 'allow-all'] as const) {
    const options: ToolGateOptions = {
      workspaceRoot: root, sessionId: 'file-policy-test', permissionScope: scope,
      denyRules: [{ tool: 'glob', pattern: 'private/' }],
      hooks: { dispatch: vi.fn(async () => ({ decision: 'allow' })) } as never, emit: () => {},
    }
    const args = { pattern: '**/*.txt' }
    const hooks = createToolHooks(options, registry)
    expect(await hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' },
      call: { id: 'glob-files', name: 'glob', args }, args })).toBeUndefined()
    const tool = adaptTools(registry, options).find(candidate => candidate.name === 'glob')!
    const result = await tool.execute('glob-files', args, undefined)
    expect(result.isError).toBe(false)
    expect(result.output).toBe('public.txt')
  }
})

it('does not bypass approval when a registered extension uses an inherited property name', async () => {
  const run = vi.fn(async () => ({ success: true, output: 'executed' }))
  const registry = new Map([['constructor', { name: 'constructor', description: 'Fixture extension', execute: run }]])
  const approval = vi.fn(async (prompt: { id: string }) => ({ promptId: prompt.id, decision: 'deny' as const, respondedAt: 1 }))
  const hooks = createToolHooks({ workspaceRoot: root, sessionId: 'extension-policy-test', permissionScope: 'ask',
    hooks: { dispatch: vi.fn(async () => ({ decision: 'allow' })) } as never, emit: () => {}, escalationPromptHandler: approval,
  }, registry)
  const args = {}
  const decision = await hooks.beforeToolCall!({ assistantMessage: { role: 'assistant', content: '' },
    call: { id: 'extension-call', name: 'constructor', args }, args })
  expect(decision?.block).toBe(true)
  expect(approval).toHaveBeenCalledOnce()
  expect(run).not.toHaveBeenCalled()
})

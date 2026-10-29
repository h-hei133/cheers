import { describe, expect, it, vi } from 'vitest'
import { validateToolArguments } from './arguments.js'
import { createCoreToolRegistry } from './registry.js'
import { createDefaultExecutionService } from '../../runtime/execution/service.js'
import { adaptTools, createToolHooks } from '../../turn/tools.js'
import { executeToolBatch } from '../agent/tools.js'
import type { HookDispatcher } from '../hooks/hookDispatcher.js'

describe('tool argument boundary', () => {
  it.each([7, null, {}, [], undefined])('rejects write content %j before any execution service access', async content => {
    const service = createDefaultExecutionService()
    const read = vi.spyOn(service, 'readTextFile').mockResolvedValue('original')
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!
    await expect(tool.execute({ path: 'target.txt', ...(content === undefined ? {} : { content }) },
      { workspaceRoot: process.cwd(), taskId: 'invalid' })).rejects.toThrow('Invalid tool arguments')
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('allows explicit empty content through the existing writer', async () => {
    const service = createDefaultExecutionService()
    vi.spyOn(service, 'readTextFile').mockResolvedValue('original')
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!
    await tool.execute({ path: 'target.txt', content: '' }, { workspaceRoot: process.cwd(), taskId: 'empty' })
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ content: '' }))
  })

  it.each([
    { edits: [] }, { edits: [{ oldText: 'x', newText: 7 }] }, { oldText: 'x' },
    { content: '', oldText: 'x', newText: 'y' }, { edits: [{ oldText: 'x', newText: 'y' }], replaceAll: true },
    { content: '', replaceAll: true },
  ])('rejects invalid edit forms before reads: %j', async args => {
    const service = createDefaultExecutionService()
    const read = vi.spyOn(service, 'readTextFile').mockResolvedValue('original')
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('edit')!
    await expect(tool.execute({ path: 'target.txt', ...args },
      { workspaceRoot: process.cwd(), taskId: 'edit' })).rejects.toThrow('Invalid tool arguments')
    expect(read).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
  })

  it('rejects invalid model calls before approval and pre-use hooks', async () => {
    const approval = vi.fn()
    const dispatch = vi.fn()
    const options = { workspaceRoot: process.cwd(), sessionId: 'validation',
      hooks: { dispatch } as unknown as HookDispatcher, permissionScope: 'ask' as const,
      escalationPromptHandler: approval, emit: vi.fn() }
    const registry = createCoreToolRegistry()
    const tools = adaptTools(registry, options)
    const result = await executeToolBatch(tools, { role: 'assistant', content: '' },
      [{ id: 'invalid', name: 'write', args: { path: 'file', content: 7 } }],
      createToolHooks(options, registry), undefined, undefined, () => {})
    expect(JSON.stringify(result)).toContain('Invalid tool arguments')
    expect(approval).not.toHaveBeenCalled()
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('enforces nested members, range, format, alternatives and additional properties without modifying input', () => {
    const schema = { type: 'object', required: ['items'], additionalProperties: false,
      properties: { items: { type: 'array', minItems: 1, items: { type: 'integer', minimum: 1, maximum: 3 } },
        email: { type: 'string', format: 'email' } } }
    const args = { items: ['2'], email: 'secret-marker' }
    expect(() => validateToolArguments(schema, args)).toThrow('Invalid tool arguments')
    expect(args).toEqual({ items: ['2'], email: 'secret-marker' })
    for (const value of [{ items: [0] }, { items: [4] }, { items: [2], extra: true }, { items: [] }, { items: [2], email: 'secret-marker' }]) {
      expect(() => validateToolArguments(schema, value)).toThrow('constraint failed')
    }
    expect(() => validateToolArguments(schema, { items: [2], email: 'a@example.org' })).not.toThrow()
    try { validateToolArguments(schema, args) } catch (error) { expect(String(error)).not.toContain('secret-marker') }
  })

  it('fails closed for invalid, unknown and asynchronous schemas and refreshes changed schemas', () => {
    for (const schema of [{ type: 'invalid' }, { unknownConstraint: true }, { $ref: 'https://invalid.example/schema' }, { $async: true }]) {
      expect(() => validateToolArguments(schema, {})).toThrow('schema is invalid or unsupported')
    }
    const schema = { type: 'object', required: [] as string[] }
    validateToolArguments(schema, {})
    schema.required.push('newField')
    expect(() => validateToolArguments(schema, {})).toThrow('required')
  })

  it('compiles every built-in contract and supports declared modern schema dialects', () => {
    for (const tool of createCoreToolRegistry().values()) {
      try { validateToolArguments(tool.argsSchema, {}) } catch (error) {
        expect(String(error), tool.name).not.toContain('schema is invalid or unsupported')
      }
    }
    for (const $schema of ['https://json-schema.org/draft/2019-09/schema', 'https://json-schema.org/draft/2020-12/schema']) {
      const schema = { $schema, type: 'object', properties: { count: { type: 'integer' } }, unevaluatedProperties: false }
      validateToolArguments(schema, { count: 1 })
      expect(() => validateToolArguments(schema, { other: 1 })).toThrow('unevaluatedProperties')
    }
  })
})

describe('a write outside the workspace', () => {
  it('names the boundary and the command that widens it', async () => {
    // The refusal is a jail, not a question, so a bare "outside workspace"
    // reads as an arbitrary restriction. The way through is a user command;
    // the model can ask for it instead of retrying a call that cannot succeed.
    const service = createDefaultExecutionService()
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!
    const root = '/tmp/cheers-test/jail-root'

    await expect(tool.execute({ path: '/tmp/cheers-test/elsewhere/file.txt', content: 'x' },
      { workspaceRoot: root, taskId: 'outside' })).rejects.toThrow(/\/workspace add <path> --write/)
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses the same way for edit', async () => {
    const service = createDefaultExecutionService()
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('edit')!

    await expect(tool.execute({ path: '/tmp/cheers-test/elsewhere/file.txt', content: 'x' },
      { workspaceRoot: '/tmp/cheers-test/jail-root', taskId: 'outside-edit' })).rejects.toThrow(/\/workspace add <path> --write/)
    expect(write).not.toHaveBeenCalled()
  })
})

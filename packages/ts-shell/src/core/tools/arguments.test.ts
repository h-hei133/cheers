import fs from 'node:fs'
import path from 'node:path'
import { realpathSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { captureWorkspaceRoot } from '../workspace/roots.js'
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

describe('an attached workspace root widens the file tools', () => {
  /** A real directory, because the resolver checks directory identity. */
  const root = (name: string): string => {
    const target = fs.mkdtempSync(path.join('/tmp/cheers-test/', name))
    return target
  }

  it('writes through an attached root that grants write access', async () => {
    // The grant command stores a root with identity and access; a writer that
    // only checked the primary root made that command look like it did nothing.
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('attach-primary-')
    const attached = root('attach-outside-')
    const service = createDefaultExecutionService()
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!
    const target = path.join(attached, 'note.txt')

    await expect(tool.execute({ path: target, content: 'x' }, {
      workspaceRoot: primary, taskId: 'attached-write',
      workspaceRoots: [captureWorkspaceRoot(attached, attached, 'write')],
    })).resolves.toBeDefined()
    expect(write).toHaveBeenCalledOnce()
    expect(write.mock.calls[0]![0]).toMatchObject({ workspaceRoot: realpathSync(attached), absolutePath: target })
  })

  it('still refuses a read-only attached root for a write', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('readonly-primary-')
    const attached = root('readonly-outside-')
    const service = createDefaultExecutionService()
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!

    await expect(tool.execute({ path: path.join(attached, 'note.txt'), content: 'x' }, {
      workspaceRoot: primary, taskId: 'readonly-attached',
      workspaceRoots: [captureWorkspaceRoot(attached, attached, 'read')],
    })).rejects.toThrow('This additional workspace root is read-only.')
    expect(write).not.toHaveBeenCalled()
  })

  it('refuses an attached root whose directory identity changed', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('stale-primary-')
    const attached = root('stale-outside-')
    const granted = captureWorkspaceRoot(attached, attached, 'write')
    // Replace the directory with a different one: the inode necessarily changes,
    // so this does not depend on birthtime resolution.
    const replacement = root('stale-replacement-')
    fs.rmSync(attached, { recursive: true, force: true })
    fs.renameSync(replacement, attached)
    const service = createDefaultExecutionService()
    const write = vi.spyOn(service, 'writeTextFile').mockResolvedValue(undefined)
    const tool = createCoreToolRegistry({ executionService: service }).get('write')!

    await expect(tool.execute({ path: path.join(attached, 'note.txt'), content: 'x' }, {
      workspaceRoot: primary, taskId: 'stale-attached', workspaceRoots: [granted],
    })).rejects.toThrow(/changed identity/)
    expect(write).not.toHaveBeenCalled()
  })
})

describe('an attached root is readable whatever its access mode', () => {
  const root = (name: string): string => fs.mkdtempSync(path.join('/tmp/cheers-test/', name))

  it('reads a file through a read-only attached root', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('read-primary-')
    const attached = root('read-attached-')
    fs.writeFileSync(path.join(attached, 'note.txt'), 'attached body\n')
    const service = createDefaultExecutionService()
    const tool = createCoreToolRegistry({ executionService: service }).get('read')!

    const result = await tool.execute({ path: path.join(attached, 'note.txt') }, {
      workspaceRoot: primary, taskId: 'read-attached',
      workspaceRoots: [captureWorkspaceRoot(attached, attached, 'read')],
    })
    expect(result).toMatchObject({ success: true })
    expect(String(result.output ?? '')).toContain('attached body')
  })

  it('refuses to read through an unregistered directory', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('unreg-primary-')
    const attached = root('unreg-attached-')
    const other = root('unreg-other-')
    fs.writeFileSync(path.join(other, 'secret.txt'), 'not mine\n')
    const service = createDefaultExecutionService()
    const tool = createCoreToolRegistry({ executionService: service }).get('read')!

    await expect(tool.execute({ path: path.join(other, 'secret.txt') }, {
      workspaceRoot: primary, taskId: 'read-unregistered',
      workspaceRoots: [captureWorkspaceRoot(attached, attached, 'read')],
    })).rejects.toThrow(/outside workspace/)
  })
})

describe('an attached root is searchable', () => {
  const root = (name: string): string => fs.mkdtempSync(path.join('/tmp/cheers-test/', name))

  it('finds files under an attached root with glob', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('glob-primary-')
    const attached = root('glob-attached-')
    fs.writeFileSync(path.join(attached, 'found.ts'), 'export const x = 1\n')
    const service = createDefaultExecutionService()
    const tool = createCoreToolRegistry({ executionService: service }).get('glob')!

    const result = await tool.execute({ pattern: '*.ts', path: attached }, {
      workspaceRoot: primary, taskId: 'glob-attached',
      workspaceRoots: [captureWorkspaceRoot(attached, attached, 'read')],
    })
    expect(result).toMatchObject({ success: true })
    expect(String(result.output ?? '')).toContain('found.ts')
  })

  it('finds content under an attached root with grep', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('grep-primary-')
    const attached = root('grep-attached-')
    fs.writeFileSync(path.join(attached, 'note.txt'), 'attached needle here\n')
    const service = createDefaultExecutionService()
    const tool = createCoreToolRegistry({ executionService: service }).get('grep')!

    const result = await tool.execute({ pattern: 'needle', path: attached }, {
      workspaceRoot: primary, taskId: 'grep-attached',
      workspaceRoots: [captureWorkspaceRoot(attached, attached, 'read')],
    })
    expect(result).toMatchObject({ success: true })
    expect(String(result.output ?? '')).toContain('needle')
  })
})

describe('a write through an attached root keeps the session ledger', () => {
  const root = (name: string): string => fs.mkdtempSync(path.join('/tmp/cheers-test/', name))

  it('records the operation under the session root, not the attached one', async () => {
    // Undo reads the ledger the session owns. A write whose ledger moved to the
    // attached root would succeed and then be invisible to /undo.
    fs.mkdirSync('/tmp/cheers-test', { recursive: true })
    const primary = root('ledger-primary-')
    const attached = root('ledger-attached-')
    // A real execution service, because the ledger is written by the operation
    // store rather than by the mocked write call.
    const tool = createCoreToolRegistry({}).get('write')!
    const target = path.join(attached, 'note.txt')

    await expect(tool.execute({ path: target, content: 'x' }, {
      workspaceRoot: primary, taskId: 'ledger-attached',
      workspaceRoots: [captureWorkspaceRoot(attached, attached, 'write')],
      sessionId: 'sess_ledger',
    })).resolves.toBeDefined()
    expect(fs.existsSync(target)).toBe(true)
    // The ledger root is derived from the operation identity; the attached root
    // must not acquire one of its own.
    expect(fs.existsSync(path.join(attached, '.sisyphus', 'edit-snapshots'))).toBe(false)
  })
})

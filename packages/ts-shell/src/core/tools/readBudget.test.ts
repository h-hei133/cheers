import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createCoreToolRegistry } from './registry.js'
import { ArtifactManager } from '../session/artifactManager.js'
import { executeToolBatch, TOOL_OUTPUT_LIMIT } from '../agent/tools.js'
import { adaptTools, createToolHooks, type ToolGateOptions } from '../../turn/tools.js'

let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'read-budget-')) })
afterEach(async () => { vi.restoreAllMocks(); await fs.rm(root, { recursive: true, force: true }) })

async function modelOutput(name: string, args: Record<string, unknown>): Promise<string> {
  const registry = createCoreToolRegistry()
  const options: ToolGateOptions = { workspaceRoot: root, sessionId: 'paging', permissionScope: 'allow-all',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as never, emit: () => {} }
  const batch = await executeToolBatch(adaptTools(registry, options), { role: 'assistant', content: '' },
    [{ id: 'page', name, args }], createToolHooks(options, registry), 'sequential', undefined, () => {})
  return batch.messages[0].content as string
}

it('retains file continuation and tells the model to recover omitted page text before advancing', async () => {
  await fs.writeFile(path.join(root, 'page.txt'), ('x'.repeat(200) + '\n').repeat(500))
  const output = await modelOutput('read', { path: 'page.txt' })
  expect(output.length).toBeLessThanOrEqual(TOOL_OUTPUT_LIMIT)
  expect(output).toMatch(/offset=\d+ to continue/)
  expect(output).toContain('offset=1 and a smaller limit before advancing')
  expect(output).toContain('byte-range inspection')
  const small = await modelOutput('read', { path: 'page.txt', limit: 1 })
  expect(small).toContain('x'.repeat(200))
  expect(small).toContain('offset=2 to continue')
  expect(small).not.toContain('output truncated')
})

it.each(['read', 'glob'])('keeps accurate selected-page artifact notices from %s through the turn and kernel', async name => {
  for (let index = 0; index < 550; index++) await fs.writeFile(path.join(root, 'z'.repeat(200) + '-' + index + '.ts'), 'x')
  const output = await modelOutput(name, name === 'read' ? { path: '.' } : { pattern: '*.ts' })
  expect(output.length).toBeLessThanOrEqual(TOOL_OUTPUT_LIMIT)
  expect(output).toContain('500-')
  expect(output).toContain('page saved to artifact://')
  expect(output).toContain('50 additional')
  expect(output).not.toContain('Full list')
  const uri = /artifact:\/\/\d+/.exec(output)![0]
  const saved = await fs.readFile(ArtifactManager.getShared(root, 'paging').resolve(uri)!, 'utf8')
  expect(saved.split('\n')).toHaveLength(500)
})

it('reads a short page without reading or buffering the rest of the file', async () => {
  await fs.writeFile(path.join(root, 'large.txt'), 'first\n' + 'rest\n'.repeat(400_000))
  const open = fs.open
  const completeReads = vi.fn()
  let bytesRead = 0
  let handle: Awaited<ReturnType<typeof fs.open>> | undefined
  vi.spyOn(fs, 'open').mockImplementation(async (...args) => {
    handle = await open(...args)
    const readFile = handle.readFile.bind(handle)
    vi.spyOn(handle, 'readFile').mockImplementation((...options: any[]) => { completeReads(); return readFile(...options as [any]) })
    const read = handle.read.bind(handle)
    vi.spyOn(handle, 'read').mockImplementation(async (...options: any[]) => {
      const result = await read(...options as [any])
      bytesRead += result.bytesRead
      return result
    })
    return handle
  })
  const result = await createCoreToolRegistry().get('read')!.execute({ path: 'large.txt', limit: 1 }, { workspaceRoot: root, taskId: 'budget' })
  expect(result.output).toContain('first')
  expect(result.output).not.toContain('rest')
  expect(completeReads).not.toHaveBeenCalled()
  expect(bytesRead).toBeGreaterThan(0)
  expect(bytesRead).toBeLessThanOrEqual(64 * 1024)
  expect(handle?.fd).toBe(-1)
  expect(result.output).toContain('offset=2')
  expect(result.output).not.toContain('of 400001')
})

it('applies the same bounded paging to selectors and session artifacts', async () => {
  const store = ArtifactManager.getShared(root, 'page-fixture')
  const artifact = await store.save('one\ntwo\nthree\n', 'fixture')
  const read = createCoreToolRegistry().get('read')!
  const result = await read.execute({ path: artifact.uri + ':2-2' }, { workspaceRoot: root, sessionId: 'page-fixture', taskId: 'artifact' })
  expect(result.output).toContain('two')
  expect(result.output).not.toContain('three')
  expect(result.metadata?.read).toMatchObject({ startLine: 2, endLine: 2, nextOffset: 3, stopReason: 'line-limit' })
  await fs.writeFile(path.join(root, 'many.txt'), 'line\n'.repeat(2000))
  const raw = await read.execute({ path: 'many.txt:raw' }, { workspaceRoot: root, taskId: 'raw' })
  expect(raw.metadata?.read).toMatchObject({ startLine: 1, endLine: 1000, nextOffset: 1001, stopReason: 'line-limit' })
})

it('does not reread or spill the complete source after reaching the page byte cap', async () => {
  await fs.writeFile(path.join(root, 'many.txt'), ('x'.repeat(200) + '\n').repeat(500))
  const save = vi.spyOn(ArtifactManager.prototype, 'save')
  const result = await createCoreToolRegistry().get('read')!.execute({ path: 'many.txt' }, { workspaceRoot: root, taskId: 'bytes' })
  expect(result.metadata?.read).toMatchObject({ stopReason: 'output-limit' })
  expect(Buffer.byteLength(result.output ?? '')).toBeLessThan(52 * 1024)
  expect(result.output).toMatch(/offset=\d+/)
  expect(save).not.toHaveBeenCalled()
})

it('explains nonresumable scan and line limits without suggesting a futile next offset', async () => {
  const read = createCoreToolRegistry().get('read')!
  await fs.writeFile(path.join(root, 'scan.txt'), 'x'.repeat(8 * 1024 * 1024 - 6) + '\none\ntarget')
  const scan = await read.execute({ path: 'scan.txt', offset: 2 }, { workspaceRoot: root, taskId: 'scan' })
  expect(scan.metadata?.read).toMatchObject({ startLine: 2, endLine: 2, stopReason: 'scan-limit' })
  expect(scan.output).toContain('one')
  expect(scan.output).toContain('Use byte-range inspection')
  expect(scan.output).not.toContain('offset=')
  await fs.writeFile(path.join(root, 'line.txt'), 'one\n' + 'x'.repeat(60 * 1024))
  const line = await read.execute({ path: 'line.txt' }, { workspaceRoot: root, taskId: 'line' })
  expect(line.output).toContain('one')
  expect(line.output).toContain('Line 2 exceeds')
  expect(line.output).not.toContain('offset=')
})

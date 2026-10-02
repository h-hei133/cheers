import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoreToolRegistry } from '../../core/tools/registry.js'
import { captureRecoveryAuthorityRecord } from '../../edit/recovery/recoveryAuthorityStore.js'
import { createDefaultExecutionService } from './service.js'
import type { TextFileWriteExecutionRequest } from './types.js'

vi.mock('../../edit/recovery/recoveryAuthorityStore.js', async () => ({
  ...await vi.importActual<typeof import('../../edit/recovery/recoveryAuthorityStore.js')>(
    '../../edit/recovery/recoveryAuthorityStore.js',
  ),
  captureRecoveryAuthorityRecord: vi.fn(),
}))

let workspaceRoot: string
let target: string

beforeEach(async () => {
  workspaceRoot = await fs.mkdtemp(path.join(process.cwd(), '.tmp-conditional-write-'))
  target = path.join(workspaceRoot, 'note.txt')
  vi.mocked(captureRecoveryAuthorityRecord).mockReset()
})

afterEach(async () => {
  await fs.rm(workspaceRoot, { recursive: true, force: true })
})

function request(expectedContent?: string): TextFileWriteExecutionRequest {
  return {
    operationKind: 'file.write',
    absolutePath: target,
    workspaceRoot,
    content: 'agent change\n',
    expectedContent,
    authority: { mode: 'approved-for-write', source: 'tool-runtime-approval', reason: 'test' },
    caller: 'conditional-write-test',
    reason: 'test conditional write',
    reportSafeTarget: 'note.txt',
  }
}

describe('conditional workspace writes', () => {
  it('rejects stale content before recording a recovery snapshot', async () => {
    await fs.writeFile(target, 'external change\n')
    await expect(createDefaultExecutionService().writeTextFile(request('before\n')))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' })
    expect(await fs.readFile(target, 'utf8')).toBe('external change\n')
    expect(captureRecoveryAuthorityRecord).not.toHaveBeenCalled()
  })

  it('checks again after asynchronous snapshot persistence', async () => {
    await fs.writeFile(target, 'before\n')
    vi.mocked(captureRecoveryAuthorityRecord).mockImplementationOnce(async () => {
      await fs.writeFile(target, 'changed during snapshot\n')
      throw new Error('snapshot storage failed')
    })
    await expect(createDefaultExecutionService().writeTextFile(request('before\n')))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' })
    expect(await fs.readFile(target, 'utf8')).toBe('changed during snapshot\n')
  })

  it('does not recreate a concurrently deleted file', async () => {
    await expect(createDefaultExecutionService().writeTextFile(request('before\n')))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' })
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not recreate a file deleted during snapshot persistence', async () => {
    await fs.writeFile(target, 'before\n')
    vi.mocked(captureRecoveryAuthorityRecord).mockImplementationOnce(async () => {
      await fs.unlink(target)
      throw new Error('snapshot source removed')
    })
    await expect(createDefaultExecutionService().writeTextFile(request('before\n')))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' })
    await expect(fs.stat(target)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('treats an empty expected file as a condition', async () => {
    await fs.writeFile(target, 'external change\n')
    await expect(createDefaultExecutionService().writeTextFile(request('')))
      .rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' })
    await fs.writeFile(target, '')
    await createDefaultExecutionService().writeTextFile(request(''))
    expect(await fs.readFile(target, 'utf8')).toBe('agent change\n')
  })

  it('preserves unconditional write and create semantics', async () => {
    const service = createDefaultExecutionService()
    await service.writeTextFile(request())
    await fs.writeFile(target, 'external change\n')
    await service.writeTextFile(request())
    expect(await fs.readFile(target, 'utf8')).toBe('agent change\n')
  })
})

describe('edit tool read-to-write conditions', () => {
  it.each([
    { oldText: 'before', newText: 'after' },
    { edits: [{ oldText: 'before', newText: 'after' }] },
    { content: 'after\n' },
  ])('preserves an external process edit for %j', async (args) => {
    await fs.writeFile(target, 'before\n')
    const service = createDefaultExecutionService()
    const registry = createCoreToolRegistry({
      executionService: {
        ...service,
        async writeTextFile(input) {
          execFileSync(process.execPath, [
            '-e', 'require("node:fs").writeFileSync(process.argv[1], "external change\\n")', target,
          ])
          return service.writeTextFile(input)
        },
      },
    })
    await expect(registry.get('edit')!.execute(
      { path: 'note.txt', ...args }, { workspaceRoot, taskId: 'edit-test' },
    )).rejects.toMatchObject({ code: 'FILE_CONTENT_CHANGED' })
    expect(await fs.readFile(target, 'utf8')).toBe('external change\n')
  })

  it.each([
    { oldText: 'before', newText: 'after' },
    { edits: [{ oldText: 'before', newText: 'after' }] },
  ])('compares the original BOM and line endings for %j', async (args) => {
    await fs.writeFile(target, '\uFEFFbefore\r\n')
    const result = await createCoreToolRegistry().get('edit')!.execute(
      { path: 'note.txt', ...args }, { workspaceRoot, taskId: 'edit-test' },
    )
    expect(result.success).toBe(true)
    expect(await fs.readFile(target, 'utf8')).toBe('\uFEFFafter\r\n')
  })
})

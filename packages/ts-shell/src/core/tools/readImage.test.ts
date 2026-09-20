import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { safeRemoveDir } from '../../test-utils/cleanup.js'
import { createCoreToolRegistry } from './registry.js'

/**
 * A binary file read as text is mojibake, and mojibake is worse than a refusal:
 * it looks like content. The read tool must say what the file is instead.
 */
describe('read tool on an image', () => {
  let workspaceRoot = ''

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'read-image-'))
    // Smallest valid PNG: signature + IHDR + IDAT + IEND.
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    )
    await fs.writeFile(path.join(workspaceRoot, 'pixel.png'), png)
  })

  afterEach(async () => {
    await safeRemoveDir(workspaceRoot)
  })

  it('reports the file rather than returning its bytes as text', async () => {
    const read = createCoreToolRegistry().get('read')
    if (!read) throw new Error('read tool missing from registry')

    const result = await read.execute({ path: 'pixel.png' }, { taskId: 't', workspaceRoot })

    expect(result.success).toBe(true)
    expect(result.output).toContain('image/png')
    expect(result.output).toContain('cannot be read as text')
    // The PNG signature must not survive into the model's context as characters.
    expect(result.output).not.toContain('\uFFFD')
  })

  it('still reads a text file beside it normally', async () => {
    await fs.writeFile(path.join(workspaceRoot, 'notes.md'), 'plain text\n', 'utf8')
    const read = createCoreToolRegistry().get('read')
    if (!read) throw new Error('read tool missing from registry')

    const result = await read.execute({ path: 'notes.md' }, { taskId: 't', workspaceRoot })

    expect(result.output).toContain('plain text')
  })
})

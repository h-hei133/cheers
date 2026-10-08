import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { safeRemoveDir } from '../../test-utils/cleanup.js'
import { createCoreToolRegistry } from './registry.js'
import which from 'which'

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

  it('decodes the image into typed content without putting binary data in display text', async () => {
    const read = createCoreToolRegistry().get('read')
    if (!read) throw new Error('read tool missing from registry')

    const pending = read.execute({ path: 'pixel.png' }, { taskId: 't', workspaceRoot })
    if (process.platform !== 'linux' || !['ffprobe', 'ffmpeg', 'prlimit'].every(name => which.sync(name, { nothrow: true }))) {
      await expect(pending).rejects.toMatchObject({ reason: 'unavailable' })
      return
    }
    const result = await pending

    expect(result.success).toBe(true)
    expect(result.output).toContain('image/png')
    expect(result.output).toContain('Attached a decoded JPEG frame')
    expect(result.images).toHaveLength(1)
    expect(result.images?.[0]?.mimeType).toBe('image/jpeg')
    expect(Buffer.from(result.images![0]!.data, 'base64').subarray(0, 2)).toEqual(Buffer.from([255, 216]))
    expect(result.metadata?.media).toMatchObject({ width: 1, height: 1 })
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

  it('refuses a hostile pixel header and corrupt payload without changing the source or exposing decoder diagnostics', async () => {
    const file = path.join(workspaceRoot, 'pixel.png')
    const malformed = await fs.readFile(file)
    malformed.writeUInt32BE(100_000, 16)
    malformed.writeUInt32BE(100_000, 20)
    await fs.writeFile(file, malformed)
    const pending = createCoreToolRegistry().get('read')!.execute({ path: 'pixel.png' }, { taskId: 't', workspaceRoot })
    await expect(pending).rejects.toThrow()
    await expect(pending).rejects.toMatchObject({ name: 'MediaReadError' })
    expect(await fs.readFile(file)).toEqual(malformed)
  })
})

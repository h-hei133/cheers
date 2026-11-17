import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { inspectImage } from '../../../model-adapters/image/input.js'
import type { ImageContent } from '../../../model-adapters/multimodal.js'
import { createDefaultExecutionService } from '../../../runtime/execution/service.js'
import type { ExecutionService } from '../../../runtime/execution/types.js'
import { SessionManager } from '../../../session/SessionManager.js'
import type { ToolDefinition, ToolExecutionContext, ToolExecutionResult } from '../../../tools/types.js'
import { adaptTools, type ToolGateOptions } from '../../../turn/tools.js'
import { createToolMediaBudget } from '../../agent/media.js'
import { createToolResultMessage } from '../../agent/tools.js'
import type { HookDispatcher } from '../../hooks/hookDispatcher.js'
import { createReadToolDefinition } from '../read.js'
import { createCodemodeToolDefinition } from './tool.js'

const PIXEL_DATA = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
const PIXEL: ImageContent = { type: 'image', data: PIXEL_DATA, mimeType: 'image/png' }
const SMALL_OUTPUT_BYTES = 64 * 4

let temporary: string
let workspace: string
beforeEach(() => {
  const parent = path.join(os.tmpdir(), 'cheers-test')
  fs.mkdirSync(parent, { recursive: true })
  temporary = fs.mkdtempSync(path.join(parent, 'codemode-output-'))
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

function scriptTool(tools = new Map<string, ToolDefinition>()) {
  const tool = createCodemodeToolDefinition(() => tools)
  tools.set(tool.name, tool)
  return tool
}

function context(): ToolExecutionContext {
  return { workspaceRoot: workspace, taskId: 'script-owner' }
}

function feedback(result: ToolExecutionResult): string {
  return result.error ?? result.output ?? ''
}

function assertBoundedFeedback(result: ToolExecutionResult, status: 'Script completed' | 'Script failed') {
  const output = feedback(result)
  expect(output).toMatch(new RegExp(`^${status}`))
  expect(Buffer.byteLength(output, 'utf8')).toBeLessThanOrEqual(SMALL_OUTPUT_BYTES)
  expect(output).not.toContain('\uFFFD')
  const message = createToolResultMessage('script-owner', output, result.metadata, result.images)
  const published = typeof message.content === 'string' ? message.content
    : message.content.flatMap(block => block.type === 'text' ? [block.text] : []).join('\n')
  expect(published).toBe(output)
  expect(message.metadata?.outputNotice).toBe(result.metadata?.outputNotice)
  return output
}

function returned(output: string): Record<string, unknown> {
  return JSON.parse(output.replace(/^Script completed\s*/, '')) as Record<string, unknown>
}

/** A complete GIF with valid comment subblocks, leaving its image frame and trailer intact. */
function largeGif(commentBytes: number): ImageContent {
  const original = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')
  const extension = [Buffer.from([0x21, 0xfe])]
  for (let remaining = commentBytes; remaining > 0;) {
    const bytes = Math.min(255, remaining)
    extension.push(Buffer.from([bytes]), Buffer.alloc(bytes, 65))
    remaining -= bytes
  }
  extension.push(Buffer.from([0]))
  const data = Buffer.concat([original.subarray(0, -1), ...extension, original.subarray(-1)]).toString('base64')
  return { type: 'image', data, mimeType: 'image/gif' }
}

async function readScript(code: string, service = createDefaultExecutionService()) {
  const sessionId = 'codemode-read-owner'
  new SessionManager().createNewWithId(sessionId, workspace)
  const read = createReadToolDefinition(service)
  const tools = new Map([[read.name, read]])
  const script = scriptTool(tools)
  const hooks = { dispatch: async () => ({ decision: 'allow' }) } as unknown as HookDispatcher
  const gate: ToolGateOptions = { sessionId, workspaceRoot: workspace,
    permissionScope: 'allow-all', hooks, emit: () => {} }
  const adapted = adaptTools(tools, gate).find(tool => tool.name === script.name)!
  return adapted.execute('script-owner', { code }, new AbortController().signal)
}

describe('bounded feedback from the actual script worker', () => {
  it('renders separate text and console output with actual line endings', async () => {
    const result = await scriptTool().execute({ code: 'text("first"); text("second"); console.log("third");' }, context())
    expect(result.success).toBe(true)
    expect(feedback(result)).toBe('Script completed\n\n==> text 1/2 <==\nfirst\n\n==> text 2/2 <==\nsecond\n\n<console_output>\nthird\n</console_output>')
  })

  it.each([
    ['top-level return', `return 'return-head:' + 'x'.repeat(600) + ':return-tail';`],
    ['multibyte text', `text('text-head:' + '界🙂'.repeat(110) + ':text-tail');`],
    ['combined text, console and return', `text('界'.repeat(90)); console.log('🙂'.repeat(50)); return 'r'.repeat(100);`],
  ] as const)('bounds %s together with the final status and notice', async (_label, code) => {
    const result = await scriptTool().execute({ code: `// @options: {"max_output_tokens":64}\n${code}` }, context())
    expect(result.success).toBe(true)
    const output = assertBoundedFeedback(result, 'Script completed')
    const notice = result.metadata?.outputNotice
    expect(typeof notice).toBe('string')
    expect(String(notice).length).toBeGreaterThan(0)
    expect(Buffer.byteLength(String(notice), 'utf8')).toBeLessThanOrEqual(SMALL_OUTPUT_BYTES)
    expect(output).toContain(notice)
  })

  it.each(['text("界".repeat(2000));', 'return "界".repeat(2000);'])(
    'preserves a bounded terminal outcome for output above the worker buffer: %s', async code => {
      const result = await scriptTool().execute({ code: `// @options: {"max_output_tokens":64}\n${code}` }, context())
      assertBoundedFeedback(result, result.success ? 'Script completed' : 'Script failed')
      if (result.success) {
        expect(typeof result.metadata?.outputNotice).toBe('string')
        expect(feedback(result)).toContain(result.metadata?.outputNotice)
      } else {
        expect(feedback(result)).toMatch(/output|buffer|limit/i)
      }
    },
  )
})

describe('validated images retained by the actual script worker', () => {
  it.each([
    `data:IMAGE/PNG;base64,${PIXEL_DATA}`,
    { data: PIXEL_DATA, mimeType: ' IMAGE/PNG ' },
    { image_url: { url: `data:Image/Png;base64,${PIXEL_DATA}` } },
  ])('normalizes a valid declared MIME before the shared inspector: %j', async input => {
    const result = await scriptTool().execute({ code: `await image(${JSON.stringify(input)}); return 'valid-image';` }, context())
    expect(result.success).toBe(true)
    expect(result.images).toEqual([PIXEL])
    expect(result.metadata?.outputNotice).toBeUndefined()
  })

  it('keeps a complete image total within both existing media limits', async () => {
    expect(inspectImage(PIXEL)).toMatchObject({ widthPx: 1, heightPx: 1 })
    const result = await scriptTool().execute({ code: `
      await image(${JSON.stringify(PIXEL)});
      await image('data:image/png;base64,${PIXEL_DATA}');
      return 'complete-image-control';
    ` }, context())
    expect(result.success).toBe(true)
    expect(result.images).toEqual([PIXEL, PIXEL])
    expect(result.metadata?.outputNotice).toBeUndefined()
    const budget = createToolMediaBudget()
    expect(result.images!.length).toBeLessThanOrEqual(budget.images)
    expect(result.images!.reduce((total, image) => total + image.data.length, 0)).toBeLessThanOrEqual(budget.encodedBytes)
    for (const image of result.images!) expect(inspectImage(image)).toMatchObject({ widthPx: 1, heightPx: 1 })
    const message = createToolResultMessage('script-owner', result.output!, result.metadata, result.images)
    expect(Array.isArray(message.content)).toBe(true)
    if (typeof message.content === 'string') throw new Error('Image content was lost during publication.')
    expect(message.content.filter(block => block.type === 'image')).toEqual([PIXEL, PIXEL])
  })

  it('omits repeated images after four, with bounded feedback metadata', async () => {
    const result = await scriptTool().execute({ code: `// @options: {"max_output_tokens":64}
      for (let index = 0; index < 9; index++) await image(${JSON.stringify(PIXEL)});
      return 'image-count-control';
    ` }, context())
    expect(result.success).toBe(true)
    expect(result.images).toEqual(Array.from({ length: 4 }, () => PIXEL))
    const output = assertBoundedFeedback(result, 'Script completed')
    expect(result.metadata?.outputNotice).toMatch(/image.*omitted|omitted.*image/i)
    expect(result.metadata?.outputNotice).toContain('four-image/4MiB')
    expect(output).toContain(result.metadata?.outputNotice)
  })

  it('enforces the encoded aggregate limit before the four-image count is reached', async () => {
    const image = largeGif(1_600_000)
    const budget = createToolMediaBudget()
    expect(inspectImage(image)).toMatchObject({ widthPx: 1, heightPx: 1 })
    expect(image.data.length).toBeLessThan(budget.encodedBytes)
    expect(image.data.length * 2).toBeGreaterThan(budget.encodedBytes)
    const result = await scriptTool().execute({ code: `// @options: {"max_output_tokens":64}
      const item = ${JSON.stringify(image)};
      await image(item); await image(item);
      return 'encoded-total-control';
    ` }, context())
    expect(result.success).toBe(true)
    expect(result.images).toHaveLength(1)
    expect(result.images?.[0]).toEqual(image)
    const output = assertBoundedFeedback(result, 'Script completed')
    expect(result.metadata?.outputNotice).toContain('four-image/4MiB')
    expect(output).toContain(result.metadata?.outputNotice)
  })

  it('rejects a complete individually oversized image before retaining a valid successor', async () => {
    const oversized = largeGif(3_200_000)
    expect(inspectImage(oversized)).toMatchObject({ widthPx: 1, heightPx: 1 })
    expect(oversized.data.length).toBeGreaterThan(createToolMediaBudget().encodedBytes)
    const result = await scriptTool().execute({ code: `
      let rejected = false;
      try { await image(${JSON.stringify(oversized)}); } catch { rejected = true; }
      await image(${JSON.stringify(PIXEL)});
      return { rejected };
    ` }, context())
    expect(result.success).toBe(true)
    expect(returned(result.output!)).toEqual({ rejected: true })
    expect(result.images).toEqual([PIXEL])
  })

  it.each([
    ['PNG signature only', { data: 'iVBORw0KGgo=', mimeType: 'image/png' }],
    ['JPEG signature only', { data: '/9j/', mimeType: 'image/jpeg' }],
    ['GIF signature only', { data: 'R0lGODlh', mimeType: 'image/gif' }],
    ['WebP signature only', { data: 'UklGRgAAAABXRUJQ', mimeType: 'image/webp' }],
    ['forged object MIME', { data: PIXEL_DATA, mimeType: 'image/jpeg' }],
    ['forged data URI MIME', `data:image/jpeg;base64,${PIXEL_DATA}`],
    ['forged image_url MIME', { image_url: { url: `data:image/gif;base64,${PIXEL_DATA}` } }],
  ])('rejects %s before retention and still accepts complete bytes', async (_label, invalid) => {
    const result = await scriptTool().execute({ code: `
      let rejected = false;
      try { await image(${JSON.stringify(invalid)}); } catch { rejected = true; }
      await image(${JSON.stringify(PIXEL)});
      return { rejected };
    ` }, context())
    expect(result.success).toBe(true)
    expect(returned(result.output!)).toEqual({ rejected: true })
    expect(result.images).toEqual([PIXEL])
  })
})

describe('builtin read results through the real tool gate and worker', () => {
  it('keeps text-only nested read results compatible with string consumers', async () => {
    fs.writeFileSync(path.join(workspace, 'notes.txt'), 'native-text-line\nsecond-line\n')
    const result = await readScript(`
      const item = await tools.read({ path: 'notes.txt' });
      return { type: typeof item, firstLine: item.split('\\n')[0] };
    `)
    expect(result.isError, result.output).toBe(false)
    expect(returned(result.output)).toEqual({ type: 'string', firstLine: 'native-text-line' })
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true, calls: [{ name: 'read', status: 'ok' }] })
  })

  it('forwards inert image-bearing read results into published model feedback', async () => {
    fs.writeFileSync(path.join(workspace, 'pixel.png'), Buffer.from(PIXEL_DATA, 'base64'))
    // The native decoder seam is synthetic; builtin routing, the gate, worker and publication are real.
    const mediaReader: ExecutionService['readMedia'] = async request => {
      expect(request.kind).toBe('image')
      expect(request.absolutePath).toBe(path.join(workspace, 'pixel.png'))
      expect(request.abortSignal).toBeDefined()
      expect(inspectImage(PIXEL)).toMatchObject({ widthPx: 1, heightPx: 1 })
      return { output: 'pixel.png: image/png (1 x 1)', images: [PIXEL], metadata: { media: { width: 1, height: 1 } } }
    }
    const readMedia = vi.fn(mediaReader)
    const result = await readScript(`
      const item = await tools.read({ path: 'pixel.png' });
      const shape = { type: typeof item, keys: Object.keys(item).sort(), output: item.output,
        images: item.images.length, callbacks: Object.values(item).some(value => typeof value === 'function') };
      await image(item);
      await image(await tools.read({ path: 'pixel.png' }));
      return shape;
    `, { ...createDefaultExecutionService(), readMedia })
    expect(result.isError, result.output).toBe(false)
    expect(readMedia).toHaveBeenCalledTimes(2)
    expect(returned(result.output)).toEqual({ type: 'object', keys: ['images', 'output'],
      output: 'pixel.png: image/png (1 x 1)', images: 1, callbacks: false })
    expect(result.images).toEqual([PIXEL, PIXEL])
    expect(result.output).not.toContain(PIXEL_DATA)
    expect(result.metadata?.nestedCalls).toMatchObject({ complete: true,
      calls: [{ name: 'read', status: 'ok' }, { name: 'read', status: 'ok' }] })
    const message = createToolResultMessage('script-owner', result.output, result.metadata, result.images)
    expect(message.role).toBe('tool')
    if (typeof message.content === 'string') throw new Error('The read image was lost during model publication.')
    expect(message.content.filter(block => block.type === 'image')).toEqual([PIXEL, PIXEL])
    expect(message.metadata?.nestedCalls).toEqual(result.metadata?.nestedCalls)
  })
})

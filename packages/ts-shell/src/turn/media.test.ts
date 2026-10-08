import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, it } from 'vitest'
import which from 'which'
import { executeToolBatch, type AgentTool } from '../core/agent/tools.js'
import type { AgentMessage } from '../core/agent/state.js'
import { createCoreToolRegistry } from '../core/tools/registry.js'
import { endpointTurnBody } from '../provider/endpoints/index.js'
import { toChatMessages } from './prompt.js'
import { adaptTools, createToolHooks, type ToolGateOptions } from './tools.js'
import { appendTranscriptEvent, readTranscriptEvents, projectTranscriptMessages } from '../session/transcript/sessionTranscript.js'
import { createMessageTranscriptEvent } from '../session/sessionEventCodec.js'

const image = { type: 'image' as const, mimeType: 'image/png', data: 'aGVsbG8=' }
const call = { id: 'image-call', name: 'read', args: { path: 'pixel.png' } }
const assistant: AgentMessage = { role: 'assistant', content: '', tool_calls: [
  { id: call.id, type: 'function', function: { name: 'read', arguments: JSON.stringify(call.args) } },
  { id: 'text-call', type: 'function', function: { name: 'read', arguments: '{"path":"note.txt"}' } },
] }
let root: string
beforeEach(async () => { root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-turn-')) })
afterEach(async () => { await fs.rm(root, { recursive: true, force: true }) })

it.each(['openai-compatible', 'anthropic-messages', 'bedrock-converse-stream', 'google-generative-ai'])(
  'carries parallel image/text results in the supported %s shape and makes nonvision omission explicit', async endpoint => {
    const tool: AgentTool = { name: 'read', execute: async id => ({ output: id === call.id ? 'decoded frame' : 'plain text', isError: false,
      ...(id === call.id ? { images: [image] } : {}) }) }
    const batch = await executeToolBatch([tool], assistant, [call, { id: 'text-call', name: 'read', args: {} }],
      undefined, 'parallel', undefined, () => {})
    expect(batch.messages[0].content).toEqual([{ type: 'text', text: 'decoded frame' }, image])
    const messages = toChatMessages([assistant, ...batch.messages])
    const input = { model: 'gemini-3-pro', systemPrompt: '', messages, tools: [], allowTools: true, vision: true,
      systemRole: 'system' as const, temperature: 0, reasoningEffort: false, maxTokensField: 'max_tokens' as const,
      assistantAfterToolResult: false }
    const body = endpointTurnBody(endpoint, input)
    expect(JSON.stringify(body)).toContain(image.data)
    expect(JSON.stringify(body)).toContain('plain text')
    expect(JSON.stringify(body)).toContain(call.id)
    expect(JSON.stringify(body)).toContain('text-call')
    const unsupported = endpointTurnBody(endpoint, { ...input, vision: false })
    expect(JSON.stringify(unsupported)).toContain('non-vision fallback')
    expect(JSON.stringify(unsupported)).not.toContain(image.data)
    if (endpoint === 'openai-compatible') {
      const wire = body.messages as { role: string; content: unknown; tool_call_id?: string }[]
      expect(wire.slice(-3).map(message => message.role)).toEqual(['tool', 'tool', 'user'])
      expect(wire.slice(-3, -1).map(message => message.tool_call_id)).toEqual([call.id, 'text-call'])
      expect(JSON.stringify(wire[wire.length - 1].content)).toContain('image_url')
      expect(JSON.stringify(wire[wire.length - 1].content)).toContain(call.id)
    } else if (endpoint === 'anthropic-messages') {
      const result = (body.messages as any[]).at(-1).content
      expect(result.map((block: any) => block.type)).toEqual(['tool_result', 'tool_result'])
      expect(result[0].content[1]).toMatchObject({ type: 'image', source: { data: image.data } })
    }
  },
)

it('passes actual decoded media from the registry through turn gates and preserves the original file', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
  await fs.writeFile(path.join(root, 'pixel.png'), png)
  const registry = createCoreToolRegistry()
  const options: ToolGateOptions = { workspaceRoot: root, sessionId: 'media', permissionScope: 'allow-all',
    hooks: { dispatch: async () => ({ decision: 'allow' }) } as never, emit: () => {} }
  const batch = await executeToolBatch(adaptTools(registry, options), assistant, [call], createToolHooks(options, registry), 'sequential', undefined, () => {})
  if (process.platform !== 'linux' || !['ffprobe', 'ffmpeg', 'prlimit'].every(name => which.sync(name, { nothrow: true }))) {
    expect(batch.messages[0].content).toContain('bounded native media reader is unavailable')
    return
  }
  const content = batch.messages[0].content as any[]
  expect(content[1]).toMatchObject({ type: 'image', mimeType: 'image/jpeg' })
  expect(content[1].data.length).toBeGreaterThan(50)
  expect(content[0].text).not.toContain(content[1].data)
  expect(await fs.readFile(path.join(root, 'pixel.png'))).toEqual(png)
  const transcript = path.join(root, 'transcript.jsonl')
  for (const message of [assistant, ...batch.messages]) appendTranscriptEvent(transcript, createMessageTranscriptEvent({ ...message, timestamp: new Date().toISOString() }))
  const restored = toChatMessages(projectTranscriptMessages(readTranscriptEvents(transcript)))
  expect(restored.find(message => message.tool_call_id === call.id)?.content).toEqual(batch.messages[0].content)
  const replaced = await executeToolBatch([{ name: 'read', execute: async () => ({ output: 'decoded frame', isError: false, images: [image] }) }],
    assistant, [call], { afterToolCall: async () => ({ output: 'redacted' }) }, 'sequential', undefined, () => {})
  expect(replaced.messages[0].content).toBe('redacted')
})

it.each(['parallel', 'sequential'] as const)('bounds aggregate tool images before %s publication while pairing every call', async mode => {
  const calls = Array.from({ length: 21 }, (_, index) => ({ id: 'image-' + index, name: 'read', args: {} }))
  const emitted: AgentMessage[] = []
  const batch = await executeToolBatch([{ name: 'read', execute: async () => ({ output: 'decoded source', isError: false, images: [image] }) }],
    assistant, calls, undefined, mode, undefined, event => { if (event.type === 'message_end') emitted.push(event.message) })
  expect(batch.messages.map(message => message.tool_call_id)).toEqual(calls.map(call => call.id))
  expect(emitted).toHaveLength(21)
  for (const messages of [emitted, batch.messages]) {
    expect(messages.flatMap(message => Array.isArray(message.content) ? message.content.filter(block => block.type === 'image') : [])).toHaveLength(4)
    expect(messages.slice(4).every(message => typeof message.content === 'string' && message.content.includes('Re-read the omitted source'))).toBe(true)
  }
})

it('caps encoded batch bytes and clears image-only results when a hook replaces their text', async () => {
  const tool: AgentTool = { name: 'read', execute: async () => ({ output: 'decoded'.repeat(3000), isError: false, images: [{ ...image, data: 'x'.repeat(3 * 1024 * 1024) }] }) }
  const batch = await executeToolBatch([tool], assistant, [call, { ...call, id: 'second' }], undefined, 'sequential', undefined, () => {})
  expect(Array.isArray(batch.messages[0].content)).toBe(true)
  expect(batch.messages[1].content).toContain('4MiB encoded media budget')
  const replaced = await executeToolBatch([{ name: 'read', execute: async () => ({ output: '', isError: false, images: [image] }) }],
    assistant, [call], { afterToolCall: async () => ({ output: 'redacted' }) }, 'sequential', undefined, () => {})
  expect(replaced.messages[0].content).toBe('redacted')
})

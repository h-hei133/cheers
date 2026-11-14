import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadInProcessExtension, loadInProcessExtensionAsync, runExtensionFactory, type ExtensionAPI } from './inProcessLoader.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })

function extension(source: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-initialization-'))
  roots.push(root)
  const filePath = path.join(root, 'extension.ts')
  fs.writeFileSync(filePath, source)
  return { workspaceRoot: root, filePath }
}

describe('extension initialization admission', () => {
  it('waits for async file factories and closes the successful registration snapshot', async () => {
    const options = extension(`
      export default async (api) => {
        await api.ui.confirm('Initialize', 'Ready?');
        api.registerTool({ name: 'initialized', description: 'ready', argsSchema: { type: 'object' }, execute: async () => ({ success: true, output: 'ok' }) });
        module.exports.registerLate = () => api.registerFlag({ name: 'late' });
      };
    `)
    let resolveHost!: () => void
    const hostReady = new Promise<void>(resolve => { resolveHost = resolve })
    let published = false
    const pending = loadInProcessExtensionAsync({ ...options, host: { ui: { confirm: () => hostReady.then(() => true) } } })
      .then(value => { published = true; return value })
    await Promise.resolve()
    expect(published).toBe(false)
    resolveHost()
    const loaded = await pending
    expect(loaded.tools.map(tool => tool.name)).toEqual(['initialized'])
    expect(Object.isFrozen(loaded.tools)).toBe(true)
    expect(() => (loaded.exports.registerLate as () => void)()).toThrow('registration is closed')
  })

  it('rejects async factories in the synchronous compatibility entry without publishing partial registrations', async () => {
    const options = extension(`
      export default async (api) => {
        await Promise.resolve();
        api.registerTool({ name: 'late' });
      };
    `)
    expect(() => loadInProcessExtension(options)).toThrow('loadInProcessExtensionAsync')
    await Promise.resolve()
  })

  it('runs synchronous exported factory code inside the VM execution deadline', async () => {
    const options = extension('export default () => { while (true) {} };')
    await expect(loadInProcessExtensionAsync({ ...options, initializationTimeoutMs: 20 })).rejects.toThrow('timed out')
  })

  it('discards rejected inline initialization and retires its API capability', async () => {
    let captured!: ExtensionAPI
    await expect(runExtensionFactory({ workspaceRoot: process.cwd(), factory: async api => {
      captured = api
      api.registerFlag({ name: 'pending' })
      await Promise.resolve()
      throw new Error('initialization rejected')
    } })).rejects.toThrow('initialization rejected')
    expect(() => captured.registerFlag({ name: 'late' })).toThrow('retired')
    expect(() => captured.sendMessage('late')).toThrow('retired')
  })

  it.each(['timeout', 'cancel'] as const)('retires late registration and host effects after %s', async outcome => {
    const controller = new AbortController()
    let captured!: ExtensionAPI
    let release!: () => void
    const delay = new Promise<void>(resolve => { release = resolve })
    let lateError: unknown
    const effects: string[] = []
    const pending = runExtensionFactory({
      workspaceRoot: process.cwd(), signal: controller.signal, initializationTimeoutMs: outcome === 'timeout' ? 20 : 5_000,
      host: { sendMessage: message => { effects.push(String(message)) } },
      factory: async api => {
        captured = api
        await delay
        try { api.registerFlag({ name: 'late' }) } catch (error) { lateError = error }
        await api.sendMessage('late')
      },
    })
    if (outcome === 'cancel') controller.abort()
    await expect(pending).rejects.toThrow(outcome === 'timeout' ? 'timed out' : 'cancelled')
    release()
    await Promise.resolve()
    await Promise.resolve()
    expect(lateError).toBeInstanceOf(Error)
    expect(effects).toEqual([])
    expect(() => captured.readWorkspaceFile('HANDOFF.md')).toThrow('retired')
  })
})

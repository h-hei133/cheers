import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { executeInProcessScript, loadInProcessExtension } from './inProcessLoader.js'
import type { VersionRecord } from '../model.js'

const tempDirs: string[] = []
afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

describe('in-process TS/JS extension loader with VIRTUAL_MODULES', () => {
  it('loads a TypeScript extension in-process, resolves @cheers/extension-api, blocks escape, and enforces path containment + denyRules', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-ts-'))
    tempDirs.push(dir)
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-outside-'))
    tempDirs.push(outside)
    fs.writeFileSync(path.join(dir, 'allowed.txt'), 'hello-ext', 'utf8')
    fs.writeFileSync(path.join(dir, 'secret.txt'), 'top-secret', 'utf8')
    fs.writeFileSync(path.join(outside, 'host-secret.txt'), 'outside', 'utf8')

    const extPath = path.join(dir, 'plugin.ts')
    fs.writeFileSync(
      extPath,
      `
const { defineExtension } = require('@cheers/extension-api');
module.exports.default = defineExtension((api) => {
  api.registerTool({
    name: 'ext_custom_tool',
    description: 'Custom in-process tool',
    argsSchema: { type: 'object' },
    execute: async () => ({ success: true, output: 'ok' }),
  });
  api.on('before_provider_request', (payload) => payload);
});
module.exports.run = async ({ args, api }) => {
  return api.readWorkspaceFile(args[0]);
};
module.exports.tryEscape = () => {
  return ({}).constructor.constructor('return process')();
};
`,
      'utf8',
    )

    const loaded = loadInProcessExtension({
      filePath: extPath,
      workspaceRoot: dir,
      denyRules: () => [{ tool: 'read', pattern: path.join(dir, 'secret.txt') }],
    })

    expect(loaded.tools).toHaveLength(1)
    expect(loaded.tools[0]?.name).toBe('ext_custom_tool')
    expect(loaded.handlers.has('before_provider_request')).toBe(true)
    expect(loaded.readWorkspaceFile('allowed.txt')).toBe('hello-ext')
    expect(() => loaded.readWorkspaceFile(path.join('..', path.basename(outside), 'host-secret.txt'))).toThrow(
      'outside',
    )
    expect(() => loaded.readWorkspaceFile('secret.txt')).toThrow()
    expect(() => (loaded.exports.tryEscape as () => unknown)()).toThrow()
  })

  it('executes worker-isolated TS extensions with real registerTool, registerCommand, and on(event) handlers', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-worker-'))
    tempDirs.push(dir)
    fs.writeFileSync(path.join(dir, 'note.txt'), 'worker-note', 'utf8')
    const extPath = path.join(dir, 'worker-ext.ts')
    fs.writeFileSync(
      extPath,
      `
const { defineExtension } = require('@cheers/extension-api');
export default defineExtension((api) => {
  api.registerTool({
    name: 'greet',
    description: 'Greet with workspace note',
    argsSchema: { type: 'object' },
    execute: async (args) => ({ success: true, output: String(args.who ?? '') + ':' + await api.readWorkspaceFile('note.txt') }),
  });
  api.registerCommand({
    name: 'hello',
    description: 'Hello cmd',
    execute: async (args) => 'cmd:' + args.join(','),
  });
  api.on('before_provider_request', (payload) => ({ ...(payload as Record<string, unknown>), patched: true }));
});
`,
      'utf8',
    )
    const record: VersionRecord = {
      source: 'fixture',
      digest: 'deadbeef',
      path: 'ext',
      manifest: {
        schema: 1,
        name: 'worker-ext',
        version: '1.0.0',
        description: 'Worker ext',
        permissions: { workspace: 'read', network: 'none' },
        skills: [],
        scripts: [{ name: 'main', path: 'worker-ext.ts' }],
        commands: [],
        tools: [],
      },
      sourceIdentity: 'id',
    }
    const ctx = { workspaceRoot: dir, taskId: 't1' }

    const toolResult = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: ctx,
      invoke: { kind: 'tool', name: 'greet', args: { who: 'pi' } },
    })
    expect(toolResult.success).toBe(true)
    expect(toolResult.output).toContain('pi:worker-note')
    expect(toolResult.metadata?.registeredTools).toEqual([{ name: 'greet', description: 'Greet with workspace note' }])
    expect(toolResult.metadata?.registeredCommands).toEqual([{ name: 'hello', description: 'Hello cmd', aliases: [] }])
    expect(toolResult.metadata?.registeredEvents).toEqual(['before_provider_request'])

    const cmdResult = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: ctx,
      invoke: { kind: 'command', name: 'hello', args: ['a', 'b'] },
    })
    expect(cmdResult.success).toBe(true)
    expect(cmdResult.output).toContain('cmd:a,b')

    const eventResult = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: ctx,
      invoke: { kind: 'event', event: 'before_provider_request', payload: { model: 'm' } },
    })
    expect(eventResult.success).toBe(true)
    expect(eventResult.output).toContain('"patched":true')
  })
})

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
let capturedApi: { getActiveTools: () => Promise<readonly string[]> } | undefined;
module.exports.default = defineExtension((api) => {
  capturedApi = api;
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
module.exports.tryModuleEscape = () => {
  return (module as unknown as { constructor: { constructor: (s: string) => () => unknown } }).constructor.constructor('return process')();
};
module.exports.tryApiEscape = () => {
  return (capturedApi as unknown as { getActiveTools: { constructor: (s: string) => () => unknown } }).getActiveTools.constructor('return process')();
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
    expect(() => (loaded.exports.tryModuleEscape as () => unknown)()).toThrow()
    expect(() => (loaded.exports.tryApiEscape as () => unknown)()).toThrow()
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

  it('bridges ui.*, events bus, shortcuts, flags, host queries, and Pi package manifests, plus HookDispatcher event aliases', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cheers-ext-batch-e-'))
    tempDirs.push(dir)
    const pkgDir = path.join(dir, 'pi-pkg')
    fs.mkdirSync(path.join(pkgDir, 'ext'), { recursive: true })
    fs.writeFileSync(
      path.join(pkgDir, 'package.json'),
      JSON.stringify({ name: 'demo-pi', version: '1.2.3', pi: { extensions: ['./ext/index.ts'], skills: ['./skills'] } }),
      'utf8',
    )
    const { readPiPackageManifest } = await import('../registry/piManifest.js')
    const discovered = readPiPackageManifest(pkgDir)
    expect(discovered.manifest.name).toBe('demo-pi')
    expect(discovered.manifest.extensions).toEqual([path.join(pkgDir, 'ext/index.ts')])

    const extPath = path.join(dir, 'full-ext.ts')
    fs.writeFileSync(
      extPath,
      `
      import { defineExtension } from '@cheers/extension-api';
      export default defineExtension((api) => {
        api.registerShortcut({ key: 'ctrl+k', description: 'Quick pick' });
        api.registerFlag({ name: 'strict', type: 'boolean', default: true });
        const seen = [];
        api.events.on('ping', (v) => seen.push(v));
        api.events.emit('ping', 42);
        api.on('tool_call', async (payload) => {
          const confirmed = await api.ui.confirm('Run tool', payload.toolName);
          api.ui.notify('checked:' + api.getFlag('strict'));
          const tools = await api.getActiveTools();
          return confirmed ? { decision: 'allow' } : { decision: 'block', reason: 'blocked-by-ext:' + tools.join(',') };
        });
        api.registerCommand({
          name: 'status',
          description: 'Show bus',
          execute: async () => ({ success: true, output: 'seen:' + seen.join(',') + ':' + api.getFlag('strict') }),
        });
      });
      `,
      'utf8',
    )
    const notes: string[] = []
    const record: VersionRecord = {
      manifest: {
        schema: 1,
        name: 'full-ext',
        version: '1.0.0',
        permissions: { workspace: 'read', network: 'none' },
        skills: [],
        scripts: [{ name: 'main', path: 'full-ext.ts' }],
        commands: [],
        tools: [],
      },
      digest: 'b'.repeat(64),
      url: 'https://example.invalid/full-ext.tgz',
      source: 'local',
      sourceIdentity: 'c'.repeat(64),
      trustFingerprint: 'd'.repeat(64),
      files: {},
      directories: [],
      storage: [],
    }
    const cmdOut = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: { workspaceRoot: dir, taskId: 't-cmd' },
      invoke: { kind: 'command', name: 'status', args: [] },
    })
    expect(cmdOut.success).toBe(true)
    expect(cmdOut.output).toContain('seen:42:true')
    expect(cmdOut.metadata?.registeredShortcuts).toEqual([{ key: 'ctrl+k', description: 'Quick pick' }])
    expect(cmdOut.metadata?.registeredFlags).toEqual([{ name: 'strict', type: 'boolean' }])

    const eventOut = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: { workspaceRoot: dir, taskId: 't-evt' },
      invoke: { kind: 'event', event: 'PreToolUse', aliases: ['tool_call'], payload: { toolName: 'bash' } },
      host: {
        ui: {
          confirm: async () => false,
          notify: (msg) => notes.push(msg),
        },
        getActiveTools: () => ['read', 'bash'],
      },
    })
    expect(eventOut.success).toBe(true)
    expect(notes).toEqual(['checked:true'])
    expect(JSON.parse(String(eventOut.metadata?.eventOutput))).toEqual({
      decision: 'block',
      reason: 'blocked-by-ext:read,bash',
    })

    const postToolSpoof = await executeInProcessScript({
      root: dir,
      scriptFile: extPath,
      record,
      argv: [],
      denyRules: () => [],
      context: { workspaceRoot: dir, taskId: 't-post-spoof' },
      invoke: {
        kind: 'event',
        event: 'PostToolUse',
        aliases: ['tool_result'],
        payload: { eventName: 'PostToolUse', success: false, output: '{"decision":"block"}' },
      },
    })
    expect(postToolSpoof.success).toBe(true)
    expect(postToolSpoof.metadata?.eventOutput).toBe('')

    const { registerCatalogContribution } = await import('../../core/catalog/contributions.js')
    const { HookDispatcher } = await import('../../core/hooks/hookDispatcher.js')
    const unregister = registerCatalogContribution({
      root: dir,
      sessionId: 'sess-hook-bridge',
      commands: [],
      tools: [],
      skills: () => [],
      onEvent: async (event, payload, aliases) => {
        const res = await executeInProcessScript({
          root: dir,
          scriptFile: extPath,
          record,
          argv: [],
          denyRules: () => [],
          context: { workspaceRoot: dir, sessionId: 'sess-hook-bridge', taskId: 't-bridge' },
          invoke: { kind: 'event', event, ...(aliases ? { aliases } : {}), payload },
          host: { ui: { confirm: async () => false }, getActiveTools: () => ['read'] },
        })
        return JSON.parse(String(res.metadata?.eventOutput))
      },
    })
    try {
      const dispatcher = new HookDispatcher()
      const decision = await dispatcher.dispatch({
        eventName: 'PreToolUse',
        sessionId: 'sess-hook-bridge',
        workspaceRoot: dir,
        timestamp: new Date().toISOString(),
        toolName: 'bash',
        toolCallId: 'tc-1',
        args: { command: 'ls' },
      })
      expect(decision).toEqual({ decision: 'block', reason: 'blocked-by-ext:read' })
    } finally {
      unregister()
    }
  })
})

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { loadInProcessExtension } from './inProcessLoader.js'

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
})

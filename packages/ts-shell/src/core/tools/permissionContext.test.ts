import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { evaluateToolPermissionScope } from '../query/toolPolicy.js'
import { resolveWorkspaceToolTarget } from './permissionContext.js'

const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }) })
function workspace(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-paths-'))
  roots.push(root)
  fs.mkdirSync(path.join(root, 'private'))
  fs.writeFileSync(path.join(root, 'private', 'data.txt'), 'private data')
  fs.symlinkSync(path.join(root, 'private'), path.join(root, 'alias'), 'dir')
  return root
}

describe('file target policy', () => {
  it.each(['read', 'write', 'edit', 'grep', 'lsp'])('denies the canonical target of %s across permission modes', tool => {
    const root = workspace()
    const key = tool === 'lsp' ? 'filePath' : 'path'
    for (const scope of ['ask', 'accept-edits', 'allow-all'] as const) {
      for (const target of ['private/data.txt', './private/data.txt', 'alias/data.txt', path.join(root, 'alias/data.txt')]) {
        const decision = evaluateToolPermissionScope(tool, { [key]: target }, scope, root, [{ tool, pattern: 'private/' }])
        expect(decision.denied, `${scope}: ${target}`).toBe(true)
        expect(decision.requiresEscalation).toBe(false)
      }
    }
  })

  it('checks selector-free read targets without treating artifact IDs as workspace paths', () => {
    const root = workspace()
    expect(evaluateToolPermissionScope('read', { path: 'alias/data.txt:1-5' }, 'allow-all', root,
      [{ tool: 'read', pattern: 'private/' }]).denied).toBe(true)
    expect(evaluateToolPermissionScope('read', { path: 'artifact://1:1-5' }, 'allow-all', root,
      [{ tool: 'read', pattern: 'artifact://' }]).denied).toBe(true)
    expect(evaluateToolPermissionScope('read', { path: 'artifact://1' }, 'allow-all', root,
      [{ tool: 'read', pattern: root }]).denied).not.toBe(true)
  })

  it('distinguishes parent traversal from filenames that begin with two dots', () => {
    const root = workspace()
    fs.writeFileSync(path.join(root, '..notes'), 'ordinary workspace file')
    expect(resolveWorkspaceToolTarget({ path: '..notes' }, 'path', root)).toBe(path.join(root, '..notes'))
    expect(() => resolveWorkspaceToolTarget({ path: '../outside' }, 'path', root)).toThrow('outside')
  })
})

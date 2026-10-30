import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { captureWorkspaceRoot } from './roots.js'
import { workspaceToolBinding } from './tools.js'

const root = (name: string): string => fs.mkdtempSync(path.join('/tmp/cheers-test/', name))
const setup = (): { primary: string; attached: string } => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true })
  return { primary: root('bind-primary-'), attached: root('bind-attached-') }
}

describe('file tool binding selects the root the tool will act through', () => {
  it('binds an attached root and rewrites the argument to its absolute target', () => {
    const { primary, attached } = setup()
    const granted = captureWorkspaceRoot(attached, attached, 'write')
    const target = path.join(attached, 'note.txt')
    const binding = workspaceToolBinding('write', { path: target, content: 'x' }, primary, [granted])
    expect(binding).toMatchObject({ root: attached, scoped: true })
    // The argument is rewritten so the writer resolves the same file the policy
    // approved, rather than re-deriving it from the primary root.
    expect(binding.args.path).toBe(target)
  })

  it('keeps the primary root and the caller spelling for an inside path', () => {
    const { primary, attached } = setup()
    const binding = workspaceToolBinding('write', { path: 'src/a.ts', content: 'x' }, primary,
      [captureWorkspaceRoot(attached, attached, 'write')])
    expect(binding).toMatchObject({ root: primary, scoped: true })
    expect(binding.args.path).toBe('src/a.ts')
  })

  it('refuses a read-only attached root for a write and allows it for a read', () => {
    const { primary, attached } = setup()
    const target = path.join(attached, 'note.txt')
    const readOnly = captureWorkspaceRoot(attached, attached, 'read')
    expect(() => workspaceToolBinding('write', { path: target, content: 'x' }, primary, [readOnly]))
      .toThrow('This additional workspace root is read-only.')
    expect(workspaceToolBinding('read', { path: target }, primary, [readOnly])).toMatchObject({ root: attached })
  })

  it('refuses an unregistered path and leaves non-file tools on the primary root', () => {
    const { primary, attached } = setup()
    const other = root('bind-other-')
    expect(() => workspaceToolBinding('write', { path: path.join(other, 'x.txt'), content: 'x' }, primary,
      [captureWorkspaceRoot(attached, attached, 'write')])).toThrow()
    expect(workspaceToolBinding('bash', { command: 'ls' }, primary, [])).toEqual({ root: primary, args: { command: 'ls' }, scoped: false })
  })
})

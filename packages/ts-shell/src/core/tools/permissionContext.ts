import path from 'node:path'
import { verifyPathContainment } from '../security/pathJail.js'
import { parsePathSelector } from './selectorParser.js'

export function resolveToolTarget(
  args: Record<string, unknown>,
  key: string,
  workspaceRoot: string,
): string {
  const raw = args[key]
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`${key} must be a non-empty string`)
  }

  return path.isAbsolute(raw) ? raw : path.join(workspaceRoot, raw)
}

export function resolveWorkspaceToolTarget(
  args: Record<string, unknown>,
  key: string,
  workspaceRoot: string,
): string {
  const target = resolveToolTarget(args, key, workspaceRoot)
  const containment = verifyPathContainment(target, workspaceRoot)
  if (!containment.allowed) throw new Error('Tool path resolves outside the workspace boundary.')
  return containment.resolvedPath
}

/** Policy compares both the requested spelling and the file the tool resolves. */
export function filePolicyTargets(toolName: string, args: Record<string, unknown>, workspaceRoot: string): readonly string[] {
  const key = toolName === 'lsp' ? 'filePath' : ['read', 'write', 'edit', 'apply_patch', 'glob', 'grep'].includes(toolName) ? 'path' : undefined
  if (!key || typeof args[key] !== 'string') return []
  const raw = args[key] as string
  const clean = toolName === 'read' ? parsePathSelector(raw).cleanPath : raw
  if (!clean || clean.startsWith('artifact://')) return [raw, clean]
  const target = path.resolve(workspaceRoot, clean)
  const containment = verifyPathContainment(target, workspaceRoot)
  return [...new Set([raw, clean, target, path.relative(workspaceRoot, target),
    containment.resolvedPath, path.relative(workspaceRoot, containment.resolvedPath)])]
}

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { verifyPathContainment } from '../security/pathJail.js'
import { parsePathSelector } from './selectorParser.js'

const UNICODE_SPACES_PATTERN = /[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g
const NARROW_NO_BREAK_SPACE = '\u202F'

/** Expand `@`, `file://`, `~`, and Unicode spaces before resolving against `workspaceRoot`. */
export function normalizeToolPathInput(raw: string): string {
  let normalized = raw.startsWith('@') ? raw.slice(1) : raw
  if (normalized.startsWith('file://')) {
    try {
      normalized = fileURLToPath(normalized)
    } catch {
      // Keep raw string when malformed so jail/validation rejects cleanly.
    }
  }
  normalized = normalized.replace(UNICODE_SPACES_PATTERN, ' ')
  if (normalized === '~') return os.homedir()
  if (normalized.startsWith('~/') || normalized.startsWith('~\\')) {
    return path.join(os.homedir(), normalized.slice(2))
  }
  return normalized
}

export function resolveToolTarget(
  args: Record<string, unknown>,
  key: string,
  workspaceRoot: string,
): string {
  const raw = args[key]
  if (typeof raw !== 'string' || raw.length === 0) {
    throw new Error(`${key} must be a non-empty string`)
  }
  const clean = normalizeToolPathInput(raw)
  if (clean.length === 0) {
    throw new Error(`${key} must be a non-empty string`)
  }
  return path.isAbsolute(clean) ? clean : path.join(workspaceRoot, clean)
}

/** Probe macOS screenshot narrow-NBSP, NFD, and curly-apostrophe read fallbacks within jail. */
export function resolveReadablePathVariant(resolvedPath: string, workspaceRoot: string): string {
  if (fs.existsSync(resolvedPath)) return resolvedPath
  const candidates = [
    resolvedPath.replace(/ (AM|PM)\./gi, `${NARROW_NO_BREAK_SPACE}$1.`),
    resolvedPath.normalize('NFD'),
    resolvedPath.replace(/'/g, '\u2019'),
  ]
  for (const candidate of candidates) {
    if (candidate === resolvedPath) continue
    const checked = verifyPathContainment(candidate, workspaceRoot)
    if (checked.allowed && fs.existsSync(checked.resolvedPath)) return checked.resolvedPath
  }
  return resolvedPath
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
  const normalized = normalizeToolPathInput(clean)
  const target = path.resolve(workspaceRoot, normalized)
  const containment = verifyPathContainment(target, workspaceRoot)
  return [...new Set([raw, clean, normalized, target, path.relative(workspaceRoot, target),
    containment.resolvedPath, path.relative(workspaceRoot, containment.resolvedPath)])]
}

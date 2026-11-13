import fs from 'node:fs'
import path from 'node:path'
import { isRecord } from '../../core/values/record.js'
import { verifyPathContainment } from '../../core/security/pathJail.js'

export interface PiPackageManifest {
  readonly name: string
  readonly version?: string
  readonly extensions: readonly string[]
  readonly skills: readonly string[]
  readonly prompts: readonly string[]
  readonly themes: readonly string[]
  readonly changelogPath?: string
}

export interface DiscoveredLocalPiPackage {
  readonly root: string
  readonly manifest: PiPackageManifest
  readonly diagnostics: readonly string[]
}

function stringList(value: unknown, label: string, diagnostics: string[]): string[] {
  if (value === undefined) return []
  if (!Array.isArray(value)) {
    diagnostics.push(`Invalid pi.${label}: expected string array.`)
    return []
  }
  const out: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) out.push(item.trim())
    else diagnostics.push(`Ignored non-string entry in pi.${label}.`)
  }
  return out
}

function resolveContainedPaths(root: string, entries: readonly string[], label: string, diagnostics: string[]): string[] {
  const resolved: string[] = []
  for (const rel of entries) {
    const clean = rel.replace(/^[!+-]/, '')
    if (!clean) continue
    const target = path.resolve(root, clean)
    const containment = verifyPathContainment(target, root)
    if (!containment.allowed) {
      diagnostics.push(`Refused pi.${label} entry escaping package root: ${rel}`)
      continue
    }
    resolved.push(containment.resolvedPath)
  }
  return resolved
}

/** Read and validate a Pi-format `"pi"` manifest from `<packageDir>/package.json` without executing any code. */
export function readPiPackageManifest(packageDir: string): DiscoveredLocalPiPackage {
  const resolvedRoot = path.resolve(packageDir)
  const pkgPath = path.join(resolvedRoot, 'package.json')
  const containedPkg = verifyPathContainment(pkgPath, resolvedRoot)
  if (!containedPkg.allowed) {
    throw new Error(`Refused package.json escaping ${resolvedRoot}.`)
  }
  if (!fs.existsSync(containedPkg.resolvedPath)) {
    throw new Error(`No package.json found at ${containedPkg.resolvedPath}.`)
  }
  const stat = fs.lstatSync(containedPkg.resolvedPath)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 1024 * 1024) {
    throw new Error(`Refused unsafe or oversized package.json at ${containedPkg.resolvedPath}.`)
  }
  const parsed: unknown = JSON.parse(fs.readFileSync(containedPkg.resolvedPath, 'utf8'))
  if (!isRecord(parsed)) {
    throw new Error('Malformed package.json object.')
  }
  const diagnostics: string[] = []
  const pi = isRecord(parsed.pi) ? parsed.pi : {}
  if (parsed.pi !== undefined && !isRecord(parsed.pi)) {
    diagnostics.push('Ignored non-object "pi" field in package.json.')
  }

  const extensions = resolveContainedPaths(resolvedRoot, stringList(pi.extensions, 'extensions', diagnostics), 'extensions', diagnostics)
  const skills = resolveContainedPaths(resolvedRoot, stringList(pi.skills, 'skills', diagnostics), 'skills', diagnostics)
  const prompts = resolveContainedPaths(resolvedRoot, stringList(pi.prompts, 'prompts', diagnostics), 'prompts', diagnostics)
  const themes = resolveContainedPaths(resolvedRoot, stringList(pi.themes, 'themes', diagnostics), 'themes', diagnostics)

  let changelogPath: string | undefined
  if (typeof pi.changelogPath === 'string' && pi.changelogPath.trim()) {
    const containment = verifyPathContainment(path.resolve(resolvedRoot, pi.changelogPath.trim()), resolvedRoot)
    if (containment.allowed) changelogPath = containment.resolvedPath
    else diagnostics.push('Refused pi.changelogPath escaping package root.')
  }

  return {
    root: resolvedRoot,
    manifest: {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : path.basename(resolvedRoot),
      ...(typeof parsed.version === 'string' && parsed.version.trim() ? { version: parsed.version.trim() } : {}),
      extensions,
      skills,
      prompts,
      themes,
      ...(changelogPath ? { changelogPath } : {}),
    },
    diagnostics,
  }
}

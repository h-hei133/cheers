/**
 * Which files a tool may see, and which directories are never entered.
 *
 * Three things have to agree before a tool can answer "what is in this
 * workspace": the set of directories not worth descending into, the ignore rules
 * the repository already declares, and the paths the answer is expressed in.
 * They used to be decided separately — each tool walked the whole tree and then
 * filtered the result with its own hardcoded list, three lists that disagreed,
 * and each re-derived the relative path with its own string surgery.
 *
 * The layers here are ordered by what they can know:
 *
 *   1. Directory names never entered. Always applied. This is the only layer that
 *      prunes during the walk rather than filtering afterwards, so it is what
 *      keeps the traversal cheap.
 *   2. The repository's own ignore rules, asked of git when there is a
 *      repository to ask. git resolves `core.excludesFile`, `.git/info/exclude`
 *      and nested `.gitignore` files with the precedence it defines, which is
 *      more than we could reproduce faithfully.
 *   3. The same rules matched in-process when there is no repository, because
 *      git exits 128 outside one and losing ignore support there is a gap rather
 *      than a degradation.
 *
 * Layer 1 is not redundant with the others: a repository that does not ignore
 * `node_modules` still should not have it walked, and layers 2 and 3 report what
 * their sources say rather than what is worth reading.
 */

import { promises as fs, realpathSync, type Dirent } from 'node:fs'
import { verifyPathContainment } from '../../core/security/pathJail.js'
import path from 'node:path'
import { DirectoryReadError, readDirectory } from './directory.js'
import { ReadCleanupError } from './read.js'
import { WalkBudget, WalkLimitError } from './walk/budget.js'
import { PRUNED_DIRECTORIES } from './walk/policy.js'
import type { FileWalkOptions } from './types.js'
import ignore, { type Ignore } from 'ignore'
import {
  IGNORE_FILE_NAMES,
  loadIgnoreFile,
  loadIgnoredViaGit,
  listWorkspaceFilesViaGit,
  loadDirectoryMatcher,
} from './ignoreRules.js'

export type { FileWalkOptions } from './types.js'

/** Policy checks use canonical targets; cancellation is never an omitted entry. */
function checkedPath(root: string, target: string, options?: FileWalkOptions): string {
  options?.abortSignal?.throwIfAborted()
  const checked = verifyPathContainment(target, root)
  if (!checked.allowed) throw new Error('Directory target is outside the workspace.')
  options?.assertFileAccess?.(checked.resolvedPath)
  return checked.resolvedPath
}

function visiblePath(root: string, target: string, options?: FileWalkOptions): boolean {
  options?.abortSignal?.throwIfAborted()
  try {
    let current = checkedPath(root, target, options)
    while (current !== root && path.dirname(current) !== current) {
      current = path.dirname(current)
      checkedPath(root, current, options)
    }
    return true
  } catch {
    options?.abortSignal?.throwIfAborted()
    return false
  }
}

/**
 * Walk `root`, honouring ignore rules matched in-process.
 *
 * Only used when git is unavailable. The matcher is created once and carried down
 * the recursion, so a nested ignore file extends the same rule set rather than
 * replacing it.
 */
async function listViaWalk(
  root: string,
  pruned: readonly string[],
  respectIgnore: boolean,
  options: FileWalkOptions | undefined,
  budget: WalkBudget,
): Promise<readonly string[]> {
  const matcher = ignore({ ignorecase: false })
  const found: string[] = []

  // Paths are kept relative to `root` throughout: that is the form the matcher
  // requires, and the form callers want back.
  const relativeOf = (absolute: string): string | null => {
    const relative = path.relative(root, absolute)
    if (relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) return null
    return relative.split(path.sep).join('/')
  }

  async function visit(absolute: string, prefix: string, depth: number): Promise<void> {
    budget.check()
    if (!visiblePath(root, absolute, options)) return
    budget.depth(depth)
    budget.take('directories', 1)
    if (respectIgnore) {
      for (const name of IGNORE_FILE_NAMES) {
        const file = path.join(absolute, name)
        if (visiblePath(root, file, options)) await loadIgnoreFile(matcher, file, prefix, root, options, budget)
      }
    }
    let entries: Dirent[]
    try {
      entries = await readDirectory(root, checkedPath(root, absolute, options), {
        ...options, checkpoint: () => budget.check(), onEntry: entry => {
          budget.take('entries', 1)
          budget.take('pathBytes', Buffer.byteLength(prefix + entry.name))
        },
      })
      checkedPath(root, absolute, options)
    } catch (error) {
      if (error instanceof ReadCleanupError) throw error
      options?.abortSignal?.throwIfAborted()
      if (error instanceof DirectoryReadError || error instanceof WalkLimitError) throw error
      throw new DirectoryReadError('unavailable')
    }
    for (const entry of entries) {
      budget.check()
      if (pruned.includes(entry.name)) continue
      const full = path.join(absolute, entry.name)
      if (!visiblePath(root, full, options)) continue
      const relative = relativeOf(full)
      if (relative === null) continue
      if (entry.isDirectory()) {
        // The trailing separator is how the matcher is told this is a directory;
        // without it a `dir/` pattern would not match and the walk would descend
        // into something the rules exclude.
        if (respectIgnore && matcher.ignores(`${relative}/`)) continue
        await visit(full, `${relative}/`, depth + 1)
      } else if (entry.isFile()) {
        if (respectIgnore && matcher.ignores(relative)) continue
        found.push(relative)
      }
    }
  }

  await visit(root, '', 0)
  budget.check()
  return found
}

/**
 * Every file under `root` a tool should see, as workspace-relative posix paths.
 *
 * Paths are relative because that is what the callers actually want: all three
 * used to strip the workspace prefix themselves, in three slightly different
 * ways. Returning the absolute form and letting each caller reduce it again is
 * what let those three drift apart.
 */
export async function listWorkspaceFiles(
  root: string,
  options?: FileWalkOptions,
): Promise<readonly string[]> {
  const budget = new WalkBudget(options?.abortSignal, options?.limits)
  budget.check()
  const pruned = options?.pruneDirectories ?? PRUNED_DIRECTORIES
  const respectIgnore = options?.respectIgnore ?? true
  options?.abortSignal?.throwIfAborted()
  checkedPath(path.resolve(root), path.resolve(root), options)
  let resolved: string
  try { resolved = realpathSync(root) } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return []
    throw error
  }
  checkedPath(resolved, resolved, options)

  if (respectIgnore) {
    const viaGit = await listWorkspaceFilesViaGit(resolved, options?.abortSignal, budget, options)
    if (viaGit !== null) {
      // git already applied its own ignore rules; the pruned names are still
      // removed, because a repository need not ignore the directories that hold
      // no source.
      const files = viaGit.filter((entry) => {
        budget.depth(entry.split('/').length - 1)
        return !entry.split('/').some((segment) => pruned.includes(segment))
          && visiblePath(resolved, path.resolve(resolved, entry), options)
      })
      budget.check()
      return files
    }
  }

  return listViaWalk(resolved, pruned, respectIgnore, options, budget)
}

/** One direct entry of a directory, as a listing should present it. */
export interface DirectoryEntry {
  /** The entry's own name, without any directory prefix. */
  readonly name: string
  readonly isDirectory: boolean
}

/** A directory's direct entries, with what was withheld from them. */
export interface DirectoryListing {
  readonly entries: readonly DirectoryEntry[]
  /**
   * How many entries the ignore rules or the pruned names withheld.
   *
   * Reported rather than dropped silently. A listing that shows three of thirty
   * entries without saying so reads as a complete answer, and a model that
   * believes it has seen everything will conclude a file does not exist when it
   * merely was not shown.
   */
  readonly omittedCount: number
}

/**
 * The direct entries of one directory, as a tool should see them.
 *
 * One level only. Recursing is what the glob tool answers, and a directory
 * listing that descended would be a second, worse glob.
 *
 * The ignore policy is the same one the file walk applies, which is the point:
 * a listing and a glob of the same tree must agree about what exists. A listing
 * with no ignore support at all would be a fourth opinion about the same
 * question, and would show a model the directories it is not meant to search.
 *
 * Pruned names are withheld rather than shown empty, because a listing that
 * offered `node_modules/` and then answered nothing when asked about it would be
 * telling the model the directory is empty when it is merely excluded.
 */
export async function listDirectoryEntries(
  root: string,
  directory: string,
  options?: FileWalkOptions,
): Promise<DirectoryListing> {
  const budget = new WalkBudget(options?.abortSignal, options?.limits)
  budget.take('directories', 1)
  const pruned = options?.pruneDirectories ?? PRUNED_DIRECTORIES
  const respectIgnore = options?.respectIgnore ?? true
  options?.abortSignal?.throwIfAborted()
  const resolvedRoot = realpathSync(root)
  const initial = verifyPathContainment(directory, root)
  const resolvedDirectory = checkedPath(resolvedRoot, initial.resolvedPath, options)

  const dirents = await readDirectory(resolvedRoot, resolvedDirectory, {
    ...options, checkpoint: () => budget.check(), onEntry: entry => {
      budget.take('entries', 1)
      budget.take('pathBytes', Buffer.byteLength(entry.name))
    },
  })
  checkedPath(resolvedRoot, resolvedDirectory, options)
  const candidates = dirents.filter((entry) => {
    budget.check()
    return !pruned.includes(entry.name) && visiblePath(resolvedRoot, path.join(resolvedDirectory, entry.name), options)
  })
  let omittedCount = dirents.length - candidates.length

  // Names are what git is asked about; paths are what the matcher needs.
  const ignored = respectIgnore
    ? await loadIgnoredViaGit(
        resolvedDirectory,
        candidates.map((entry) => entry.name),
        options?.abortSignal,
        budget,
        { root: resolvedRoot, assertFileAccess: options?.assertFileAccess ?? (() => {}), pruneDirectories: pruned },
      )
    : new Set<string>()
  const matcher =
    respectIgnore && ignored === null
      ? await loadDirectoryMatcher(resolvedRoot, resolvedDirectory, { ...options, assertFileAccess: (file) => {
        if (!visiblePath(resolvedRoot, file, options)) throw new Error('Ignore file is unavailable or denied.')
      } }, budget)
      : null
  const relative = path.relative(resolvedRoot, resolvedDirectory)
  const prefix = relative === '' ? '' : `${relative.split(path.sep).join('/')}/`

  const entries: DirectoryEntry[] = []
  for (const entry of candidates) {
    budget.check()
    if (!visiblePath(resolvedRoot, path.join(resolvedDirectory, entry.name), options)) { omittedCount++; continue }
    const isDirectory = await resolveIsDirectory(resolvedDirectory, entry)
    let excluded = false
    if (ignored !== null) {
      excluded = ignored.has(entry.name)
    } else if (matcher !== null) {
      // The trailing separator is how the matcher is told this is a directory,
      // so a `dir/` pattern matches.
      const path_ = `${prefix}${entry.name}`
      excluded = matcher.ignores(isDirectory ? `${path_}/` : path_)
    }
    if (excluded) {
      omittedCount++
      continue
    }
    entries.push({ name: entry.name, isDirectory })
  }

  // Directories first, then by name. Sorted by comparison rather than locale
  // collation so the order does not shift with the environment.
  entries.sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
    if (a.name < b.name) return -1
    if (a.name > b.name) return 1
    return 0
  })
  budget.check()
  return { entries, omittedCount }
}

/**
 * Whether an entry is a directory, following a symlink when it is one.
 *
 * A symlink to a directory reports as a symlink, not a directory, so reading it
 * as a file would fail on a path the listing just offered. Statting the link
 * resolves that; a broken link reports as a file, which is what the eventual
 * read will say too.
 */
async function resolveIsDirectory(
  parent: string,
  entry: Dirent,
): Promise<boolean> {
  if (entry.isDirectory()) return true
  if (!entry.isSymbolicLink()) return false
  try {
    const stats = await fs.stat(path.join(parent, entry.name))
    return stats.isDirectory()
  } catch {
    return false
  }
}

import path from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { isReadResourceFailure, ReadChangedError, ReadCleanupError, withVerifiedReadTarget } from './read.js'
import type { CapturedReadSource, FileWalkOptions } from './types.js'
import type { FileHandle } from 'node:fs/promises'
import { WalkBudget, WalkLimitError } from './walk/budget.js'
import { addIgnoreContent } from './ignore/syntax.js'
import { loadIgnoredViaGit } from './ignore/git.js'
import { repositoryMarker } from './view/git.js'

export { listWorkspaceFilesViaGit, loadIgnoredViaGit } from './ignore/git.js'

/**
 * The repository's own ignore rules, as one question with one answer.
 *
 * Three callers need to know whether a path is excluded: the file walk, the
 * directory listing, and skill discovery. Each used to answer it itself — the
 * listing asked git and matched in-process, the walk did the same, and skill
 * discovery did not ask at all — so the same directory could be invisible to one
 * and visible to another.
 *
 * The rules live here rather than beside any one caller because they are a fact
 * about the repository, not about the tool asking. A fourth opinion about what
 * exists is the failure mode this module exists to prevent.
 *
 * Two sources, in order of authority:
 *
 *   1. git, when there is a repository to ask. It resolves `core.excludesFile`,
 *      `.git/info/exclude` and nested `.gitignore` files with the precedence it
 *      defines, and reports a tracked path as not ignored even when a pattern
 *      matches it — more than could be reproduced faithfully by hand.
 *   2. The same rules matched in-process when there is no repository, because
 *      git exits 128 outside one and losing ignore support there is a gap rather
 *      than a degradation.
 */

/**
 * Files read for ignore rules at each directory, when git is not available.
 *
 * `.ignore` is a widely shared convention, honoured alongside `.gitignore` by
 * every implementation that reads either. `.fdignore` is deliberately absent: it
 * belongs to a specific tool this project does not ship.
 */
const IGNORE_FILES = ['.gitignore', '.ignore'] as const

/** The ignore files read at each directory when git is not available. */
export const IGNORE_FILE_NAMES = IGNORE_FILES

function ignoreSources(root: string, target: string): { file: string; prefix: string }[] {
  const relative = path.relative(root, target)
  const segments = relative === '' || relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)
    ? [] : relative.split(path.sep)
  const sources: { file: string; prefix: string }[] = []
  let current = root
  let prefix = ''
  for (const segment of [...segments, undefined]) {
    for (const name of IGNORE_FILES) sources.push({ file: path.join(current, name), prefix })
    if (segment !== undefined) {
      current = path.join(current, segment)
      prefix = `${prefix}${segment}/`
    }
  }
  return sources
}

/** Runtime ignore rules are read from the same verified handles as source files. */
export async function loadIgnoreFile(matcher: Ignore, file: string, prefix: string, root: string, options?: FileWalkOptions, budget = new WalkBudget(options?.abortSignal, options?.limits)): Promise<void> {
  budget.check()
  let content: string
  let source: CapturedReadSource | undefined
  try {
    content = await withVerifiedReadTarget({ absolutePath: file, workspaceRoot: root,
      assertFileAccess: options?.assertFileAccess, abortSignal: options?.abortSignal,
      onCapturedSource: captured => { source = captured },
    }, 'file', async (handle, verify) => {
      const value = await readIgnoreContent(handle, verify, budget)
      await verify()
      return value
    })
  } catch (error) {
    if (error instanceof ReadCleanupError || error instanceof ReadChangedError || isReadResourceFailure(error)) throw error
    options?.abortSignal?.throwIfAborted()
    if (error instanceof WalkLimitError) throw error
    budget.check()
    return
  }
  if (source) options?.onCapturedSource?.(source)
  addIgnoreContent(matcher, content, prefix, budget)
}

async function readIgnoreContent(handle: FileHandle, verify: () => Promise<void>, budget: WalkBudget): Promise<string> {
  const buffer = Buffer.alloc(16 * 1024)
  const parts: Buffer[] = []
  let position = 0
  while (true) {
    budget.check()
    await verify()
    const { bytesRead } = await handle.read({ buffer, position, length: budget.readAllowance('ignoreBytes', buffer.length) })
    budget.take('ignoreBytes', bytesRead)
    if (!bytesRead) break
    parts.push(Buffer.from(buffer.subarray(0, bytesRead)))
    position += bytesRead
  }
  return Buffer.concat(parts).toString('utf8')
}

export async function loadDirectoryMatcher(root: string, target: string, options?: FileWalkOptions, budget = new WalkBudget(options?.abortSignal, options?.limits)): Promise<Ignore> {
  budget.depth(path.relative(root, target).split(path.sep).filter(Boolean).length)
  const matcher = ignore({ ignorecase: false })
  for (const source of ignoreSources(root, target)) {
    budget.check()
    await loadIgnoreFile(matcher, source.file, source.prefix, root, options, budget)
  }
  budget.check()
  return matcher
}

/** One directory's skill candidates share the native view and traversal budget. */
export async function loadIgnoredDirectories(root: string, directory: string, names: readonly string[], options?: FileWalkOptions,
  budget = new WalkBudget(options?.abortSignal, options?.limits)): Promise<ReadonlySet<string>> {
  budget.check()
  const resolvedRoot = path.resolve(root)
  const resolvedDirectory = path.resolve(directory)
  const relative = path.relative(resolvedRoot, resolvedDirectory)
  if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error('Discovery directory is outside its selected root.')
  if (!names.length) return new Set()
  if (repositoryMarker(resolvedRoot, resolvedDirectory)) {
    const native = await loadIgnoredViaGit(resolvedDirectory, names, options?.abortSignal, budget,
      { root: resolvedRoot, assertFileAccess: options?.assertFileAccess ?? (() => {}), onCapturedSource: options?.onCapturedSource, directories: true })
    if (native !== null) return native
  }
  const matcher = await loadDirectoryMatcher(resolvedRoot, resolvedDirectory, options, budget)
  return new Set(names.filter(name => matcher.ignores(`${path.posix.join(relative.split(path.sep).join('/'), name)}/`)))
}

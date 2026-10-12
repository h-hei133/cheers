import { readFileSync } from 'node:fs'
import path from 'node:path'
import ignore, { type Ignore } from 'ignore'
import { ReadCleanupError, withVerifiedReadTarget } from './read.js'
import type { FileWalkOptions } from './types.js'
import type { FileHandle } from 'node:fs/promises'
import { WalkBudget, WalkLimitError } from './walk/budget.js'
import { addIgnoreContent } from './ignore/syntax.js'
import { listIgnoredViaGit } from './ignore/discovery.js'

export { listWorkspaceFilesViaGit, loadIgnoredViaGit } from './ignore/git.js'
export { listIgnoredViaGit } from './ignore/discovery.js'

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

/**
 * Fold one directory's ignore file into `matcher`.
 *
 * A pattern in a nested ignore file is relative to that file's directory, so each
 * line is rewritten to be relative to the root before being added. Without this a
 * `.gitignore` in `a/b/` containing `c` would also hide a root-level `c`.
 *
 * The rewrite follows git's own rule that a pattern without a slash matches at
 * any depth below the declaring directory, while one containing a slash is
 * anchored there. `prefix` is empty at the root and `a/b/` below it.
 */
export function addIgnoreFile(matcher: Ignore, file: string, prefix: string, allowed?: (file: string) => boolean): void {
  if (allowed && !allowed(file)) return
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return
  }
  addIgnoreContent(matcher, content, prefix)
}

/**
 * An ignore matcher carrying every rule that reaches `target`.
 *
 * Built by replaying the ancestor chain from `root` down, because a rule in an
 * ancestor applies to `target` and there is no cheaper way to know it: the
 * matcher is stateful and the prefixes differ at each level. Each directory's
 * ignore files are folded in with that directory's prefix relative to `root`,
 * exactly as the walk does when it descends.
 */
export function matcherForDirectory(root: string, target: string, allowed?: (file: string) => boolean): Ignore {
  const matcher = ignore({ ignorecase: false })
  for (const source of ignoreSources(root, target)) addIgnoreFile(matcher, source.file, source.prefix, allowed)
  return matcher
}

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
  try {
    content = await withVerifiedReadTarget({ absolutePath: file, workspaceRoot: root,
      assertFileAccess: options?.assertFileAccess, abortSignal: options?.abortSignal,
    }, 'file', async (handle, verify) => {
      const value = await readIgnoreContent(handle, verify, budget)
      await verify()
      return value
    })
  } catch (error) {
    if (error instanceof ReadCleanupError) throw error
    options?.abortSignal?.throwIfAborted()
    if (error instanceof WalkLimitError) throw error
    budget.check()
    return
  }
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

/**
 * Whether one directory holds something the repository excludes.
 *
 * The single question skill discovery asks, and the reason this module is
 * exported rather than inlined at each caller: a skill inside a directory the
 * repository ignores must be as invisible to discovery as it is to every tool.
 *
 * Fails open — an unreadable tree, an absent git, or a directory outside `root`
 * all answer "not ignored". Missing a skill is worse than showing one that a
 * `.gitignore` covers: the model cannot use a skill it was never told about, and
 * it has no way to notice the omission.
 */
export function isDirectoryIgnored(root: string, directory: string): boolean {
  const resolvedRoot = path.resolve(root)
  const resolvedDirectory = path.resolve(directory)
  const relative = path.relative(resolvedRoot, resolvedDirectory)
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    return false
  }
  const parent = path.dirname(resolvedDirectory)
  const name = path.basename(resolvedDirectory)

  const viaGit = listIgnoredViaGit(parent, [name])
  if (viaGit !== null) return viaGit.has(name)

  // git has no repository to answer from, so the rules are matched in-process.
  // The trailing separator is how the matcher is told this is a directory, so a
  // `dir/` pattern matches.
  const prefix = relative.split(path.sep).join('/')
  return matcherForDirectory(resolvedRoot, parent).ignores(`${prefix}/`)
}

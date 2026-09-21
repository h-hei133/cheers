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

import { spawnSync } from 'node:child_process'
import { readFileSync, promises as fs, type Dirent } from 'node:fs'
import path from 'node:path'
import ignore, { type Ignore } from 'ignore'

/**
 * Directory names never entered, at any depth.
 *
 * These are the directories that cannot hold the source a tool is looking for:
 * installed packages, the repository's own metadata, build output, and this
 * project's audit residue. They are named rather than pathed so a nested copy is
 * pruned too.
 */
const PRUNED_DIRECTORIES = ['node_modules', '.git', 'dist', '.normproof'] as const

/**
 * Files read for ignore rules at each directory, when git is not available.
 *
 * `.ignore` is a widely shared convention, honoured alongside `.gitignore` by
 * every implementation that reads either. `.fdignore` is deliberately absent: it
 * belongs to a specific tool this project does not ship.
 */
const IGNORE_FILES = ['.gitignore', '.ignore'] as const

export interface FileWalkOptions {
  /** Directory names never entered, replacing the default set. */
  readonly pruneDirectories?: readonly string[]
  /** Whether ignore rules are honoured at all. Default true. */
  readonly respectIgnore?: boolean
}

/**
 * The paths git reports for `root`, or null when `root` is not in a repository.
 *
 * `-C <root>` rather than a bare call: a bare `git ls-files` run from a
 * subdirectory lists only that subdirectory and expresses the results relative
 * to it, which silently drops the rest of the workspace. With `-C` the paths come
 * back relative to `root` and scoped to it, so no filtering or prefix stripping
 * is needed afterwards.
 *
 * The exit status is the repository test. git exits 128 outside a repository, and
 * asking it once is more faithful than probing for a `.git` entry ourselves: a
 * worktree, a submodule and a `GIT_DIR` override all answer differently to a
 * directory scan.
 */
function listViaGit(root: string): readonly string[] | null {
  const result = spawnSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', shell: false },
  )
  if (result.error || result.status !== 0) {
    return null
  }
  return (result.stdout || '')
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => line.split(path.sep).join('/'))
}

/**
 * Fold one directory's ignore file into `matcher`.
 *
 * A pattern in a nested ignore file is relative to that file's directory, so each
 * line is rewritten to be relative to the walk root before being added. Without
 * this a `.gitignore` in `a/b/` containing `c` would also hide a root-level `c`.
 *
 * The rewrite follows git's own rule that a pattern without a slash matches at
 * any depth below the declaring directory, while one containing a slash is
 * anchored there. `prefix` is empty at the root and `a/b/` below it.
 */
function addIgnoreFile(matcher: Ignore, file: string, prefix: string): void {
  let content: string
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    return
  }
  const patterns: string[] = []
  for (const raw of content.split(/\r?\n/)) {
    const trimmed = raw.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const negated = trimmed.startsWith('!')
    const body = negated ? trimmed.slice(1) : trimmed
    if (body === '') continue
    const anchored = body.startsWith('/')
    const bare = anchored ? body.slice(1) : body
    let rewritten = bare
    if (prefix !== '') {
      // No slash and not anchored: matches at any depth below this directory.
      if (!anchored && !bare.includes('/')) rewritten = `**/${bare}`
      rewritten = `${prefix}${rewritten}`
    }
    patterns.push(negated ? `!${rewritten}` : rewritten)
  }
  if (patterns.length > 0) {
    matcher.add(patterns)
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
): Promise<readonly string[]> {
  const matcher = ignore({ ignorecase: false })
  const found: string[] = []

  // Paths are kept relative to `root` throughout: that is the form the matcher
  // requires, and the form callers want back.
  const relativeOf = (absolute: string): string | null => {
    const relative = path.relative(root, absolute)
    if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) return null
    return relative.split(path.sep).join('/')
  }

  async function visit(absolute: string, prefix: string): Promise<void> {
    if (respectIgnore) {
      for (const name of IGNORE_FILES) {
        addIgnoreFile(matcher, path.join(absolute, name), prefix)
      }
    }
    let entries: Dirent[]
    try {
      entries = await fs.readdir(absolute, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (pruned.includes(entry.name)) continue
      const full = path.join(absolute, entry.name)
      const relative = relativeOf(full)
      if (relative === null) continue
      if (entry.isDirectory()) {
        // The trailing separator is how the matcher is told this is a directory;
        // without it a `dir/` pattern would not match and the walk would descend
        // into something the rules exclude.
        if (respectIgnore && matcher.ignores(`${relative}/`)) continue
        await visit(full, `${relative}/`)
      } else if (entry.isFile()) {
        if (respectIgnore && matcher.ignores(relative)) continue
        found.push(relative)
      }
    }
  }

  await visit(root, '')
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
  const pruned = options?.pruneDirectories ?? PRUNED_DIRECTORIES
  const respectIgnore = options?.respectIgnore ?? true
  const resolved = path.resolve(root)

  if (respectIgnore) {
    const viaGit = listViaGit(resolved)
    if (viaGit !== null) {
      // git already applied its own ignore rules; the pruned names are still
      // removed, because a repository need not ignore the directories that hold
      // no source.
      return viaGit.filter((entry) =>
        !entry.split('/').some((segment) => pruned.includes(segment)),
      )
    }
  }

  return listViaWalk(resolved, pruned, respectIgnore)
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
 * The names `directory` holds that the ignore rules exclude.
 *
 * Asked of git in one batch rather than one call per entry. git resolves the
 * ancestor and nested ignore files, `.git/info/exclude` and the configured
 * global excludes with the precedence it defines, and it reports a tracked path
 * as not ignored even when a pattern matches it — the same judgement
 * `listWorkspaceFiles` relies on, which is the point of asking it here too.
 *
 * Returns null when there is no repository to ask, which is the caller's signal
 * to fall back to matching in-process. Exit 1 means "nothing was ignored" and is
 * an answer, not a failure; only 128 (not a repository) means git cannot help.
 */
function listIgnoredViaGit(
  directory: string,
  names: readonly string[],
): ReadonlySet<string> | null {
  if (names.length === 0) return new Set()
  const result = spawnSync('git', ['-C', directory, 'check-ignore', '--stdin'], {
    input: `${names.join('\n')}\n`,
    encoding: 'utf8',
    shell: false,
  })
  if (result.error || result.status === 128) return null
  if (result.status !== 0 && result.status !== 1) return null
  return new Set(
    (result.stdout || '')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => line.split(path.sep).join('/')),
  )
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
function matcherForDirectory(root: string, target: string): Ignore {
  const matcher = ignore({ ignorecase: false })
  const relative = path.relative(root, target)
  const segments =
    relative === '' || relative.startsWith('..') ? [] : relative.split(path.sep)

  let current = root
  let prefix = ''
  for (const segment of segments) {
    for (const name of IGNORE_FILES) {
      addIgnoreFile(matcher, path.join(current, name), prefix)
    }
    current = path.join(current, segment)
    prefix = `${prefix}${segment}/`
  }
  for (const name of IGNORE_FILES) {
    addIgnoreFile(matcher, path.join(current, name), prefix)
  }
  return matcher
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
  const pruned = options?.pruneDirectories ?? PRUNED_DIRECTORIES
  const respectIgnore = options?.respectIgnore ?? true
  const resolvedRoot = path.resolve(root)
  const resolvedDirectory = path.resolve(directory)

  const dirents = await fs.readdir(resolvedDirectory, { withFileTypes: true })
  const candidates = dirents.filter((entry) => !pruned.includes(entry.name))
  let omittedCount = dirents.length - candidates.length

  // Names are what git is asked about; paths are what the matcher needs.
  const ignored = respectIgnore
    ? listIgnoredViaGit(
        resolvedDirectory,
        candidates.map((entry) => entry.name),
      )
    : new Set<string>()
  const matcher =
    respectIgnore && ignored === null
      ? matcherForDirectory(resolvedRoot, resolvedDirectory)
      : null
  const relative = path.relative(resolvedRoot, resolvedDirectory)
  const prefix = relative === '' ? '' : `${relative.split(path.sep).join('/')}/`

  const entries: DirectoryEntry[] = []
  for (const entry of candidates) {
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

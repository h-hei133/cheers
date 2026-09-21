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

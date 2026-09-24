import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import ignore, { type Ignore } from 'ignore'

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
 * How long git may take before the caller gives up on it.
 *
 * These calls are synchronous, so a git that never returns takes the session with
 * it — no prompt, no output, nothing to cancel. On a network mount or a very large
 * repository that is not hypothetical. The budget is generous because a legitimate
 * listing of a big repository is not fast, and stopping the wait only costs the
 * faster path: the in-process matcher answers the same question.
 */
const GIT_TIMEOUT_MS = 10_000

/**
 * How much git output to accept before giving up on it.
 *
 * Above Node's 1 MiB default on purpose. A repository with twenty thousand files
 * lists at about 1.5 MiB, and exceeding the default does not truncate — it raises
 * ENOBUFS, which is indistinguishable here from git being absent, so the caller
 * silently falls back to reading the whole tree in-process. That fallback answers
 * correctly but is far slower, and it would run on ordinary large repositories
 * rather than rare ones.
 */
const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024

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
export function listWorkspaceFilesViaGit(root: string): readonly string[] | null {
  const result = spawnSync(
    'git',
    ['-C', root, 'ls-files', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8', shell: false, timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER_BYTES },
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
 * The names in `directory` that the ignore rules exclude.
 *
 * Asked of git in one batch rather than one call per entry. git resolves the
 * ancestor and nested ignore files, `.git/info/exclude` and the configured
 * global excludes with the precedence it defines, and it reports a tracked path
 * as not ignored even when a pattern matches it — the same judgement
 * `listWorkspaceFilesViaGit` relies on, which is the point of asking it here too.
 *
 * Returns null when there is no repository to ask, which is the caller's signal
 * to fall back to matching in-process. Exit 1 means "nothing was ignored" and is
 * an answer, not a failure; only 128 (not a repository) means git cannot help.
 */
export function listIgnoredViaGit(
  directory: string,
  names: readonly string[],
): ReadonlySet<string> | null {
  if (names.length === 0) return new Set()
  const result = spawnSync('git', ['-C', directory, 'check-ignore', '--stdin'], {
    input: `${names.join('\n')}\n`,
    encoding: 'utf8',
    shell: false,
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
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
export function addIgnoreFile(matcher: Ignore, file: string, prefix: string): void {
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
 * An ignore matcher carrying every rule that reaches `target`.
 *
 * Built by replaying the ancestor chain from `root` down, because a rule in an
 * ancestor applies to `target` and there is no cheaper way to know it: the
 * matcher is stateful and the prefixes differ at each level. Each directory's
 * ignore files are folded in with that directory's prefix relative to `root`,
 * exactly as the walk does when it descends.
 */
export function matcherForDirectory(root: string, target: string): Ignore {
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

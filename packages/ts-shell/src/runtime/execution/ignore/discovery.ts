import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { GIT_TIMEOUT_MS, GIT_MAX_BUFFER_BYTES, gitArgs, literalGitPaths, ignoredNames } from './git.js'

/**
 * The names in `directory` that the ignore rules exclude.
 *
 * Trusted synchronous skill discovery asks Git only when metadata is contained
 * and config cannot redirect implicit reads. Includes and configured excludes
 * use the caller's matcher fallback; runtime file tools use the private view.
 *
 * Returns null when discovery cannot admit a native answer. Exit 1 means
 * "nothing was ignored" and is a valid answer. This path does not claim the
 * asynchronous view's descriptor binding against concurrent replacements.
 */
export function listIgnoredViaGit(
  directory: string,
  names: readonly string[],
): ReadonlySet<string> | null {
  if (names.length === 0) return new Set()
  // This synchronous compatibility surface cannot build the asynchronous
  // private descriptor view. Restrict its native use to a repository whose
  // metadata and ignore sources are directly contained by `directory`; any
  // include/excludes dependency falls back to the in-process matcher instead
  // of letting Git follow an implicit path outside the authority boundary.
  if (!syncGitSourcesAreContained(directory)) return null
  const paths = literalGitPaths(names)
  const result = spawnSync('git', gitArgs(directory, ['check-ignore', '--stdin', '-z']), {
    input: `${paths.join('\0')}\0`,
    encoding: 'utf8',
    shell: false,
    env: {
      PATH: process.env.PATH ?? '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C',
      HOME: '/nonexistent', XDG_CONFIG_HOME: '/nonexistent',
      GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_OPTIONAL_LOCKS: '0',
    },
    timeout: GIT_TIMEOUT_MS,
    maxBuffer: GIT_MAX_BUFFER_BYTES,
  })
  if (result.error || result.status === 128) return null
  if (result.status !== 0 && result.status !== 1) return null
  return ignoredNames(names, paths, result.stdout || '')
}

function contained(root: string, target: string): boolean {
  const relative = path.relative(root, target)
  return relative === '' || relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function checkedSource(root: string, file: string): string {
  const target = realpathSync(file)
  if (!contained(root, target)) throw new Error('Discovery metadata is outside the workspace.')
  return target
}

function syncGitSourcesAreContained(directory: string): boolean {
  let root: string
  try { root = realpathSync(directory) } catch { return false }
  const marker = path.join(root, '.git')
  if (!existsSync(marker)) return false
  try {
    const markerTarget = checkedSource(root, marker)
    let gitDirectory = markerTarget
    if (statSync(marker).isFile()) {
      const content = readFileSync(markerTarget, 'utf8')
      if (!content.startsWith('gitdir: ')) return false
      gitDirectory = checkedSource(root, path.resolve(path.dirname(marker), content.slice(8).trimEnd()))
    }
    const commonFile = path.join(gitDirectory, 'commondir')
    let commonDirectory = gitDirectory
    if (existsSync(commonFile)) {
      const commonSource = checkedSource(root, commonFile)
      commonDirectory = checkedSource(root, path.resolve(gitDirectory, readFileSync(commonSource, 'utf8').trimEnd()))
    }
    for (const metadata of new Set([gitDirectory, commonDirectory])) {
      const names = readdirSync(metadata)
      if (names.length > 4096) return false
      for (const relative of ['HEAD', 'index', 'commondir', 'config', 'config.worktree', 'info/exclude',
        ...names.filter(name => /^sharedindex\.[a-f0-9]+$/.test(name))]) {
        const file = path.join(metadata, relative)
        if (!existsSync(file)) continue
        const source = checkedSource(root, file)
        if (relative === 'config' || relative === 'config.worktree') {
          const content = readFileSync(source, 'utf8')
          if (/include|excludesfile|worktree\s*=/i.test(content)) return false
        }
      }
    }
    return true
  } catch { return false }
}

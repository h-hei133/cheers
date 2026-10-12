import path from 'node:path'
import which from 'which'
import { promises as fs } from 'node:fs'
import { executeLocally } from '../local.js'
import { ReadCleanupError } from '../read.js'
import type { FileWalkOptions } from '../types.js'
import { WalkBudget } from '../walk/budget.js'
import { withNativeReadView, ViewSourceError, type NativeReadPlan } from '../view/index.js'
import { configureGitView } from '../view/config.js'
import { repositoryMarker } from '../view/git.js'

/**
 * How long git may take before the caller gives up on it.
 *
 * Runtime and discovery queries can be cancelled through the execution owner.
 * Incomplete queries throw instead of changing native semantics.
 */
export const GIT_TIMEOUT_MS = 10_000

/**
 * How much git output to accept before giving up on it.
 *
 * Above Node's 1 MiB default on purpose. A repository with twenty thousand files
 * lists at about 1.5 MiB, and exceeding the default does not truncate — it raises
 * ENOBUFS. The larger bound admits ordinary repositories while an incomplete
 * asynchronous result remains a failure rather than a matcher fallback.
 */
export const GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024

interface GitReadAccess {
  readonly root: string
  readonly assertFileAccess: (target: string) => void
  readonly pruneDirectories?: readonly string[]
  /** Directory candidates remain traversable when they contain indexed files. */
  readonly directories?: boolean
  readonly onCapturedSource?: FileWalkOptions['onCapturedSource']
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
 * Git runs only in an admitted private view. Contained gitfiles and linked
 * metadata preserve repository semantics; inherited repository overrides are
 * cleared, and metadata outside the workspace is refused.
 */
export async function listWorkspaceFilesViaGit(root: string, abortSignal?: AbortSignal, budget = new WalkBudget(abortSignal), options?: FileWalkOptions): Promise<readonly string[] | null> {
  const workspaceRoot = path.resolve(root)
  const output = await runGit(root, ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], undefined, abortSignal, budget, true,
    { root: workspaceRoot, assertFileAccess: options?.assertFileAccess ?? (() => {}), pruneDirectories: options?.pruneDirectories, onCapturedSource: options?.onCapturedSource })
  if (output === null) return null
  // Git already uses forward slashes. NUL records bypass filename quoting and
  // preserve whitespace, backslashes and embedded newlines as literal names.
  return output.split('\0').filter((name) => name !== '')
}

export function gitArgs(directory: string, args: readonly string[]): string[] {
  return ['-c', 'core.fsmonitor=false', '-C', directory, ...args]
}

function gitViewArgs(root: string, directory: string, args: readonly string[]): string[] {
  // The private native view is mounted at the workspace path, which is a
  // filesystem boundary from its parent. Explicit repository roots keep Git
  // from walking out of the view while preserving nested-repository selection.
  const marker = repositoryMarker(root, directory)
  if (!marker) throw new ViewSourceError()
  return ['-c', 'core.fsmonitor=false', '--git-dir', marker, '--work-tree', path.dirname(marker), '-C', directory, ...args]
}

function detachedGitArgs(args: readonly string[]): string[] {
  return ['-c', 'core.fsmonitor=false', ...args]
}

/** Runtime queries share the command runner's process-tree cancellation. */
async function runGit(directory: string, args: readonly string[], input: string | undefined, abortSignal: AbortSignal | undefined,
  budget: WalkBudget, countEntries: boolean, access: GitReadAccess): Promise<string | null> {
  budget.check()
  // Executable discovery reads no Git config. A machine without Git keeps the
  // TypeScript matcher fallback and does not need a native view launcher.
  if (!which.sync('git', { nothrow: true })) return null
  directory = path.resolve(directory)
  let executionError: GitExecutionError | undefined
  const execute = async (...parameters: Parameters<typeof runGitOutput>) => {
    try { return await runGitOutput(...parameters) }
    catch (error) { if (error instanceof GitExecutionError) executionError = error; throw error }
  }
  try {
    return await withNativeReadView({ ...access, abortSignal, budget }, async (sources, plan, materialize) => {
      if (!repositoryMarker(access.root, directory)) {
        await fs.mkdir(sources.destination(directory), { recursive: true, mode: 0o700 })
        const output = await execute(directory, args, input, abortSignal, budget, countEntries,
          plan('git', gitArgs(directory, args), directory))
        if (output !== null) sources.verify()
        return output
      }
      const query = (arguments_: readonly string[], detached = false) => execute(directory, arguments_, undefined, abortSignal, budget, false,
        plan('git', detached ? detachedGitArgs(arguments_) : gitViewArgs(access.root, directory, arguments_), directory, detached))
      const configuration = await configureGitView(sources, directory, query)
      if (!configuration) return null
      const tracked = countEntries || access.directories ? await query(['ls-files', '-z', '--cached']) : ''
      if (tracked === null) throw new ViewSourceError()
      const trackedPaths = tracked.split('\0').filter(Boolean)
      if (access.directories) {
        budget.take('entries', trackedPaths.length)
        budget.take('pathBytes', Buffer.byteLength(tracked))
      }
      const prefix = path.relative(access.root, directory).split(path.sep).join('/')
      await materialize({ native: 'git', directory, recursive: countEntries,
        tracked: trackedPaths.map(file => path.posix.join(prefix, file)), ...configuration })
      const output = await execute(directory, args, input, abortSignal, budget, countEntries, plan('git', gitViewArgs(access.root, directory, args), directory))
      if (output === null) throw new ViewSourceError()
      sources.verify()
      if (!access.directories) return output
      const parents = new Set<string>()
      for (const file of trackedPaths) {
        for (let parent = path.posix.dirname(file); parent !== '.' && parent !== path.posix.dirname(parent); parent = path.posix.dirname(parent)) parents.add(parent)
      }
      return output.split('\0').filter(name => name && !parents.has(path.posix.normalize(name))).map(name => `${name}\0`).join('')
    })
  } catch (error) {
    if (executionError && error instanceof ReadCleanupError) {
      throw new AggregateError([executionError, error], `${executionError.message} Read cleanup also could not be verified.`)
    }
    throw error
  }
}

class GitExecutionError extends Error {
  constructor() { super('Git query failed: input delivery or process cleanup could not be verified.') }
}

class GitQueryError extends Error {
  constructor() { super('Git query failed before a complete native answer was available.') }
}

async function runGitOutput(directory: string, args: readonly string[], input: string | undefined, abortSignal: AbortSignal | undefined,
  budget: WalkBudget, countEntries: boolean, plan: NativeReadPlan): Promise<string | null> {
  abortSignal?.throwIfAborted()
  directory = path.resolve(directory)
  const controller = new AbortController()
  const onAbort = (): void => controller.abort()
  abortSignal?.addEventListener('abort', onAbort, { once: true })
  const chunks: Buffer[] = []
  let outputBytes = 0
  let totalBytes = 0
  let oversized = false
  let budgetError: unknown
  try {
    const result = await executeLocally({ ...plan,
      input, abortSignal: controller.signal, timeoutMs: budget.timeRemaining(GIT_TIMEOUT_MS), captureOutput: false,
      onStdout: chunk => {
        if (controller.signal.aborted) return
        try {
          budget.check()
          if (countEntries) {
            budget.take('pathBytes', chunk.length)
            let records = 0
            for (let at = chunk.indexOf(0); at !== -1; at = chunk.indexOf(0, at + 1)) records++
            budget.take('entries', records)
          }
        } catch (error) { budgetError = error; controller.abort(); return }
        outputBytes += chunk.length
        if (outputBytes > GIT_MAX_BUFFER_BYTES) { oversized = true; controller.abort(); return }
        chunks.push(chunk)
      },
      onOutput: chunk => {
        totalBytes += Buffer.byteLength(chunk)
        if (totalBytes > GIT_MAX_BUFFER_BYTES) { oversized = true; controller.abort() }
      },
    })
    // Unverified execution must remain a failure even when cancellation or an
    // output limit prompted the stop. A fallback cannot prove that cleanup ran.
    if (result.failureKind === 'execution_failure') {
      throw new GitExecutionError()
    }
    abortSignal?.throwIfAborted()
    if (budgetError) throw budgetError
    budget.check()
    if (oversized) throw new GitQueryError()
    if (result.status === 'completed' || result.status === 'failed') await plan.verifyExit(result.exitCode)
    if (result.status !== 'completed') {
      if (result.status === 'failed' && result.exitCode === 128) return null
      if (result.status === 'failed' && result.exitCode === 1
        && ((args[0] === 'check-ignore') || (args[0] === 'config' && args.includes('--get')))) return Buffer.concat(chunks).toString('utf8')
      throw new GitQueryError()
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally { abortSignal?.removeEventListener('abort', onAbort) }
}

export function literalGitPaths(names: readonly string[]): string[] {
  // check-ignore rejects leading-colon pathspec syntax, even with NUL input.
  return names.map((name) => name.startsWith(':') ? `./${name}` : name)
}

export function ignoredNames(names: readonly string[], paths: readonly string[], output: string): ReadonlySet<string> {
  const ignored = new Set(output.split('\0').filter((name) => name !== ''))
  return new Set(names.filter((_, index) => ignored.has(paths[index]!)))
}

/** Runtime and skill discovery share the private native query. */
export async function loadIgnoredViaGit(directory: string, names: readonly string[], abortSignal?: AbortSignal, budget = new WalkBudget(abortSignal),
  access?: GitReadAccess): Promise<ReadonlySet<string> | null> {
  abortSignal?.throwIfAborted()
  if (names.length === 0) return new Set()
  const paths = literalGitPaths(names)
  const output = await runGit(directory, ['check-ignore', '--stdin', '-z'], `${paths.join('\0')}\0`, abortSignal, budget, false,
    access ?? { root: path.resolve(directory), assertFileAccess: () => {} })
  return output === null ? null : ignoredNames(names, paths, output)
}

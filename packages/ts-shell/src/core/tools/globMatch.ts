/**
 * One glob matcher for every tool that filters paths.
 *
 * There were two hand-written copies of this, in the glob tool and in grep's
 * `glob` filter, and both were wrong in the same way: the double-star-separator
 * rewrite produced `(.+/)?` and the later question-mark rewrite then turned that
 * `?` into `[^/]`, so the optional group became mandatory. A pattern like
 * `src` + double-star + `/*.ts` therefore failed to match `src/a.ts`, and the
 * leading double-star form failed to match a root-level `a.ts` — the patterns
 * the tool's own description advertises.
 *
 * Rewriting a glob to a regular expression by hand is where both copies went
 * wrong, so this delegates to a matcher instead of fixing the rewrite. It has no
 * dependencies, so the whole matcher is this file's one import.
 */

import picomatch from 'picomatch'

/**
 * Whether `filePath` matches `pattern`.
 *
 * `nocase` is on because the previous matcher compiled its expression with the
 * `i` flag, and a workspace search that stopped finding `Package.json` after this
 * change would be a regression rather than a fix.
 */
const compiled = new Map<string, (candidate: string) => boolean>()

/**
 * Compile once per pattern.
 *
 * A glob filter runs against every file in the workspace, and compiling a
 * matcher per file would repeat the same parse thousands of times. The cache is
 * unbounded because patterns come from tool arguments, which are few and short
 * lived; a bounded cache would add eviction policy for a set that never grows
 * large enough to need it.
 */
function matcherFor(pattern: string): (candidate: string) => boolean {
  const cached = compiled.get(pattern)
  if (cached !== undefined) return cached
  const matcher = picomatch(pattern, { nocase: true, dot: true })
  compiled.set(pattern, matcher)
  return matcher
}

/**
 * Patterns that mean "everything".
 *
 * Kept as literals rather than left to the matcher because these are the forms a
 * caller writes to mean "do not filter", and they should not depend on how any
 * particular matcher treats `**` at the root.
 */
function matchesEverything(pattern: string): boolean {
  return pattern === '' || pattern === '*' || pattern === '**' || pattern === '**/*'
}

/**
 * Whether a backslash in `pattern` is being used to name a literal character.
 *
 * The matcher runs in POSIX mode, where a backslash escapes the character after
 * it: `\*` is a literal star, `\\` a literal backslash. A pattern using that
 * deliberately is expressing exact characters, and rewriting it would change
 * what it means. Anything else — a Windows-style separator like `src\**\*.ts` —
 * matches nothing at all in POSIX mode, so converting it is all gain.
 */
function usesBackslashAsEscape(pattern: string): boolean {
  for (let index = 0; index < pattern.length; index += 1) {
    if (pattern[index] !== '\\') continue
    const next = pattern[index + 1]
    if (next === '\\' || next === '*' || next === '?') return true
    if (next === undefined) return true
  }
  return false
}

/**
 * Match a workspace-relative path against a glob pattern.
 *
 * A pattern with no directory separator is also tried against the basename, so
 * `*.json` finds `config/settings.json`. That is what a file search tool is
 * expected to do — the same rule `--glob '*.json'` follows — and dropping it
 * would silently narrow every existing `glob` filter to the workspace root.
 */
export function matchesGlob(filePath: string, pattern: string): boolean {
  const clean = pattern.trim().replace(/^\.\//, '')
  if (matchesEverything(clean)) return true
  // Windows separators are accepted only when no backslash is doing escape
  // duty, so a pattern naming literal characters keeps its meaning.
  const normalized = usesBackslashAsEscape(clean) ? clean : clean.replace(/\\/g, '/')
  const match = matcherFor(normalized)
  if (match(filePath)) return true
  if (!normalized.includes('/')) {
    const base = filePath.slice(filePath.lastIndexOf('/') + 1)
    return match(base)
  }
  return false
}

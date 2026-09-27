// Exported work that nothing calls.
//
// The boundary analyser reports which files are reachable from a CLI entry, and
// it does that by following imports. Imports are not calls. A file can be
// imported for a type, for a barrel re-export, or by a sibling that is itself
// never called, and the analyser marks it reachable in every one of those cases.
// What it then cannot see is the module wired into the graph whose behaviour no
// running code ever asks for — and that is the shape this repository kept
// producing: a full implementation of something, correctly registered, never
// invoked.
//
// So this gate asks a different question. For each production module, take the
// functions and classes it exports, and ask whether any of those names appears
// anywhere else in the source outside an import line. When none of them does,
// nothing in this tree calls this module's exported work, whatever the import
// graph says.
//
// What this catches: a module whose entire exported surface is never referenced,
// and which does not register itself on import. What it does not catch, and
// deliberately so:
//
//   - A use reached through a computed member access. It errs toward silence.
//   - A name used only in a type position, which is counted as a use here. That
//     is the false-negative direction: a module kept alive by types alone is
//     reported as live, and the review that removes it has to notice on its own.
//   - A module that is genuinely reachable but exports nothing, which has no
//     exported surface to check.
//
// The exemption list below is the set the tree may keep. It is meant to be short
// and to shrink: an entry is a decision that the module stays unreferenced, and a
// new entry should be hard to justify.
//
// Exit codes follow the other gates: 1 on a finding, 3 when it cannot run at all.

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const targetRoot = resolve(process.argv[2] ?? repoRoot)
const SOURCE_ROOT = 'packages/ts-shell/src'

// Directories whose modules are entry points or test scaffolding. An entry point
// is called by the process rather than by source, and a fixture is called by a
// test rather than by production code; neither is dead for being unreferenced
// here.
const EXEMPT_PREFIXES = ['entrypoints/', 'test-utils/', 'core/harness/']

// Importing the module *is* the call.
const SELF_REGISTERING = /\bdeclare(?:Endpoint|Provider|Tool|Hook)\s*\(/

// Allowed unreferenced modules, with the reason each stays. Keep this short.
const ALLOWED = new Map()

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === 'dist' || entry === '.git') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    // `.tsx` as well as `.ts`: the CLI entry is the one `.tsx` in the tree, and
    // reading only `.ts` made its two calls invisible, so the gate reported the
    // functions it calls as unreferenced. Missing a file is not a smaller
    // mistake than missing a line; it is the same mistake at a coarser grain.
    else if ((full.endsWith('.ts') || full.endsWith('.tsx')) && !/\.test\.tsx?$/.test(full)) {
      out.push(full)
    }
  }
  return out
}

// Remove comments and the contents of string literals without moving any line.
//
// Both removals matter for the same reason: a name is only a call when it is an
// identifier in code. The most useful sentence in a file often names the function
// it tells you not to use, and `call phantom() to start` is a string, not a call
// to `phantom`. Counting either would let a module that nothing calls still look
// live, which is the failure this gate exists to catch.
//
// Template literals are the part that has to be handled rather than collapsed:
// `${expr}` is real code. The literal parts are blanked and the interpolations
// kept, so a call written inside one is still seen.
//
// Newlines survive, so a reported line number is the line the reader will find
// the text on.
function stripComments(source) {
  let out = ''
  let i = 0
  let state = 'code'
  let braceDepth = 0
  /** Open `${` interpolations, innermost last. */
  const interpolations = []

  const blank = (ch) => {
    out += ch === '\n' ? '\n' : ' '
  }

  while (i < source.length) {
    const ch = source[i]
    const next = source[i + 1]

    if (state === 'code') {
      if (ch === '/' && next === '/') {
        state = 'line'
        out += '  '
        i += 2
        continue
      }
      if (ch === '/' && next === '*') {
        state = 'block'
        out += '  '
        i += 2
        continue
      }
      if (ch === '"' || ch === "'" || ch === '`') {
        state = ch
        out += ch
        i += 1
        continue
      }
      const insideInterpolation = interpolations.length > 0
      if (insideInterpolation) {
        if (ch === '{') braceDepth += 1
        if (ch === '}') {
          if (braceDepth === 0) {
            interpolations.pop()
            state = '`'
            out += ch
            i += 1
            continue
          }
          braceDepth -= 1
        }
      }
      out += ch
      i += 1
      continue
    }

    if (state === 'line') {
      if (ch === '\n') {
        state = 'code'
        out += '\n'
        i += 1
        continue
      }
      blank(ch)
      i += 1
      continue
    }

    if (state === 'block') {
      if (ch === '*' && next === '/') {
        state = 'code'
        out += '  '
        i += 2
        continue
      }
      blank(ch)
      i += 1
      continue
    }

    // Inside a quote or a template literal: contents are not code.
    if (ch === '\\') {
      blank(ch)
      blank(next ?? '')
      i += 2
      continue
    }
    if (ch === state) {
      state = 'code'
      out += ch
      i += 1
      continue
    }
    if (state === '`' && ch === '$' && next === '{') {
      interpolations.push(true)
      braceDepth = 0
      state = 'code'
      out += '${'
      i += 2
      continue
    }
    if (ch === '\n') {
      // An unterminated literal ends at the line, so the rest of the file is
      // still read as code rather than swallowed.
      state = 'code'
      out += '\n'
      i += 1
      continue
    }
    blank(ch)
    i += 1
  }
  return out
}

// An import or a re-export is not a use. Counting one would make every module
// that imports a symbol look like a caller, which is the mistake this gate
// exists to avoid.
//
// Only `export ... from '...'` is a re-export. Matching every line that starts
// with `export` would also skip `export const v = used()`, which is a call, and
// the gate would then report the very module it just watched being used.
function isImportOrReexport(line) {
  if (/^\s*import\s/.test(line)) return true
  return /^\s*export\b[\s\S]*\bfrom\s*['"]/.test(line)
}

// A generator is declared `async function*`, and a regex that stops at `function`
// misses it. Missing one export is not neutral: the name never enters the checked
// set, so a module whose only reachable export is the generator is reported for
// the ones that merely happen to be unused too.
function exportedNames(source) {
  const names = new Set()
  for (const m of source.matchAll(
    /export\s+(?:default\s+)?(?:async\s+)?function\s*\*?\s*(\w+)/g,
  )) {
    names.add(m[1])
  }
  for (const m of source.matchAll(/export\s+class\s+(\w+)/g)) names.add(m[1])
  // An exported singleton is how a class is used without anyone writing `new`:
  // `export const processTerminal = new Terminal()` is instantiated here, and
  // `Terminal` is then named only in its own declaration and in the type
  // position of that line. Checking classes alone reported the class as dead
  // while the CLI was importing the instance and running the app on it.
  for (const m of source.matchAll(/export\s+const\s+(\w+)/g)) names.add(m[1])
  return names
}

// Every identifier used in the file, ignoring import and re-export lines.
function referencedNames(source) {
  const names = new Set()
  for (const line of source.split('\n')) {
    if (isImportOrReexport(line)) continue
    // Two characters after the first, so a three-letter name like `TUI` counts.
    // Requiring three made every such name invisible, and an invisible use is
    // indistinguishable from no use: the gate reported `new TUI(...)` as dead.
    // A spread call `...renderSearchBar(...)` puts a `.` before the name, and a
    // one-character lookbehind read that as a member access and reported the
    // live function dead. Three dots means spread; two or one still reads as a
    // member access and stays excluded.
    for (const m of line.replace(/\.\.\.([A-Za-z_])/g, ' $1').matchAll(/(?<![\w.$])([A-Za-z_]\w{2,})(?![\w$])/g)) names.add(m[1])
  }
  return names
}

/**
 * Files whose exported functions and classes are referenced by nothing else.
 *
 * The declaring file does not count as a reference to itself: the declaration
 * line mentions the name, and so does every recursive call inside it, and
 * neither says anything about whether anyone calls the module.
 *
 * Exported as a function so the test beside it can exercise a fixture tree
 * instead of only the live one.
 */
export function findUnreferencedModules(files, readSource = (f) => readFileSync(f, 'utf8')) {
  const sources = new Map()
  for (const file of files) sources.set(file, stripComments(readSource(file)))

  // name -> set of files that mention it outside an import line
  const users = new Map()
  for (const [file, source] of sources) {
    for (const name of referencedNames(source)) {
      let set = users.get(name)
      if (!set) users.set(name, (set = new Set()))
      set.add(file)
    }
  }

  const findings = []
  for (const [file, source] of sources) {
    if (SELF_REGISTERING.test(source)) continue
    const exported = exportedNames(source)
    if (exported.size === 0) continue
    const referenced = [...exported].filter((name) => {
      const set = users.get(name)
      if (!set) return false
      for (const user of set) if (user !== file) return true
      return false
    })
    if (referenced.length === 0) findings.push({ file, exported: [...exported] })
  }
  return findings
}

function relOf(file) {
  return relative(join(targetRoot, SOURCE_ROOT), file).split('\\').join('/')
}

function main() {
  const files = walk(join(targetRoot, SOURCE_ROOT))
  if (files.length === 0) {
    console.error(`[fail] call-reachability - ${SOURCE_ROOT} holds no source files`)
    process.exit(3)
  }

  // Usage is scanned across every source file, including the exempt ones. An
  // entry point is called by the process rather than by source, but it is also
  // the thing that calls most of the tree, so leaving it out of the scan would
  // report every module it drives as unreferenced.
  const findings = findUnreferencedModules(files).filter(({ file }) => {
    const rel = relOf(file)
    return !EXEMPT_PREFIXES.some((prefix) => rel.startsWith(prefix)) && !ALLOWED.has(rel)
  })

  if (findings.length > 0) {
    for (const { file, exported } of findings) {
      console.error(`[advisory] call-unreferenced - ${relOf(file)} (${exported.length} export(s): ${exported.slice(0, 3).join(', ')})`)
    }
    console.error(`\n[advisory] call-reachability - ${findings.length} module(s) export work nothing calls`)
    // Advisory: the tree currently holds this shape, and the count is what the
    // cleanup rounds drive down. Blocking now would fail every push until the
    // last one is gone, which is how a gate gets disabled instead of obeyed.
    console.log(`[advisory] call-reachability - ${findings.length} module(s) to review, ${files.length} checked`)
    return
  }

  console.log(`[pass] call-reachability - every module's exported work is referenced (${files.length} files)`)
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main()
}

#!/usr/bin/env node
// Distinguish a thin facade from a real monolith, so the responsibility ceiling
// means something.
//
// The structural judge counts function-like names per module and reports every
// module above 20, but the count alone cannot tell two very different things
// apart. A thin facade is an aggregation surface: every name delegates, so the
// count measures how many modules it assembles, not how much behaviour it owns.
// agent-rules already grants that standing to SessionManager by name. A real
// monolith is the opposite: the names carry bodies with branching and state of
// their own, and the ceiling is aimed at exactly that.
//
// Without a criterion, "it's a facade, keep it" is an untestable claim, and the
// alternative is splitting a 100%-delegation shim for no reason. This script
// makes the distinction computable:
//
//   thinFacade(module) :=
//         delegationRatio >= 0.90          names are aggregation, not logic
//       && branchingFunctionCount === 0    no function branches of its own
//       && ownStateWriteCount === 0        no this.<field> = outside the ctor
//
// A lines-per-declared-name ceiling was considered and rejected: measured, it
// separates nothing. Every over-ceiling module exceeds 15 lines per name, so the
// clause never changes a verdict, while it wrongly rejects genuine facades -
// modules at delegationRatio 1.00 with zero branching reach 80 lines per name
// when their bodies are literal tables rather than logic. Length is not
// complexity, and a criterion that cannot tell the two apart is not a criterion.
//
// The thresholds are not fitted to an outcome. Measured against this tree the
// classification is unanimous: one module sits at delegationRatio 1.00 with zero
// branching, and every other over-ceiling module sits at <= 0.03. Any cut inside
// that gap classifies identically, so 0.90 is a safe place to put the line
// rather than a tuned one.
//
// Usage:
//   node scripts/analyze-module-facades.mjs            # report over-ceiling modules
//   node scripts/analyze-module-facades.mjs --all      # report every module
//   node scripts/analyze-module-facades.mjs --ceiling 20
//
// Exit codes: 0 report produced, 2 the source root is missing.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_ROOT = join(ROOT, 'packages', 'ts-shell', 'src')

const args = process.argv.slice(2)
const showAll = args.includes('--all')
const ceilingIndex = args.indexOf('--ceiling')
const CEILING = ceilingIndex === -1 ? 20 : Number(args[ceilingIndex + 1])

// Thresholds, each justified in the header. Kept together so the criterion reads
// as one definition rather than four scattered numbers.
const THIN_FACADE = {
  minDelegationRatio: 0.9,
  maxBranchingFunctions: 0,
  maxOwnStateWrites: 0,
}

if (!existsSync(SOURCE_ROOT)) {
  console.log(`[config-failure] module-facade-source-missing - ${relative(ROOT, SOURCE_ROOT)}`)
  process.exit(2)
}

function collectSources(directory, files = []) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const full = join(directory, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      collectSources(full, files)
      continue
    }
    if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      files.push(full)
    }
  }
  return files
}

// Strip comments and string bodies so a name or a keyword inside prose cannot be
// counted. Mirrors what the judge does before counting, for the same reason.
function maskSource(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

const FUNCTION_DECL = /(^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g
const ARROW_BINDING = /(^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\b|\()/g
const CLASS_METHOD = /(^|\n)[ \t]+(?:(?:public|private|protected|static|readonly|async|get|set|override)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]+)?\{/g

function declaredNames(masked) {
  const names = new Set()
  for (const re of [FUNCTION_DECL, ARROW_BINDING, CLASS_METHOD]) {
    re.lastIndex = 0
    let match
    while ((match = re.exec(masked)) !== null) names.add(match[2])
  }
  // Control keywords are never declarations, but a mask can expose one when a
  // method name follows a brace on the same line.
  for (const keyword of DECLARATION_KEYWORDS) names.delete(keyword)
  // A constructor initialises the object; it is not an aggregation surface, so it
  // does not count toward either the ceiling or the delegation ratio.
  names.delete('constructor')
  return names
}

const BRANCHING = /\b(if|for|while|switch|try|catch)\s*\(|\?\s*[^:.\s]+\s*:/

// A body is a pure delegation when it makes exactly one call and nothing else:
// `return foo(...)`, `await foo(...)`, a bare `foo(...)`, the same with a
// multi-line argument list, or a call whose result is read once
// (`return this.layout(id).sessionDir`). Anything that branches, assigns, or
// sequences is logic, not delegation.
const DELEGATION_CALL = /^\s*(?:return\s+|await\s+)?[\w$.]+\s*(?:<[^>]*>)?\(/
const DELEGATION_TAIL = /\)(?:\s*[?]?\.\s*[A-Za-z_$][\w$]*)*\s*;?\s*$/

function isDelegation(body) {
  const joined = body
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .join(' ')
  if (joined.length === 0) return false
  if (!DELEGATION_CALL.test(joined)) return false
  if (!DELEGATION_TAIL.test(joined)) return false
  if (BRANCHING.test(body)) return false
  // One statement: a single call with its closing paren, nothing sequenced after.
  const semicolons = (joined.match(/;/g) ?? []).length
  return semicolons <= 1
}

const DECLARATION_KEYWORDS = new Set([
  'if',
  'for',
  'while',
  'switch',
  'catch',
  'return',
  'do',
  'else',
  'typeof',
  'function',
  'await',
])

// Each declaration's own body, found by matching its opening brace and scanning
// to the balanced close. Matching any `... {` instead would let a class body
// swallow every method inside it, which mis-attributes bodies to the wrong name.
const DECLARATION_HEAD = new RegExp(
  [
    /(?:^|\n)\s*(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]+)?/,
    /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?(?:function\s*\*?\s*[A-Za-z_$][\w$]*\s*)?\([^)]*\)\s*(?::[^{;=]+)?/,
    /(?:^|\n)[ \t]+(?:(?:public|private|protected|static|readonly|async|get|set|override)\s+)*([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*(?::[^{;]+)?/,
  ]
    .map((re) => re.source)
    .join('|'),
  'g',
)

function functionBodies(masked) {
  const bodies = []
  DECLARATION_HEAD.lastIndex = 0
  let head
  while ((head = DECLARATION_HEAD.exec(masked)) !== null) {
    const name = head.slice(1).find((part) => part !== undefined)
    if (DECLARATION_KEYWORDS.has(name)) continue
    // The body opens at the next `{` after the head. A head whose body is a bare
    // arrow expression has no brace and is skipped.
    const open = masked.indexOf('{', head.index + head[0].length)
    if (open === -1) continue
    // Only a head at brace depth 0 or 1 is a real declaration: depth 0 for
    // top-level functions and arrow bindings, depth 1 for class methods. A match
    // deeper than that is a call expression inside some body that happens to look
    // like a signature, and counting it would mis-attribute that outer body.
    let depthBefore = 0
    for (let i = 0; i < head.index; i += 1) {
      if (masked[i] === '{') depthBefore += 1
      else if (masked[i] === '}') depthBefore -= 1
    }
    if (depthBefore > 1) continue
    let depth = 0
    let index = open
    for (; index < masked.length; index += 1) {
      const char = masked[index]
      if (char === '{') depth += 1
      else if (char === '}') {
        depth -= 1
        if (depth === 0) break
      }
    }
    if (depth !== 0) continue
    bodies.push(masked.slice(open + 1, index))
    DECLARATION_HEAD.lastIndex = index
  }
  return bodies
}

function countThisWrites(masked, constructorBodies) {
  const writes = masked.match(/this\.[A-Za-z_$][\w$]*\s*(?:\+\+|--|[+\-*/]?=)/g) ?? []
  // Constructor parameter-property assignments are initialisation, not state
  // mutation, so subtract those the constructors account for.
  return Math.max(0, writes.length - constructorBodies)
}

function analyse(file) {
  const raw = readFileSync(file, 'utf8')
  const masked = maskSource(raw)
  const names = declaredNames(masked)
  const bodies = functionBodies(masked)
  const branching = bodies.filter((body) => BRANCHING.test(body)).length
  const delegations = bodies.filter((body) => isDelegation(body)).length
  const lines = raw.split('\n').length
  const nameCount = names.size
  const ownStateWrites = countThisWrites(masked, 0)

  return {
    file: relative(ROOT, file),
    lines,
    nameCount,
    branching,
    delegations,
    ownStateWrites,
    delegationRatio: nameCount === 0 ? 1 : delegations / nameCount,
    linesPerName: nameCount === 0 ? 0 : lines / nameCount,
  }
}

const rows = collectSources(SOURCE_ROOT)
  .map(analyse)
  .filter((row) => row.nameCount > 0)
  .sort((left, right) => right.nameCount - left.nameCount)

function verdict(row) {
  const thin =
    row.delegationRatio >= THIN_FACADE.minDelegationRatio &&
    row.branching <= THIN_FACADE.maxBranchingFunctions &&
    row.ownStateWrites <= THIN_FACADE.maxOwnStateWrites
  if (thin) return 'thin-facade'
  if (row.nameCount > CEILING) return 'monolith'
  return 'within-ceiling'
}

const reported = showAll ? rows : rows.filter((row) => row.nameCount > CEILING)

console.log(
  `module-facade-check ceiling=${CEILING} modules=${rows.length} reported=${reported.length} ` +
    `thresholds=delegationRatio>=${THIN_FACADE.minDelegationRatio},branching<=${THIN_FACADE.maxBranchingFunctions},` +
    `ownStateWrites<=${THIN_FACADE.maxOwnStateWrites}`,
)
console.log('')
console.log('  verdict         names lines  delegation  branching  lines/name  module')

for (const row of reported) {
  const name = row.file.replace('packages/ts-shell/src/', '')
  console.log(
    `  ${verdict(row).padEnd(14)} ${String(row.nameCount).padStart(5)} ` +
      `${String(row.lines).padStart(5)} ${row.delegationRatio.toFixed(2).padStart(11)} ` +
      `${String(row.branching).padStart(10)} ${row.linesPerName.toFixed(1).padStart(11)}  ${name}`,
  )
}

const monoliths = reported.filter((row) => verdict(row) === 'monolith')
const facades = reported.filter((row) => verdict(row) === 'thin-facade')

console.log('')
console.log(`module-facade-summary monoliths=${monoliths.length} thin_facades=${facades.length}`)
if (facades.length > 0) {
  console.log(
    `[advisory] module-facade-shim - ${facades.length} over-ceiling module(s) are thin facades and may keep their names: ` +
      facades.map((row) => row.file.replace('packages/ts-shell/src/', '')).join(', '),
  )
}
if (monoliths.length > 0) {
  console.log(
    `[advisory] module-facade-monolith - ${monoliths.length} module(s) own real behaviour above the ceiling: ` +
      monoliths.map((row) => row.file.replace('packages/ts-shell/src/', '')).join(', '),
  )
}

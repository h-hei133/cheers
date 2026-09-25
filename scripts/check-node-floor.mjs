// An API newer than the Node version the package claims to support.
//
// `package.json` declares `engines.node: ">=20.3.0"`, and CI runs exactly that
// version so the claim is checked rather than asserted. What that catches is
// real, and what it caught was expensive: `Promise.withResolvers` needs Node 22,
// three modules call it, and CI was red on every push for a stretch while local
// runs were Node 24 and green. Nobody noticed, because a failing CI run looks the
// same whether the cause is yours or not.
//
// One of the three was found and hand-fixed with a comment explaining why, and
// the comment did not stop the third from being added: `clipboardImage.ts` used
// the same helper again, and the same red CI followed. A comment is a note to
// whoever reads that file, and the failure appears in whichever file nobody
// looked at. This gate is the part that does not depend on reading.
//
// What this catches: a call to a runtime API introduced after the declared floor,
// by name, anywhere under the source tree. What it does not catch: an API reached
// indirectly (a dependency calling it), a behaviour difference between versions,
// or a syntax feature the parser would reject outright. It is a list of the ones
// that have actually bitten, kept honest by the test beside it.
//
// Exit codes follow the other gates: 1 on a finding, 3 when it cannot run at all.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// The tree to check. Defaults to this repository; a test passes a fixture root so
// the gate can be exercised against a known shape instead of only the live tree.
const targetRoot = resolve(process.argv[2] ?? repoRoot)
const SOURCE_ROOT = 'packages/ts-shell/src'
const PACKAGE_JSON = 'package.json'

// APIs that do not exist at the declared floor, with the version that added them.
//
// Only the ones this repository has actually reached for. The list is not a
// compatibility database and does not try to be one: an entry is added when a
// call appears, which is when it is worth knowing the floor does not have it.
const TOO_NEW = new Map([
  ['Promise.withResolvers', '22.0.0'],
  ['Object.groupBy', '21.0.0'],
  ['Map.groupBy', '21.0.0'],
  ['Array.fromAsync', '22.0.0'],
  ['Set.prototype.union', '22.0.0'],
  ['Set.prototype.intersection', '22.0.0'],
  ['Set.prototype.difference', '22.0.0'],
  ['Symbol.dispose', '22.0.0'],
  ['process.getBuiltinModule', '22.3.0'],
  ['fs.globSync', '22.0.0'],
])

// Uses that are present in the source but never evaluated by this runtime.
//
// A browser preload script is a template string: the page evaluates it, and the
// page has whatever the browser has. Reading `navigator` or `window` inside one
// says nothing about Node.
const NOT_EVALUATED_BY_NODE = new Set([])

function fail(reason, detail) {
  console.log(`[config-failure] ${reason} - ${detail}`)
  process.exit(3)
}

function declaredFloor() {
  const manifestPath = join(targetRoot, PACKAGE_JSON)
  if (!existsSync(manifestPath)) {
    fail('cannot read the declared floor', `${PACKAGE_JSON} is missing`)
  }
  let manifest
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
  } catch (error) {
    fail('cannot read the declared floor', `${PACKAGE_JSON} is not JSON: ${error.message}`)
  }
  const range = manifest?.engines?.node
  if (typeof range !== 'string') {
    fail('no Node version is declared', `${PACKAGE_JSON} has no engines.node`)
  }
  const match = /(\d+)\.(\d+)(?:\.(\d+))?/.exec(range)
  if (!match) {
    fail('cannot read the declared floor', `engines.node is ${JSON.stringify(range)}`)
  }
  return { range, major: Number(match[1]), minor: Number(match[2]) }
}

function walk(dir) {
  const out = []
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      out.push(...walk(full))
      continue
    }
    if (!/\.(ts|tsx|mjs|js)$/.test(entry.name)) continue
    if (/\.test\.|\.spec\./.test(entry.name)) continue
    out.push(full)
  }
  return out
}

// Comments explain these APIs — often by saying not to use them, which is the
// most useful sentence in the file. Text after `//` or inside a block is not a
// call, and reporting it would make the gate's own guidance unquotable.
//
// Newlines survive the removal, so the line number in a finding is the line the
// reader will find it on. Collapsing a block comment would shift every number
// below it, and a gate that points at the wrong line costs more than it saves.
//
// Strings are tracked rather than regex-replaced. A `//` inside a string is not a
// comment — `"https://example.test"` ends a line looked like one under a plain
// regex, so a real call written after it on the same line went unreported. A gate
// that misses the thing it exists for is worse than no gate, because it is
// trusted.
function stripComments(source) {
  let out = ''
  let index = 0
  let quote = null
  while (index < source.length) {
    const char = source[index]
    if (quote) {
      out += char
      if (char === '\\') {
        // An escaped character is part of the string whatever it looks like.
        out += source[index + 1] ?? ''
        index += 2
        continue
      }
      if (char === quote) quote = null
      index += 1
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      out += char
      index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      while (index < source.length && source[index] !== '\n') index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      const body = source.slice(index, end === -1 ? source.length : end + 2)
      // Newlines kept, everything else blanked, so line numbers stay true.
      out += body.replace(/[^\n]/g, '')
      index += body.length
      continue
    }
    out += char
    index += 1
  }
  return out
}

function findUses(file) {
  const source = stripComments(readFileSync(file, 'utf8'))
  const found = []
  for (const [api, added] of TOO_NEW) {
    if (NOT_EVALUATED_BY_NODE.has(file)) continue
    // The bare name, not a call: an assignment or a property read of it is the
    // same mistake as calling it, and `Promise.withResolvers` may be stored.
    let index = source.indexOf(api)
    while (index !== -1) {
      const line = source.slice(0, index).split('\n').length
      found.push({ api, added, line })
      index = source.indexOf(api, index + api.length)
    }
  }
  return found
}

const floor = declaredFloor()
const files = walk(join(targetRoot, SOURCE_ROOT))
if (files.length === 0) {
  fail('nothing to check', `${SOURCE_ROOT} holds no source files`)
}

const findings = []
for (const file of files) {
  for (const use of findUses(file)) {
    const [major, minor] = use.added.split('.').map(Number)
    if (major > floor.major || (major === floor.major && minor > floor.minor)) {
      findings.push({ file: relative(targetRoot, file), ...use })
    }
  }
}

if (findings.length > 0) {
  // Findings go to stdout, like every other check-* gate here, so a caller that
  // captures one stream sees the reason rather than an unexplained exit code.
  console.log(`[fail] node-floor - ${findings.length} use(s) need a newer Node than the declared ${floor.range}`)
  for (const finding of findings) {
    console.log(`  ${finding.file}:${finding.line} - ${finding.api} was added in ${finding.added}`)
  }
  console.log('  Build it by hand, the way retry.ts and fileLock.ts do, or raise engines.node.')
  process.exit(1)
}

console.log(`[pass] node-floor - no use of a runtime API newer than the declared ${floor.range}`)

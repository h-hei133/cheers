#!/usr/bin/env node
// Detect documentation that still points at code that has moved or gone.
//
// Every other gate here checks code: tsc for types, vitest for behaviour, the
// structural judge for graph shape. None checks whether the prose describing
// that code still describes it. So each refactor widens the gap between docs
// and reality, invisibly. When this gate was written, agent-rules still named
// orchestration/patchResult/, a directory removed several steps earlier, and
// 155 references across 44 current-state documents were already dead.
//
// Two scopes, because they carry different obligations:
//
//   RULES - AGENTS.md, agent-rules/, the wiki index. These bind every agent
//           that starts work here, so a dead path in them misdirects work.
//           A dead reference here FAILS the gate.
//
//   DOCS  - the documents DOC_STATUS.md presents as describing the current
//           tree. Their drift is reported with a count so it is visible and can
//           be driven down, but it is not yet clean, so it does not fail the
//           gate. Pass --strict to require it clean.
//
// Archived and historical material is out of scope by construction: a route
// closeout from May is supposed to describe the tree as it was in May.
//
// References are read from two shapes. Inline ones sit in backticks. Block ones
// sit on their own line inside a fence, which is how rules and architecture
// notes draw tree shapes. The second shape was added on 2026-09-19: ten dead
// paths in agent-rules/file-placement-and-naming.md lived in fences and the
// gate had never seen them, because a rule that misdirects is worse than a note
// that does - every agent starting here reads the rule.
//
// Block lines must be a whole path carrying a directory segment. That keeps
// prose out, and it keeps the blocks that contrast a good name with a bad one
// out too: those use bare filenames, which name no location and so cannot
// resolve either way.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const strict = process.argv.includes('--strict')

const RULES = ['AGENTS.md', 'agent-rules', '.wiki/_index.md']
// The documents whose own status entry claims they describe the current tree.
// Written as a predicate rather than a directory list: docs/architecture holds
// three active documents beside two historical ones, a superseded one and
// twenty-seven the map does not list at all, so a directory is the wrong unit.
const DOC_STATUS = 'docs/DOC_STATUS.md'
const ACTIVE_STATUS = 'active'

// File and directory references into this repository. A trailing slash marks a
// directory, which counts: directories are exactly what a refactor deletes.
const CANDIDATE = /`((?:packages|apps|scripts|docs|agent-rules|contracts)\/[^`\s]+?\.(?:ts|tsx|mjs|js|json|md)|(?:packages|apps|scripts|docs|agent-rules|contracts)\/[^`\s]*?\/)`/g

// The same references written without the repository root, which is how prose
// inside `packages/ts-shell/` names things: the domain path on its own rather
// than prefixed with the package and source directories. The gate already
// resolves such paths through its `packages/ts-shell/src` base, but the pattern
// above could never hand it one, so this whole family went unseen.
//
// Gated on the first segment being a real domain under the product source tree.
// Without that gate the pattern matches any two-segment path in prose - a
// `test/artifact-workflow.mjs` inside a disposable workspace, a `theme/theme.ts`
// from another repository - and those resolve to nothing for reasons that are
// not drift. The domain list is read from disk, so a new domain is covered the
// day it is created and a removed one stops being a reference source.
const SOURCE_PATH = /`([a-z][a-z0-9-]*(?:\/[A-Za-z0-9_.@-]+)+\.(?:ts|tsx|mjs|js))`/g

function sourceDomains() {
  const root = resolve(repoRoot, 'packages/ts-shell/src')
  if (!existsSync(root)) return new Set()
  return new Set(
    readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name),
  )
}

function sourcePaths(text, domains) {
  const found = []
  for (const match of text.matchAll(SOURCE_PATH)) {
    if (domains.has(match[1].split('/')[0])) found.push(match[1])
  }
  return found
}

// The same references written on their own line inside a fenced block. Rules
// and architecture notes show tree shapes that way, and a stale line there
// misdirects exactly like an inline one - ten dead paths in
// agent-rules/file-placement-and-naming.md sat in fences and went unseen.
//
// Two constraints keep this honest. The line must be a whole path, so prose
// that merely contains a slash is not swept up. And it must carry a directory
// segment, because the blocks that contrast a good name against a bad one use
// bare filenames (`trajectoryProjection.ts`), which name no location and so
// cannot be resolved either way.
const BLOCK_PATH = /^[a-z][a-z0-9-]*(?:\/[A-Za-z0-9_.-]+)+\/?$/

function blockPaths(text) {
  const found = []
  let fenced = false
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('```')) {
      fenced = !fenced
      continue
    }
    if (!fenced) continue
    if (BLOCK_PATH.test(trimmed)) found.push(trimmed)
  }
  return found
}

// A reference resolves if it names something that exists, in any of the shapes
// prose legitimately uses: TypeScript written as .js, and a directory written
// with or without its index. Paths without a repository root prefix are read
// from the product source tree, which is how the rules write them.
function resolves(referenced) {
  const shapes = [
    referenced,
    referenced.replace(/\.js$/, '.ts'),
    referenced.replace(/\.js$/, '.tsx'),
    referenced.replace(/^(.*)\/$/, '$1/index.md'),
  ]
  const bases = ['', 'packages/ts-shell/src']
  return shapes.some((shape) => bases.some((base) => existsSync(resolve(repoRoot, base, shape))))
}

function collect(target, files = []) {
  const absolute = resolve(repoRoot, target)
  if (!existsSync(absolute)) {
    console.log(`[config-failure] drift-check-target-missing - ${target}`)
    process.exit(3)
  }
  if (statSync(absolute).isFile()) {
    files.push(absolute)
    return files
  }
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const full = join(absolute, entry.name)
    if (entry.isDirectory()) collect(relative(repoRoot, full), files)
    else if (entry.name.endsWith('.md')) files.push(full)
  }
  return files
}

function scan(files) {
  let references = 0
  const dangling = []
  const sourceDangling = []
  const domains = sourceDomains()
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    const referenced = [
      ...[...text.matchAll(CANDIDATE)].map((match) => match[1]),
      ...blockPaths(text),
    ]
    for (const reference of referenced) {
      // A glob names a family, not a file, so it cannot be resolved. So does a
      // placeholder like <path>, which prose uses to describe a pattern.
      if (reference.includes('*') || reference.includes('<')) continue
      references += 1
      if (resolves(reference)) continue
      dangling.push(`${relative(repoRoot, file)} -> ${reference}`)
    }
    // Unprefixed source references are counted apart from the rest. A dead one
    // is not necessarily drift: these documents legitimately cite paths that
    // were deleted, to record the deletion ("Step 2.6 deleted X and it was
    // rolled back"). The count is what matters - it is the size of the surface
    // the root-prefixed pattern cannot see, and it should fall as documents are
    // corrected, not rise.
    for (const reference of sourcePaths(text, domains)) {
      references += 1
      if (resolves(reference)) continue
      sourceDangling.push(`${relative(repoRoot, file)} -> ${reference}`)
    }
  }
  return { references, dangling, sourceDangling }
}

// Read the status map and keep the paths it marks active. The map is the
// project's own statement of which documents still describe the tree, so it
// decides the scope rather than a hand-kept directory list.
function activeDocuments() {
  const statusPath = resolve(repoRoot, DOC_STATUS)
  if (!existsSync(statusPath)) {
    console.log(`[config-failure] drift-check-status-map-missing - ${DOC_STATUS}`)
    process.exit(3)
  }
  const paths = []
  const absent = []
  for (const line of readFileSync(statusPath, 'utf8').split('\n')) {
    const row = /^\|\s*`([^`]+)`\s*\|\s*([a-z-]+)\s*\|/.exec(line)
    if (row === null || row[2] !== ACTIVE_STATUS) continue
    const target = row[1]
    // The map names repository files; skip anything outside the repository.
    if (target.startsWith('..') || target.startsWith('/')) continue
    if (!existsSync(resolve(repoRoot, target))) {
      absent.push(target)
      continue
    }
    paths.push(target)
  }
  // An entry claiming a document is the current source of truth, when that
  // document is gone, is exactly the drift this gate exists to catch. Report
  // all of them, then stop: the scope itself is wrong, so the scan below would
  // be measuring the wrong set.
  if (absent.length > 0) {
    for (const target of absent) console.log(`[product-regression] status-map-path-missing - ${target}`)
    console.log(`[product-regression] status-map-drift - ${absent.length} active entr(ies) name files that do not exist`)
    process.exit(1)
  }
  return paths
}

const rulesFiles = RULES.flatMap((target) => collect(target))
const docsFiles = activeDocuments().flatMap((target) => collect(target))
const rules = scan(rulesFiles)
const docs = scan(docsFiles)

console.log(`drift-check rules_files=${rulesFiles.length} rules_refs=${rules.references} rules_dangling=${rules.dangling.length} rules_source_dangling=${rules.sourceDangling.length}`)
console.log(`drift-check docs_files=${docsFiles.length} docs_refs=${docs.references} docs_dangling=${docs.dangling.length} docs_source_dangling=${docs.sourceDangling.length}`)

for (const entry of rules.dangling) {
  console.log(`[product-regression] rule-reference-dangling - ${entry}`)
}
for (const entry of docs.dangling) {
  console.log(`[advisory] doc-reference-dangling - ${entry}`)
}

if (rules.dangling.length > 0) {
  console.log(`[product-regression] rules-drift - ${rules.dangling.length} binding rule reference(s) name paths that do not exist`)
  process.exit(1)
}
if (strict && docs.dangling.length > 0) {
  console.log(`[product-regression] docs-drift - ${docs.dangling.length} current-state document reference(s) name paths that do not exist`)
  process.exit(1)
}
console.log(`[pass] rules-drift - every binding rule reference resolves`)
if (docs.dangling.length > 0) {
  console.log(`[advisory] docs-drift - ${docs.dangling.length} reference(s) in current-state documents name paths that do not exist; run with --strict to fail`)
}
// Reported, never fatal, and deliberately not printed one per line: a deletion
// round leaves hundreds of legitimate citations of removed paths, and listing
// them would bury the findings this gate exists to surface. The count is the
// signal - it is how much of the prose surface the root-prefixed pattern cannot
// see, and it should trend down as documents are corrected.
if (docs.sourceDangling.length > 0) {
  console.log(`[advisory] docs-source-drift - ${docs.sourceDangling.length} unprefixed source reference(s) in current-state documents name paths that do not exist; these are counted, not listed, and not failed on`)
}

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
  for (const file of files) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(CANDIDATE)) {
      const referenced = match[1]
      // A glob names a family, not a file, so it cannot be resolved. So does a
      // placeholder like <path>, which prose uses to describe a pattern.
      if (referenced.includes('*') || referenced.includes('<')) continue
      references += 1
      // TypeScript is routinely written as .js in prose, and a directory index
      // is written either way. Accept the shapes that resolve.
      const candidates = [
        referenced,
        referenced.replace(/\.js$/, '.ts'),
        referenced.replace(/\.js$/, '.tsx'),
        referenced.replace(/^(.*)\/$/, '$1/index.md'),
      ]
      if (candidates.some((candidate) => existsSync(resolve(repoRoot, candidate)))) continue
      dangling.push(`${relative(repoRoot, file)} -> ${referenced}`)
    }
  }
  return { references, dangling }
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

console.log(`drift-check rules_files=${rulesFiles.length} rules_refs=${rules.references} rules_dangling=${rules.dangling.length}`)
console.log(`drift-check docs_files=${docsFiles.length} docs_refs=${docs.references} docs_dangling=${docs.dangling.length}`)

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

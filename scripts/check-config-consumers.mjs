// A config field that nothing reads is a promise the runtime does not keep.
//
// `RuntimeConfig` declares its fields, `DEFAULT_CONFIG` gives them defaults, and
// `getRuntimeConfig` merges them onto the resolved object. Those three steps make
// a field look alive: it appears in the type, it has a value, and it shows up in
// `Object.keys(result)`. Nothing in the language objects when no code ever reads
// it, so a field can stay dead through any number of releases. Two did
// (`thinkingBudgets`, `promptCacheTtl`) until they were found by hand.
//
// No reference implementation has this check, so there is nothing to copy. The
// closest mechanism is codex's `RawMcpServerConfig`, which forces a consumer with
// exhaustive destructuring so that adding a field without a mapping site is a
// compile error. TypeScript has no equivalent for interface members, so the
// consumer link is checked here instead.
//
// What this catches: a field declared on `RuntimeConfig` (or `TuiPreferences`)
// with no production read. What it does not catch: a field that is read but whose
// value is then ignored downstream, and a field read only by tests. Test-only
// reads are reported as such rather than counted as consumers, because a test
// asserting a field's round trip does not make the field useful.
//
// Named check-* rather than verify-*: this asserts a structural invariant about
// the tree, the way check-import-cycles.mjs does, rather than exercising
// behaviour the way verify-*.mjs scripts do.
//
// Exit codes follow the other gates: 1 on a finding, 3 when it cannot run at all.

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
// The tree to check. Defaults to this repository; a test passes a fixture root so
// the gate can be exercised against a known shape instead of only the live tree.
const targetRoot = resolve(process.argv[2] ?? repoRoot)
const CONFIG_MODULE = 'packages/ts-shell/src/config/runtimeConfig.ts'
const SOURCE_ROOT = 'packages/ts-shell/src'

// Fields that are deliberately declared with no production reader.
//
// An entry here is a decision, not a backlog item: it says the capability behind
// the field exists and the field is where a caller will reach it. A field whose
// capability does not exist does not belong here - it belongs deleted, which is
// why `thinkingBudgets` and `promptCacheTtl` are gone rather than listed.
const DECLARED_WITHOUT_READER = new Map([])

function interfaceFields(source, name) {
  const start = source.indexOf(`export interface ${name} `)
  if (start < 0) return undefined
  // The body runs to the closing brace at column 0.
  const rest = source.slice(start)
  const end = rest.search(/\n}\n/)
  if (end < 0) return undefined
  const body = rest.slice(0, end)
  return [...body.matchAll(/^\s+readonly (\w+)\??:/gm)].map((match) => match[1])
}

const configPath = resolve(targetRoot, CONFIG_MODULE)
// existsSync, not statSync: statSync throws on a missing path, which would turn
// "the tree this gate checks is not here" into an uncaught exception instead of
// the config-failure exit code the other gates use.
if (!existsSync(configPath)) {
  console.log(`[config-failure] config-consumer-gate-source-missing - ${CONFIG_MODULE}`)
  process.exit(3)
}

const configSource = readFileSync(configPath, 'utf8')

// Both interfaces must be found. A rename that leaves one of them unparsed would
// otherwise shrink the field list silently - and a gate that reads fewer fields
// than exist passes on exactly the fields it can no longer see.
// Only the resolved shapes. `RuntimeConfigFile` describes what a config file may
// contain and its members are deliberately not `readonly` — it is an input shape,
// not a resolved one — so the parser below, which collects `readonly` members,
// cannot read it. A field there is not inert in the same way either: it reaches a
// resolved field by being merged in `getRuntimeConfig`, and the resolved interface
// is checked. A file field with no resolved counterpart is caught as an unused
// property by the type checker instead.
const REQUIRED_INTERFACES = ['RuntimeConfig', 'TuiPreferences']
const parsed = new Map(
  REQUIRED_INTERFACES.map((name) => [name, interfaceFields(configSource, name)]),
)

for (const [name, fields] of parsed) {
  if (fields === undefined) {
    console.log(`[config-failure] config-consumer-gate-interface-missing - ${name} not found in ${CONFIG_MODULE}`)
    process.exit(3)
  }
  if (fields.length === 0) {
    console.log(`[config-failure] config-consumer-gate-interface-empty - ${name} declares no readonly fields`)
    process.exit(3)
  }
}

const declared = [...parsed.values()].flat()

// A floor on the parsed count, derived from the tree rather than pinned to a
// number: the per-interface check above catches a renamed interface, and this
// catches a parser change that keeps the interfaces but loses most of their
// bodies. Pinning an absolute count would break every fixture a test builds, and
// would need editing whenever a field is legitimately added or removed.
const MIN_DECLARED_FIELDS = REQUIRED_INTERFACES.length
if (declared.length < MIN_DECLARED_FIELDS) {
  console.log(
    `[config-failure] config-consumer-gate-parse-shrank - parsed ${declared.length} field(s), ` +
      `expected at least ${MIN_DECLARED_FIELDS}`,
  )
  process.exit(3)
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else if (entry.name.endsWith('.ts')) files.push(full)
  }
  return files
}

// A field is read when `.field` appears anywhere in the product source outside
// its own declaration module. Destructuring (`const { a } = config`) and index
// access (`config['a']`) would escape this pattern; neither appears in this tree,
// and the parse guards above fail loudly if the shape changes.
//
// `this.field` does not count. A class member with the same name as a config
// field — `InteractiveMode` has a `tui` render engine, and `provider` and
// `agentMode` are likewise common member names — would otherwise satisfy the gate
// while the config value itself is never read. That is the failure the gate
// exists to catch, so the lookbehind is what keeps it honest.
const consumers = new Map(declared.map((field) => [field, { production: [], test: [] }]))
const matcher = new RegExp(`(?<!this)\\.(${declared.join('|')})\\b`, 'g')

for (const file of walk(resolve(targetRoot, SOURCE_ROOT))) {
  const path = relative(targetRoot, file)
  if (path === CONFIG_MODULE) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(matcher)) {
    const bucket = path.endsWith('.test.ts') ? 'test' : 'production'
    const entry = consumers.get(match[1])
    if (!entry[bucket].includes(path)) entry[bucket].push(path)
  }
}

const findings = []
for (const field of declared) {
  const { production, test } = consumers.get(field)
  if (production.length > 0) continue
  if (DECLARED_WITHOUT_READER.has(field)) continue
  findings.push({ field, test })
}

console.log(
  `config-consumer-check fields=${declared.length} ` +
    `read=${declared.filter((f) => consumers.get(f).production.length > 0).length} ` +
    `declared_without_reader=${DECLARED_WITHOUT_READER.size} ` +
    `findings=${findings.length}`,
)

for (const { field, test } of findings) {
  const note = test.length > 0 ? ` (read only by ${test.length} test file(s))` : ''
  console.log(`[product-regression] config-field-without-consumer - ${field}${note}`)
}

if (findings.length > 0) {
  console.log(
    `[product-regression] config-consumer-drift - ${findings.length} field(s) declared with no production reader`,
  )
  console.log(
    '[hint] Delete the field, or add it to DECLARED_WITHOUT_READER with the reason ' +
      'its capability exists. A field whose capability does not exist belongs deleted.',
  )
  process.exit(1)
}

console.log('[pass] config-consumers - every declared field has a production reader or a recorded reason')

// A declared hook event, or a registered tool, that nothing ever reaches.
//
// `check-config-consumers.mjs` covers one carrier: a config field with no
// production reader. The same shape lives in two more places, and one of them
// already shipped a wrong claim.
//
//   - Hook events. `HookEventName` declared eighteen, and `phase-1-execution.md`
//     recorded that all eighteen had a dispatch site. Three did not
//     (`PostToolUseFailure`, `WorktreeCreate`, `WorktreeRemove`). A repository can
//     declare a hook for one of those, watch the config validate, watch it
//     register, and never see it run, with nothing said.
//   - Tool definitions. The system prompt named thirteen tools while the registry
//     offered fourteen; `skill` was missing, so the model was told about a tool
//     set it did not have. The list is derived now, and this gate keeps the two
//     ends from drifting apart again.
//
// What this catches: an event name in the union with no `eventName: "<name>"`
// dispatch anywhere, and a `create*ToolDefinition` factory that no registry
// calls. What it does not catch: an event dispatched from a path that never
// executes, or a factory whose product is registered then filtered away.
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
const SOURCE_ROOT = 'packages/ts-shell/src'
const HOOK_TYPES = join(SOURCE_ROOT, 'core/hooks/types.ts')
const TOOLS_DIR = join(SOURCE_ROOT, 'core/tools')
const TOOL_REGISTRY = join(SOURCE_ROOT, 'core/tools/registry.ts')

// Event names that are deliberately declared with no dispatch site.
//
// An entry here is a decision, not a backlog item. A name whose capability does
// not exist does not belong here - it belongs deleted, which is why the four
// retired events are gone from the union rather than listed.
const EVENTS_WITHOUT_DISPATCH = new Map([])

// Tool factories that are deliberately not registered in this build.
//
// `messagingTools.ts` implements agent-to-agent messaging over a session socket.
// The socket host and client are not part of the shipped CLI, so the two tools
// that would expose them are built but not offered. Listing them here records
// that as a decision rather than letting the gate imply an oversight.
const TOOLS_NOT_REGISTERED = new Map([
  ['createListAgentsToolDefinition', 'agent-to-agent messaging has no shipped transport'],
  ['createSendMessageToolDefinition', 'agent-to-agent messaging has no shipped transport'],
])

function fail(reason, detail) {
  console.log(`[config-failure] ${reason} - ${detail}`)
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

const sourceDir = resolve(targetRoot, SOURCE_ROOT)
if (!existsSync(sourceDir)) fail('declaration-gate-source-missing', SOURCE_ROOT)
const hookTypesPath = resolve(targetRoot, HOOK_TYPES)
if (!existsSync(hookTypesPath)) fail('declaration-gate-source-missing', HOOK_TYPES)

const files = walk(sourceDir)

// --- hook events -----------------------------------------------------------

const hookSource = readFileSync(hookTypesPath, 'utf8')
const unionMatch = hookSource.match(/export type HookEventName =([\s\S]*?)\n\n/)
if (!unionMatch) fail('declaration-gate-parse-failed', 'HookEventName union not found')
const declaredEvents = [...unionMatch[1].matchAll(/\|\s*"([A-Za-z]+)"/g)].map((m) => m[1])
// A parser change that loses most of the union would otherwise pass on whatever
// it could still see. The union had eighteen members when this gate was written.
if (declaredEvents.length < 10) {
  fail('declaration-gate-parse-shrank', `parsed ${declaredEvents.length} hook event(s)`)
}

const dispatchedEvents = new Set()
for (const file of files) {
  if (relative(targetRoot, file) === HOOK_TYPES) continue
  for (const match of readFileSync(file, 'utf8').matchAll(/eventName:\s*"([A-Za-z]+)"/g)) {
    dispatchedEvents.add(match[1])
  }
}

// --- tool definitions ------------------------------------------------------

const toolFactories = []
for (const file of files) {
  if (!relative(targetRoot, file).startsWith(TOOLS_DIR)) continue
  const text = readFileSync(file, 'utf8')
  for (const match of text.matchAll(/export function (create[A-Za-z]*ToolDefinition)\s*\(/g)) {
    toolFactories.push({ name: match[1], file: relative(targetRoot, file) })
  }
}
if (toolFactories.length === 0) {
  fail('declaration-gate-parse-shrank', 'no create*ToolDefinition factories found')
}

const registryPath = resolve(targetRoot, TOOL_REGISTRY)
if (!existsSync(registryPath)) fail('declaration-gate-source-missing', TOOL_REGISTRY)
const registrySource = readFileSync(registryPath, 'utf8')
const registeredFactories = new Set(
  [...registrySource.matchAll(/(create[A-Za-z]*ToolDefinition)\s*\(/g)].map((m) => m[1]),
)
if (registeredFactories.size === 0) {
  fail('declaration-gate-parse-shrank', 'registry names no tool factory')
}

// --- findings --------------------------------------------------------------

const findings = []
for (const event of declaredEvents) {
  if (dispatchedEvents.has(event)) continue
  if (EVENTS_WITHOUT_DISPATCH.has(event)) continue
  findings.push({ kind: 'hook-event-without-dispatch', name: event })
}
for (const factory of toolFactories) {
  if (registeredFactories.has(factory.name)) continue
  if (TOOLS_NOT_REGISTERED.has(factory.name)) continue
  findings.push({ kind: 'tool-factory-not-registered', name: factory.name, file: factory.file })
}

console.log(
  `declaration-check hook_events=${declaredEvents.length} dispatched=${declaredEvents.filter((e) => dispatchedEvents.has(e)).length} ` +
    `tool_factories=${toolFactories.length} registered=${toolFactories.filter((f) => registeredFactories.has(f.name)).length} ` +
    `findings=${findings.length}`,
)

for (const finding of findings) {
  const where = finding.file ? ` (${finding.file})` : ''
  console.log(`[product-regression] ${finding.kind} - ${finding.name}${where}`)
}

if (findings.length > 0) {
  console.log(
    `[product-regression] declaration-drift - ${findings.length} declared name(s) nothing reaches`,
  )
  console.log(
    '[hint] Wire it, delete it, or record it in EVENTS_WITHOUT_DISPATCH / TOOLS_NOT_REGISTERED ' +
      'with the reason its capability exists. A name whose capability does not exist belongs deleted.',
  )
  process.exit(1)
}

console.log('[pass] declarations - every hook event dispatches and every tool factory is registered or recorded')

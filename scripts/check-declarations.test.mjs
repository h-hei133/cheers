// Tests for check-declarations.mjs.
//
// The gate exists because two carriers of the same defect had already shipped a
// wrong claim: a hook event declared with no dispatch site, and a tool the
// registry offered that the system prompt never named. The cases below are the
// ones that actually happened, plus the ways the gate could pass while checking
// nothing.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const gate = fileURLToPath(new URL('./check-declarations.mjs', import.meta.url))
const HOOK_TYPES = 'packages/ts-shell/src/core/hooks/types.ts'
const TOOLS_DIR = 'packages/ts-shell/src/core/tools'

// A hook types module shaped like the real one: a union and the payload types.
function hookSource(events) {
  const members = events.map((e) => `  | "${e}"`).join('\n')
  return `export type HookEventName =\n${members};\n\nexport interface BaseHookEventPayload {\n  readonly eventName: HookEventName;\n}\n`
}

// A dispatcher that emits the given event names.
function dispatcherSource(events) {
  return `export async function dispatch(eventName: string): Promise<void> {
${events.map((e) => `  void { eventName: "${e}" };`).join('\n')}
}
`
}

// A tools module exposing the given factories, and a registry calling some.
function toolSource(factories) {
  return factories.map((f) => `export function ${f}() { return {}; }\n`).join('')
}

function registrySource(called) {
  return `export function build() {\n  return [${called.map((c) => `${c}()`).join(', ')}];\n}\n`
}

function run(root) {
  return spawnSync(process.execPath, [gate, root], { encoding: 'utf8' })
}

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'declarations-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return root
}

// The minimum a fixture needs: ten events (the parse floor) all dispatched, and
// one factory that is registered.
function baseline(extra = {}) {
  const events = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J']
  return {
    [HOOK_TYPES]: hookSource(events),
    'packages/ts-shell/src/dispatch.ts': dispatcherSource(events),
    [`${TOOLS_DIR}/registry.ts`]: registrySource(['createAlphaToolDefinition']),
    [`${TOOLS_DIR}/alpha.ts`]: toolSource(['createAlphaToolDefinition']),
    ...extra,
  }
}

test('passes when every event dispatches and every factory is registered', (t) => {
  const result = run(fixture(t, baseline()))
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /\[pass\] declarations/)
})

test('reports a hook event that nothing dispatches', (t) => {
  // The shape PostToolUseFailure, WorktreeCreate and WorktreeRemove had.
  const files = baseline()
  files[HOOK_TYPES] = hookSource(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'WorktreeCreate'])
  const result = run(fixture(t, files))
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /hook-event-without-dispatch - WorktreeCreate/)
})

test('reports a tool factory the registry never calls', (t) => {
  // The shape messagingTools.ts has: built, not offered.
  const files = baseline({ [`${TOOLS_DIR}/unused.ts`]: toolSource(['createUnusedToolDefinition']) })
  const result = run(fixture(t, files))
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /tool-factory-not-registered - createUnusedToolDefinition/)
})

test('an exempted factory name is reported as recorded, not as a finding', (t) => {
  // The exemption list is keyed by name, so it must actually suppress. A gate
  // that reported these anyway would train the reader to ignore its output.
  const files = baseline({
    [`${TOOLS_DIR}/messaging.ts`]: toolSource(['createListAgentsToolDefinition', 'createSendMessageToolDefinition']),
  })
  const result = run(fixture(t, files))
  assert.equal(result.status, 0, result.stdout)
  assert.match(result.stdout, /findings=0/)
})

test('does not count the declaration module itself as a dispatch site', (t) => {
  // A union member is written `| "Name"`, but the payload interface repeats
  // `eventName: "Name"`. If the gate scanned its own file it would find every
  // event dispatched and pass on all of them.
  const files = baseline()
  files[HOOK_TYPES] = hookSource(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'Phantom'])
    .replace('export interface BaseHookEventPayload {', 'export interface PhantomPayload {\n  readonly eventName: "Phantom";\n}\n\nexport interface BaseHookEventPayload {')
  const result = run(fixture(t, files))
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /hook-event-without-dispatch - Phantom/)
})

test('counts a dispatch from any production module', (t) => {
  const files = baseline({ 'packages/ts-shell/src/turn/tools.ts': dispatcherSource(['A']) })
  const result = run(fixture(t, files))
  assert.equal(result.status, 0, result.stdout)
})

test('fails loudly when the hook union is not found', (t) => {
  const files = baseline()
  files[HOOK_TYPES] = 'export type SomethingElse = "A";\n'
  const result = run(fixture(t, files))
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /declaration-gate-parse-failed/)
})

test('fails loudly when the union parses to fewer members than the floor', (t) => {
  // A renamed union that still matches the pattern would otherwise pass on the
  // one member it could see.
  const files = baseline()
  files[HOOK_TYPES] = hookSource(['A'])
  const result = run(fixture(t, files))
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /declaration-gate-parse-shrank/)
})

test('fails loudly when no tool factory is found', (t) => {
  const files = baseline()
  delete files[`${TOOLS_DIR}/alpha.ts`]
  const result = run(fixture(t, files))
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /declaration-gate-parse-shrank/)
})

test('fails loudly when the source tree is missing', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'declarations-empty-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const result = run(root)
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /declaration-gate-source-missing/)
})

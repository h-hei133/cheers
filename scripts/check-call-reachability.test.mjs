// Tests for check-call-reachability.mjs.
//
// The gate exists because the boundary analyser follows imports and imports are
// not calls: a tree full of correctly-registered modules whose behaviour nothing
// invokes was reported as fully reachable. The cases below are the shapes that
// mistake hides, plus the ways the gate could pass while checking nothing.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const gate = fileURLToPath(new URL('./check-call-reachability.mjs', import.meta.url))
const SRC = 'packages/ts-shell/src'

function run(root) {
  return spawnSync(process.execPath, [gate, root], { encoding: 'utf8' })
}

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'call-reach-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [rel, content] of Object.entries(files)) {
    const full = join(root, SRC, rel)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content)
  }
  return root
}

test('a module whose exported function nothing calls is reported', (t) => {
  const root = fixture(t, {
    'orphan.ts': 'export function neverCalled(): number { return 1 }\n',
    'caller.ts': 'export function live(): number { return 2 }\n',
    'entry.ts': 'import { live } from "./caller.js"\nexport const x = live()\n',
  })
  const result = run(root)
  assert.match(result.stderr, /orphan\.ts/)
  assert.doesNotMatch(result.stderr, /caller\.ts/)
})

test('an import is not a call', (t) => {
  // The shape the boundary analyser cannot see: imported, so reachable by its
  // rule, and never invoked by anything.
  const root = fixture(t, {
    'target.ts': 'export function buildThing(): number { return 1 }\n',
    'consumer.ts': 'import { buildThing } from "./target.js"\nexport const label = "buildThing"\n',
  })
  const result = run(root)
  assert.match(result.stderr, /target\.ts/)
})

test('a call through an object literal counts, so the module is not reported', (t) => {
  const root = fixture(t, {
    'impl.ts': 'export function doWork(): number { return 1 }\n',
    'contract.ts':
      'import { doWork } from "./impl.js"\nexport const c = { run: () => doWork() }\n',
  })
  const result = run(root)
  assert.doesNotMatch(result.stderr, /impl\.ts/)
})

test('a module that registers itself on import is not reported', (t) => {
  const root = fixture(t, {
    'endpoint.ts':
      'declareEndpoint("k", { path: () => "/x" })\nexport function endpointPath(): string { return "/x" }\n',
    'boot.ts': 'import "./endpoint.js"\nexport const ok = true\n',
  })
  const result = run(root)
  assert.doesNotMatch(result.stderr, /endpoint\.ts/)
})

test('an entry point is exempt, because the process calls it', (t) => {
  const root = fixture(t, {
    'entrypoints/cli.ts': 'export function main(): void {}\n',
  })
  const result = run(root)
  assert.doesNotMatch(result.stderr, /cli\.ts/)
})

test('a name mentioned only inside a comment does not count as a call', (t) => {
  const root = fixture(t, {
    'target.ts': 'export function ghost(): number { return 1 }\n',
    'note.ts': '// ghost() is the name of the thing we removed\nexport const x = 1\n',
  })
  const result = run(root)
  assert.match(result.stderr, /target\.ts/)
})

test('a name inside a string literal does not count as a call', (t) => {
  const root = fixture(t, {
    'target.ts': 'export function phantom(): number { return 1 }\n',
    'msg.ts': 'export const text = "call phantom() to start"\n',
  })
  const result = run(root)
  assert.match(result.stderr, /target\.ts/)
})

test('a call to a three-letter name counts, so it is not reported', (t) => {
  // Requiring three characters after the first made `new TUI(...)` invisible, and
  // an invisible use reads the same as no use: the gate called a live class dead.
  const root = fixture(t, {
    'engine.ts': 'export class TUI { render(): void {} }\n',
    'mode.ts':
      'import { TUI } from "./engine.js"\nexport const make = () => new TUI()\n',
  })
  const result = run(root)
  assert.doesNotMatch(result.stderr, /engine\.ts/)
})

test('a call from a .tsx file counts, so the callee is not reported', (t) => {
  // The CLI entry is the one `.tsx` in this tree. Scanning only `.ts` made its
  // calls invisible and the gate reported the functions it calls as dead.
  const root = fixture(t, {
    'boot.ts': 'export function runCliProcess(): void {}\n',
    'entrypoints/cli.tsx': 'import { runCliProcess } from "./boot.js"\nrunCliProcess()\n',
  })
  const result = run(root)
  assert.doesNotMatch(result.stderr, /boot\.ts/)
})

test('the gate passes on a tree where everything is called', (t) => {
  const root = fixture(t, {
    // `boot.ts` exports nothing, so there is no unused export of its own: the
    // fixture has to be clean in both directions or it tests the wrong thing.
    'impl.ts': 'export function used(): number { return 1 }\n',
    'boot.ts': 'import { used } from "./impl.js"\nconst v = used()\nconsole.log(v)\n',
  })
  const result = run(root)
  assert.equal(result.status, 0, result.stderr)
  assert.match(result.stdout, /\[pass\] call-reachability/)
})

test('an exported singleton counts as a use of the class it instantiates', (t) => {
  // `class T` is named in its own declaration and in the singleton's type, and
  // nowhere else. Checking classes without checking exported consts reported the
  // class dead while the app was importing the instance and running on it.
  const root = fixture(t, {
    'terminal.ts': 'export class Terminal {}\nexport const processTerminal = new Terminal()\n',
    'mode.ts': 'import { processTerminal } from "./terminal.js"\nconsole.log(processTerminal)\n',
  })
  const result = run(root)
  assert.doesNotMatch(result.stderr, /terminal\.ts/)
})

test('a tree with no source files cannot pass', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'call-reach-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const result = run(root)
  assert.equal(result.status, 3)
  assert.match(result.stderr, /holds no source files/)
})

test('a spread call counts, so the callee is not reported', (t) => {
  // `...renderSearchBar(...)` puts a dot before the name, and the member-access
  // exclusion read that as a property call. The function was reported dead
  // while its caller pushed its output into every frame it rendered.
  const root = fixture(t, {
    'bar.ts': 'export function renderSearchBar(): string[] { return [] }\n',
    'view.ts': 'import { renderSearchBar } from "./bar.js"\nexport const rows = [...renderSearchBar()]\n',
  })
  const result = run(root)
  assert.doesNotMatch(result.stderr, /bar\.ts/)
})

// Tests for check-node-floor.mjs.
//
// The gate exists because a runtime API newer than the declared floor reached the
// tree three times, and the third time was after the first two had been fixed by
// hand with a comment saying why. CI was red on every push while local runs, on a
// newer Node, were green. The cases below are the ones that happened, plus the
// ways the gate could pass while checking nothing.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const gate = fileURLToPath(new URL('./check-node-floor.mjs', import.meta.url))
const SRC = 'packages/ts-shell/src'

function manifest(engines) {
  return `${JSON.stringify({ name: 'fixture', version: '0.0.0', engines }, null, 2)}\n`
}

function run(root) {
  return spawnSync(process.execPath, [gate, root], { encoding: 'utf8' })
}

function fixture(t, files) {
  const root = mkdtempSync(join(tmpdir(), 'node-floor-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return root
}

function baseline(extra = {}) {
  return {
    'package.json': manifest({ node: '>=20.3.0' }),
    [`${SRC}/ok.ts`]: 'export const value = 1\n',
    ...extra,
  }
}

test('passes when nothing newer than the declared floor is used', (t) => {
  const result = run(fixture(t, baseline()))
  assert.equal(result.status, 0, result.stdout + result.stderr)
  assert.match(result.stdout, /\[pass\] node-floor/)
})

test('reports the API that actually reached the tree', (t) => {
  // The shape clipboardImage.ts had, after two other files had already been fixed
  // by hand for the same call.
  const files = baseline({
    [`${SRC}/clipboard.ts`]: 'const { promise } = Promise.withResolvers()\nexport default promise\n',
  })
  const result = run(fixture(t, files))
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /Promise\.withResolvers was added in 22\.0\.0/)
})

test('reports the line the call is on, not the line after a collapsed comment', (t) => {
  // A block comment above the call must not shift the number: a gate that points
  // at the wrong line sends the reader looking in the wrong place, which costs
  // more than not reporting at all.
  const files = baseline({
    [`${SRC}/commented.ts`]: `/**\n * Three\n * lines\n * of doc.\n */\nexport const x = Promise.withResolvers()\n`,
  })
  const result = run(fixture(t, files))
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /commented\.ts:6\b/)
})

test('finds a use written after a string containing two slashes', (t) => {
  // A `//` inside a string is not a comment. A plain regex strip treated the rest
  // of the line as one, so a real call after a URL went unreported — the gate
  // missing exactly what it exists for, in the file most likely to contain a URL.
  const files = baseline({
    [`${SRC}/url.ts`]: 'export const u = "https://x.test"; const y = Promise.withResolvers()\n',
    [`${SRC}/tpl.ts`]: 'const s = `a // b`\nconst t = Promise.withResolvers()\n',
  })
  const result = run(fixture(t, files))
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /url\.ts:1/)
  assert.match(result.stdout, /tpl\.ts:2/)
})

test('does not report an API named only in a comment', (t) => {
  // Both real fixes are prose saying not to use this call. If quoting that
  // guidance tripped the gate, the guidance would have to go.
  const files = baseline({
    [`${SRC}/explained.ts`]: '// Built by hand rather than with `Promise.withResolvers`, which needs Node 22.\nexport const value = 2\n',
    [`${SRC}/block.ts`]: '/* Object.groupBy is not available here. */\nexport const other = 3\n',
  })
  const result = run(fixture(t, files))
  assert.equal(result.status, 0, result.stdout)
})

test('passes when the declared floor is new enough', (t) => {
  // The same source, against a floor that has the API. This is what makes the
  // gate about the declaration rather than about a hardcoded opinion.
  const files = {
    'package.json': manifest({ node: '>=22.0.0' }),
    [`${SRC}/uses.ts`]: 'export const x = Promise.withResolvers()\n',
  }
  const result = run(fixture(t, files))
  assert.equal(result.status, 0, result.stdout)
})

test('fails loudly when the floor cannot be read', (t) => {
  // A gate that cannot run must say so rather than pass. Exiting 0 here would
  // make a deleted `engines` field look like a clean tree.
  const files = {
    'package.json': `${JSON.stringify({ name: 'fixture' })}\n`,
    [`${SRC}/ok.ts`]: 'export const value = 1\n',
  }
  const result = run(fixture(t, files))
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /no Node version is declared/)
})

test('fails loudly when the tree holds no source', (t) => {
  const files = { 'package.json': manifest({ node: '>=20.3.0' }) }
  const result = run(fixture(t, files))
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /nothing to check/)
})

test('ignores test files, which may name an API while asserting about it', (t) => {
  const files = baseline({
    [`${SRC}/thing.test.ts`]: 'export const x = Promise.withResolvers()\n',
  })
  const result = run(fixture(t, files))
  assert.equal(result.status, 0, result.stdout)
})

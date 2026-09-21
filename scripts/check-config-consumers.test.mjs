// Tests for check-config-consumers.mjs.
//
// The gate exists because a config field can be declared, defaulted and merged
// onto the resolved object while no code ever reads it, and nothing in the
// language objects. It was written after two such fields survived unnoticed, so
// the cases below are the ones that actually happened plus the ways the gate
// could pass while checking nothing.

import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const gate = fileURLToPath(new URL('./check-config-consumers.mjs', import.meta.url))
const CONFIG_PATH = 'packages/ts-shell/src/config/runtimeConfig.ts'

// A config module shaped like the real one: two interfaces, a defaults table and
// a merge function. `fields` are the RuntimeConfig members; `readers` names the
// fields some other module reads. Readers go in a separate file because the gate
// excludes the declaration module itself - a field read only by its own file has
// no consumer.
function configSource(fields) {
  const declarations = fields.map((f) => `  readonly ${f}?: number;`).join('\n')
  const defaults = fields.map((f) => `  ${f}: 1,`).join('\n')
  const merges = fields.map((f) => `    ${f}: merged.${f} ?? DEFAULT_CONFIG.${f},`).join('\n')
  return `export interface RuntimeConfig {
${declarations}
  readonly tui?: TuiPreferences;
}

export interface TuiPreferences {
  readonly statusItems?: readonly string[];
}

export interface RuntimeConfigFile {
${declarations}
}

const DEFAULT_CONFIG = {
${defaults}
};

export function getRuntimeConfig(): RuntimeConfig {
  return {
${merges}
  } as RuntimeConfig;
}
`
}

// A separate module that reads the named fields off the resolved config.
function readerSource(readers) {
  return `export function reads(config: RuntimeConfig): number[] {
  return [${readers.map((f) => `config.${f}`).join(', ')}];
}
`
}

function run(root) {
  return spawnSync(process.execPath, [gate, root], { encoding: 'utf8' })
}

function fixture(t, config, extras = {}) {
  const root = mkdtempSync(join(tmpdir(), 'config-consumers-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const files = { [CONFIG_PATH]: config, ...extras }
  for (const [path, contents] of Object.entries(files)) {
    const full = join(root, path)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, contents)
  }
  return root
}

test('passes when every declared field has a production reader', (t) => {
  const root = fixture(t, configSource(['alpha', 'beta']), {
    'packages/ts-shell/src/consumer.ts': readerSource(['alpha', 'beta', 'statusItems', 'tui']),
  })
  const result = run(root)
  assert.equal(result.status, 0, result.stderr)
})

test('reports a field that is declared, defaulted and merged but never read', (t) => {
  // The exact shape the two removed fields had.
  const root = fixture(t, configSource(['alpha', 'dead']), {
    'packages/ts-shell/src/consumer.ts': readerSource(['alpha', 'statusItems', 'tui']),
  })
  const result = run(root)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /config-field-without-consumer - dead/)
})

test('reports a field read only by a test as having no production reader', (t) => {
  // A test asserting a field's round trip does not make the field useful.
  const root = fixture(t, configSource(['alpha', 'dead']), {
    'packages/ts-shell/src/consumer.ts': readerSource(['alpha', 'statusItems', 'tui']),
    'packages/ts-shell/src/thing.test.ts': 'const x = config.dead;\n',
  })
  const result = run(root)
  assert.equal(result.status, 1, result.stdout)
  assert.match(result.stdout, /config-field-without-consumer - dead \(read only by 1 test file\(s\)\)/)
})

test('counts a field read from another production module as consumed', (t) => {
  const root = fixture(t, configSource(['alpha', 'beta']), {
    'packages/ts-shell/src/consumer.ts': readerSource(['alpha', 'beta', 'statusItems', 'tui']),
  })
  const result = run(root)
  assert.equal(result.status, 0, result.stderr)
})

test('fails loudly when a required interface cannot be found', (t) => {
  // A rename must not shrink the field list and pass on what remains.
  const root = fixture(t, 'export interface SomethingElse {\n  readonly alpha?: number;\n}\n')
  const result = run(root)
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /config-consumer-gate-interface-missing - RuntimeConfig/)
})

test('fails loudly when an interface declares no readonly fields', (t) => {
  const root = fixture(
    t,
    'export interface RuntimeConfig {\n  tui?: TuiPreferences;\n}\n\nexport interface TuiPreferences {\n  statusItems?: string;\n}\n',
  )
  const result = run(root)
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /config-consumer-gate-interface-empty - RuntimeConfig/)
})

test('fails loudly when the config module is absent', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'config-consumers-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const result = run(root)
  assert.equal(result.status, 3, result.stdout)
  assert.match(result.stdout, /config-consumer-gate-source-missing/)
})

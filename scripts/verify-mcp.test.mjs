import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { verifyContractReport } from './support/contract.mjs'
import * as routing from './verify-mcp-routing.mjs'
import * as local from './verify-mcp-local-execution.mjs'
import * as taxonomy from './verify-mcp-error-taxonomy.mjs'

const shell = fileURLToPath(new URL('../packages/ts-shell/', import.meta.url))
const stale = 'rejects an old registry contract after refresh without calling the replacement tool'
const unavailable = 'withdraws unavailable catalogs and refuses old registry calls before dispatch'

for (const [name, gate, critical] of [
  ['routing', routing, [stale, unavailable, 'hides /mcp when MCP command exposure is disabled']],
  ['local execution', local, [stale, unavailable, 'does not replay a call after disconnect and reconnects for a subsequent request']],
  ['error taxonomy', taxonomy, [unavailable, 'refuses unknown tools before dispatch with an explicit unavailable classification']],
]) {
  test(`${name} requires current suites and executed critical scenarios`, () => {
    const files = gate.contractSuites.map(file => path.join(shell, file))
    assert.equal(new Set(files).size, files.length)
    for (const file of files) assert.ok(fs.statSync(file).isFile(), file)
    for (const title of critical) assert.ok(gate.requiredAssertions.some(assertion => assertion.title === title), title)
    const required = gate.requiredAssertions.map(assertion => ({ ...assertion, file: path.join(shell, assertion.file) }))
    const passingAssertions = required.flatMap(assertion =>
      Array.from({ length: assertion.count ?? 1 }, () => ({ title: assertion.title, status: 'passed' })))
    const report = { success: true, numFailedTests: 0, numPassedTests: passingAssertions.length,
      testResults: files.map(file => ({ name: file, status: 'passed', assertionResults: [
        { title: 'unrelated assertion', status: 'passed' },
        ...required.filter(assertion => assertion.file === file).flatMap(assertion =>
          Array.from({ length: assertion.count ?? 1 }, () => ({ title: assertion.title, status: 'passed' }))),
      ] })),
    }
    assert.doesNotThrow(() => verifyContractReport(report, files, required))
    for (const assertion of required) {
      const missing = structuredClone(report)
      const suite = missing.testResults.find(result => result.name === assertion.file)
      const index = suite.assertionResults.findIndex(result => result.title === assertion.title)
      suite.assertionResults.splice(index, 1)
      assert.throws(() => verifyContractReport(missing, files, required), /required contract assertion/)
    }
  })
}

test('error taxonomy pins both report-safety variants', () => {
  const assertion = taxonomy.requiredAssertions.find(entry =>
    entry.title === 'canonicalizes protocol diagnostics before redaction and safe report projection')
  assert.equal(assertion?.count, 2)
})

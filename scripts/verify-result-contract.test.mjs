import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { verifyContractReport } from './verify-result-contract.mjs'

const file = path.resolve('contract.test.ts')
const passing = () => ({
  success: true, numFailedTests: 0, numPassedTests: 1,
  testResults: [{ name: file, status: 'passed', assertionResults: [{ status: 'passed' }] }],
})

test('accepts a report only with executed passing contract assertions', () => {
  assert.doesNotThrow(() => verifyContractReport(passing(), [file]))
  for (const report of [
    { ...passing(), numPassedTests: 0 },
    { ...passing(), testResults: [] },
    { ...passing(), testResults: [{ name: file, status: 'passed', assertionResults: [] }] },
  ]) assert.throws(() => verifyContractReport(report, [file]))
  assert.throws(() => verifyContractReport(passing(), [path.resolve('missing.test.ts')]))
})

test('rejects skipped, pending, todo and failed assertions despite runner success', () => {
  for (const status of ['skipped', 'pending', 'todo', 'failed']) {
    const report = passing()
    report.testResults[0].assertionResults.push({ status })
    assert.throws(() => verifyContractReport(report, [file]), /unpassed assertions/)
  }
})

test('rejects runner or suite failure and malformed reports', () => {
  for (const report of [undefined, {}, { ...passing(), success: false },
    { ...passing(), numFailedTests: 1 },
    { ...passing(), testResults: [{ name: file, status: 'failed', assertionResults: [{ status: 'passed' }] }] },
  ]) assert.throws(() => verifyContractReport(report, [file]))
})

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { verifyContractReport } from './verify-result-contract.mjs'
import {
  CONTRACT_EXIT_CODES,
  ContractGateError,
  classifyContractError,
  classifyContractRunner,
  cleanupSuccessfulGateArtifacts,
  contractClassificationForExitCode,
  runContractGate,
} from './support/contract.mjs'
import { releaseGateFailure } from './verify-release-core.mjs'

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

test('rejects a missing required scenario even when its suite has other passing assertions', () => {
  const required = [{ file, title: 'preserves the original operation' }]
  const report = passing()
  report.testResults[0].assertionResults[0].title = 'unrelated passing test'
  assert.throws(() => verifyContractReport(report, [file], required), /required contract assertion/)
  report.testResults[0].assertionResults.push({ title: required[0].title, status: 'passed' })
  assert.doesNotThrow(() => verifyContractReport(report, [file], required))
  assert.throws(() => verifyContractReport(report, [file], [{ file: path.resolve('other.test.ts'), title: 'test' }]), /Required assertion file/)
})

test('requires every declared variant of a parameterized contract scenario', () => {
  const required = [{ file, title: 'redacts both credential shapes', count: 2 }]
  const report = passing()
  report.testResults[0].assertionResults[0] = { title: required[0].title, status: 'passed' }
  assert.throws(() => verifyContractReport(report, [file], required), /1\/2/)
  report.testResults[0].assertionResults.push({ title: required[0].title, status: 'passed' })
  assert.doesNotThrow(() => verifyContractReport(report, [file], required))
})

test('classifies contract failures without collapsing product and setup states', async () => {
  const product = new ContractGateError('assertion drift', CONTRACT_EXIT_CODES.productRegression)
  assert.deepEqual(classifyContractError(product), {
    classification: 'product-regression',
    exitCode: CONTRACT_EXIT_CODES.productRegression,
  })
  assert.deepEqual(classifyContractError(new Error('unexpected')), {
    classification: 'execution-inconclusive',
    exitCode: CONTRACT_EXIT_CODES.inconclusive,
  })

  const base = { code: 0, timedOut: false, interrupted: undefined, cleanupUnconfirmed: false, launchError: undefined }
  assert.equal(classifyContractRunner(base), undefined)
  assert.equal(classifyContractRunner({ ...base, code: 1 }).exitCode, CONTRACT_EXIT_CODES.productRegression)
  for (const result of [
    { ...base, code: 1, timedOut: true },
    { ...base, code: 1, interrupted: 'SIGINT' },
    { ...base, code: 1, cleanupUnconfirmed: true },
    { ...base, code: null },
    { ...base, code: 1, launchError: 'spawn failed' },
  ]) {
    assert.equal(classifyContractRunner(result).exitCode, CONTRACT_EXIT_CODES.inconclusive)
  }

  try {
    verifyContractReport({}, [file])
    assert.fail('malformed reports must fail')
  } catch (error) {
    assert.equal(classifyContractError(error).exitCode, CONTRACT_EXIT_CODES.productRegression)
  }
  await assert.rejects(runContractGate('Bad Name', []), error =>
    classifyContractError(error).exitCode === CONTRACT_EXIT_CODES.configFailure)
  await assert.rejects(runContractGate('missing-suite', ['missing.test.ts']), error =>
    classifyContractError(error).exitCode === CONTRACT_EXIT_CODES.configFailure)
})

test('release orchestration preserves every gate exit classification', () => {
  assert.deepEqual(contractClassificationForExitCode(0), { classification: 'pass', exitCode: 0 })
  assert.deepEqual(contractClassificationForExitCode(1), {
    classification: 'product-regression',
    exitCode: 1,
  })
  assert.deepEqual(contractClassificationForExitCode(2), {
    classification: 'execution-inconclusive',
    exitCode: 2,
  })
  assert.deepEqual(contractClassificationForExitCode(3), {
    classification: 'config-failure',
    exitCode: 3,
  })
  assert.deepEqual(contractClassificationForExitCode(99), {
    classification: 'product-regression',
    exitCode: 1,
  })
  assert.deepEqual(releaseGateFailure('probe', 2), {
    classification: 'execution-inconclusive',
    exitCode: 2,
    message: '[execution-inconclusive] release-core - probe exited 2',
  })
  assert.deepEqual(releaseGateFailure('probe', 99), {
    classification: 'product-regression',
    exitCode: 1,
    message: '[product-regression] release-core - probe exited 99',
  })
})

test('successful gate cleanup reports an uncertain retained artifact', () => {
  assert.equal(cleanupSuccessfulGateArtifacts('/tmp/gate', () => {}), undefined)
  assert.equal(cleanupSuccessfulGateArtifacts('/tmp/gate', () => {
    throw new Error('locked by another process')
  }), 'locked by another process')
})

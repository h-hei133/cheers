#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')

export const contractSuites = [
  'src/result/terminal/truth.test.ts',
  'src/turn/session.test.ts',
  'src/core/shell/sessionRuntime.test.ts',
  'src/core/shell/providerReadiness.test.ts',
  'src/cli/interactive/turnSink.test.ts',
  'src/cli/print/result.test.ts',
]

// A successful runner exit alone also permits empty or skipped selections.
export function verifyContractReport(report, expectedFiles) {
  if (report?.success !== true || report.numFailedTests !== 0 || !(report.numPassedTests > 0)) {
    throw new Error('Runner did not report passing contract tests')
  }
  for (const file of expectedFiles) {
    const suite = report.testResults?.find(candidate =>
      typeof candidate.name === 'string' && path.resolve(candidate.name) === path.resolve(file))
    if (!suite || suite.status !== 'passed' || !Array.isArray(suite.assertionResults) || suite.assertionResults.length === 0) {
      throw new Error(`Missing or unsuccessful contract suite: ${file}`)
    }
    if (suite.assertionResults.some(assertion => assertion.status !== 'passed')) {
      throw new Error(`Contract suite contains unpassed assertions: ${file}`)
    }
  }
}

function isolatedEnvironment(home, tmp, root) {
  const env = {}
  for (const key of ['PATH', 'SystemRoot', 'WINDIR', 'COMSPEC', 'PATHEXT', 'LANG']) {
    if (process.env[key]) env[key] = process.env[key]
  }
  return { ...env, HOME: home, USERPROFILE: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp,
    CHEERS_SYNTHETIC_HOME: home, CHEERS_TEST_ROOT: root, CHEERS_REAL_HOME: '',
    CHEERS_PROVIDER_MODE: 'synthetic', NO_COLOR: '1' }
}

function runTests(vitestPath, reportPath, env) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [vitestPath, 'run', ...contractSuites,
      '--threads', 'false', '--reporter=json', '--outputFile', reportPath], {
      cwd: tsShellRoot, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
    })
    let output = Buffer.alloc(0)
    let timedOut = false
    const capture = chunk => { output = Buffer.concat([output, chunk]).subarray(-128 * 1024) }
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.on('error', error => capture(Buffer.from(error.message)))
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL') }, 240000)
    child.on('close', code => {
      clearTimeout(timer)
      resolve({ code, timedOut, output })
    })
  })
}

async function main() {
  const files = contractSuites.map(file => path.join(tsShellRoot, file))
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`Contract suite does not exist: ${file}`)
  }
  const vitestPath = [tsShellRoot, repoRoot]
    .map(root => path.join(root, 'node_modules', 'vitest', 'vitest.mjs'))
    .find(file => fs.existsSync(file))
  if (!vitestPath) throw new Error('Vitest is not installed')
  const tmpRoot = path.join(repoRoot, '.tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  const root = fs.mkdtempSync(path.join(tmpRoot, 'result-contract-'))
  const home = path.join(root, 'home')
  const tmp = path.join(root, 'tmp')
  fs.mkdirSync(home)
  fs.mkdirSync(tmp)
  const reportPath = path.join(root, 'tests.json')
  console.log(`gate=result-contract artifacts=${root}`)
  const result = await runTests(vitestPath, reportPath, isolatedEnvironment(home, tmp, root))
  fs.writeFileSync(path.join(root, 'runner.log'), result.output)
  if (result.code !== 0 || result.timedOut) {
    throw new Error(`Contract runner failed: exit=${result.code} timeout=${result.timedOut}; see runner.log`)
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  verifyContractReport(report, files)
  console.log(`[pass] result-contract: ${files.length} suites, ${report.numPassedTests} tests`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1 })
}

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')

export const CONTRACT_EXIT_CODES = Object.freeze({
  pass: 0,
  productRegression: 1,
  inconclusive: 2,
  configFailure: 3,
})

const CONTRACT_CLASSIFICATIONS = Object.freeze({
  [CONTRACT_EXIT_CODES.productRegression]: 'product-regression',
  [CONTRACT_EXIT_CODES.inconclusive]: 'execution-inconclusive',
  [CONTRACT_EXIT_CODES.configFailure]: 'config-failure',
})

export class ContractGateError extends Error {
  constructor(message, exitCode) {
    super(message)
    this.name = 'ContractGateError'
    this.exitCode = exitCode
    this.classification = CONTRACT_CLASSIFICATIONS[exitCode] ?? 'execution-inconclusive'
  }
}

function gateError(message, exitCode) {
  return new ContractGateError(message, exitCode)
}

export function classifyContractError(error) {
  if (error instanceof ContractGateError) {
    return { classification: error.classification, exitCode: error.exitCode }
  }
  return {
    classification: CONTRACT_CLASSIFICATIONS[CONTRACT_EXIT_CODES.inconclusive],
    exitCode: CONTRACT_EXIT_CODES.inconclusive,
  }
}

export function contractClassificationForExitCode(exitCode) {
  if (exitCode === CONTRACT_EXIT_CODES.pass) return { classification: 'pass', exitCode }
  if (exitCode === CONTRACT_EXIT_CODES.inconclusive
    || exitCode === CONTRACT_EXIT_CODES.configFailure
    || exitCode === CONTRACT_EXIT_CODES.productRegression) {
    return { classification: CONTRACT_CLASSIFICATIONS[exitCode], exitCode }
  }
  return {
    classification: CONTRACT_CLASSIFICATIONS[CONTRACT_EXIT_CODES.productRegression],
    exitCode: CONTRACT_EXIT_CODES.productRegression,
  }
}

export function classifyContractRunner(result) {
  if (result.timedOut || result.interrupted || result.cleanupUnconfirmed || result.launchError || result.code === null) {
    return gateError(
      `Contract runner was inconclusive: exit=${result.code} timeout=${result.timedOut} `
        + `interrupted=${result.interrupted ?? 'no'} cleanup-unconfirmed=${result.cleanupUnconfirmed}`
        + `${result.launchError ? ` launch-error=${result.launchError}` : ''}`,
      CONTRACT_EXIT_CODES.inconclusive,
    )
  }
  if (result.code !== 0) {
    return gateError(`Contract runner failed with exit=${result.code}`, CONTRACT_EXIT_CODES.productRegression)
  }
  return undefined
}

export function cleanupSuccessfulGateArtifacts(root, remove = fs.rmSync) {
  try {
    remove(root, { recursive: true, force: true })
    return undefined
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
}

// A successful runner exit alone also permits empty or skipped selections.
export function verifyContractReport(report, expectedFiles, requiredAssertions = []) {
  if (report?.success !== true || report.numFailedTests !== 0 || !(report.numPassedTests > 0)) {
    throw gateError('Runner did not report passing contract tests', CONTRACT_EXIT_CODES.productRegression)
  }
  for (const file of expectedFiles) {
    const suite = report.testResults?.find(candidate =>
      typeof candidate.name === 'string' && path.resolve(candidate.name) === path.resolve(file))
    if (!suite || suite.status !== 'passed' || !Array.isArray(suite.assertionResults) || suite.assertionResults.length === 0) {
      throw gateError(`Missing or unsuccessful contract suite: ${file}`, CONTRACT_EXIT_CODES.productRegression)
    }
    if (suite.assertionResults.some(assertion => assertion.status !== 'passed')) {
      throw gateError(`Contract suite contains unpassed assertions: ${file}`, CONTRACT_EXIT_CODES.productRegression)
    }
  }
  for (const { file, title, count = 1 } of requiredAssertions) {
    if (!Number.isSafeInteger(count) || count < 1) {
      throw gateError(`Required assertion count must be a positive integer: ${file}: ${title}`,
        CONTRACT_EXIT_CODES.configFailure)
    }
    if (!expectedFiles.some(expected => path.resolve(expected) === path.resolve(file))) {
      throw gateError(`Required assertion file is not in the contract suites: ${file}`,
        CONTRACT_EXIT_CODES.configFailure)
    }
    const suite = report.testResults?.find(candidate =>
      typeof candidate.name === 'string' && path.resolve(candidate.name) === path.resolve(file))
    const passed = suite?.assertionResults?.filter(assertion => assertion.title === title
      && assertion.status === 'passed').length ?? 0
    if (passed < count) {
      throw gateError(`Missing required contract assertion: ${file}: ${title} (${passed}/${count})`,
        CONTRACT_EXIT_CODES.productRegression)
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
    CHEERS_PROVIDER_MODE: 'synthetic', NO_COLOR: '1', GIT_CEILING_DIRECTORIES: root }
}

function terminateRunner(child) {
  if (process.platform !== 'win32') {
    try { process.kill(-child.pid, 'SIGKILL') } catch { child.kill('SIGKILL') }
    return
  }
  const killer = spawn(path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'taskkill.exe'),
    ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore', windowsHide: true, shell: false })
  const timer = setTimeout(() => { killer.kill('SIGKILL'); killer.unref() }, 2000)
  killer.once('error', () => clearTimeout(timer))
  killer.once('close', () => clearTimeout(timer))
}

export function runTests(vitestPath, reportPath, env, suites, tsShellRoot, timeoutMs = 240000) {
  return new Promise(resolve => {
    const child = spawn(process.execPath, [vitestPath, 'run', ...suites,
      '--threads', 'false', '--reporter=json', '--outputFile', reportPath], {
      cwd: tsShellRoot, env, stdio: ['ignore', 'pipe', 'pipe'], shell: false,
      detached: process.platform !== 'win32', windowsHide: true,
    })
    let output = Buffer.alloc(0)
    let timedOut = false
    let interrupted
    let launchError
    let stopping = false
    let settled = false
    let drainTimer
    const capture = chunk => { output = Buffer.concat([output, chunk]).subarray(-128 * 1024) }
    const finish = (code, cleanupUnconfirmed = false) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      clearTimeout(drainTimer)
      process.off('SIGINT', onInterrupt)
      process.off('SIGTERM', onTerminate)
      process.off('exit', onExit)
      child.stdout.destroy()
      child.stderr.destroy()
      if (cleanupUnconfirmed) child.unref()
      resolve({ code, timedOut, interrupted, cleanupUnconfirmed, launchError, output })
    }
    const stop = () => {
      if (settled || stopping) return
      stopping = true
      clearTimeout(timer)
      if (child.pid) terminateRunner(child)
      else child.kill('SIGKILL')
      // Escaped descendants or failed termination must not make the gate wait indefinitely.
      drainTimer = setTimeout(() => finish(null, true), 2000)
    }
    const onInterrupt = () => { interrupted = 'SIGINT'; stop() }
    const onTerminate = () => { interrupted = 'SIGTERM'; stop() }
    const onExit = () => { if (!settled && child.pid) terminateRunner(child) }
    process.on('SIGINT', onInterrupt)
    process.on('SIGTERM', onTerminate)
    process.on('exit', onExit)
    child.stdout.on('data', capture)
    child.stderr.on('data', capture)
    child.on('error', error => {
      launchError = error.message
      capture(Buffer.from(error.message))
    })
    const timer = setTimeout(() => {
      timedOut = true
      // The runner owns a process group: killing only its leader leaves inherited pipes open.
      stop()
    }, timeoutMs)
    child.once('close', code => finish(code))
  })
}

export async function runContractGate(name, suites, requiredAssertions = []) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || !Array.isArray(suites) || !suites.length || new Set(suites).size !== suites.length) {
    throw gateError('A gate requires a name and distinct non-empty suites', CONTRACT_EXIT_CODES.configFailure)
  }
  if (!Array.isArray(requiredAssertions) || requiredAssertions.some(assertion =>
    typeof assertion?.file !== 'string' || typeof assertion?.title !== 'string'
      || !Number.isSafeInteger(assertion.count ?? 1) || (assertion.count ?? 1) < 1)) {
    throw gateError('Required assertions need a file, title and positive integer count',
      CONTRACT_EXIT_CODES.configFailure)
  }
  const files = suites.map(file => path.join(tsShellRoot, file))
  for (const file of files) {
    if (!fs.existsSync(file)) throw gateError(`Contract suite does not exist: ${file}`, CONTRACT_EXIT_CODES.configFailure)
  }
  for (const assertion of requiredAssertions) {
    if (!files.some(file => path.resolve(file) === path.resolve(path.join(tsShellRoot, assertion.file)))) {
      throw gateError(`Required assertion file is not in the contract suites: ${assertion.file}`,
        CONTRACT_EXIT_CODES.configFailure)
    }
  }
  const vitestPath = [tsShellRoot, repoRoot]
    .map(root => path.join(root, 'node_modules', 'vitest', 'vitest.mjs'))
    .find(file => fs.existsSync(file))
  if (!vitestPath) throw gateError('Vitest is not installed', CONTRACT_EXIT_CODES.configFailure)
  const tmpRoot = path.join(repoRoot, '.tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  const root = fs.mkdtempSync(path.join(tmpRoot, name + '-'))
  const home = path.join(root, 'home')
  const tmp = path.join(root, 'tmp')
  fs.mkdirSync(home)
  fs.mkdirSync(tmp)
  const reportPath = path.join(root, 'tests.json')
  console.log(`gate=${name} failure-artifacts=${root}`)
  const result = await runTests(vitestPath, reportPath, isolatedEnvironment(home, tmp, root), suites, tsShellRoot)
  fs.writeFileSync(path.join(root, 'runner.log'), result.output)
  const runnerFailure = classifyContractRunner(result)
  if (runnerFailure) {
    runnerFailure.message += `; see ${path.join(root, 'runner.log')}`
    throw runnerFailure
  }
  let report
  try {
    report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  } catch (error) {
    throw gateError(`Contract runner report is unreadable: ${error instanceof Error ? error.message : String(error)}`,
      CONTRACT_EXIT_CODES.configFailure)
  }
  verifyContractReport(report, files, requiredAssertions.map(assertion => ({
    ...assertion, file: path.join(tsShellRoot, assertion.file),
  })))
  console.log(`[pass] ${name}: ${files.length} suites, ${report.numPassedTests} tests`)
  const cleanupError = cleanupSuccessfulGateArtifacts(root)
  if (cleanupError) {
    console.error(`[cleanup-inconclusive] successful gate artifacts retained at ${root}: ${cleanupError}`)
  }
}

export async function runContractGateCli(name, suites, requiredAssertions = []) {
  console.log('status taxonomy: pass=0 product-regression=1 execution-inconclusive=2 config-failure=3')
  try {
    await runContractGate(name, suites, requiredAssertions)
  } catch (error) {
    const { classification, exitCode } = classifyContractError(error)
    console.error(`[${classification}] ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = exitCode
  }
}

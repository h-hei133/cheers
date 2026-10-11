import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')

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
      resolve({ code, timedOut, interrupted, cleanupUnconfirmed, output })
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
    child.on('error', error => capture(Buffer.from(error.message)))
    const timer = setTimeout(() => {
      timedOut = true
      // The runner owns a process group: killing only its leader leaves inherited pipes open.
      stop()
    }, timeoutMs)
    child.once('close', code => finish(code))
  })
}

export async function runContractGate(name, suites) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || !Array.isArray(suites) || !suites.length || new Set(suites).size !== suites.length) throw new Error('A gate requires a name and distinct non-empty suites')
  const files = suites.map(file => path.join(tsShellRoot, file))
  for (const file of files) {
    if (!fs.existsSync(file)) throw new Error(`Contract suite does not exist: ${file}`)
  }
  const vitestPath = [tsShellRoot, repoRoot]
    .map(root => path.join(root, 'node_modules', 'vitest', 'vitest.mjs'))
    .find(file => fs.existsSync(file))
  if (!vitestPath) throw new Error('Vitest is not installed')
  const tmpRoot = path.join(repoRoot, '.tmp')
  fs.mkdirSync(tmpRoot, { recursive: true })
  const root = fs.mkdtempSync(path.join(tmpRoot, name + '-'))
  const home = path.join(root, 'home')
  const tmp = path.join(root, 'tmp')
  fs.mkdirSync(home)
  fs.mkdirSync(tmp)
  const reportPath = path.join(root, 'tests.json')
  console.log(`gate=${name} artifacts=${root}`)
  const result = await runTests(vitestPath, reportPath, isolatedEnvironment(home, tmp, root), suites, tsShellRoot)
  fs.writeFileSync(path.join(root, 'runner.log'), result.output)
  if (result.code !== 0 || result.timedOut || result.interrupted || result.cleanupUnconfirmed) {
    throw new Error(`Contract runner failed: exit=${result.code} timeout=${result.timedOut} interrupted=${result.interrupted ?? 'no'} cleanup-unconfirmed=${result.cleanupUnconfirmed}; see runner.log`)
  }
  const report = JSON.parse(fs.readFileSync(reportPath, 'utf8'))
  verifyContractReport(report, files)
  console.log(`[pass] ${name}: ${files.length} suites, ${report.numPassedTests} tests`)
}

#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { getRealProviderHome, getTestRoot } from './support/testPaths.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const cliEntryPath = path.join(
  repoRoot,
  'packages',
  'ts-shell',
  'dist',
  'packages',
  'ts-shell',
  'src',
  'entrypoints',
  'cli.js',
)
const realHome = getRealProviderHome({ allowDefault: true })
const testRoot = getTestRoot()
const runtimeHome = process.env.HOME?.trim() || path.join(testRoot, 'lightweight-chat-home')
const projectRoot = path.join(testRoot, 'lightweight-chat-project')
const prompt = '这是一次测试'

const networkFailurePattern =
  /(provider-readiness:network|provider-network-inconclusive|ConnectTimeoutError|HeadersTimeoutError|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout|unreachable)/i
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const authorizationBearerPattern =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const keyValueSecretPattern =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const openAiStyleKeyPattern = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const secretQueryParamPattern =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi
const posixPrivateAgentsRealHomePattern =
  /\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi

function run(command, args, options = {}) {
  return new Promise((resolve) => {
    const env = {}
    for (const [key, value] of Object.entries({ ...process.env, ...(options.env ?? {}) })) {
      if (typeof value === 'string') env[key] = value
    }
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stdout = ''
    let stderr = ''
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, options.timeoutMs ?? 240000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({
        code: -1,
        timedOut: false,
        stdout,
        stderr: `${stderr}${error.message}`,
        output: `${stdout}${stderr}${error.message}`,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, timedOut, stdout, stderr, output: `${stdout}${stderr}` })
    })
  })
}

function runToFiles(command, args, options = {}) {
  return new Promise((resolve) => {
    fs.mkdirSync(testRoot, { recursive: true })
    const captureDir = fs.mkdtempSync(path.join(testRoot, 'lightweight-chat-output-'))
    const stdoutPath = path.join(captureDir, 'stdout.txt')
    const stderrPath = path.join(captureDir, 'stderr.txt')
    const stdoutFd = fs.openSync(stdoutPath, 'w')
    const stderrFd = fs.openSync(stderrPath, 'w')
    const env = {}
    for (const [key, value] of Object.entries({ ...process.env, ...(options.env ?? {}) })) {
      if (typeof value === 'string') env[key] = value
    }
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env,
      stdio: ['ignore', stdoutFd, stderrFd],
      shell: false,
    })
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, options.timeoutMs ?? 240000)

    child.on('error', (error) => {
      clearTimeout(timer)
      fs.closeSync(stdoutFd)
      fs.closeSync(stderrFd)
      const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : ''
      const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : ''
      resolve({
        code: -1,
        timedOut: false,
        stdout,
        stderr: `${stderr}${error.message}`,
        output: `${stdout}${stderr}${error.message}`,
      })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      fs.closeSync(stdoutFd)
      fs.closeSync(stderrFd)
      const stdout = fs.existsSync(stdoutPath) ? fs.readFileSync(stdoutPath, 'utf8') : ''
      const stderr = fs.existsSync(stderrPath) ? fs.readFileSync(stderrPath, 'utf8') : ''
      resolve({ code: code ?? -1, timedOut, stdout, stderr, output: `${stdout}${stderr}` })
    })
  })
}

function redactProviderOutput(input) {
  return String(input ?? '')
    .replace(
      authorizationBearerPattern,
      (_match, prefix, quote) => `${prefix}${quote}Bearer [REDACTED]`,
    )
    .replace(bearerTokenPattern, 'Bearer [REDACTED]')
    .replace(
      keyValueSecretPattern,
      (_match, key, separator, quote) => `${key}${separator}${quote}[REDACTED]`,
    )
    .replace(openAiStyleKeyPattern, '[REDACTED_API_KEY]')
    .replace(secretQueryParamPattern, '$1[REDACTED]')
    .replace(posixPrivateAgentsRealHomePattern, '[REAL_PROVIDER_HOME]')
}

function summarizeOutput(output) {
  return redactProviderOutput(output)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-18)
    .join('\n')
}

async function readRepoStatusShort() {
  const result = await run('git', ['status', '--short'], { cwd: repoRoot, timeoutMs: 30000 })
  return {
    ok: result.code === 0 && !result.timedOut,
    status: result.stdout.trim(),
    output: result.output,
  }
}

function snapshotProject() {
  const files = new Map()
  if (!fs.existsSync(projectRoot)) {
    return files
  }
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name)
      const relativePath = path.relative(projectRoot, absolutePath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        visit(absolutePath)
      } else {
        files.set(relativePath, fs.readFileSync(absolutePath, 'utf8'))
      }
    }
  }
  visit(projectRoot)
  return files
}

function changedFiles(before, after) {
  const names = new Set([...before.keys(), ...after.keys()])
  return [...names].filter((name) => before.get(name) !== after.get(name)).sort()
}

function prepareIsolatedProject() {
  fs.rmSync(projectRoot, { recursive: true, force: true })
  fs.mkdirSync(projectRoot, { recursive: true })
  fs.writeFileSync(
    path.join(projectRoot, 'README.md'),
    'Lightweight chat smoke fixture. This file must remain unchanged.\n',
    'utf8',
  )
}

function assertNoSecretLeak(redactedOutput) {
  return !/Bearer\s+(?!\[REDACTED\])\S+/i.test(redactedOutput) &&
    !/sk-[A-Za-z0-9][A-Za-z0-9._-]{8,}/.test(redactedOutput) &&
    !/(access[_-]?token|refresh[_-]?token|api[_-]?key)\s*[:=]\s*(?!\[REDACTED\])\S+/i.test(redactedOutput)
}

async function main() {
  console.log('gate name=real-provider-lightweight-chat-smoke')
  console.log('status taxonomy: PASS=0 FAIL=1 PROVIDER_NETWORK=2 CONFIG=3')
  console.log('mode=lightweight-chat')
  console.log(`repo=${repoRoot}`)
  console.log(`runtimeHome=${runtimeHome}`)
  console.log(`testRoot=${testRoot}`)

  if (!realHome) {
    console.log('[CONFIG] real provider home is not configured; set PRIVATE_AGENTS_REAL_HOME to opt in')
    process.exit(3)
  }
  if (!fs.existsSync(realHome)) {
    console.log('[CONFIG] real provider home path is missing')
    process.exit(3)
  }
  if (!fs.existsSync(cliEntryPath)) {
    console.log('[CONFIG] built CLI is missing; run npm run build -w packages/ts-shell first')
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    console.log(`repositoryClean=false`)
    console.log('[FAIL] repository must be clean before lightweight chat smoke')
    if (repoBefore.output) console.log(summarizeOutput(repoBefore.output))
    process.exit(1)
  }

  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  prepareIsolatedProject()
  const before = snapshotProject()

  const result = await runToFiles(process.execPath, [
    cliEntryPath,
    '--project',
    projectRoot,
    '--provider',
    'openai-compatible',
    '--print',
    prompt,
  ], {
    cwd: repoRoot,
    env: {
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      PRIVATE_AGENTS_HOME_OVERRIDE: realHome,
      PRIVATE_AGENTS_REAL_HOME: realHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'real',
      PRIVATE_AGENTS_PROVIDER_TRANSPORT_DIAGNOSTICS: '1',
      PRIVATE_AGENTS_PROVIDER_NO_PROXY: process.env.PRIVATE_AGENTS_PROVIDER_NO_PROXY ?? '*',
    },
    timeoutMs: 240000,
  })

  const after = snapshotProject()
  const fixtureChanged = changedFiles(before, after)
  const repoAfter = await readRepoStatusShort()
  const redactedOutput = redactProviderOutput(result.output)
  const providerCalls =
    redactedOutput.match(/\[provider-transport\]\s+host=/g)?.length ?? 0
  const redactionPassed = assertNoSecretLeak(redactedOutput)
  const repositoryClean = repoAfter.ok && !repoAfter.status
  const noToolWriteRoute =
    !/Actions:|Approvals:|\[tool:|\[approval\]|apply_patch|Changed files:/i.test(redactedOutput)
  const plainChatSucceeded =
    result.code === 0 &&
    !result.timedOut &&
    /Result\s+- Outcome: success\s+- Detail: completed/s.test(redactedOutput)

  console.log(`providerCalls=${providerCalls}`)
  console.log(`childExit=${result.timedOut ? 'timeout' : result.code}`)
  console.log(`fixtureChanged=${fixtureChanged.join(',') || 'none'}`)
  console.log(`repositoryClean=${repositoryClean}`)
  console.log(`redaction=${redactionPassed ? 'pass' : 'fail'}`)
  console.log(`noToolWriteRoute=${noToolWriteRoute}`)
  console.log(`plainChatSucceeded=${plainChatSucceeded}`)

  if (
    result.timedOut ||
    (!plainChatSucceeded && networkFailurePattern.test(redactedOutput))
  ) {
    console.log('[PROVIDER_NETWORK] real-provider-lightweight-chat-smoke')
    console.log(summarizeOutput(redactedOutput))
    process.exit(2)
  }

  const failures = []
  if (!plainChatSucceeded) failures.push('plain chat did not complete successfully')
  if (providerCalls !== 1) failures.push(`provider call count expected 1, got ${providerCalls}`)
  if (fixtureChanged.length !== 0) failures.push(`fixture changed: ${fixtureChanged.join(',')}`)
  if (!repositoryClean) failures.push('repository is not clean after smoke')
  if (!redactionPassed) failures.push('redaction failed')
  if (!noToolWriteRoute) failures.push('tool/write route evidence appeared')

  if (failures.length > 0) {
    console.log(`[FAIL] real-provider-lightweight-chat-smoke ${failures.join('; ')}`)
    console.log(`outputTail=${summarizeOutput(redactedOutput) || 'empty'}`)
    process.exit(1)
  }

  console.log('[PASS] real-provider-lightweight-chat-smoke')
}

main().catch((error) => {
  console.error(redactProviderOutput(error instanceof Error ? error.stack ?? error.message : String(error)))
  process.exit(1)
})

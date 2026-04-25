#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')

const syntheticHome = 'D:/Test/pca-home-synth'
const realHome = 'D:/Test/home-sf'
const reportPath = 'D:/Test/test-results/real-user-capabilities-report.json'
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const includeCandidates = process.argv.includes('--include-candidates')

const failureCategories = [
  'none',
  'provider-readiness',
  'task-execution-failure',
  'verification-failed',
  'verification-blocked',
  'protected-file-changed',
  'assertion-mismatch',
  'environment-filesystem-issue',
]

const futureGateCandidates = [
  {
    id: 'real-small-project-smoke',
    status: 'candidate-not-run',
    provider: 'real',
    projectShape: {
      requiredFiles: ['src/utils.js', 'src/app.js', 'README.md', 'project.json', 'LOCKED.md'],
      roles: {
        code: ['src/utils.js', 'src/app.js'],
        docs: ['README.md'],
        configLike: ['project.json'],
        protected: ['project.json', 'LOCKED.md'],
      },
    },
    contract: [
      'turn1 multi-file sync: greet -> welcome across src/utils.js, src/app.js, README.md',
      'turn1 protected unchanged: project.json and LOCKED.md',
      'turn1 low-risk contains/unchanged verification passed',
      'turn2 README-only correction changes README.md only',
      'turn2 protected unchanged: src/utils.js, src/app.js, project.json, LOCKED.md',
      'turn2 README contains welcome() and welcome("Ada")',
      'turn2 low-risk contains/unchanged verification passed',
    ],
    requiredReportFields: [
      'capability',
      'projectDir',
      'sessionId',
      'changedFiles',
      'protectedFiles',
      'verification',
      'failureCategory',
      'failureReason',
      'reportPath',
    ],
    promotionCriteria: [
      'real-provider path remains stable for repeated manual runs',
      'failure categories stay actionable without parsing output tails',
      'runtime remains low enough for explicit real release gate',
      'no new verification type or provider/auth behavior is required',
    ],
    releaseRealDecision: 'deferred: keep out of verify:release:real until the candidate has repeated stability evidence',
  },
]

const scenarios = [
  {
    id: 'synthetic-single-file-protected-verify',
    provider: 'synthetic',
    projectDir: `D:/Test/pca-capability-gate-synthetic-${runId}`,
    files: {
      'LOCKED.md': 'Do not modify this file.\n',
    },
    protectedFiles: ['LOCKED.md'],
    turns: [
      {
        prompt: 'Create file note.txt with content: hello capability gate. Do NOT modify LOCKED.md. Verify note.txt contains hello capability gate and LOCKED.md is unchanged.',
        expectChanged: ['note.txt'],
        expectContains: {
          'note.txt': ['hello capability gate'],
        },
      },
    ],
  },
  {
    id: 'real-small-bugfix-followup-verify',
    provider: 'real',
    projectDir: `D:/Test/pca-capability-gate-real-bugfix-${runId}`,
    files: {
      'math.js': 'export function double(n) {\n  return n + 2;\n}\n',
      'README.md': 'double(3) should return 6.\n',
      'LOCKED.md': 'Do not modify this file.\n',
    },
    protectedFiles: ['README.md', 'LOCKED.md'],
    turns: [
      {
        prompt: 'There is a bug in math.js: double(3) should return 6, but the implementation is wrong. Fix the bug in math.js. Do NOT modify README.md. Do NOT modify LOCKED.md. Verify math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.',
        expectChanged: ['math.js'],
        expectContains: {
          'math.js': ['n * 2'],
        },
      },
      {
        prompt: 'Correction: add a short comment above double explaining that it doubles a number. Only modify math.js. Verify math.js contains doubles a number and math.js contains n * 2 and README.md is unchanged and LOCKED.md is unchanged.',
        expectChanged: ['math.js'],
        expectContains: {
          'math.js': ['doubles a number', 'n * 2'],
        },
      },
    ],
  },
  {
    id: 'real-multifile-consistency-verify',
    provider: 'real',
    projectDir: `D:/Test/pca-capability-gate-real-multifile-${runId}`,
    files: {
      'todo.txt': 'ship minimal CLI smoke\ndocument one follow-up\nverify multi-file follow-up\n',
      'plan.txt': '- ship minimal CLI smoke\n- document one follow-up\n',
      'LOCKED.md': 'Do not modify this file.\n',
    },
    protectedFiles: ['todo.txt', 'LOCKED.md'],
    turns: [
      {
        prompt: 'Replace plan.txt with exactly this content:\n```text\n- ship minimal CLI smoke\n- document one follow-up\n- verify multi-file follow-up\n```\nDo NOT modify todo.txt. Do NOT modify LOCKED.md. Verify todo.txt and plan.txt stay consistent and LOCKED.md is unchanged.',
        expectChanged: ['plan.txt'],
        expectContains: {
          'plan.txt': ['ship minimal CLI smoke', 'document one follow-up', 'verify multi-file follow-up'],
        },
      },
    ],
  },
]

const candidateScenarios = [
  {
    id: 'real-small-project-smoke',
    provider: 'real',
    projectDir: `D:/Test/pca-candidate-real-small-project-${runId}`,
    files: {
      'src/utils.js': 'export function greet(name = "world") {\n  return "Hello, " + name;\n}\n',
      'src/app.js': 'import { greet } from "./utils.js";\n\nexport const message = greet("Ada");\n',
      'README.md': 'Use greet("Ada") to say hello.\n',
      'project.json': '{"name":"candidate-smoke","private":true}\n',
      'LOCKED.md': 'Do not modify this file.\n',
    },
    protectedFiles: ['src/utils.js', 'src/app.js', 'project.json', 'LOCKED.md'],
    turns: [
      {
        prompt: 'Rename exported function greet to welcome. Update src/utils.js, src/app.js, and README.md so they consistently use welcome. Do NOT modify project.json. Do NOT modify LOCKED.md. Verify src/utils.js contains export function welcome and src/app.js contains welcome and README.md contains welcome("Ada") and project.json is unchanged and LOCKED.md is unchanged.',
        protectedFiles: ['project.json', 'LOCKED.md'],
        expectChanged: ['README.md', 'src/app.js', 'src/utils.js'],
        expectContains: {
          'src/utils.js': ['export function welcome'],
          'src/app.js': ['welcome'],
          'README.md': ['welcome("Ada")'],
        },
      },
      {
        prompt: 'Correction: README.md should show welcome() as the primary example, but keep welcome("Ada") as a second example. Only modify README.md. Verify README.md contains welcome() and README.md contains welcome("Ada") and src/utils.js is unchanged and src/app.js is unchanged and project.json is unchanged and LOCKED.md is unchanged.',
        protectedFiles: ['src/utils.js', 'src/app.js', 'project.json', 'LOCKED.md'],
        expectChanged: ['README.md'],
        expectContains: {
          'README.md': ['welcome()', 'welcome("Ada")'],
        },
      },
    ],
  },
]

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
    }, options.timeoutMs ?? 300000)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      clearTimeout(timer)
      resolve({ code: -1, timedOut: false, stdout, stderr: `${stderr}${error.message}`, output: `${stdout}${stderr}${error.message}` })
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: code ?? -1, timedOut, stdout, stderr, output: `${stdout}${stderr}` })
    })
  })
}

function ensureHome(home, provider) {
  if (!fs.existsSync(home)) {
    throw Object.assign(new Error(`${provider} home is missing: ${home}`), { configFailure: true })
  }
}

function prepareProject(scenario) {
  fs.rmSync(scenario.projectDir, { recursive: true, force: true })
  fs.mkdirSync(scenario.projectDir, { recursive: true })
  for (const [relativePath, content] of Object.entries(scenario.files)) {
    const absolutePath = path.join(scenario.projectDir, relativePath)
    fs.mkdirSync(path.dirname(absolutePath), { recursive: true })
    fs.writeFileSync(absolutePath, content, 'utf8')
  }
}

function snapshot(projectDir) {
  const result = new Map()
  const visit = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absolutePath = path.join(dir, entry.name)
      const relativePath = path.relative(projectDir, absolutePath).replace(/\\/g, '/')
      if (entry.isDirectory()) {
        visit(absolutePath)
      } else {
        result.set(relativePath, fs.readFileSync(absolutePath, 'utf8'))
      }
    }
  }
  visit(projectDir)
  return result
}

function changedFiles(before, after) {
  const names = new Set([...before.keys(), ...after.keys()])
  return [...names].filter((name) => before.get(name) !== after.get(name)).sort()
}

function summarizeOutput(output) {
  return output
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-18)
    .join('\n')
}

function providerEnv(provider) {
  if (provider === 'synthetic') {
    return {
      HOME: syntheticHome,
      USERPROFILE: syntheticHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'synthetic',
    }
  }
  return {
    HOME: realHome,
    USERPROFILE: realHome,
  }
}

async function runCliTurn(scenario, turnIndex, prompt) {
  return run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    scenario.projectDir,
    '--non-interactive-approval',
    'allow-once',
    '--print',
    prompt,
  ], {
    cwd: tsShellRoot,
    env: providerEnv(scenario.provider),
    timeoutMs: scenario.provider === 'real' ? 420000 : 240000,
  })
}

async function readCurrentSessionId(scenario) {
  const result = await run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    scenario.projectDir,
    '--print',
    '/sessions current',
  ], {
    cwd: tsShellRoot,
    env: providerEnv(scenario.provider),
    timeoutMs: 120000,
  })
  const match = result.output.match(/- ID:\s*(\S+)/)
  return match?.[1] ?? '(unknown)'
}

function assertScenarioState(scenario, turn, beforeTurn, afterTurn, output) {
  const failures = []
  const observedChanged = changedFiles(beforeTurn, afterTurn)
  const expectedChanged = [...turn.expectChanged].sort()
  const unexpectedChanges = observedChanged.filter((name) => !expectedChanged.includes(name))
  const missingChanges = expectedChanged.filter((name) => !observedChanged.includes(name))

  if (unexpectedChanges.length > 0) {
    failures.push(`unexpected changed files: ${unexpectedChanges.join(', ')}`)
  }
  if (missingChanges.length > 0) {
    failures.push(`expected changed files not changed: ${missingChanges.join(', ')}`)
  }

  const protectedFiles = turn.protectedFiles ?? scenario.protectedFiles
  for (const protectedFile of protectedFiles) {
    if (beforeTurn.get(protectedFile) !== afterTurn.get(protectedFile)) {
      failures.push(`protected file changed: ${protectedFile}`)
    }
  }

  for (const [relativePath, markers] of Object.entries(turn.expectContains ?? {})) {
    const content = afterTurn.get(relativePath)
    if (typeof content !== 'string') {
      failures.push(`expected file missing: ${relativePath}`)
      continue
    }
    for (const marker of markers) {
      if (!content.includes(marker)) {
        failures.push(`missing marker in ${relativePath}: ${marker}`)
      }
    }
  }

  const verificationPassed = /Verification:\s*passed/i.test(output) || /verification passed/i.test(output)
  if (!verificationPassed) {
    failures.push('verification did not report passed')
  }

  return {
    ok: failures.length === 0,
    failures,
    changedFiles: observedChanged,
    verification: verificationPassed ? 'passed' : 'missing',
  }
}

function categorizeFailure(failureReason) {
  const normalized = String(failureReason ?? '').toLowerCase()
  if (!normalized.trim()) return 'none'
  if (
    normalized.includes('home is missing') ||
    normalized.includes('provider') ||
    normalized.includes('auth') ||
    normalized.includes('credential')
  ) {
    return 'provider-readiness'
  }
  if (
    normalized.includes('timed out') ||
    normalized.includes('enoent') ||
    normalized.includes('eacces') ||
    normalized.includes('filesystem')
  ) {
    return 'environment-filesystem-issue'
  }
  if (normalized.includes('protected file changed')) {
    return 'protected-file-changed'
  }
  if (
    normalized.includes('verification did not report passed') ||
    normalized.includes('verification blocked')
  ) {
    return 'verification-blocked'
  }
  if (normalized.includes('verification failed')) {
    return 'verification-failed'
  }
  if (
    normalized.includes('missing marker') ||
    normalized.includes('expected file missing') ||
    normalized.includes('expected changed files not changed')
  ) {
    return 'assertion-mismatch'
  }
  return 'task-execution-failure'
}

async function runScenario(scenario) {
  prepareProject(scenario)
  let previousSnapshot = snapshot(scenario.projectDir)
  const turnResults = []
  let sessionId = '(pending)'

  for (const [index, turn] of scenario.turns.entries()) {
    const runResult = await runCliTurn(scenario, index, turn.prompt)
    if (runResult.code !== 0 || runResult.timedOut) {
      return {
        capability: scenario.id,
        provider: scenario.provider,
        status: 'FAIL',
        projectDir: scenario.projectDir,
        sessionId,
        changedFiles: [],
        protectedFiles: scenario.protectedFiles,
        reportPath,
        verification: 'blocked',
        failureCategory: categorizeFailure(
          runResult.timedOut ? `turn ${index + 1} timed out` : `turn ${index + 1} exited ${runResult.code}`,
        ),
        failureReason: runResult.timedOut ? `turn ${index + 1} timed out` : `turn ${index + 1} exited ${runResult.code}`,
        outputTail: summarizeOutput(runResult.output),
        turns: turnResults,
      }
    }

    sessionId = await readCurrentSessionId(scenario)

    const nextSnapshot = snapshot(scenario.projectDir)
    const assertion = assertScenarioState(scenario, turn, previousSnapshot, nextSnapshot, runResult.output)
    turnResults.push({
      turn: index + 1,
      changedFiles: assertion.changedFiles,
      verification: assertion.verification,
      outputTail: summarizeOutput(runResult.output),
    })
    if (!assertion.ok) {
      return {
        capability: scenario.id,
        provider: scenario.provider,
        status: 'FAIL',
        projectDir: scenario.projectDir,
        sessionId,
        changedFiles: assertion.changedFiles,
        protectedFiles: scenario.protectedFiles,
        reportPath,
        verification: assertion.verification,
        failureCategory: categorizeFailure(assertion.failures.join('; ')),
        failureReason: assertion.failures.join('; '),
        outputTail: summarizeOutput(runResult.output),
        turns: turnResults,
      }
    }
    previousSnapshot = nextSnapshot
  }

  const allChangedFiles = [...new Set(turnResults.flatMap((turn) => turn.changedFiles))].sort()
  return {
    capability: scenario.id,
    provider: scenario.provider,
    status: 'PASS',
    projectDir: scenario.projectDir,
    sessionId,
    changedFiles: allChangedFiles,
    protectedFiles: scenario.protectedFiles,
    reportPath,
    verification: 'passed',
    failureCategory: 'none',
    failureReason: '',
    turns: turnResults,
  }
}

function writeReport(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function buildCandidateMetadata(candidateResults) {
  return futureGateCandidates.map((candidate) => {
    const result = candidateResults.find((entry) => entry.capability === candidate.id)
    if (!result) return candidate
    return {
      ...candidate,
      status: result.status === 'PASS' ? 'candidate-pass' : 'candidate-fail',
      dryRun: {
        projectDir: result.projectDir,
        sessionId: result.sessionId,
        changedFiles: result.changedFiles,
        protectedFiles: result.protectedFiles,
        verification: result.verification,
        failureCategory: result.failureCategory,
        failureReason: result.failureReason,
      },
    }
  })
}

async function main() {
  console.log('gate name=real-user-capabilities')
  console.log('status taxonomy: PASS=0 FAIL=1 CONFIG=3')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real HOME=${realHome}`)
  console.log('homeCreated=false')
  console.log(`candidateMode=${includeCandidates ? 'include-candidates' : 'off'}`)

  try {
    ensureHome(syntheticHome, 'synthetic')
    ensureHome(realHome, 'real')
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      status: 'CONFIG',
      reportPath,
      failureCategory: 'provider-readiness',
      failureReason: error.message,
      failureCategories,
      futureGateCandidates,
      candidates: [],
      capabilities: [],
    }
    writeReport(report)
    console.log(`[CONFIG] ${error.message}`)
    console.log(`report=${reportPath}`)
    process.exit(3)
  }

  const capabilities = []
  for (const scenario of scenarios) {
    const result = await runScenario(scenario)
    capabilities.push(result)
    const suffix = result.status === 'PASS' ? `verification=${result.verification}` : result.failureReason
    console.log(`[${result.status}] ${scenario.id} - provider=${scenario.provider} project=${scenario.projectDir} session=${result.sessionId} ${suffix}`)
  }

  const candidates = []
  if (includeCandidates) {
    for (const scenario of candidateScenarios) {
      const result = await runScenario(scenario)
      candidates.push(result)
      const suffix = result.status === 'PASS' ? `verification=${result.verification}` : result.failureReason
      console.log(`[${result.status}] candidate:${scenario.id} - provider=${scenario.provider} project=${scenario.projectDir} session=${result.sessionId} ${suffix}`)
    }
  }

  const ok =
    capabilities.every((capability) => capability.status === 'PASS') &&
    candidates.every((candidate) => candidate.status === 'PASS')
  const report = {
    generatedAt: new Date().toISOString(),
    status: ok ? 'PASS' : 'FAIL',
    reportPath,
    failureCategories,
    futureGateCandidates: buildCandidateMetadata(candidates),
    capabilities,
    candidates,
  }
  writeReport(report)
  console.log(`report=${reportPath}`)
  process.exit(ok ? 0 : 1)
}

main().catch((error) => {
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'FAIL',
    reportPath,
    failureCategory: categorizeFailure(error.message),
    failureReason: error.stack ?? error.message,
    failureCategories,
    futureGateCandidates,
    candidates: [],
    capabilities: [],
  }
  writeReport(report)
  console.error(error)
  process.exit(1)
})

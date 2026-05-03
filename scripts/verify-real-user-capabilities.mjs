#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import {
  cleanupReadonlyFixture,
  compareReadonlySnapshots,
  createReadonlyCodingFixture,
  snapshotReadonlyFixture,
} from './real-provider-readonly-fixture.mjs'
import {
  redactAndAssertReadonlyProviderOutput,
} from './real-provider-readonly-redaction.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')

const syntheticHome = 'D:/Test/pca-home-synth'
const realHome = 'D:/Test/home-sf'
const reportPath = 'D:/Test/test-results/real-user-capabilities-report.json'
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const includeCandidates = process.argv.includes('--include-candidates')
const includeContinueSmoke = process.argv.includes('--include-continue-smoke')
const showHelp = process.argv.includes('--help') || process.argv.includes('-h')
const turnBoundaryDryRun = process.argv.includes('--turn-boundary-dry-run')
const terminalResultSurfaceDryRun = process.argv.includes('--terminal-result-surface-dry-run')
const toolExecutionPlanningDryRun = process.argv.includes('--tool-execution-planning-dry-run')
const failureFollowupContextDryRun = process.argv.includes('--failure-followup-context-dry-run')
const realReadonlyCodingDryRun = process.argv.includes('--real-readonly-coding-dry-run')

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

const providerNetworkFailurePattern =
  /(provider-readiness:network|provider-network-inconclusive|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|network|socket hang up|TLS|timeout|unreachable|kind[:= ]+network)/i
const providerConfigFailurePattern =
  /(provider-readiness:(missing-key|missing-config|unsupported-provider)|missing.*config|failed to parse.*config|config\.json|missing.*key|api key|apikey|not connected|connect first|credentials|missing baseUrl|baseUrl is missing|model is missing)/i
const providerAuthFailurePattern =
  /(provider-readiness:auth|authentication was rejected|invalid authentication|invalid api key|unauthorized|forbidden|401|403|kind[:= ]+authentication)/i
const realHomeConfigPattern =
  /[A-Za-z]:[\\/]+Test[\\/]+home-sf[\\/]+\.private-agents[\\/]+config\.json/gi
const bearerTokenPattern = /Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const authorizationBearerPattern =
  /\b(authorization\s*[:=]\s*)(["']?)Bearer\s+[A-Za-z0-9._~+/=-]+/gi
const keyValueSecretPattern =
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|x-api-key)(\s*[:=]\s*)(["']?)[^\s"'`,;]+/gi
const openAiStyleKeyPattern = /\b(sk-[A-Za-z0-9][A-Za-z0-9._-]{8,})\b/g
const secretQueryParamPattern =
  /([?&](?:api[_-]?key|access[_-]?token|refresh[_-]?token|id[_-]?token|token|key|signature|sig)=)[^&\s"'`<>]+/gi

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
  {
    id: 'real-completed-continue-followup-verify',
    status: 'candidate-not-run',
    provider: 'real',
    projectShape: {
      requiredFiles: ['math.js', 'README.md', 'LOCKED.md'],
      roles: {
        code: ['math.js'],
        docs: ['README.md'],
        protected: ['README.md', 'LOCKED.md'],
      },
    },
    contract: [
      'turn1 completed session: exact math.js replacement and verification passed',
      'turn2 bare /continue <follow-up> stays on the same session id',
      'turn2 changed files remain limited to math.js',
      'turn2 transcript/output exposes changed files and verification evidence',
      'protected unchanged: README.md and LOCKED.md',
    ],
    requiredReportFields: [
      'capability',
      'projectDir',
      'sessionId',
      'turns[].sessionId',
      'turns[].mode',
      'turns[].changedFiles',
      'turns[].transcriptEvidence',
      'verification',
      'failureCategory',
      'failureReason',
    ],
    promotionCriteria: [
      'same-session /continue behavior passes repeatedly under real provider',
      'provider/network failures remain distinguishable from product failures',
      'transcript evidence stays stable without parsing long output tails',
    ],
    releaseRealDecision: 'deferred: keep out of default verify-real-user-capabilities until repeated real-provider stability is observed',
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
  {
    id: 'real-completed-continue-followup-verify',
    provider: 'real',
    projectDir: `D:/Test/pca-candidate-real-continue-${runId}`,
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
        continueCompletedSession: true,
        expectSameSession: true,
        expectChanged: ['math.js'],
        expectContains: {
          'math.js': ['doubles a number', 'n * 2'],
        },
        expectTranscriptContains: ['math.js', 'Verification: passed'],
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

function providerReadinessStatusForCode(code) {
  if (code === 0) return 'pass'
  if (code === 2) return 'provider-network-inconclusive'
  if (code === 3) return 'config-failure'
  return 'provider-readiness-failed'
}

async function runProviderReadinessPreflight() {
  const result = await run(process.execPath, [
    path.join(repoRoot, 'scripts', 'verify-provider-readiness.mjs'),
  ], {
    cwd: repoRoot,
    timeoutMs: 660000,
  })
  return {
    ok: result.code === 0 && !result.timedOut,
    code: result.timedOut ? 2 : result.code,
    status: result.timedOut
      ? 'provider-network-inconclusive'
      : providerReadinessStatusForCode(result.code),
    outputTail: summarizeOutput(result.output),
  }
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
  return redactProviderOutput(output)
    .split(/\r?\n/)
    .filter(Boolean)
    .slice(-18)
    .join('\n')
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
    .replace(realHomeConfigPattern, '[REAL_PROVIDER_CONFIG_PATH]')
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
  const cliPrompt = scenario.turns[turnIndex]?.continueCompletedSession
    ? `/continue ${prompt}`
    : prompt
  return run(process.execPath, [
    tsxCliPath,
    cliEntryPath,
    '--project',
    scenario.projectDir,
    '--non-interactive-approval',
    'allow-once',
    '--print',
    cliPrompt,
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

function readSessionTranscript(scenario, sessionId) {
  const home = scenario.provider === 'real' ? realHome : syntheticHome
  const transcriptPath = path.join(home, '.private-agents', 'sessions', sessionId, 'transcript.jsonl')
  try {
    return fs.readFileSync(transcriptPath, 'utf8')
  } catch {
    return ''
  }
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

function isProviderReadinessOutput(output) {
  const normalized = String(output ?? '').toLowerCase()
  return (
    hasExplicitProviderReadinessMarker(normalized) ||
    providerNetworkFailurePattern.test(normalized) ||
    providerConfigFailurePattern.test(normalized) ||
    providerAuthFailurePattern.test(normalized)
  )
}

function hasExplicitProviderReadinessMarker(output) {
  const normalized = String(output ?? '').toLowerCase()
  return (
    normalized.includes('provider readiness failed') ||
    normalized.includes('provider-readiness') ||
    normalized.includes('unable to reach the openai-compatible endpoint')
  )
}

function classifyProviderReadinessFailure(failureReason, output, provider) {
  const normalized = `${String(failureReason ?? '')}\n${String(output ?? '')}`
  if (provider !== 'real' && !hasExplicitProviderReadinessMarker(normalized)) {
    return undefined
  }
  if (providerNetworkFailurePattern.test(normalized)) {
    return {
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      reason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
    }
  }
  if (providerAuthFailurePattern.test(normalized)) {
    return {
      statusDetail: 'config-failure',
      exitCode: 3,
      reason: 'provider-readiness:auth: provider authentication failed during this turn',
    }
  }
  if (providerConfigFailurePattern.test(normalized)) {
    return {
      statusDetail: 'config-failure',
      exitCode: 3,
      reason: 'provider-readiness:missing-config: provider credential or endpoint configuration is incomplete',
    }
  }
  if (isProviderReadinessOutput(normalized)) {
    return {
      statusDetail: 'provider-readiness-failed',
      exitCode: 1,
      reason: 'provider-readiness:unknown: provider readiness failed during this turn',
    }
  }
  return undefined
}

function categorizeFailure(failureReason, output, provider) {
  if (classifyProviderReadinessFailure(failureReason, output, provider)) {
    return 'provider-readiness'
  }
  const normalized = `${String(failureReason ?? '')}\n${String(output ?? '')}`.toLowerCase()
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

function normalizeFailureReason(failureReason, output, provider) {
  return classifyProviderReadinessFailure(failureReason, output, provider)?.reason ?? failureReason
}

function summarizeFailureStatus(results) {
  const failed = results.filter((entry) => entry.status !== 'PASS')
  if (failed.length === 0) {
    return { statusDetail: 'passed', exitCode: 0 }
  }

  const providerFailures = failed
    .filter((entry) => entry.failureCategory === 'provider-readiness')
    .map((entry) =>
      classifyProviderReadinessFailure(
        entry.failureReason,
        entry.outputTail,
        entry.provider,
      ) ?? {
        statusDetail: 'provider-readiness-failed',
        exitCode: 1,
      },
    )

  if (providerFailures.length === failed.length) {
    if (providerFailures.some((entry) => entry.statusDetail === 'provider-network-inconclusive')) {
      return { statusDetail: 'provider-network-inconclusive', exitCode: 2 }
    }
    if (providerFailures.some((entry) => entry.statusDetail === 'config-failure')) {
      return { statusDetail: 'config-failure', exitCode: 3 }
    }
    return { statusDetail: 'provider-readiness-failed', exitCode: 1 }
  }

  return { statusDetail: 'failed', exitCode: 1 }
}

function nextActionForFailureSurface(failureCategory, statusDetail) {
  if (failureCategory === 'provider-readiness') {
    if (statusDetail === 'provider-network-inconclusive') {
      return 'Retry when the provider endpoint is reachable; do not treat this as a product regression.'
    }
    if (statusDetail === 'config-failure') {
      return 'Fix provider configuration or authentication outside this run, then retry the same capability gate.'
    }
    return 'Inspect provider readiness output, fix the provider state, then retry the same capability gate.'
  }
  if (failureCategory === 'verification-failed' || failureCategory === 'verification-blocked') {
    return 'Repair the verification failure and rerun the focused check.'
  }
  if (failureCategory === 'protected-file-changed') {
    return 'Restore the protected file, then rerun with a narrower instruction.'
  }
  if (failureCategory === 'assertion-mismatch') {
    return 'Inspect changed files and rerun the scenario after correcting the mismatch.'
  }
  if (failureCategory === 'environment-filesystem-issue') {
    return 'Fix the local filesystem or sandbox permission issue, then rerun the gate.'
  }
  return 'Inspect the model/tool execution output, fix the failed step, then retry.'
}

function buildTerminalResultSurface(result) {
  const status = summarizeFailureStatus([result])
  const failureCategory = result.failureCategory ?? 'none'
  const outputTail = summarizeOutput(result.outputTail ?? '')
  const failureReason = redactProviderOutput(result.failureReason ?? '')
  if (result.status === 'PASS') {
    return {
      outcome: 'success',
      statusDetail: status.statusDetail,
      failureCategory,
      failureReason: '',
      nextAction: 'Continue with the next task.',
      outputTail,
    }
  }
  return {
    outcome: failureCategory === 'provider-readiness' ? 'provider-failure' : 'stopped',
    statusDetail: status.statusDetail,
    failureCategory,
    failureReason,
    nextAction: nextActionForFailureSurface(failureCategory, status.statusDetail),
    outputTail,
  }
}

function buildFailureFollowupContext(result, followupPrompt) {
  const surface = buildTerminalResultSurface(result)
  return {
    previousOutcome: surface.outcome,
    blocker: surface.failureCategory,
    statusDetail: surface.statusDetail,
    reason: surface.failureReason,
    doNext: surface.nextAction,
    followupPrompt: redactProviderOutput(followupPrompt),
    contextLine: [
      `previousOutcome=${surface.outcome}`,
      `blocker=${surface.failureCategory}`,
      `status=${surface.statusDetail}`,
      surface.failureReason ? `reason=${surface.failureReason}` : '',
      `DoNext=${surface.nextAction}`,
      `followup=${redactProviderOutput(followupPrompt)}`,
    ].filter(Boolean).join(' | '),
  }
}

function renderTerminalResultSurface(result) {
  const surface = buildTerminalResultSurface(result)
  const parts = [
    `Outcome: ${surface.outcome}`,
    `Category: ${surface.failureCategory}`,
    `Status: ${surface.statusDetail}`,
  ]
  if (surface.failureReason) {
    parts.push(`Reason: ${surface.failureReason}`)
  }
  parts.push(`NextAction: ${surface.nextAction}`)
  return parts.join(' | ')
}

const benignCommandAllowlist = new Set(['node --version', 'npm --version'])

function normalizeSlashes(value) {
  return String(value ?? '').replace(/\\/g, '/')
}

function isInsideSyntheticOrTempWorkspace(value) {
  const normalized = normalizeSlashes(value).toLowerCase()
  return (
    normalized.startsWith('d:/test/pca-home-synth') ||
    normalized.startsWith('d:/test/pca-tool-planning-') ||
    normalized.startsWith('c:/tmp/')
  )
}

function isRealProviderHomePath(value) {
  return normalizeSlashes(value).toLowerCase().startsWith('d:/test/home-sf')
}

function buildToolExecutionPlanningAudit(plan) {
  if (plan.providerStatus && plan.providerStatus !== 'ready') {
    return {
      decision: 'provider-gated',
      execute: false,
      reason: 'provider failure must stop before tool execution',
      nextAction: 'Fix provider readiness before evaluating tool execution.',
    }
  }

  const target = plan.targetPath ?? plan.projectDir ?? ''
  if (target && isRealProviderHomePath(target)) {
    return {
      decision: 'blocked-real-home',
      execute: false,
      reason: 'tool plan targets real-provider home',
      nextAction: 'Use a synthetic/test workspace; never target real-provider configuration files.',
    }
  }

  if (plan.writes && !isInsideSyntheticOrTempWorkspace(target)) {
    return {
      decision: 'blocked-dangerous-write',
      execute: false,
      reason: 'write plan is outside synthetic/test workspace',
      nextAction: 'Move the fixture into a synthetic/test workspace before allowing execution.',
    }
  }

  if (plan.tool === 'bash') {
    if (!benignCommandAllowlist.has(plan.command ?? '')) {
      return {
        decision: 'blocked-command-not-allowlisted',
        execute: false,
        reason: 'command is not in the benign dry-run allowlist',
        nextAction: 'Restrict the audit to allowlisted benign commands.',
      }
    }
    if (plan.approval !== 'explicit-allow') {
      return {
        decision: 'approval-required',
        execute: false,
        reason: 'tool execution requires explicit approval',
        nextAction: 'Ask for explicit approval before executing even benign real-provider-planned tools.',
      }
    }
    return {
      decision: 'allow-benign-command',
      execute: true,
      reason: 'allowlisted benign command with explicit approval',
      nextAction: 'Execute only inside the controlled audit harness.',
    }
  }

  if (plan.tool === 'read-file') {
    return {
      decision: 'allow-read-only',
      execute: true,
      reason: 'read-only tool plan in synthetic/test workspace',
      nextAction: 'Read only the controlled fixture and preserve sanitized output.',
    }
  }

  return {
    decision: 'blocked-unknown-tool',
    execute: false,
    reason: 'tool is outside this audit boundary',
    nextAction: 'Add a focused audit case before allowing this tool family.',
  }
}

async function runScenario(scenario) {
  prepareProject(scenario)
  let previousSnapshot = snapshot(scenario.projectDir)
  const turnResults = []
  let sessionId = '(pending)'

  for (const [index, turn] of scenario.turns.entries()) {
    const previousSessionId = sessionId
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
          runResult.output,
          scenario.provider,
        ),
        failureReason: normalizeFailureReason(
          runResult.timedOut ? `turn ${index + 1} timed out` : `turn ${index + 1} exited ${runResult.code}`,
          runResult.output,
          scenario.provider,
        ),
        outputTail: summarizeOutput(runResult.output),
        turns: turnResults,
      }
    }

    sessionId = await readCurrentSessionId(scenario)

    const nextSnapshot = snapshot(scenario.projectDir)
    const assertion = assertScenarioState(scenario, turn, previousSnapshot, nextSnapshot, runResult.output)
    if (
      turn.expectSameSession &&
      previousSessionId !== '(pending)' &&
      sessionId !== previousSessionId
    ) {
      assertion.ok = false
      assertion.failures.push(`session id changed during completed /continue: before=${previousSessionId} after=${sessionId}`)
    }
    const transcript = readSessionTranscript(scenario, sessionId)
    for (const marker of turn.expectTranscriptContains ?? []) {
      if (!transcript.includes(marker) && !runResult.output.includes(marker)) {
        assertion.ok = false
        assertion.failures.push(`continuation transcript missing marker: ${marker}`)
      }
    }
    turnResults.push({
      turn: index + 1,
      mode: turn.continueCompletedSession ? 'continue-completed-session' : 'prompt',
      sessionId,
      changedFiles: assertion.changedFiles,
      verification: assertion.verification,
      transcriptEvidence: (turn.expectTranscriptContains ?? []).filter(
        (marker) => transcript.includes(marker) || runResult.output.includes(marker),
      ),
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
        failureCategory: categorizeFailure(assertion.failures.join('; '), runResult.output, scenario.provider),
        failureReason: normalizeFailureReason(assertion.failures.join('; '), runResult.output, scenario.provider),
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

function runTurnBoundaryDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=turn-boundary-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-network-mid-turn',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output:
        'provider-readiness:network fetch failed while waiting for model turn Authorization: Bearer sk-live-secret',
      expectedCategory: 'provider-readiness',
      expectedStatusDetail: 'provider-network-inconclusive',
      expectedExitCode: 2,
    },
    {
      name: 'provider-auth-mid-turn',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output: 'provider-readiness:auth authentication was rejected with api_key=sk-live-secret',
      expectedCategory: 'provider-readiness',
      expectedStatusDetail: 'config-failure',
      expectedExitCode: 3,
    },
    {
      name: 'provider-config-redacted',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output:
        'Failed to parse D:/Test/home-sf/.private-agents/config.json: refresh_token=refresh-secret',
      expectedCategory: 'provider-readiness',
      expectedStatusDetail: 'config-failure',
      expectedExitCode: 3,
    },
    {
      name: 'tool-execution-failure',
      provider: 'real',
      failureReason: 'turn 1 exited 1',
      output: 'Tool execution failed: command exited 1',
      expectedCategory: 'task-execution-failure',
      expectedStatusDetail: 'failed',
      expectedExitCode: 1,
    },
    {
      name: 'verification-failed',
      provider: 'real',
      failureReason: 'verification failed: expected marker was not present',
      output: 'Result\nOutcome: stopped\nVerification failed',
      expectedCategory: 'verification-failed',
      expectedStatusDetail: 'failed',
      expectedExitCode: 1,
    },
  ]

  let ok = true
  for (const item of cases) {
    const result = {
      status: 'FAIL',
      provider: item.provider,
      failureCategory: categorizeFailure(item.failureReason, item.output, item.provider),
      failureReason: normalizeFailureReason(item.failureReason, item.output, item.provider),
      outputTail: summarizeOutput(item.output),
    }
    const failureStatus = summarizeFailureStatus([result])
    const redacted =
      !result.outputTail.includes('sk-live-secret') &&
      !result.outputTail.includes('refresh-secret') &&
      !result.outputTail.includes('.private-agents/config.json')
    const passed =
      result.failureCategory === item.expectedCategory &&
      failureStatus.statusDetail === item.expectedStatusDetail &&
      failureStatus.exitCode === item.expectedExitCode &&
      redacted
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] ${item.name} category=${result.failureCategory} status=${failureStatus.statusDetail} exit=${failureStatus.exitCode}`,
    )
    ok = ok && passed
  }

  const passStatus = summarizeFailureStatus([
    {
      status: 'PASS',
      provider: 'real',
      failureCategory: 'none',
      failureReason: '',
      outputTail: 'Result\nOutcome: success',
    },
  ])
  const passOk = passStatus.statusDetail === 'passed' && passStatus.exitCode === 0
  console.log(
    `[${passOk ? 'PASS' : 'FAIL'}] model-turn-success-boundary status=${passStatus.statusDetail} exit=${passStatus.exitCode}`,
  )
  ok = ok && passOk

  process.exit(ok ? 0 : 1)
}

function runTerminalResultSurfaceDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=terminal-result-surface-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-network-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
        outputTail: 'provider-readiness:network fetch failed Authorization: Bearer sk-live-secret',
      },
      expected: ['Outcome: provider-failure', 'Category: provider-readiness', 'Status: provider-network-inconclusive', 'NextAction: Retry when the provider endpoint is reachable'],
      forbidden: ['sk-live-secret', '.private-agents/config.json'],
    },
    {
      name: 'provider-auth-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:auth: provider authentication failed during this turn',
        outputTail: 'provider-readiness:auth api_key=sk-live-secret',
      },
      expected: ['Outcome: provider-failure', 'Category: provider-readiness', 'Status: config-failure', 'NextAction: Fix provider configuration or authentication'],
      forbidden: ['sk-live-secret'],
    },
    {
      name: 'model-tool-failure-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'task-execution-failure',
        failureReason: 'Tool execution failed: command exited 1',
        outputTail: 'Tool execution failed: command exited 1',
      },
      expected: ['Outcome: stopped', 'Category: task-execution-failure', 'Status: failed', 'NextAction: Inspect the model/tool execution output'],
      forbidden: ['sk-live-secret'],
    },
    {
      name: 'verification-stopped-terminal-result',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'verification-failed',
        failureReason: 'verification failed: expected marker was not present',
        outputTail: 'Result\nOutcome: stopped\nVerification failed',
      },
      expected: ['Outcome: stopped', 'Category: verification-failed', 'Status: failed', 'NextAction: Repair the verification failure'],
      forbidden: [],
    },
  ]

  let ok = true
  for (const item of cases) {
    const line = renderTerminalResultSurface(item.result)
    const hasExpected = item.expected.every((marker) => line.includes(marker))
    const avoidsForbidden = item.forbidden.every((marker) => !line.includes(marker))
    const passed = hasExpected && avoidsForbidden
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${item.name} - ${line}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runFailureFollowupContextDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=failure-followup-context-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('followupExecution=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-network-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
        outputTail: 'provider-readiness:network fetch failed Authorization: Bearer sk-live-secret',
      },
      followupPrompt: 'retry the same task after network recovers',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=provider-readiness',
        'status=provider-network-inconclusive',
        'reason=provider-readiness:network',
        'DoNext=Retry when the provider endpoint is reachable',
      ],
      forbidden: ['sk-live-secret', '.private-agents/config.json'],
    },
    {
      name: 'provider-auth-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'provider-readiness',
        failureReason: 'provider-readiness:auth: provider authentication failed during this turn',
        outputTail: 'provider-readiness:auth api_key=sk-live-secret',
      },
      followupPrompt: 'continue once I fix credentials',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=provider-readiness',
        'status=config-failure',
        'reason=provider-readiness:auth',
        'DoNext=Fix provider configuration or authentication',
      ],
      forbidden: ['sk-live-secret'],
    },
    {
      name: 'tool-failure-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'task-execution-failure',
        failureReason: 'Tool execution failed: command exited 1',
        outputTail: 'Tool execution failed: command exited 1',
      },
      followupPrompt: 'try the safe command instead',
      expected: [
        'previousOutcome=stopped',
        'blocker=task-execution-failure',
        'status=failed',
        'reason=Tool execution failed',
        'DoNext=Inspect the model/tool execution output',
      ],
      forbidden: [],
    },
    {
      name: 'verification-followup-context',
      result: {
        status: 'FAIL',
        provider: 'real',
        failureCategory: 'verification-failed',
        failureReason: 'verification failed: expected marker was not present',
        outputTail: 'Result\nOutcome: stopped\nVerification failed',
      },
      followupPrompt: 'repair the missing marker',
      expected: [
        'previousOutcome=stopped',
        'blocker=verification-failed',
        'status=failed',
        'reason=verification failed',
        'DoNext=Repair the verification failure',
      ],
      forbidden: [],
    },
  ]

  let ok = true
  for (const item of cases) {
    const context = buildFailureFollowupContext(item.result, item.followupPrompt)
    const hasExpected = item.expected.every((marker) => context.contextLine.includes(marker))
    const avoidsForbidden = item.forbidden.every((marker) => !context.contextLine.includes(marker))
    const passed = hasExpected && avoidsForbidden
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${item.name} - ${context.contextLine}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runToolExecutionPlanningDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=tool-execution-planning-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('toolExecution=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'provider-failure-before-tool',
      plan: {
        providerStatus: 'provider-network-inconclusive',
        tool: 'bash',
        command: 'node --version',
        approval: 'explicit-allow',
        projectDir: 'D:/Test/pca-tool-planning-provider-gated',
      },
      expectedDecision: 'provider-gated',
      expectedExecute: false,
    },
    {
      name: 'read-only-synthetic-fixture',
      plan: {
        providerStatus: 'ready',
        tool: 'read-file',
        targetPath: 'D:/Test/pca-tool-planning-read/fixture.txt',
        writes: false,
      },
      expectedDecision: 'allow-read-only',
      expectedExecute: true,
    },
    {
      name: 'benign-command-needs-approval',
      plan: {
        providerStatus: 'ready',
        tool: 'bash',
        command: 'node --version',
        approval: 'not-requested',
        projectDir: 'D:/Test/pca-tool-planning-command',
      },
      expectedDecision: 'approval-required',
      expectedExecute: false,
    },
    {
      name: 'benign-command-explicit-allow',
      plan: {
        providerStatus: 'ready',
        tool: 'bash',
        command: 'node --version',
        approval: 'explicit-allow',
        projectDir: 'D:/Test/pca-tool-planning-command',
      },
      expectedDecision: 'allow-benign-command',
      expectedExecute: true,
    },
    {
      name: 'dangerous-command-blocked',
      plan: {
        providerStatus: 'ready',
        tool: 'bash',
        command: 'del /s /q D:\\Test\\home-sf',
        approval: 'explicit-allow',
        projectDir: 'D:/Test/pca-tool-planning-command',
      },
      expectedDecision: 'blocked-command-not-allowlisted',
      expectedExecute: false,
    },
    {
      name: 'real-home-write-blocked',
      plan: {
        providerStatus: 'ready',
        tool: 'write-file',
        targetPath: 'D:/Test/home-sf/.private-agents/config.json',
        writes: true,
      },
      expectedDecision: 'blocked-real-home',
      expectedExecute: false,
    },
    {
      name: 'workspace-write-outside-test-blocked',
      plan: {
        providerStatus: 'ready',
        tool: 'write-file',
        targetPath: 'D:/Users/project/src/app.js',
        writes: true,
      },
      expectedDecision: 'blocked-dangerous-write',
      expectedExecute: false,
    },
  ]

  let ok = true
  for (const item of cases) {
    const audit = buildToolExecutionPlanningAudit(item.plan)
    const line = `decision=${audit.decision} execute=${audit.execute} reason=${audit.reason} nextAction=${audit.nextAction}`
    const passed =
      audit.decision === item.expectedDecision &&
      audit.execute === item.expectedExecute &&
      !line.includes('.private-agents/config.json')
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${item.name} - ${line}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function printHelp() {
  console.log('Usage: node scripts/verify-real-user-capabilities.mjs [options]')
  console.log('')
  console.log('Default mode runs the existing real-user capability gate and may perform real-provider checks.')
  console.log('Safe dry-run options do not execute real provider calls:')
  console.log('  --turn-boundary-dry-run')
  console.log('  --terminal-result-surface-dry-run')
  console.log('  --tool-execution-planning-dry-run')
  console.log('  --failure-followup-context-dry-run')
  console.log('  --real-readonly-coding-dry-run')
  console.log('')
  console.log('Future explicit opt-in smoke:')
  console.log('  --real-readonly-coding-smoke')
  console.log('    Opt-in only; read-only; excluded from default verification.')
  console.log('    External network/auth/model failures are attribution outcomes, not automatic product regressions.')
  console.log('    Real provider secrets/config must be redacted and must not be printed.')
}

function runRealReadonlyCodingDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')
  console.log('defaultSmoke=skipped')

  const fixture = createReadonlyCodingFixture()
  try {
    const before = snapshotReadonlyFixture(fixture.fixtureDir)
    const after = snapshotReadonlyFixture(fixture.fixtureDir)
    const comparison = compareReadonlySnapshots(before, after)
    const redaction = redactAndAssertReadonlyProviderOutput(
      [
        'Authorization: Bearer sk-live-secret-123456789',
        'api_key=sk-url-secret-123456789',
        'refresh_token=refresh-secret',
        'D:/Test/home-sf/.private-agents/config.json',
      ].join('\n'),
    )
    const report = {
      capability: 'real-readonly-coding-smoke',
      provider: 'real',
      mode: 'dry-run',
      optInRequired: true,
      realProviderExecution: false,
      modelTurn: false,
      fixture: {
        files: fixture.files,
        noMutation: comparison.ok,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      resultContract: {
        expectedTerminalResult: 'success-or-attributed-provider-failure',
        expectedChangedFiles: [],
        requiresChangedFilesEmpty: true,
      },
      redaction: {
        ok: redaction.ok,
        leaks: redaction.leaks,
      },
      skip: {
        defaultGate: true,
        reason: 'real-provider read-only coding smoke requires explicit opt-in',
      },
    }

    const promptOk =
      fixture.prompt.includes('read-only task') &&
      fixture.prompt.includes('changedFiles is empty') &&
      fixture.prompt.includes('Do not run shell commands')
    const reportOk =
      report.optInRequired &&
      !report.realProviderExecution &&
      !report.modelTurn &&
      report.fixture.noMutation &&
      report.resultContract.requiresChangedFilesEmpty &&
      report.redaction.ok &&
      report.skip.defaultGate
    const passed = promptOk && reportOk

    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`skipReason=${report.skip.reason}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-readonly-coding-dry-run-contract`)
    process.exit(passed ? 0 : 1)
  } finally {
    cleanupReadonlyFixture(fixture.fixtureDir)
  }
}

async function main() {
  if (showHelp) {
    printHelp()
    return
  }
  if (realReadonlyCodingDryRun) {
    runRealReadonlyCodingDryRun()
    return
  }
  if (turnBoundaryDryRun) {
    runTurnBoundaryDryRun()
    return
  }
  if (terminalResultSurfaceDryRun) {
    runTerminalResultSurfaceDryRun()
    return
  }
  if (toolExecutionPlanningDryRun) {
    runToolExecutionPlanningDryRun()
    return
  }
  if (failureFollowupContextDryRun) {
    runFailureFollowupContextDryRun()
    return
  }

  console.log('gate name=real-user-capabilities')
  console.log('status taxonomy: PASS=0 FAIL=1 PROVIDER_NETWORK=2 CONFIG=3')
  console.log('state semantics: provider preflight inconclusive skips capability execution; mid-turn provider readiness stays provider-readiness, not coding failure')
  console.log(`repo=${repoRoot}`)
  console.log(`synthetic HOME=${syntheticHome}`)
  console.log(`real HOME=${realHome}`)
  console.log('homeCreated=false')
  console.log(`candidateMode=${includeCandidates ? 'include-candidates' : includeContinueSmoke ? 'include-continue-smoke' : 'off'}`)

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

  const providerPreflight = await runProviderReadinessPreflight()
  if (!providerPreflight.ok) {
    const isConfig = providerPreflight.status === 'config-failure'
    const report = {
      generatedAt: new Date().toISOString(),
      status: 'FAIL',
      statusDetail: providerPreflight.status,
      reportPath,
      failureCategory: 'provider-readiness',
      failureReason:
        providerPreflight.status === 'provider-network-inconclusive'
          ? 'provider-network-inconclusive: provider endpoint remained unreachable after readiness retry'
          : providerPreflight.status,
      providerReadiness: providerPreflight,
      capabilitySkipped: true,
      codingCapabilityNotEvaluated: true,
      failureCategories,
      futureGateCandidates,
      capabilities: [],
      candidates: [],
    }
    writeReport(report)
    const label =
      providerPreflight.status === 'provider-network-inconclusive'
        ? 'PROVIDER_NETWORK'
        : isConfig
          ? 'CONFIG'
          : 'FAIL'
    console.log(`[${label}] provider-readiness-preflight - ${report.failureReason}`)
    console.log(`report=${reportPath}`)
    process.exit(
      providerPreflight.status === 'provider-network-inconclusive'
        ? 2
        : isConfig
          ? 3
          : 1,
    )
  }
  console.log('[PASS] provider-readiness-preflight - real provider reachable')

  const capabilities = []
  for (const scenario of scenarios) {
    const result = await runScenario(scenario)
    capabilities.push(result)
    const suffix = result.status === 'PASS' ? `verification=${result.verification}` : renderTerminalResultSurface(result)
    console.log(`[${result.status}] ${scenario.id} - provider=${scenario.provider} project=${scenario.projectDir} session=${result.sessionId} ${suffix}`)
  }

  const candidates = []
  const selectedCandidateScenarios = includeCandidates
    ? candidateScenarios
    : includeContinueSmoke
      ? candidateScenarios.filter(
          (scenario) => scenario.id === 'real-completed-continue-followup-verify',
        )
      : []
  if (selectedCandidateScenarios.length > 0) {
    for (const scenario of selectedCandidateScenarios) {
      const result = await runScenario(scenario)
      candidates.push(result)
      const suffix = result.status === 'PASS' ? `verification=${result.verification}` : renderTerminalResultSurface(result)
      console.log(`[${result.status}] candidate:${scenario.id} - provider=${scenario.provider} project=${scenario.projectDir} session=${result.sessionId} ${suffix}`)
    }
  }

  const ok =
    capabilities.every((capability) => capability.status === 'PASS') &&
    candidates.every((candidate) => candidate.status === 'PASS')
  const summarizedFailure = summarizeFailureStatus([...capabilities, ...candidates])
  const report = {
    generatedAt: new Date().toISOString(),
    status: ok ? 'PASS' : 'FAIL',
    statusDetail: summarizedFailure.statusDetail,
    reportPath,
    providerReadiness: providerPreflight,
    capabilitySkipped: false,
    codingCapabilityNotEvaluated: false,
    failureCategories,
    futureGateCandidates: buildCandidateMetadata(candidates),
    capabilities,
    candidates,
  }
  writeReport(report)
  console.log(`report=${reportPath}`)
  process.exit(summarizedFailure.exitCode)
}

main().catch((error) => {
  const rawFailure = error instanceof Error ? error.stack ?? error.message : String(error)
  const redactedFailure = redactProviderOutput(rawFailure)
  const report = {
    generatedAt: new Date().toISOString(),
    status: 'FAIL',
    reportPath,
    failureCategory: categorizeFailure(redactedFailure),
    failureReason: redactedFailure,
    failureCategories,
    futureGateCandidates,
    candidates: [],
    capabilities: [],
  }
  writeReport(report)
  console.error(redactedFailure)
  process.exit(1)
})

#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import {
  cleanupReadonlyFixture,
  compareReadonlySnapshots,
  createReadonlyCodingFixture,
  snapshotReadonlyFixture,
} from './real-provider-readonly-fixture.mjs'
import {
  assertOnlyExpectedCodingFixtureChanges,
  buildCodingFlowDryRunContract,
  cleanupCodingFlowFixture,
  compareCodingFlowSnapshots,
  createCodingFlowFixture,
  readCodingFlowNoteStatus,
  snapshotCodingFlowFixture,
} from './real-provider-coding-fixture.mjs'
import {
  redactAndAssertReadonlyProviderOutput,
} from './real-provider-readonly-redaction.mjs'
import {
  redactAndAssertCodingProviderOutput,
} from './real-provider-coding-redaction.mjs'
import {
  ensureDirIfNeeded,
  getRealCodingFlowRuntimeHome,
  getRealCodingFlowAuditLogPath,
  getRealProviderHome,
  getSyntheticHome,
  getTestRoot,
} from './support/testPaths.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')

const syntheticHome = getSyntheticHome()
const realHome = getRealProviderHome({ allowDefault: true })
const testRoot = getTestRoot()
const reportPath = path.join(testRoot, 'test-results', 'real-user-capabilities-report.json')
const runId = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)
const includeCandidates = process.argv.includes('--include-candidates')
const includeContinueSmoke = process.argv.includes('--include-continue-smoke')
const showHelp = process.argv.includes('--help') || process.argv.includes('-h')
const turnBoundaryDryRun = process.argv.includes('--turn-boundary-dry-run')
const terminalResultSurfaceDryRun = process.argv.includes('--terminal-result-surface-dry-run')
const toolExecutionPlanningDryRun = process.argv.includes('--tool-execution-planning-dry-run')
const failureFollowupContextDryRun = process.argv.includes('--failure-followup-context-dry-run')
const realReadonlyCodingDryRun = process.argv.includes('--real-readonly-coding-dry-run')
const realReadonlyCodingPreflight = process.argv.includes('--real-readonly-coding-preflight')
const realReadonlyCodingPreflightSelfTest = process.argv.includes('--real-readonly-coding-preflight-self-test')
const realReadonlyCodingFailureAttributionSelfTest = process.argv.includes('--real-readonly-coding-failure-attribution-self-test')
const realReadonlyCodingSmoke = process.argv.includes('--real-readonly-coding-smoke')
const realCodingFlowDryRun = process.argv.includes('--real-coding-flow-dry-run')
const realCodingFlowSmoke = process.argv.includes('--real-coding-flow-smoke')
const realCodingFlowFailureAttributionSelfTest = process.argv.includes('--real-coding-flow-failure-attribution-self-test')
const realCodingFlowFollowupContextSelfTest = process.argv.includes('--real-coding-flow-followup-context-self-test')
const realCodingFlowFollowupSmokeDryRun = process.argv.includes('--real-coding-flow-followup-smoke-dry-run')
const realCodingFlowFollowupSmoke = process.argv.includes('--real-coding-flow-followup-smoke')
const realCodingFlowDiagnosticsSelfTest = process.argv.includes('--real-coding-flow-diagnostics-self-test')
const realCodingFlowAuditIsolationSelfTest = process.argv.includes('--real-coding-flow-audit-isolation-self-test')

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
const providerModelFailurePattern =
  /(provider-readiness:model|model.*(?:not found|not available|unsupported|does not exist|is invalid)|unsupported model|invalid model|quota|rate limit|429|insufficient quota|context length|maximum context)/i
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
const posixPrivateAgentsConfigPattern =
  /\/[^\s"'`<>]+\/\.private-agents\/config\.json/gi
const posixPrivateAgentsRealHomePattern =
  /\/[^\s"'`<>]*\.private-agents-real(?:\/[^\s"'`<>]*)?/gi

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
    projectDir: path.join(testRoot, `pca-capability-gate-synthetic-${runId}`),
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
    projectDir: path.join(testRoot, `pca-capability-gate-real-bugfix-${runId}`),
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
    projectDir: path.join(testRoot, `pca-capability-gate-real-multifile-${runId}`),
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
    projectDir: path.join(testRoot, `pca-candidate-real-small-project-${runId}`),
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
    projectDir: path.join(testRoot, `pca-candidate-real-continue-${runId}`),
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
  const readinessRuntimeHome = getRealCodingFlowRuntimeHome(`${runId}-provider-readiness`)
  const result = await run(process.execPath, [
    path.join(repoRoot, 'scripts', 'verify-provider-readiness.mjs'),
    '--preflight-only',
  ], {
    cwd: repoRoot,
    env: {
      ...(realHome
        ? {
            HOME: readinessRuntimeHome,
            USERPROFILE: readinessRuntimeHome,
            PRIVATE_AGENTS_REAL_HOME: realHome,
          }
        : {}),
    },
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
    .replace(posixPrivateAgentsConfigPattern, '[PRIVATE_AGENTS_CONFIG_PATH]')
    .replace(posixPrivateAgentsRealHomePattern, '[REAL_PROVIDER_HOME]')
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
  if (providerModelFailurePattern.test(normalized)) {
    return {
      statusDetail: 'provider-model-failed',
      exitCode: 1,
      reason: 'provider-readiness:model: provider model was unavailable or rejected this turn',
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
    if (providerFailures.some((entry) => entry.statusDetail === 'provider-model-failed')) {
      return { statusDetail: 'provider-model-failed', exitCode: 1 }
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
    if (statusDetail === 'provider-model-failed') {
      return 'Select an available provider model or wait for quota/rate-limit recovery, then retry the same read-only smoke.'
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

function hasPathPrefix(value, prefix) {
  const normalizedValue = normalizeSlashes(value).toLowerCase()
  const normalizedPrefix = normalizeSlashes(prefix).toLowerCase()
  return normalizedValue === normalizedPrefix || normalizedValue.startsWith(`${normalizedPrefix}/`)
}

function isInsideSyntheticOrTempWorkspace(value) {
  return (
    hasPathPrefix(value, syntheticHome) ||
    hasPathPrefix(value, path.join(testRoot, 'pca-tool-planning-provider-gated')) ||
    hasPathPrefix(value, path.join(testRoot, 'pca-tool-planning-read')) ||
    hasPathPrefix(value, path.join(testRoot, 'pca-tool-planning-command')) ||
    hasPathPrefix(value, '/tmp') ||
    hasPathPrefix(value, 'c:/tmp')
  )
}

function isRealProviderHomePath(value) {
  return Boolean(realHome && hasPathPrefix(value, realHome)) || hasPathPrefix(value, 'D:/Test/home-sf')
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
        projectDir: path.join(testRoot, 'pca-tool-planning-provider-gated'),
      },
      expectedDecision: 'provider-gated',
      expectedExecute: false,
    },
    {
      name: 'read-only-synthetic-fixture',
      plan: {
        providerStatus: 'ready',
        tool: 'read-file',
        targetPath: path.join(testRoot, 'pca-tool-planning-read', 'fixture.txt'),
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
        projectDir: path.join(testRoot, 'pca-tool-planning-command'),
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
        projectDir: path.join(testRoot, 'pca-tool-planning-command'),
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
        projectDir: path.join(testRoot, 'pca-tool-planning-command'),
      },
      expectedDecision: 'blocked-command-not-allowlisted',
      expectedExecute: false,
    },
    {
      name: 'real-home-write-blocked',
      plan: {
        providerStatus: 'ready',
        tool: 'write-file',
        targetPath: realHome
          ? path.join(realHome, '.private-agents', 'config.json')
          : 'D:/Test/home-sf/.private-agents/config.json',
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
  console.log('  --real-readonly-coding-preflight-self-test')
  console.log('  --real-readonly-coding-failure-attribution-self-test')
  console.log('  --real-coding-flow-dry-run')
  console.log('  --real-coding-flow-failure-attribution-self-test')
  console.log('  --real-coding-flow-followup-context-self-test')
  console.log('  --real-coding-flow-followup-smoke-dry-run')
  console.log('  --real-coding-flow-diagnostics-self-test')
  console.log('  --real-coding-flow-audit-isolation-self-test')
  console.log('')
  console.log('Explicit opt-in real-provider checks:')
  console.log('  --real-readonly-coding-preflight')
  console.log('    Opt-in only; readiness preflight only; no model turn.')
  console.log('  --real-readonly-coding-smoke')
  console.log('    Opt-in only; runs one real-provider read-only model turn against a temporary fixture.')
  console.log('    Excluded from default verification; does not edit/write/mutate by design.')
  console.log('    External network/auth/model failures are attribution outcomes, not automatic product regressions.')
  console.log('    Real provider secrets/config must be redacted and must not be printed.')
  console.log('  --real-coding-flow-smoke')
  console.log('    Opt-in only; runs one real-provider model turn against an isolated writable fixture.')
  console.log('    Excluded from default verification; only note.txt may change and the repository must stay clean.')
  console.log('  --real-coding-flow-followup-smoke')
  console.log('    Opt-in only; runs one real-provider response turn against synthetic stopped/failure context.')
  console.log('    Excluded from default verification; must not modify the isolated fixture.')
}

function renderReadonlyPreflightNotice(options = {}) {
  console.log(`real-provider-readonly-${options.smoke ? 'smoke' : 'preflight'}=opt-in`)
  console.log(`modelTurn=${options.modelTurn ? 'true' : 'false'}`)
  console.log(`readOnlyFixture=${options.readOnlyFixture ? 'true' : 'false'}`)
  console.log('real-provider failure attribution: external network/auth/model failures are not automatic product regressions')
  console.log('real provider secrets/config must be redacted and must not be printed')
}

function buildReadonlyPreflightStatus(preflight) {
  if (preflight.ok) {
    return {
      status: 'PASS',
      statusDetail: 'ready',
      exitCode: 0,
      failureCategory: 'none',
      failureReason: '',
    }
  }
  if (preflight.status === 'provider-network-inconclusive') {
    return {
      status: 'PROVIDER_NETWORK',
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      failureCategory: 'provider-readiness',
      failureReason: 'provider-network-inconclusive: provider endpoint remained unreachable during readiness preflight',
    }
  }
  if (preflight.status === 'config-failure') {
    return {
      status: 'CONFIG',
      statusDetail: 'config-failure',
      exitCode: 3,
      failureCategory: 'provider-readiness',
      failureReason: 'config-failure: fix provider configuration or authentication before running read-only smoke',
    }
  }
  return {
    status: 'FAIL',
    statusDetail: preflight.status ?? 'provider-readiness-failed',
    exitCode: 1,
    failureCategory: 'provider-readiness',
    failureReason: 'provider-readiness failed before read-only model turn',
  }
}

function runRealReadonlyCodingPreflightSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-preflight-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'ready',
      preflight: { ok: true, status: 'pass' },
      expected: { status: 'PASS', exitCode: 0 },
    },
    {
      name: 'network',
      preflight: { ok: false, status: 'provider-network-inconclusive' },
      expected: { status: 'PROVIDER_NETWORK', exitCode: 2 },
    },
    {
      name: 'config',
      preflight: { ok: false, status: 'config-failure' },
      expected: { status: 'CONFIG', exitCode: 3 },
    },
    {
      name: 'unknown',
      preflight: { ok: false, status: 'provider-readiness-failed' },
      expected: { status: 'FAIL', exitCode: 1 },
    },
  ]

  let ok = true
  for (const item of cases) {
    const status = buildReadonlyPreflightStatus(item.preflight)
    const passed =
      status.status === item.expected.status &&
      status.exitCode === item.expected.exitCode &&
      status.failureReason.indexOf('sk-') === -1 &&
      status.failureReason.indexOf('.private-agents/config.json') === -1
    console.log(`[${passed ? 'PASS' : 'FAIL'}] preflight-${item.name} status=${status.status} exit=${status.exitCode}`)
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runRealReadonlyCodingFailureAttributionSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-failure-attribution-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const cases = [
    {
      name: 'network-mid-turn',
      result: {
        code: 0,
        timedOut: false,
        output: [
          'Provider readiness failed (provider-readiness:network): Unable to reach the OpenAI-compatible endpoint.',
          'Authorization: Bearer sk-live-secret-123456789',
          'D:/Test/home-sf/.private-agents/config.json',
        ].join('\n'),
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        nextAction: 'Retry when the provider endpoint is reachable',
      },
    },
    {
      name: 'auth-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:auth invalid api key api_key=sk-live-secret-123456789',
      },
      expected: {
        status: 'CONFIG',
        statusDetail: 'config-failure',
        exitCode: 3,
        nextAction: 'Fix provider configuration or authentication',
      },
    },
    {
      name: 'model-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:model unsupported model or rate limit 429 for requested model',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'provider-model-failed',
        exitCode: 1,
        nextAction: 'Select an available provider model',
      },
    },
    {
      name: 'timeout-mid-turn',
      result: {
        code: -1,
        timedOut: true,
        output: 'read-only model turn timed out',
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        nextAction: 'Retry when the provider endpoint is reachable',
      },
    },
  ]

  let ok = true
  for (const item of cases) {
    const redaction = redactAndAssertReadonlyProviderOutput(item.result.output)
    const status = buildReadonlySmokeFailureStatus(item.result, redaction.redacted, redaction)
    const surface = buildTerminalResultSurface({
      status: status.status,
      provider: 'real',
      failureCategory: status.failureCategory,
      failureReason: status.failureReason,
      outputTail: redaction.redacted,
    })
    const followup = buildFailureFollowupContext({
      status: status.status,
      provider: 'real',
      failureCategory: status.failureCategory,
      failureReason: status.failureReason,
      outputTail: redaction.redacted,
    }, 'retry after provider recovers with api_key=sk-live-secret-123456789')
    const combined = [
      status.status,
      status.statusDetail,
      status.failureReason,
      surface.nextAction,
      surface.outputTail,
      followup.contextLine,
    ].join('\n')
    const safe = redactAndAssertReadonlyProviderOutput(combined)
    const passed =
      status.status === item.expected.status &&
      status.statusDetail === item.expected.statusDetail &&
      status.exitCode === item.expected.exitCode &&
      surface.nextAction.includes(item.expected.nextAction) &&
      followup.contextLine.includes(`status=${item.expected.statusDetail}`) &&
      safe.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] readonly-failure-${item.name} status=${status.statusDetail} exit=${status.exitCode} redaction=${safe.ok ? 'pass' : 'fail'}`,
    )
    if (!passed && safe.leaks.length > 0) {
      console.log(`leaks=${safe.leaks.join(',')}`)
    }
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

async function runRealReadonlyCodingPreflight() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-preflight')
  renderReadonlyPreflightNotice()
  const preflight = await runProviderReadinessPreflight()
  const status = buildReadonlyPreflightStatus(preflight)
  console.log(`[${status.status}] real-readonly-coding-preflight status=${status.statusDetail}`)
  if (preflight.outputTail) {
    console.log(preflight.outputTail)
  }
  process.exit(status.exitCode)
}

function buildReadonlySmokeFailureStatus(result, output, redaction) {
  if (result.timedOut) {
    return {
      status: 'PROVIDER_NETWORK',
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      failureCategory: 'provider-readiness',
      failureReason: 'provider-network-inconclusive: read-only model turn timed out',
    }
  }

  const providerFailure = classifyProviderReadinessFailure(
    `read-only model turn exited ${result.code}`,
    output,
    'real',
  )
  if (providerFailure) {
    return {
      status: providerFailure.exitCode === 2 ? 'PROVIDER_NETWORK' : providerFailure.exitCode === 3 ? 'CONFIG' : 'FAIL',
      statusDetail: providerFailure.statusDetail,
      exitCode: providerFailure.exitCode,
      failureCategory: 'provider-readiness',
      failureReason: providerFailure.reason,
    }
  }

  if (!redaction.ok) {
    return {
      status: 'FAIL',
      statusDetail: 'redaction-leak',
      exitCode: 1,
      failureCategory: 'task-execution-failure',
      failureReason: `redaction leak detected: ${redaction.leaks.join(',') || 'unknown'}`,
    }
  }

  return {
    status: 'FAIL',
    statusDetail: 'read-only-smoke-failed',
    exitCode: 1,
    failureCategory: categorizeFailure(`read-only model turn exited ${result.code}`, output, 'real'),
    failureReason: `read-only model turn exited ${result.code}`,
  }
}

function renderCodingFlowPreflightNotice(options = {}) {
  console.log('real-provider-coding-flow-smoke=opt-in')
  console.log(`modelTurn=${options.modelTurn ? 'true' : 'false'}`)
  console.log(`writableFixture=${options.writableFixture ? 'true' : 'false'}`)
  console.log('real-provider failure attribution: external network/auth/model failures are not automatic product regressions')
  console.log('real provider secrets/config must be redacted and must not be printed')
}

function buildCodingFlowPreflightStatus(preflight) {
  const status = buildReadonlyPreflightStatus(preflight)
  if (status.failureReason.includes('read-only')) {
    return {
      ...status,
      failureReason: status.failureReason.replace('read-only smoke', 'coding flow smoke'),
    }
  }
  return status
}

function codingFlowFailureCategoryForStatus(statusDetail, fallback = 'product runtime regression') {
  if (statusDetail === 'provider-network-inconclusive') return 'provider-network-inconclusive'
  if (statusDetail === 'config-failure') return 'auth/config failure'
  if (statusDetail === 'provider-model-failed') return 'model/quota/rate-limit failure'
  if (statusDetail === 'redaction-failure') return 'redaction failure'
  if (statusDetail === 'no-mutation-guard-failure') return 'no-mutation guard failure'
  if (statusDetail === 'real-repo-mutation-leak') return 'real repo mutation leak'
  if (statusDetail === 'terminal-result-missing') return 'terminal result missing'
  if (statusDetail === 'changed-files-wrong') return 'changedFiles wrong'
  if (statusDetail === 'verification-failed') return 'verification failed'
  return fallback
}

function nextActionForCodingFlowFailure(failureCategory, statusDetail) {
  if (failureCategory === 'provider-network-inconclusive') {
    return 'Retry the same isolated fixture task when the provider endpoint is reachable.'
  }
  if (failureCategory === 'auth/config failure') {
    return 'Fix provider configuration or authentication outside this run, then retry the same isolated fixture task.'
  }
  if (failureCategory === 'model/quota/rate-limit failure') {
    return 'Select an available model or wait for quota/rate-limit recovery, then retry the same isolated fixture task.'
  }
  if (failureCategory === 'fixture setup failure') {
    return 'Fix fixture setup under the configured test root, then rerun the focused coding flow smoke.'
  }
  if (failureCategory === 'no-mutation guard failure') {
    return 'Start from a clean repository state, then rerun the focused coding flow smoke.'
  }
  if (failureCategory === 'real repo mutation leak') {
    return 'Inspect and restore repository changes before retrying; do not continue from a mutated target repo.'
  }
  if (failureCategory === 'redaction failure') {
    return 'Fix redaction before surfacing or retrying this failure context.'
  }
  if (failureCategory === 'terminal result missing') {
    return 'Repair the terminal result surface, then rerun the focused coding flow smoke.'
  }
  if (failureCategory === 'changedFiles wrong') {
    return 'Inspect fixture changed files and retry with only note.txt editable.'
  }
  if (failureCategory === 'verification failed') {
    return 'Repair the fixture verification failure, then retry the same isolated fixture task.'
  }
  if (failureCategory === 'RTK/environment issue') {
    return 'Fix the local RTK or execution environment issue, then rerun the focused check.'
  }
  if (statusDetail === 'passed') {
    return 'Continue with the next task.'
  }
  return 'Inspect the coding flow runtime failure, fix the product issue, then retry the focused smoke.'
}

function buildCodingFlowContractFields({
  failureCategory,
  statusDetail,
  changedFiles = [],
  verification = 'blocked',
  redaction = { ok: true, leaks: [] },
  repoBefore,
  repoAfter,
  output = '',
} = {}) {
  const repositoryClean =
    Boolean(repoBefore?.ok) &&
    !repoBefore?.status &&
    (repoAfter ? Boolean(repoAfter.ok) && !repoAfter.status : true)
  return {
    repositoryClean,
    terminalResultVisible: /(^|\r?\n)Result\s*(\r?\n|$)/.test(String(output ?? '')),
    changedFiles: [...changedFiles].sort(),
    verification,
    redaction: {
      ok: Boolean(redaction.ok),
      leaks: [...(redaction.leaks ?? [])],
    },
    nextAction: nextActionForCodingFlowFailure(
      failureCategory ?? 'product runtime regression',
      statusDetail ?? statusDetailForCodingFlowFailureCategory(failureCategory),
    ),
  }
}

function buildCodingFlowDiagnostics({
  result = { code: undefined, timedOut: false, stdout: '', stderr: '', output: '' },
  redactedOutput = '',
  comparison = { added: [], removed: [], changed: [] },
  expected = { observed: [], expected: ['note.txt'], protectedChanged: [] },
  noteStatusBefore = 'missing',
  noteStatusAfter = 'missing',
  runtimeHome,
  auditLogPath,
  repoAfter,
  auditResidueCleaned = false,
  prompt = '',
  failureCategory = 'product runtime regression',
  statusDetail = 'product-runtime-regression',
  output = redactedOutput,
} = {}) {
  const safeOutput = String(output ?? '')
  const safeStdout = redactProviderOutput(result.stdout ?? '')
  const safeStderr = redactProviderOutput(result.stderr ?? '')
  const outputMarkers = detectCodingFlowOutputMarkers(safeOutput)
  const repoAwareSummaryDetected = /(^|\r?\n)Repo-aware summary(\r?\n|$)/.test(safeOutput)
  return {
    routing: {
      cliCommandKind: 'print-non-interactive',
      cwdKind: 'ts-shell-root',
      projectKind: 'isolated-fixture',
      promptBytes: Buffer.byteLength(String(prompt ?? ''), 'utf8'),
      promptIntentHint: inferCodingFlowPromptIntentHint(prompt),
      repoAwareSummaryDetected,
      enteredSessionRuntime: !repoAwareSummaryDetected,
      codingResultPresent: outputMarkers.hasActionResult,
      resultBlockPresent: outputMarkers.hasResultBlock,
      toolExecutionMarkerPresent: outputMarkers.hasToolExecutionMarker,
    },
    process: {
      modelTurnExitCode: typeof result.code === 'number' ? result.code : null,
      modelTurnTimedOut: Boolean(result.timedOut),
      modelTurnOutputBytes: Buffer.byteLength(String(result.output ?? ''), 'utf8'),
      stdoutTailRedacted: summarizeOutput(safeStdout),
      stderrTailRedacted: summarizeOutput(safeStderr),
      combinedOutputTailRedacted: summarizeOutput(safeOutput),
      outputMarkers,
    },
    fixture: {
      fixtureChangedFiles: [...(expected.observed ?? [])].sort(),
      expectedChangedFiles: [...(expected.expected ?? ['note.txt'])].sort(),
      noteStatusBefore,
      noteStatusAfter,
      protectedChangedFiles: [...(expected.protectedChanged ?? [])].sort(),
      addedFiles: [...(comparison.added ?? [])].sort(),
      removedFiles: [...(comparison.removed ?? [])].sort(),
    },
    runtime: {
      runtimeHomeKind: 'isolated-test-root',
      runtimeHomeState: inspectCodingFlowRuntimeHome(runtimeHome),
      realProviderHomeUsedForRuntime: false,
      configHomeKind: 'explicit-real-provider-home',
    },
    auditIsolation: inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter,
      auditResidueCleaned,
    }),
    mutation: buildCodingFlowMutationDiagnostics(safeOutput, {
      comparison,
      expected,
      noteStatusBefore,
      noteStatusAfter,
      statusDetail,
    }),
    classification: {
      failureStage: deriveCodingFlowFailureStage({
        failureCategory,
        statusDetail,
        output: safeOutput,
        expected,
        noteStatusAfter,
      }),
      failureCategory,
      statusDetail,
      nextAction: nextActionForCodingFlowFailure(failureCategory, statusDetail),
    },
  }
}

function inspectCodingFlowAuditIsolation({
  auditLogPath,
  repoAfter,
  auditResidueCleaned = false,
} = {}) {
  return {
    auditLogKind: auditLogPath && isPathInsideTestRoot(auditLogPath)
      ? 'isolated-test-root'
      : auditLogPath
        ? 'non-isolated'
        : 'not-configured',
    repoAuditResidueDetected: Boolean(repoAfter?.status && /\.sisyphus[\/\\]audit[\/\\]permissions\.jsonl/.test(repoAfter.status)),
    auditResidueCleaned: Boolean(auditResidueCleaned),
    auditLogCreated: Boolean(auditLogPath && fs.existsSync(auditLogPath)),
  }
}

function detectLiteralReplaceFieldsFromOutput(output) {
  const normalized = String(output ?? '')
  const explicitFrom = /\b(?:replaceFrom|fromText|source text|current source text)\b/i.test(normalized)
  const explicitTo = /\b(?:replaceTo|toText|replacement text|new text)\b/i.test(normalized)
  const replaceSummary = /\breplaced\s+[`"'][\s\S]+?[`"']\s+with\s+[`"'][\s\S]+?[`"']/i.test(normalized)
  const replaceDirective = /\breplace\s+[`"'][\s\S]+?[`"']\s+with\s+[`"'][\s\S]+?[`"']/i.test(normalized)
  return {
    replaceFromPresent: explicitFrom || replaceSummary || replaceDirective,
    replaceToPresent: explicitTo || replaceSummary || replaceDirective,
    source: explicitFrom || explicitTo || replaceSummary || replaceDirective
      ? 'redacted-output-summary'
      : 'none',
  }
}

function deriveStructuredMutationDiagnosticSource({
  actionSequence = [],
  expected = { observed: [] },
  noteStatusBefore = 'missing',
  noteStatusAfter = 'missing',
  patchFailureCode = 'none',
  statusDetail = 'product-runtime-regression',
} = {}) {
  const changedFiles = [...(expected.observed ?? [])]
  const structuredSuccess =
    statusDetail === 'passed' &&
    patchFailureCode === 'none' &&
    actionSequence.includes('edit') &&
    changedFiles.includes('note.txt') &&
    noteStatusBefore === 'draft' &&
    noteStatusAfter === 'ready'

  if (structuredSuccess) {
    return 'structured-success-no-literal-replace'
  }
  if (actionSequence.length > 0 || changedFiles.length > 0 || patchFailureCode !== 'none') {
    return 'structured-result'
  }
  return 'output-tail-fallback'
}

function buildCodingFlowMutationDiagnostics(output, {
  expected = { observed: [] },
  noteStatusBefore = 'missing',
  noteStatusAfter = 'missing',
  statusDetail = 'product-runtime-regression',
} = {}) {
  const normalized = String(output ?? '')
  const taskKind = normalized.match(/-\s*Task:\s*([^\r\n]+)/i)?.[1]?.trim() ?? 'unknown'
  const failedFileReason =
    normalized.match(/-\s*Failure reason:\s*([^\r\n]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Failed files:\s*([^\r\n]+)/i)?.[1]?.trim() ??
    ''
  const actionSummary = normalized.match(/-\s*Actions:\s*([^\r\n]+)/i)?.[1]?.trim() ?? ''
  const actionSequence = actionSummary
    ? actionSummary
        .split(',')
        .map((entry) => entry.replace(/\([^)]*\)/g, '').trim())
        .filter(Boolean)
    : []
  const targetFile =
    normalized.match(/-\s*Read files:\s*([^\r\n,]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Changed files:\s*([^\r\n,]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Unchanged attempted files:\s*([^\r\n,]+)/i)?.[1]?.trim() ??
    normalized.match(/-\s*Failed files:\s*([^\s,(]+)/i)?.[1]?.trim() ??
    'unknown'
  const patchFailureCode =
    normalized.match(/\b(patch-from-not-found|patch-ambiguous|edit-transform-unclear|edit-target-missing)\b/i)?.[1]?.toLowerCase() ??
    'none'
  const outputReplaceFields = detectLiteralReplaceFieldsFromOutput(normalized)
  const diagnosticSource = deriveStructuredMutationDiagnosticSource({
    actionSequence,
    expected,
    noteStatusBefore,
    noteStatusAfter,
    patchFailureCode,
    statusDetail,
  })
  const structuredSuccessWithoutLiteralFields =
    diagnosticSource === 'structured-success-no-literal-replace' &&
    outputReplaceFields.source === 'none'

  return {
    taskKind,
    actionSequence,
    targetFile,
    mutationInstructionPresent: !/mutation instruction missing/i.test(normalized),
    replaceFromPresent: structuredSuccessWithoutLiteralFields ? null : outputReplaceFields.replaceFromPresent,
    replaceToPresent: structuredSuccessWithoutLiteralFields ? null : outputReplaceFields.replaceToPresent,
    replaceFieldSource: outputReplaceFields.source,
    diagnosticSource,
    patchFailureCode,
    failedFileReason: failedFileReason ? summarizeOutput(failedFileReason) : '',
    modelTextTailRedacted: summarizeOutput(normalized),
  }
}

function inferCodingFlowPromptIntentHint(prompt) {
  const normalized = String(prompt ?? '').toLowerCase()
  if (/\bnote\.txt\b/.test(normalized) && /\b(edit|write|change|replace|update|modify)\b/.test(normalized)) {
    return 'single-file-edit'
  }
  if (/\b(edit|write|change|replace|update|modify)\b/.test(normalized)) {
    return 'mutation'
  }
  return 'unknown'
}

function detectCodingFlowOutputMarkers(output) {
  const normalized = String(output ?? '')
  return {
    hasResultBlock: /(^|\r?\n)Result\s*(\r?\n|$)/.test(normalized),
    hasActionResult: /Action result/i.test(normalized),
    hasChangedFilesLine: /-\s*(Changed|Changed files):/i.test(normalized),
    hasVerificationLine: /Verification:/i.test(normalized) || /verification passed/i.test(normalized),
    hasProviderReadinessMarker: hasExplicitProviderReadinessMarker(normalized),
    hasPermissionPromptMarker: /permission|approval|approve|deny|allow-once/i.test(normalized),
    hasToolExecutionMarker: /tool|edit|write|patch|changedFiles/i.test(normalized),
  }
}

function inspectCodingFlowRuntimeHome(runtimeHome) {
  if (!runtimeHome) {
    return {
      existsAfterTurn: false,
      privateAgentsDirCreated: false,
      sessionArtifactCount: 0,
    }
  }

  assertSafeCodingFlowRuntimeHome(runtimeHome)
  const privateAgentsDir = path.join(runtimeHome, '.private-agents')
  return {
    existsAfterTurn: fs.existsSync(runtimeHome),
    privateAgentsDirCreated: fs.existsSync(privateAgentsDir),
    sessionArtifactCount: countFilesUnder(path.join(privateAgentsDir, 'sessions'), 200),
  }
}

function countFilesUnder(root, limit) {
  if (!fs.existsSync(root)) return 0
  let count = 0
  const visit = (directory) => {
    if (count >= limit) return
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (count >= limit) return
      const absolutePath = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        visit(absolutePath)
      } else {
        count += 1
      }
    }
  }
  visit(root)
  return count
}

function deriveCodingFlowFailureStage({
  failureCategory,
  statusDetail,
  output,
  expected = {},
  noteStatusAfter,
}) {
  if (
    statusDetail === 'config-failure' ||
    statusDetail === 'provider-network-inconclusive' ||
    statusDetail === 'provider-model-failed' ||
    String(failureCategory ?? '').includes('provider') ||
    hasExplicitProviderReadinessMarker(output)
  ) {
    return 'model-turn'
  }
  if (failureCategory === 'terminal result missing') {
    return 'terminal-surface'
  }
  if (
    failureCategory === 'changedFiles wrong' ||
    (expected.observed ?? []).join(',') !== (expected.expected ?? ['note.txt']).join(',')
  ) {
    return 'mutation-assertion'
  }
  if (failureCategory === 'verification failed' || noteStatusAfter !== 'ready') {
    return 'verification-assertion'
  }
  return 'model-turn'
}

function createIsolatedCodingFlowRuntimeHome() {
  const runtimeHome = getRealCodingFlowRuntimeHome(runId)
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  fs.rmSync(runtimeHome, { recursive: true, force: true })
  fs.mkdirSync(runtimeHome, { recursive: true })
  return runtimeHome
}

function cleanupIsolatedCodingFlowRuntimeHome(runtimeHome) {
  if (!runtimeHome) return
  assertSafeCodingFlowRuntimeHome(runtimeHome)
  fs.rmSync(runtimeHome, { recursive: true, force: true })
}

function assertSafeCodingFlowRuntimeHome(runtimeHome) {
  const normalized = normalizePathForSafety(runtimeHome)
  const normalizedTestRoot = normalizePathForSafety(testRoot)
  if (!(normalized === normalizedTestRoot || normalized.startsWith(`${normalizedTestRoot}/`))) {
    throw new Error('Refusing to use coding flow runtime home outside the configured test root')
  }

  const normalizedRepoRoot = normalizePathForSafety(repoRoot)
  if (normalized === normalizedRepoRoot || normalized.startsWith(`${normalizedRepoRoot}/`)) {
    throw new Error('Refusing to use repository root for coding flow runtime home')
  }

  if (realHome) {
    const normalizedRealHome = normalizePathForSafety(realHome)
    if (normalized === normalizedRealHome || normalized.startsWith(`${normalizedRealHome}/`)) {
      throw new Error('Refusing to use real-provider home for coding flow runtime home')
    }
  }
}

function createIsolatedCodingFlowAuditLogPath() {
  const auditLogPath = getRealCodingFlowAuditLogPath(runId)
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
  fs.mkdirSync(path.dirname(auditLogPath), { recursive: true })
  return auditLogPath
}

function cleanupIsolatedCodingFlowAuditLog(auditLogPath) {
  if (!auditLogPath) return
  assertSafeCodingFlowRuntimeHome(path.dirname(auditLogPath))
  fs.rmSync(path.dirname(auditLogPath), { recursive: true, force: true })
}

function isPathInsideTestRoot(targetPath) {
  const normalized = normalizePathForSafety(targetPath)
  const normalizedTestRoot = normalizePathForSafety(testRoot)
  return normalized === normalizedTestRoot || normalized.startsWith(`${normalizedTestRoot}/`)
}

function normalizePathForSafety(value) {
  return path.resolve(value).replace(/\\/g, '/').toLowerCase()
}

function summarizeRedactedProviderDetails(value) {
  return String(value ?? '')
    .replace(/Authorization\s*:\s*\[REDACTED\](?:\s+\[REDACTED\])?/gi, '[REDACTED_AUTH_HEADER]')
    .replace(/\b(?:api_key|refresh_token|access_token)\s*=\s*\[REDACTED\]/gi, '[REDACTED_SECRET]')
}

function buildCodingFlowFailureFollowupContext(result, followupPrompt, fixture = {}) {
  const failureCategory = result.failureCategory ?? 'product runtime regression'
  const statusDetail =
    result.statusDetail ??
    statusDetailForCodingFlowFailureCategory(failureCategory)
  const outcome = result.status === 'PASS'
    ? 'success'
    : ['provider-network-inconclusive', 'auth/config failure', 'model/quota/rate-limit failure'].includes(failureCategory)
      ? 'provider-failure'
      : 'stopped'
  const changedFiles = [...(result.changedFiles ?? [])].sort()
  const failedFiles = [...(result.failedFiles ?? [])].sort()
  const targetFile = result.targetFile ?? failedFiles[0] ?? result.failedFile ?? undefined
  const editableFiles = [...(fixture.editableFiles ?? result.editableFiles ?? ['note.txt'])].sort()
  const protectedFiles = [...(fixture.protectedFiles ?? result.protectedFiles ?? ['README.md', 'LOCKED.md'])].sort()
  const verification = result.verification ?? (failureCategory === 'verification failed' ? 'failed' : 'blocked')
  const reason = summarizeRedactedProviderDetails(
    redactAndAssertCodingProviderOutput(result.failureReason ?? '').redacted,
  )
  const doNext = result.nextAction ?? nextActionForCodingFlowFailure(failureCategory, statusDetail)
  const safeFollowupPrompt = summarizeRedactedProviderDetails(
    redactAndAssertCodingProviderOutput(followupPrompt).redacted,
  )
  const contextLine = [
    `previousOutcome=${outcome}`,
    `blocker=${failureCategory}`,
    `status=${statusDetail}`,
    targetFile ? `targetFile=${targetFile}` : '',
    failedFiles.length > 0 ? `failedFiles=${failedFiles.join(',')}` : '',
    changedFiles.length > 0 ? `changedFiles=${changedFiles.join(',')}` : 'changedFiles=none',
    `editableFiles=${editableFiles.join(',')}`,
    `protectedFiles=${protectedFiles.join(',')}`,
    `verification=${verification}`,
    reason ? `reason=${reason}` : '',
    `DoNext=${doNext}`,
    `followup=${safeFollowupPrompt}`,
  ].filter(Boolean).join(' | ')
  const redaction = redactAndAssertCodingProviderOutput(contextLine)

  return {
    previousOutcome: outcome,
    blocker: failureCategory,
    statusDetail,
    changedFiles,
    failedFiles,
    targetFile,
    editableFiles,
    protectedFiles,
    verification,
    reason,
    doNext,
    followupPrompt: safeFollowupPrompt,
    contextLine: redaction.redacted,
    redaction: {
      ok: redaction.ok,
      leaks: redaction.leaks,
    },
  }
}

function buildCodingFlowSmokeFailureStatus(result, output, redaction) {
  if (result.timedOut) {
    return {
      status: 'PROVIDER_NETWORK',
      statusDetail: 'provider-network-inconclusive',
      exitCode: 2,
      failureCategory: 'provider-network-inconclusive',
      failureReason: 'provider-network-inconclusive: coding flow model turn timed out',
    }
  }

  const providerFailure = classifyProviderReadinessFailure(
    `coding flow model turn exited ${result.code}`,
    output,
    'real',
  )
  if (providerFailure) {
    return {
      status: providerFailure.exitCode === 2 ? 'PROVIDER_NETWORK' : providerFailure.exitCode === 3 ? 'CONFIG' : 'FAIL',
      statusDetail: providerFailure.statusDetail,
      exitCode: providerFailure.exitCode,
      failureCategory: codingFlowFailureCategoryForStatus(providerFailure.statusDetail),
      failureReason: providerFailure.reason,
    }
  }

  if (!redaction.ok) {
    return {
      status: 'FAIL',
      statusDetail: 'redaction-failure',
      exitCode: 1,
      failureCategory: 'redaction failure',
      failureReason: `redaction leak detected: ${redaction.leaks.join(',') || 'unknown'}`,
    }
  }

  return {
    status: 'FAIL',
    statusDetail: 'product-runtime-regression',
    exitCode: 1,
    failureCategory: 'product runtime regression',
    failureReason: `coding flow model turn exited ${result.code}`,
  }
}

async function readRepoStatusShort() {
  const result = await run('git', ['status', '--short'], {
    cwd: repoRoot,
    timeoutMs: 30000,
  })
  return {
    ok: result.code === 0 && !result.timedOut,
    status: result.stdout.trim(),
    outputTail: summarizeOutput(result.output),
  }
}

function assertCodingFlowSmokeSuccess(output, comparison, expected, noteContent, redaction, repoBefore, repoAfter) {
  const failures = []
  if (!repoBefore.ok || repoBefore.status) {
    failures.push('no-mutation guard failure: repository was not clean before smoke')
  }
  if (!repoAfter.ok) {
    failures.push('no-mutation guard failure: repository status could not be checked after smoke')
  } else if (repoAfter.status) {
    failures.push('real repo mutation leak: repository changed during smoke')
  }
  if (!redaction.ok) {
    failures.push(`redaction failure: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!expected.ok) {
    if (expected.unexpected.length > 0 || expected.missing.length > 0) {
      failures.push(`changedFiles wrong: observed=${expected.observed.join(',') || 'none'} expected=${expected.expected.join(',')}`)
    }
    if (expected.protectedChanged.length > 0) {
      failures.push(`verification failed: protected files changed: ${expected.protectedChanged.join(',')}`)
    }
    if (comparison.added.length > 0 || comparison.removed.length > 0) {
      failures.push('changedFiles wrong: fixture files were added or removed')
    }
  }
  if (!noteContent.includes('status: ready')) {
    failures.push('verification failed: note.txt does not contain status: ready')
  }
  if (!/(^|\r?\n)Result\s*(\r?\n|$)/.test(output) || !/-\s*Outcome:\s*success/i.test(output)) {
    failures.push('terminal result missing')
  }
  if (!/-\s*(Changed|Changed files):\s*note\.txt/i.test(output)) {
    failures.push('changedFiles wrong: terminal changed files did not report note.txt')
  }
  if (!/Verification:\s*passed/i.test(output) && !/verification passed/i.test(output)) {
    failures.push('verification failed: terminal verification did not report passed')
  }

  let failureCategory = 'none'
  if (failures.some((failure) => failure.startsWith('no-mutation guard failure'))) {
    failureCategory = 'no-mutation guard failure'
  } else if (failures.some((failure) => failure.startsWith('real repo mutation leak'))) {
    failureCategory = 'real repo mutation leak'
  } else if (failures.some((failure) => failure.startsWith('redaction failure'))) {
    failureCategory = 'redaction failure'
  } else if (failures.some((failure) => failure.startsWith('terminal result missing'))) {
    failureCategory = 'terminal result missing'
  } else if (failures.some((failure) => failure.startsWith('changedFiles wrong'))) {
    failureCategory = 'changedFiles wrong'
  } else if (failures.some((failure) => failure.startsWith('verification failed'))) {
    failureCategory = 'verification failed'
  }

  return {
    ok: failures.length === 0,
    failures,
    failureCategory,
    statusDetail: statusDetailForCodingFlowFailureCategory(failureCategory),
  }
}

function statusDetailForCodingFlowFailureCategory(failureCategory) {
  if (failureCategory === 'no-mutation guard failure') return 'no-mutation-guard-failure'
  if (failureCategory === 'real repo mutation leak') return 'real-repo-mutation-leak'
  if (failureCategory === 'redaction failure') return 'redaction-failure'
  if (failureCategory === 'terminal result missing') return 'terminal-result-missing'
  if (failureCategory === 'changedFiles wrong') return 'changed-files-wrong'
  if (failureCategory === 'verification failed') return 'verification-failed'
  if (failureCategory === 'product runtime regression') return 'product-runtime-regression'
  return 'passed'
}

function runRealCodingFlowFailureAttributionSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-failure-attribution-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const providerCases = [
    {
      name: 'network-mid-turn',
      result: {
        code: 0,
        timedOut: false,
        output: [
          'Provider readiness failed (provider-readiness:network): Unable to reach the OpenAI-compatible endpoint.',
          'Authorization: Bearer sk-live-secret-123456789',
          'D:/Test/home-sf/.private-agents/config.json',
        ].join('\n'),
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        failureCategory: 'provider-network-inconclusive',
      },
    },
    {
      name: 'auth-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:auth invalid api key api_key=sk-live-secret-123456789',
      },
      expected: {
        status: 'CONFIG',
        statusDetail: 'config-failure',
        exitCode: 3,
        failureCategory: 'auth/config failure',
      },
    },
    {
      name: 'model-mid-turn',
      result: {
        code: 1,
        timedOut: false,
        output: 'provider-readiness:model unsupported model or rate limit 429 for requested model',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'provider-model-failed',
        exitCode: 1,
        failureCategory: 'model/quota/rate-limit failure',
      },
    },
    {
      name: 'timeout-mid-turn',
      result: {
        code: -1,
        timedOut: true,
        output: 'coding flow model turn timed out',
      },
      expected: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        exitCode: 2,
        failureCategory: 'provider-network-inconclusive',
      },
    },
    {
      name: 'redaction',
      result: {
        code: 1,
        timedOut: false,
        output: 'tool output without provider readiness marker',
      },
      redaction: {
        ok: false,
        leaks: ['api-key-value'],
        redacted: 'tool output without provider readiness marker',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'redaction-failure',
        exitCode: 1,
        failureCategory: 'redaction failure',
      },
    },
    {
      name: 'product-runtime',
      result: {
        code: 1,
        timedOut: false,
        output: 'tool execution failed after provider turn completed',
      },
      expected: {
        status: 'FAIL',
        statusDetail: 'product-runtime-regression',
        exitCode: 1,
        failureCategory: 'product runtime regression',
      },
    },
  ]

  const successOutput = [
    'Result',
    '- Outcome: success',
    '- Changed files: note.txt',
    '- Verification: passed',
  ].join('\n')
  const baseComparison = { ok: false, added: [], removed: [], changed: ['note.txt'] }
  const baseExpected = {
    ok: true,
    observed: ['note.txt'],
    expected: ['note.txt'],
    unexpected: [],
    missing: [],
    protectedChanged: [],
  }
  const cleanRepo = { ok: true, status: '', outputTail: '' }
  const successCases = [
    {
      name: 'no-mutation-guard',
      args: [
        successOutput,
        baseComparison,
        baseExpected,
        'status: ready\n',
        { ok: true, leaks: [] },
        { ok: true, status: ' M scripts/verify-real-user-capabilities.mjs', outputTail: '' },
        cleanRepo,
      ],
      expectedCategory: 'no-mutation guard failure',
      expectedStatusDetail: 'no-mutation-guard-failure',
    },
    {
      name: 'real-repo-mutation-leak',
      args: [
        successOutput,
        baseComparison,
        baseExpected,
        'status: ready\n',
        { ok: true, leaks: [] },
        cleanRepo,
        { ok: true, status: ' M package.json', outputTail: '' },
      ],
      expectedCategory: 'real repo mutation leak',
      expectedStatusDetail: 'real-repo-mutation-leak',
    },
    {
      name: 'terminal-result-missing',
      args: [
        '- Changed files: note.txt\n- Verification: passed',
        baseComparison,
        baseExpected,
        'status: ready\n',
        { ok: true, leaks: [] },
        cleanRepo,
        cleanRepo,
      ],
      expectedCategory: 'terminal result missing',
      expectedStatusDetail: 'terminal-result-missing',
    },
    {
      name: 'changed-files-wrong',
      args: [
        successOutput,
        { ok: false, added: [], removed: [], changed: ['README.md'] },
        {
          ok: false,
          observed: ['README.md'],
          expected: ['note.txt'],
          unexpected: ['README.md'],
          missing: ['note.txt'],
          protectedChanged: ['README.md'],
        },
        'status: ready\n',
        { ok: true, leaks: [] },
        cleanRepo,
        cleanRepo,
      ],
      expectedCategory: 'changedFiles wrong',
      expectedStatusDetail: 'changed-files-wrong',
    },
    {
      name: 'verification-failed',
      args: [
        successOutput,
        baseComparison,
        baseExpected,
        'status: draft\n',
        { ok: true, leaks: [] },
        cleanRepo,
        cleanRepo,
      ],
      expectedCategory: 'verification failed',
      expectedStatusDetail: 'verification-failed',
    },
  ]

  let ok = true
  for (const item of providerCases) {
    const redaction = item.redaction ?? redactAndAssertCodingProviderOutput(item.result.output)
    const status = buildCodingFlowSmokeFailureStatus(item.result, redaction.redacted, redaction)
    const combined = [
      status.status,
      status.statusDetail,
      status.failureCategory,
      status.failureReason,
      redaction.redacted,
    ].join('\n')
    const safe = redactAndAssertCodingProviderOutput(combined)
    const passed =
      status.status === item.expected.status &&
      status.statusDetail === item.expected.statusDetail &&
      status.exitCode === item.expected.exitCode &&
      status.failureCategory === item.expected.failureCategory &&
      safe.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] coding-flow-failure-${item.name} category=${status.failureCategory} status=${status.statusDetail} exit=${status.exitCode} redaction=${safe.ok ? 'pass' : 'fail'}`,
    )
    if (!passed && safe.leaks.length > 0) {
      console.log(`leaks=${safe.leaks.join(',')}`)
    }
    ok = ok && passed
  }

  for (const item of successCases) {
    const result = assertCodingFlowSmokeSuccess(...item.args)
    const combined = [
      result.failureCategory,
      result.statusDetail,
      result.failures.join('\n'),
    ].join('\n')
    const safe = redactAndAssertCodingProviderOutput(combined)
    const passed =
      !result.ok &&
      result.failureCategory === item.expectedCategory &&
      result.statusDetail === item.expectedStatusDetail &&
      safe.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] coding-flow-assertion-${item.name} category=${result.failureCategory} status=${result.statusDetail} redaction=${safe.ok ? 'pass' : 'fail'}`,
    )
    if (!passed && safe.leaks.length > 0) {
      console.log(`leaks=${safe.leaks.join(',')}`)
    }
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function runRealCodingFlowFollowupContextSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-followup-context-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const fixture = {
    editableFiles: ['note.txt'],
    protectedFiles: ['README.md', 'LOCKED.md'],
  }
  const cases = [
    {
      name: 'provider-network',
      result: {
        status: 'PROVIDER_NETWORK',
        statusDetail: 'provider-network-inconclusive',
        failureCategory: 'provider-network-inconclusive',
        failureReason: [
          'provider-readiness:network: endpoint unreachable',
          'Authorization: Bearer sk-live-secret-123456789',
          'D:/Test/home-sf/.private-agents/config.json',
        ].join('\n'),
        changedFiles: [],
        verification: 'blocked',
      },
      followupPrompt: 'retry after api_key=sk-live-secret-123456789 recovers',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=provider-network-inconclusive',
        'status=provider-network-inconclusive',
        'changedFiles=none',
        'editableFiles=note.txt',
        'protectedFiles=LOCKED.md,README.md',
        'verification=blocked',
        'DoNext=Retry the same isolated fixture task',
      ],
    },
    {
      name: 'auth-config',
      result: {
        status: 'CONFIG',
        statusDetail: 'config-failure',
        failureCategory: 'auth/config failure',
        failureReason: 'provider-readiness:auth invalid api key api_key=sk-live-secret-123456789',
        changedFiles: [],
        verification: 'blocked',
      },
      followupPrompt: 'retry without printing D:/Test/home-sf/.private-agents/config.json',
      expected: [
        'previousOutcome=provider-failure',
        'blocker=auth/config failure',
        'status=config-failure',
        'DoNext=Fix provider configuration or authentication outside this run',
      ],
    },
    {
      name: 'changed-files-wrong',
      result: {
        status: 'FAIL',
        statusDetail: 'changed-files-wrong',
        failureCategory: 'changedFiles wrong',
        failureReason: 'changedFiles wrong: observed=README.md expected=note.txt',
        changedFiles: ['README.md'],
        verification: 'failed',
      },
      followupPrompt: 'retry and only edit note.txt',
      expected: [
        'previousOutcome=stopped',
        'blocker=changedFiles wrong',
        'status=changed-files-wrong',
        'changedFiles=README.md',
        'DoNext=Inspect fixture changed files and retry with only note.txt editable',
      ],
    },
    {
      name: 'verification-failed',
      result: {
        status: 'FAIL',
        statusDetail: 'verification-failed',
        failureCategory: 'verification failed',
        failureReason: 'verification failed: note.txt does not contain status: ready',
        changedFiles: ['note.txt'],
        verification: 'failed',
      },
      followupPrompt: 'make note.txt contain status: ready',
      expected: [
        'previousOutcome=stopped',
        'blocker=verification failed',
        'status=verification-failed',
        'changedFiles=note.txt',
        'verification=failed',
        'DoNext=Repair the fixture verification failure',
      ],
    },
    {
      name: 'patch-from-not-found',
      result: {
        status: 'FAIL',
        statusDetail: 'patch-from-not-found',
        failureCategory: 'product runtime regression',
        failureReason: [
          'patch-from-not-found: mutation instruction missing for note.txt',
          'Authorization: Bearer sk-live-secret-123456789',
          'api_key=sk-url-secret-123456789',
          'refresh_token=refresh-secret',
          'access_token=access-secret',
          'D:/Test/home-sf/.private-agents/config.json',
          '/home/wang/.private-agents-real/.private-agents/config.json',
        ].join('\n'),
        changedFiles: [],
        failedFiles: ['note.txt'],
        targetFile: 'note.txt',
        verification: 'blocked',
        nextAction: 'Retry with exact replacement for note.txt after reading the current fixture content.',
      },
      followupPrompt: [
        'retry with exact replacement for note.txt',
        'Authorization: Bearer sk-live-secret-123456789',
        'api_key=sk-url-secret-123456789',
        '/home/wang/.private-agents-real/.private-agents/config.json',
      ].join(' '),
      expected: [
        'previousOutcome=stopped',
        'blocker=product runtime regression',
        'status=patch-from-not-found',
        'targetFile=note.txt',
        'failedFiles=note.txt',
        'changedFiles=none',
        'protectedFiles=LOCKED.md,README.md',
        'verification=blocked',
        'reason=patch-from-not-found',
        'mutation instruction missing',
        'DoNext=Retry with exact replacement for note.txt',
        'followup=retry with exact replacement for note.txt',
      ],
    },
    {
      name: 'repo-leak',
      result: {
        status: 'FAIL',
        statusDetail: 'real-repo-mutation-leak',
        failureCategory: 'real repo mutation leak',
        failureReason: 'real repo mutation leak: repository changed during smoke',
        changedFiles: ['note.txt'],
        verification: 'blocked',
      },
      followupPrompt: 'restore repo before retrying',
      expected: [
        'previousOutcome=stopped',
        'blocker=real repo mutation leak',
        'status=real-repo-mutation-leak',
        'DoNext=Inspect and restore repository changes before retrying',
      ],
    },
  ]

  let ok = true
  for (const item of cases) {
    const context = buildCodingFlowFailureFollowupContext(item.result, item.followupPrompt, fixture)
    const hasExpected = item.expected.every((marker) => context.contextLine.includes(marker))
    const avoidsConfigPath = !/\.private-agents(?:-real)?[\\/]+(?:\.private-agents[\\/]+)?config\.json/i.test(context.contextLine)
    const avoidsKey = !/\bsk-[A-Za-z0-9][A-Za-z0-9._-]{8,}\b/i.test(context.contextLine)
    const avoidsAuthHeader = !/Authorization\s*:/i.test(context.contextLine)
    const avoidsToken = !/\b(?:refresh_token|access_token|api_key)\b/i.test(context.contextLine)
    const passed = hasExpected && avoidsConfigPath && avoidsKey && avoidsAuthHeader && avoidsToken && context.redaction.ok
    console.log(
      `[${passed ? 'PASS' : 'FAIL'}] coding-flow-followup-${item.name} blocker=${context.blocker} status=${context.statusDetail} redaction=${context.redaction.ok ? 'pass' : 'fail'}`,
    )
    if (!passed) {
      console.log(`context=${context.contextLine}`)
      if (context.redaction.leaks.length > 0) {
        console.log(`leaks=${context.redaction.leaks.join(',')}`)
      }
    }
    ok = ok && passed
  }

  process.exit(ok ? 0 : 1)
}

function buildSyntheticPatchFromNotFoundFollowupContext() {
  const fixture = {
    editableFiles: ['note.txt'],
    protectedFiles: ['README.md', 'LOCKED.md'],
  }
  const result = {
    status: 'FAIL',
    statusDetail: 'patch-from-not-found',
    failureCategory: 'product runtime regression',
    failureReason: 'patch-from-not-found: mutation instruction missing for note.txt',
    changedFiles: [],
    failedFiles: ['note.txt'],
    targetFile: 'note.txt',
    verification: 'blocked',
    nextAction: 'Retry with exact replacement for note.txt after reading the current fixture content.',
  }
  return buildCodingFlowFailureFollowupContext(
    result,
    'explain the previous failure and provide a safe recovery step for note.txt',
    fixture,
  )
}

function buildCodingFlowFollowupPrompt(context) {
  return [
    'You are receiving a safe redacted failure-follow-up context from a previous stopped coding flow.',
    'This is an explain-only, non-mutating follow-up turn.',
    '',
    '<context>',
    context.contextLine,
    '</context>',
    '',
    'Explain only. Do not inspect, modify, create, remove, or write files.',
    'Do not treat DoNext or recovery labels in the context as an instruction to perform work now.',
    'Do not claim the previous coding task is complete or successful.',
    'In plain text, summarize the stopped outcome, the target note.txt, and the failure labels patch-from-not-found and mutation instruction missing.',
    'Then describe the safe human-authorized recovery shape: a later turn should use the current source text and an exact replacement while keeping protected files unchanged.',
  ].join('\n')
}

function inferFollowupPromptIntent(prompt) {
  const normalized = String(prompt ?? '').toLowerCase()
  const explainOnly =
    /\bexplain-only\b/.test(normalized) ||
    /\bexplain only\b/.test(normalized) ||
    /\bnon-mutating\b/.test(normalized)
  const failureContext =
    /\bpatch-from-not-found\b/.test(normalized) ||
    /\bmutation instruction missing\b/.test(normalized) ||
    /\bstopped\b/.test(normalized)
  return explainOnly && failureContext ? 'explain-failure' : 'unknown'
}

function isNonMutatingFollowupPrompt(prompt) {
  const normalized = String(prompt ?? '').toLowerCase()
  return (
    inferFollowupPromptIntent(prompt) === 'explain-failure' &&
    /\bdo not (?:inspect, )?modify\b/.test(normalized) &&
    /\bdo not .*perform work now\b/.test(normalized) &&
    /\bdo not claim\b/.test(normalized)
  )
}

function detectFollowupEditRouting(output, executionPath = 'cli-orchestration') {
  if (executionPath === 'direct-provider-explanation') {
    return {
      enteredEditTargetResolution: false,
      ambiguousTargetDetected: false,
    }
  }
  const normalized = String(output ?? '')
  const ambiguousTargetDetected = /\bambiguous-target\b/i.test(normalized)
  const enteredEditTargetResolution =
    ambiguousTargetDetected ||
    /-\s*Task:\s*edit-file\b/i.test(normalized) ||
    /-\s*Failed files:\s*.*ambiguous-target/i.test(normalized)
  return {
    enteredEditTargetResolution,
    ambiguousTargetDetected,
  }
}

function buildCodingFlowFollowupRoutingDiagnostics({
  prompt = '',
  output = '',
  executionPath = 'cli-orchestration',
} = {}) {
  return {
    followupExecutionPath: executionPath,
    followupPromptIntent: inferFollowupPromptIntent(prompt),
    nonMutatingFollowup: isNonMutatingFollowupPrompt(prompt),
    ...detectFollowupEditRouting(output, executionPath),
  }
}

function assertCodingFlowFollowupSmokeResponse({
  output = '',
  prompt = '',
  executionPath = 'cli-orchestration',
  redaction = { ok: true, leaks: [] },
  comparison = { ok: true, added: [], removed: [], changed: [] },
  repoBefore = { ok: true, status: '' },
  repoAfter = { ok: true, status: '' },
} = {}) {
  const normalized = String(output ?? '')
  const routing = buildCodingFlowFollowupRoutingDiagnostics({
    prompt,
    output: normalized,
    executionPath,
  })
  const failures = []
  if (routing.followupPromptIntent !== 'explain-failure' || !routing.nonMutatingFollowup) {
    failures.push('follow-up prompt is not explain-only non-mutating')
  }
  if (!redaction.ok) {
    failures.push('redaction leak')
  }
  if (!repoBefore.ok || repoBefore.status || !repoAfter.ok || repoAfter.status) {
    failures.push('real repo mutation leak')
  }
  const changed = [...(comparison.changed ?? []), ...(comparison.added ?? []), ...(comparison.removed ?? [])].sort()
  if (changed.length > 0 || comparison.ok === false) {
    failures.push(`fixture mutation leak: ${changed.length > 0 ? changed.join(',') : 'unknown'}`)
  }
  if (normalized.trim().length === 0) {
    failures.push('terminal result missing')
  }
  if (routing.enteredEditTargetResolution) {
    failures.push('follow-up entered edit target resolution')
  }
  if (!/\b(note\.txt|target file)\b/i.test(normalized)) {
    failures.push('context missing: target file not acknowledged')
  }
  if (!/\b(patch-from-not-found|mutation instruction missing|exact replacement|exact current source|re-read|read the current|source text not found)\b/i.test(normalized)) {
    failures.push('follow-up response ignores failure context')
  }
  if (!/\b(next step|next action|safe recovery|re-read|read the current|provide the exact|retry with exact|do not modify protected)\b/i.test(normalized)) {
    failures.push('safe next action missing')
  }
  if (/\b(?:I (?:have )?(?:completed|fixed|changed|updated)|successfully (?:changed|updated|fixed)|task (?:is )?(?:complete|completed)|status:\s*ready)\b/i.test(normalized)) {
    failures.push('follow-up response claims success')
  }
  return {
    ok: failures.length === 0,
    failures,
    responseVisible: normalized.trim().length > 0,
    acknowledgesTarget: /\b(note\.txt|target file)\b/i.test(normalized),
    acknowledgesFailure: /\b(patch-from-not-found|mutation instruction missing|exact replacement|exact current source|re-read|read the current|source text not found)\b/i.test(normalized),
    safeNextAction: /\b(next step|next action|safe recovery|re-read|read the current|provide the exact|retry with exact|do not modify protected)\b/i.test(normalized),
    claimsSuccess: /\b(?:I (?:have )?(?:completed|fixed|changed|updated)|successfully (?:changed|updated|fixed)|task (?:is )?(?:complete|completed)|status:\s*ready)\b/i.test(normalized),
    fixtureMutationLeak: changed.length > 0 || comparison.ok === false,
    repositoryClean: Boolean(repoBefore.ok) && !repoBefore.status && Boolean(repoAfter.ok) && !repoAfter.status,
    routing,
  }
}

function statusForCodingFlowFollowupAssertion(assertion) {
  if (assertion.ok) {
    return {
      status: 'PASS',
      statusDetail: 'passed',
      exitCode: 0,
      failureCategory: 'none',
      failureReason: '',
    }
  }
  if (assertion.failures.some((entry) => entry.includes('redaction leak'))) {
    return { status: 'FAIL', statusDetail: 'redaction-failure', exitCode: 1, failureCategory: 'redaction failure', failureReason: 'redaction leak' }
  }
  if (assertion.failures.some((entry) => entry.includes('real repo mutation leak'))) {
    return { status: 'FAIL', statusDetail: 'real-repo-mutation-leak', exitCode: 1, failureCategory: 'real repo mutation leak', failureReason: 'real repo mutation leak' }
  }
  if (assertion.failures.some((entry) => entry.includes('fixture mutation leak'))) {
    return { status: 'FAIL', statusDetail: 'fixture-mutation-leak', exitCode: 1, failureCategory: 'fixture mutation leak', failureReason: assertion.failures.join('; ') }
  }
  if (assertion.failures.some((entry) => entry.includes('terminal result missing'))) {
    return { status: 'FAIL', statusDetail: 'terminal-result-missing', exitCode: 1, failureCategory: 'terminal result missing', failureReason: 'provider response was not visible' }
  }
  if (assertion.failures.some((entry) => entry.includes('not explain-only') || entry.includes('edit target resolution'))) {
    return { status: 'FAIL', statusDetail: 'follow-up-entered-edit-routing', exitCode: 1, failureCategory: 'follow-up entered edit routing', failureReason: assertion.failures.join('; ') }
  }
  if (assertion.failures.some((entry) => entry.includes('claims success'))) {
    return { status: 'FAIL', statusDetail: 'follow-up-claimed-success', exitCode: 1, failureCategory: 'follow-up response claims success', failureReason: assertion.failures.join('; ') }
  }
  if (assertion.failures.some((entry) => entry.includes('context missing'))) {
    return { status: 'FAIL', statusDetail: 'context-missing', exitCode: 1, failureCategory: 'context missing', failureReason: assertion.failures.join('; ') }
  }
  return { status: 'FAIL', statusDetail: 'follow-up-ignored-context', exitCode: 1, failureCategory: 'follow-up response ignores failure context', failureReason: assertion.failures.join('; ') }
}

function buildDirectProviderExplanationEvalScript() {
  const modelClientUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'model-adapters', 'client.ts')).href
  const runtimeConfigUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'config', 'runtimeConfig.ts')).href
  const providerCredentialsUrl = pathToFileURL(path.join(tsShellRoot, 'src', 'core', 'shell', 'providerCredentials.ts')).href
  return `
    import { createModelClient } from ${JSON.stringify(modelClientUrl)};
    import { getRuntimeConfig } from ${JSON.stringify(runtimeConfigUrl)};
    import { resolveProviderCredential } from ${JSON.stringify(providerCredentialsUrl)};

    ;(async () => {
      const prompt = process.env.PRIVATE_AGENTS_FOLLOWUP_PROMPT ?? '';
      const workspaceRoot = process.env.PRIVATE_AGENTS_FOLLOWUP_WORKSPACE ?? process.cwd();
      const runtimeConfig = getRuntimeConfig(workspaceRoot);
      const resolved = resolveProviderCredential({ runtimeConfig });
      const credential = resolved.credential;
      if (!credential) {
        throw new Error('provider-readiness:missing-key');
      }
      if (credential.accountAuth && credential.accountAuth.expiresAt <= Date.now()) {
        throw new Error('provider-readiness:auth account-auth token expired; reconnect before running follow-up smoke');
      }
      const model = (resolved.model ?? credential.model ?? '').trim() ||
        (credential.provider === 'openai' && credential.accountAuth ? 'gpt-5.4' : 'gpt-4.1-mini');
      const client = createModelClient({
        provider: credential.provider,
        apiKey: credential.apiKey,
        accountAuth: credential.accountAuth,
        baseUrl: resolved.baseUrl ?? credential.baseUrl,
        requestedCapabilities: { supportsToolCalls: false },
        fallbackPolicy: { enabled: false },
      });
      let output = '';
      const signal = AbortSignal.timeout(300000);
      for await (const event of client.stream({
        schemaVersion: '1.0.0',
        model,
        messages: [
          {
            role: 'system',
            content: [
              'You are answering a non-mutating failure follow-up.',
              'Do not call tools. Do not claim any file was changed.',
              'Explain the supplied failure context and provide a safe next step only.'
            ].join(' ')
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        maxOutputTokens: 700,
      }, signal)) {
        if (event.type === 'content.delta') {
          output += event.delta;
        }
      }
      console.log('__FOLLOWUP_PROVIDER_RESULT__' + JSON.stringify({ output }));
    })().catch((error) => {
      console.error(error instanceof Error ? error.stack ?? error.message : String(error));
      process.exit(1);
    });
  `
}

function directProviderExplanationEvalScriptUsesAsyncWrapper(script) {
  return /;\s*\(async\s*\(\)\s*=>\s*\{/.test(script) &&
    /\}\)\(\)\.catch\(\(error\)\s*=>/.test(script) &&
    /for\s+await\s*\(/.test(script)
}

async function runDirectProviderExplanationTurn({ prompt, runtimeHome, realHome, fixtureDir }) {
  const result = await run(process.execPath, [
    tsxCliPath,
    '--eval',
    buildDirectProviderExplanationEvalScript(),
  ], {
    cwd: tsShellRoot,
    env: {
      HOME: runtimeHome,
      USERPROFILE: runtimeHome,
      PRIVATE_AGENTS_HOME_OVERRIDE: realHome,
      PRIVATE_AGENTS_REAL_HOME: realHome,
      PRIVATE_AGENTS_PROVIDER_MODE: 'real',
      PRIVATE_AGENTS_FOLLOWUP_PROMPT: prompt,
      PRIVATE_AGENTS_FOLLOWUP_WORKSPACE: fixtureDir,
    },
    timeoutMs: 420000,
  })
  const resultLine = result.stdout
    .split(/\r?\n/)
    .find((line) => line.startsWith('__FOLLOWUP_PROVIDER_RESULT__'))
  let output = ''
  if (resultLine) {
    try {
      const parsed = JSON.parse(resultLine.slice('__FOLLOWUP_PROVIDER_RESULT__'.length))
      output = typeof parsed.output === 'string' ? parsed.output : ''
    } catch {
      output = ''
    }
  }
  return {
    ...result,
    stdout: output,
    output: output || result.output,
    rawOutput: result.output,
  }
}

function runRealCodingFlowFollowupSmokeDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-followup-smoke-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')
  console.log('defaultSmoke=skipped')

  const context = buildSyntheticPatchFromNotFoundFollowupContext()
  const prompt = buildCodingFlowFollowupPrompt(context)
  const evalScriptWrapped = directProviderExplanationEvalScriptUsesAsyncWrapper(
    buildDirectProviderExplanationEvalScript(),
  )
  const redaction = redactAndAssertCodingProviderOutput([
    prompt,
    'Authorization: Bearer sk-live-secret-123456789',
    'api_key=sk-url-secret-123456789',
    '/home/wang/.private-agents-real/.private-agents/config.json',
  ].join('\n'))
  const passing = assertCodingFlowFollowupSmokeResponse({
    output: [
      'The previous stopped coding flow targeted note.txt and failed with patch-from-not-found because the mutation instruction was missing.',
      'Safe next action: in a later human-authorized turn, use the current source text and an exact replacement while keeping README.md and LOCKED.md unchanged.',
    ].join('\n'),
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const ignoresContext = assertCodingFlowFollowupSmokeResponse({
    output: 'Please try again later.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const claimsSuccess = assertCodingFlowFollowupSmokeResponse({
    output: 'I successfully changed note.txt to status: ready.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const mutationLeak = assertCodingFlowFollowupSmokeResponse({
    output: 'The next step is to explain note.txt patch-from-not-found and exact replacement recovery.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: true, leaks: [] },
    comparison: { ok: false, added: [], removed: [], changed: ['note.txt'] },
  })
  const leak = assertCodingFlowFollowupSmokeResponse({
    output: 'The next step is to explain note.txt patch-from-not-found and exact replacement recovery.',
    prompt,
    executionPath: 'direct-provider-explanation',
    redaction: { ok: false, leaks: ['api_key'] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const editRouting = assertCodingFlowFollowupSmokeResponse({
    output: [
      'Result',
      '- Outcome: stopped',
      '- Detail: ambiguous-target',
      'Action result',
      '- Task: edit-file',
      '- Failed files: (missing-target) (ambiguous-target)',
    ].join('\n'),
    prompt,
    redaction: { ok: true, leaks: [] },
    comparison: { ok: true, added: [], removed: [], changed: [] },
  })
  const routingDiagnostics = buildCodingFlowFollowupRoutingDiagnostics({
    prompt,
    output: passing.failures.join('\n'),
    executionPath: 'direct-provider-explanation',
  })
  const serialized = JSON.stringify({ context, prompt, redacted: redaction.redacted })
  const passed =
    context.previousOutcome === 'stopped' &&
    context.targetFile === 'note.txt' &&
    context.failedFiles.join(',') === 'note.txt' &&
    routingDiagnostics.followupPromptIntent === 'explain-failure' &&
    routingDiagnostics.nonMutatingFollowup &&
    routingDiagnostics.followupExecutionPath === 'direct-provider-explanation' &&
    routingDiagnostics.enteredEditTargetResolution === false &&
    routingDiagnostics.ambiguousTargetDetected === false &&
    evalScriptWrapped &&
    prompt.includes('Explain only') &&
    prompt.includes('Do not claim the previous coding task is complete') &&
    passing.ok &&
    !ignoresContext.ok &&
    statusForCodingFlowFollowupAssertion(ignoresContext).statusDetail === 'context-missing' &&
    !claimsSuccess.ok &&
    statusForCodingFlowFollowupAssertion(claimsSuccess).statusDetail === 'follow-up-claimed-success' &&
    !mutationLeak.ok &&
    statusForCodingFlowFollowupAssertion(mutationLeak).statusDetail === 'fixture-mutation-leak' &&
    !leak.ok &&
    statusForCodingFlowFollowupAssertion(leak).statusDetail === 'redaction-failure' &&
    !editRouting.ok &&
    statusForCodingFlowFollowupAssertion(editRouting).statusDetail === 'follow-up-entered-edit-routing' &&
    editRouting.routing.enteredEditTargetResolution &&
    editRouting.routing.ambiguousTargetDetected &&
    redaction.ok &&
    !serialized.includes('.private-agents-real') &&
    !serialized.includes('.private-agents/config.json') &&
    !serialized.includes('sk-live-secret') &&
    !serialized.includes('sk-url-secret')

  console.log(`previousOutcome=${context.previousOutcome}`)
  console.log(`targetFile=${context.targetFile}`)
  console.log(`failedFiles=${context.failedFiles.join(',')}`)
  console.log(`followupPromptIntent=${routingDiagnostics.followupPromptIntent}`)
  console.log(`followupExecutionPath=${routingDiagnostics.followupExecutionPath}`)
  console.log(`nonMutatingFollowup=${routingDiagnostics.nonMutatingFollowup}`)
  console.log(`enteredEditTargetResolution=${routingDiagnostics.enteredEditTargetResolution}`)
  console.log(`ambiguousTargetDetected=${routingDiagnostics.ambiguousTargetDetected}`)
  console.log(`evalScriptAsyncWrapper=${evalScriptWrapped ? 'pass' : 'fail'}`)
  console.log(`responseAssertion=${passing.ok ? 'pass' : 'fail'}`)
  console.log(`ignoresContextStatus=${statusForCodingFlowFollowupAssertion(ignoresContext).statusDetail}`)
  console.log(`claimsSuccessStatus=${statusForCodingFlowFollowupAssertion(claimsSuccess).statusDetail}`)
  console.log(`mutationLeakStatus=${statusForCodingFlowFollowupAssertion(mutationLeak).statusDetail}`)
  console.log(`editRoutingStatus=${statusForCodingFlowFollowupAssertion(editRouting).statusDetail}`)
  console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
  console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-followup-smoke-dry-run`)
  process.exit(passed ? 0 : 1)
}

async function runRealCodingFlowFollowupSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-followup-smoke')
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=runtime-only')
  console.log('fixtureMutationAllowed=false')

  if (!realHome) {
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      failureCategory: 'provider-readiness',
      failureReason: 'real provider home is not configured; set PRIVATE_AGENTS_REAL_HOME to opt in',
    }
    writeReport(report)
    console.log('[CONFIG] real-coding-flow-followup-smoke status=config-failure')
    console.log(`report=${reportPath}`)
    process.exit(3)
  }

  try {
    ensureHome(realHome, 'real')
  } catch (error) {
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: 'CONFIG',
      statusDetail: 'config-failure',
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      failureCategory: 'provider-readiness',
      failureReason: error.message,
    }
    writeReport(report)
    console.log('[CONFIG] real-coding-flow-followup-smoke status=config-failure')
    console.log(`report=${reportPath}`)
    process.exit(3)
  }

  const repoBefore = await readRepoStatusShort()
  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildReadonlyPreflightStatus(preflight)
  console.log(`preflight=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    const repoAfter = await readRepoStatusShort()
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      failureCategory: preflightStatus.failureCategory,
      failureReason: preflightStatus.failureReason,
      outputTail: preflight.outputTail,
      redaction: {
        ok: true,
        leaks: [],
      },
    }
    writeReport(report)
    console.log(`[${preflightStatus.status}] real-coding-flow-followup-smoke status=${preflightStatus.statusDetail}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`report=${reportPath}`)
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = createIsolatedCodingFlowRuntimeHome()
  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  const fixture = createCodingFlowFixture()
  try {
    const context = buildSyntheticPatchFromNotFoundFollowupContext()
    const prompt = buildCodingFlowFollowupPrompt(context)
    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const result = await runDirectProviderExplanationTurn({
      prompt,
      runtimeHome,
      realHome,
      fixtureDir: fixture.fixtureDir,
    })
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const redaction = redactAndAssertCodingProviderOutput(result.output)
    const redactedOutput = redaction.redacted
    const repoAfter = await readRepoStatusShort()
    const providerFailure = buildCodingFlowSmokeFailureStatus(result, redactedOutput, redaction)
    const assertion = result.code === 0 && !result.timedOut && !classifyProviderReadinessFailure(
      `coding flow follow-up model turn exited ${result.code}`,
      redactedOutput,
      'real',
    )
      ? assertCodingFlowFollowupSmokeResponse({
          output: redactedOutput,
          prompt,
          executionPath: 'direct-provider-explanation',
          redaction,
          comparison,
          repoBefore,
          repoAfter,
        })
      : {
          ok: false,
          failures: [providerFailure.failureReason],
          responseVisible: redactedOutput.trim().length > 0,
          acknowledgesTarget: false,
          acknowledgesFailure: false,
          safeNextAction: false,
          claimsSuccess: false,
          fixtureMutationLeak: comparison.ok === false || comparison.added.length > 0 || comparison.removed.length > 0 || comparison.changed.length > 0,
          repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
          routing: buildCodingFlowFollowupRoutingDiagnostics({
            prompt,
            output: redactedOutput,
            executionPath: 'direct-provider-explanation',
          }),
        }
    const assertionStatus = result.code === 0 && !result.timedOut
      ? statusForCodingFlowFollowupAssertion(assertion)
      : providerFailure
    const report = {
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-followup-smoke',
      provider: 'real',
      mode: 'explicit-opt-in',
      status: assertionStatus.status,
      statusDetail: assertionStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      followupExecutionPath: 'direct-provider-explanation',
      syntheticFailureContext: true,
      stoppedSessionCreated: false,
      fixtureMutationAllowed: false,
      runtimeHome: 'isolated-test-root',
      auditIsolation: inspectCodingFlowAuditIsolation({
        auditLogPath,
        repoAfter,
      }),
      fixture: {
        files: fixture.files,
        editableFiles: fixture.editableFiles,
        protectedFiles: fixture.protectedFiles,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      followupContext: {
        previousOutcome: context.previousOutcome,
        blocker: context.blocker,
        statusDetail: context.statusDetail,
        targetFile: context.targetFile,
        failedFiles: context.failedFiles,
        changedFiles: context.changedFiles,
        verification: context.verification,
        protectedFiles: context.protectedFiles,
        redaction: context.redaction,
      },
      responseAssertion: {
        ok: assertion.ok,
        responseVisible: assertion.responseVisible,
        acknowledgesTarget: assertion.acknowledgesTarget,
        acknowledgesFailure: assertion.acknowledgesFailure,
        safeNextAction: assertion.safeNextAction,
        claimsSuccess: assertion.claimsSuccess,
        fixtureMutationLeak: assertion.fixtureMutationLeak,
      },
      routingDiagnostics: assertion.routing,
      repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
      redaction: {
        ok: redaction.ok,
        leaks: redaction.leaks,
      },
      failureCategory: assertionStatus.failureCategory,
      failureReason: assertionStatus.failureReason || assertion.failures.join('; '),
      nextAction: assertion.ok
        ? 'Continue with the next explicitly authorized validation.'
        : 'Inspect the redacted follow-up response assertion and retry only after fixing the product or smoke contract issue.',
      outputTail: summarizeOutput(redactedOutput),
    }
    writeReport(report)
    console.log(`status=${report.status}`)
    console.log(`statusDetail=${report.statusDetail}`)
    console.log(`repositoryClean=${report.repositoryClean}`)
    console.log(`auditLogKind=${report.auditIsolation.auditLogKind}`)
    console.log(`repoAuditResidueDetected=${report.auditIsolation.repoAuditResidueDetected}`)
    console.log(`fixtureMutationLeak=${report.responseAssertion.fixtureMutationLeak}`)
    console.log(`followupExecutionPath=${report.routingDiagnostics.followupExecutionPath}`)
    console.log(`followupPromptIntent=${report.routingDiagnostics.followupPromptIntent}`)
    console.log(`nonMutatingFollowup=${report.routingDiagnostics.nonMutatingFollowup}`)
    console.log(`enteredEditTargetResolution=${report.routingDiagnostics.enteredEditTargetResolution}`)
    console.log(`ambiguousTargetDetected=${report.routingDiagnostics.ambiguousTargetDetected}`)
    console.log(`responseVisible=${report.responseAssertion.responseVisible}`)
    console.log(`acknowledgesTarget=${report.responseAssertion.acknowledgesTarget}`)
    console.log(`acknowledgesFailure=${report.responseAssertion.acknowledgesFailure}`)
    console.log(`safeNextAction=${report.responseAssertion.safeNextAction}`)
    console.log(`claimsSuccess=${report.responseAssertion.claimsSuccess}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`[${report.status}] real-coding-flow-followup-smoke status=${report.statusDetail}`)
    process.exit(assertionStatus.exitCode)
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}


function runRealCodingFlowDiagnosticsSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-diagnostics-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const runtimeHome = createIsolatedCodingFlowRuntimeHome()
  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  const fixture = createCodingFlowFixture()
  try {
    fs.mkdirSync(path.join(runtimeHome, '.private-agents', 'sessions', 'diagnostic-session'), {
      recursive: true,
    })
    fs.writeFileSync(
      path.join(runtimeHome, '.private-agents', 'sessions', 'diagnostic-session', 'transcript.jsonl'),
      '{}\n',
      'utf8',
    )

    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noteStatusBefore = readCodingFlowNoteStatus(fixture.fixtureDir)
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noteStatusAfter = readCodingFlowNoteStatus(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const expected = assertOnlyExpectedCodingFixtureChanges(
      comparison,
      ['note.txt'],
      fixture.protectedFiles,
    )
    const result = {
      code: 0,
      timedOut: false,
      stdout: [
        'Action result',
        '- Task: edit-file',
        '- Changed: none',
        '- Failed files: note.txt (patch-from-not-found: mutation instruction missing)',
        '- Failure reason: mutation instruction missing',
        '- Read files: note.txt',
        '- Verification: skipped',
        'Execution summary',
        '- Actions: read (1 run)',
        'Authorization: Bearer sk-live-secret-123456789',
        '/home/wang/.private-agents-real/.private-agents/config.json',
      ].join('\n'),
      stderr: 'api_key=sk-url-secret-123456789',
      output: [
        'Action result',
        '- Task: edit-file',
        '- Changed: none',
        '- Failed files: note.txt (patch-from-not-found: mutation instruction missing)',
        '- Failure reason: mutation instruction missing',
        '- Read files: note.txt',
        '- Verification: skipped',
        'Execution summary',
        '- Actions: read (1 run)',
        'Authorization: Bearer sk-live-secret-123456789',
        '/home/wang/.private-agents-real/.private-agents/config.json',
        'api_key=sk-url-secret-123456789',
      ].join('\n'),
    }
    const redacted = redactProviderOutput(result.output)
    const diagnostics = buildCodingFlowDiagnostics({
      result,
      redactedOutput: redacted,
      comparison,
      expected,
      noteStatusBefore,
      noteStatusAfter,
      runtimeHome,
      auditLogPath,
      repoAfter: { ok: true, status: '', outputTail: '' },
      prompt: fixture.prompt,
      failureCategory: 'changedFiles wrong',
      statusDetail: 'changed-files-wrong',
    })
    const successResult = {
      code: 0,
      timedOut: false,
      stdout: [
        'Edit completed for note.txt. Verification passed.',
        'Result',
        '- Outcome: success',
        'Action result',
        '- Task: edit-file',
        '- Changed: 1 file(s)',
        '- Changed files: note.txt',
        '- Read files: note.txt',
        '- Change summary: note.txt: replaced `status: draft` with `status: ready`',
        '- Verification: passed',
        'Execution summary',
        '- Actions: read, edit (2 run)',
      ].join('\n'),
      stderr: '',
    }
    successResult.output = successResult.stdout
    const successDiagnostics = buildCodingFlowDiagnostics({
      result: successResult,
      redactedOutput: redactProviderOutput(successResult.output),
      comparison: { added: [], removed: [], changed: ['note.txt'] },
      expected: { observed: ['note.txt'], expected: ['note.txt'], protectedChanged: [] },
      noteStatusBefore: 'draft',
      noteStatusAfter: 'ready',
      runtimeHome,
      auditLogPath,
      repoAfter: { ok: true, status: '', outputTail: '' },
      prompt: fixture.prompt,
      failureCategory: 'none',
      statusDetail: 'passed',
    })
    const serialized = JSON.stringify({ diagnostics, successDiagnostics })
    const passed =
      diagnostics.process.modelTurnExitCode === 0 &&
      diagnostics.process.modelTurnTimedOut === false &&
      diagnostics.process.modelTurnOutputBytes > 0 &&
      diagnostics.process.outputMarkers.hasActionResult &&
      !diagnostics.process.outputMarkers.hasResultBlock &&
      diagnostics.routing.cliCommandKind === 'print-non-interactive' &&
      diagnostics.routing.cwdKind === 'ts-shell-root' &&
      diagnostics.routing.projectKind === 'isolated-fixture' &&
      diagnostics.routing.promptBytes > 0 &&
      diagnostics.routing.promptIntentHint === 'single-file-edit' &&
      diagnostics.routing.repoAwareSummaryDetected === false &&
      diagnostics.routing.enteredSessionRuntime === true &&
      diagnostics.routing.codingResultPresent === true &&
      diagnostics.routing.resultBlockPresent === false &&
      diagnostics.routing.toolExecutionMarkerPresent === true &&
      diagnostics.fixture.fixtureChangedFiles.length === 0 &&
      diagnostics.fixture.expectedChangedFiles.join(',') === 'note.txt' &&
      diagnostics.fixture.noteStatusBefore === 'draft' &&
      diagnostics.fixture.noteStatusAfter === 'draft' &&
      diagnostics.runtime.runtimeHomeKind === 'isolated-test-root' &&
      diagnostics.runtime.runtimeHomeState.existsAfterTurn &&
      diagnostics.runtime.runtimeHomeState.privateAgentsDirCreated &&
      diagnostics.runtime.runtimeHomeState.sessionArtifactCount === 1 &&
      diagnostics.runtime.realProviderHomeUsedForRuntime === false &&
      diagnostics.runtime.configHomeKind === 'explicit-real-provider-home' &&
      diagnostics.auditIsolation.auditLogKind === 'isolated-test-root' &&
      diagnostics.auditIsolation.repoAuditResidueDetected === false &&
      diagnostics.auditIsolation.auditResidueCleaned === false &&
      diagnostics.auditIsolation.auditLogCreated === false &&
      diagnostics.mutation.taskKind === 'edit-file' &&
      diagnostics.mutation.actionSequence.join(',') === 'read' &&
      diagnostics.mutation.targetFile === 'note.txt' &&
      diagnostics.mutation.mutationInstructionPresent === false &&
      diagnostics.mutation.replaceFromPresent === false &&
      diagnostics.mutation.replaceToPresent === false &&
      diagnostics.mutation.replaceFieldSource === 'none' &&
      diagnostics.mutation.diagnosticSource === 'structured-result' &&
      diagnostics.mutation.patchFailureCode === 'patch-from-not-found' &&
      successDiagnostics.mutation.taskKind === 'edit-file' &&
      successDiagnostics.mutation.actionSequence.join(',') === 'read,edit' &&
      successDiagnostics.mutation.targetFile === 'note.txt' &&
      successDiagnostics.mutation.mutationInstructionPresent === true &&
      successDiagnostics.mutation.replaceFromPresent === true &&
      successDiagnostics.mutation.replaceToPresent === true &&
      successDiagnostics.mutation.replaceFieldSource === 'redacted-output-summary' &&
      successDiagnostics.mutation.diagnosticSource === 'structured-success-no-literal-replace' &&
      successDiagnostics.mutation.patchFailureCode === 'none' &&
      diagnostics.classification.failureStage === 'mutation-assertion' &&
      diagnostics.classification.failureCategory === 'changedFiles wrong' &&
      diagnostics.classification.statusDetail === 'changed-files-wrong' &&
      !serialized.includes('.private-agents-real') &&
      !serialized.includes('.private-agents/config.json') &&
      !serialized.includes('sk-live-secret') &&
      !serialized.includes('sk-url-secret')

    console.log(`modelTurnExitCode=${diagnostics.process.modelTurnExitCode}`)
    console.log(`modelTurnTimedOut=${diagnostics.process.modelTurnTimedOut}`)
    console.log(`noteStatusBefore=${diagnostics.fixture.noteStatusBefore}`)
    console.log(`noteStatusAfter=${diagnostics.fixture.noteStatusAfter}`)
    console.log(`repoAwareSummaryDetected=${diagnostics.routing.repoAwareSummaryDetected}`)
    console.log(`promptIntentHint=${diagnostics.routing.promptIntentHint}`)
    console.log(`runtimeHomeKind=${diagnostics.runtime.runtimeHomeKind}`)
    console.log(`auditLogKind=${diagnostics.auditIsolation.auditLogKind}`)
    console.log(`mutationInstructionPresent=${diagnostics.mutation.mutationInstructionPresent}`)
    console.log(`mutationDiagnosticSource=${diagnostics.mutation.diagnosticSource}`)
    console.log(`successReplaceFromPresent=${successDiagnostics.mutation.replaceFromPresent}`)
    console.log(`successReplaceToPresent=${successDiagnostics.mutation.replaceToPresent}`)
    console.log(`successReplaceFieldSource=${successDiagnostics.mutation.replaceFieldSource}`)
    console.log(`patchFailureCode=${diagnostics.mutation.patchFailureCode}`)
    console.log(`failureStage=${diagnostics.classification.failureStage}`)
    console.log(`redaction=${passed ? 'pass' : 'fail'}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-diagnostics-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

function runRealCodingFlowAuditIsolationSelfTest() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-audit-isolation-self-test')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')

  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  try {
    const cleanRepo = { ok: true, status: '', outputTail: '' }
    const dirtyRepo = {
      ok: true,
      status: '?? packages/ts-shell/.sisyphus/audit/permissions.jsonl',
      outputTail: '',
    }
    const beforeCreate = inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter: cleanRepo,
      auditResidueCleaned: false,
    })
    fs.writeFileSync(auditLogPath, '{"eventType":"permission_check"}\n', 'utf8')
    const afterCreate = inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter: cleanRepo,
      auditResidueCleaned: false,
    })
    const residueDetected = inspectCodingFlowAuditIsolation({
      auditLogPath,
      repoAfter: dirtyRepo,
      auditResidueCleaned: true,
    })
    const serialized = JSON.stringify({ beforeCreate, afterCreate, residueDetected })
    const passed =
      beforeCreate.auditLogKind === 'isolated-test-root' &&
      beforeCreate.repoAuditResidueDetected === false &&
      beforeCreate.auditResidueCleaned === false &&
      beforeCreate.auditLogCreated === false &&
      afterCreate.auditLogKind === 'isolated-test-root' &&
      afterCreate.auditLogCreated === true &&
      afterCreate.repoAuditResidueDetected === false &&
      residueDetected.repoAuditResidueDetected === true &&
      residueDetected.auditResidueCleaned === true &&
      !serialized.includes(auditLogPath) &&
      !serialized.includes('.private-agents-real') &&
      !serialized.includes('.private-agents/config.json')

    console.log(`auditLogKind=${afterCreate.auditLogKind}`)
    console.log(`auditLogCreated=${afterCreate.auditLogCreated}`)
    console.log(`repoAuditResidueDetected=${residueDetected.repoAuditResidueDetected}`)
    console.log(`auditResidueCleaned=${residueDetected.auditResidueCleaned}`)
    console.log(`redaction=${passed ? 'pass' : 'fail'}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-audit-isolation-self-test`)
    process.exitCode = passed ? 0 : 1
  } finally {
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

function assertReadonlySmokeSuccess(output, snapshotComparison, redaction) {
  const failures = []
  if (!redaction.ok) {
    failures.push(`redaction leak detected: ${redaction.leaks.join(',') || 'unknown'}`)
  }
  if (!snapshotComparison.ok) {
    const changed = [
      ...snapshotComparison.added.map((name) => `added:${name}`),
      ...snapshotComparison.removed.map((name) => `removed:${name}`),
      ...snapshotComparison.changed.map((name) => `changed:${name}`),
    ]
    failures.push(`fixture mutated: ${changed.join(',') || 'unknown'}`)
  }
  if (!/(^|\r?\n)Result\s*(\r?\n|$)/.test(output) || !/-\s*Outcome:\s*success/i.test(output)) {
    failures.push('terminal result success was not visible')
  }
  if (!/-\s*(Changed|Changed files):\s*none/i.test(output)) {
    failures.push('changedFiles empty was not visible')
  }
  return {
    ok: failures.length === 0,
    failures,
  }
}

async function runRealReadonlyCodingSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-readonly-coding-smoke')
  renderReadonlyPreflightNotice({ modelTurn: true, readOnlyFixture: true, smoke: true })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=runtime-only')

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildReadonlyPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-readonly-coding-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    if (preflight.outputTail) {
      console.log(preflight.outputTail)
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-readonly-coding-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      readOnlyFixture: false,
      failureCategory: preflightStatus.failureCategory,
      failureReason: preflightStatus.failureReason,
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const fixture = createReadonlyCodingFixture()
  try {
    const before = snapshotReadonlyFixture(fixture.fixtureDir)
    const result = await run(process.execPath, [
      tsxCliPath,
      cliEntryPath,
      '--project',
      fixture.fixtureDir,
      '--print',
      fixture.prompt,
    ], {
      cwd: tsShellRoot,
      env: {
        HOME: realHome,
        USERPROFILE: realHome,
        PRIVATE_AGENTS_PROVIDER_MODE: 'real',
      },
      timeoutMs: 420000,
    })
    const after = snapshotReadonlyFixture(fixture.fixtureDir)
    const comparison = compareReadonlySnapshots(before, after)
    const redaction = redactAndAssertReadonlyProviderOutput(result.output)
    const redactedOutput = redaction.redacted
    const providerFailure = classifyProviderReadinessFailure(
      `read-only model turn exited ${result.code}`,
      redactedOutput,
      'real',
    )

    if (result.code === 0 && !result.timedOut && !providerFailure) {
      const success = assertReadonlySmokeSuccess(redactedOutput, comparison, redaction)
      const report = {
        generatedAt: new Date().toISOString(),
        capability: 'real-readonly-coding-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: success.ok ? 'PASS' : 'FAIL',
        statusDetail: success.ok ? 'passed' : 'product-regression',
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        readOnlyFixture: true,
        fixture: {
          files: fixture.files,
          noMutation: comparison.ok,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        terminalResultVisible: /(^|\r?\n)Result\s*(\r?\n|$)/.test(redactedOutput),
        changedFilesEmptyVisible: /-\s*(Changed|Changed files):\s*none/i.test(redactedOutput),
        redaction: {
          ok: redaction.ok,
          leaks: redaction.leaks,
        },
        failureCategory: success.ok ? 'none' : 'task-execution-failure',
        failureReason: success.failures.join('; '),
        outputTail: summarizeOutput(redactedOutput),
      }
      writeReport(report)
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`noMutation=${comparison.ok}`)
      console.log(`terminalResultVisible=${report.terminalResultVisible}`)
      console.log(`changedFilesEmptyVisible=${report.changedFilesEmptyVisible}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      if (!success.ok) {
        console.log(`failureReason=${report.failureReason}`)
      }
      console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-readonly-coding-smoke`)
      process.exit(success.ok ? 0 : 1)
    }

    const failureStatus = buildReadonlySmokeFailureStatus(result, redactedOutput, redaction)
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-readonly-coding-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: failureStatus.status,
      statusDetail: failureStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      readOnlyFixture: true,
      fixture: {
        files: fixture.files,
        noMutation: comparison.ok,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      redaction: {
        ok: redaction.ok,
        leaks: redaction.leaks,
      },
      failureCategory: failureStatus.failureCategory,
      failureReason: failureStatus.failureReason,
      outputTail: summarizeOutput(redactedOutput),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`noMutation=${comparison.ok}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`[${failureStatus.status}] real-readonly-coding-smoke status=${failureStatus.statusDetail}`)
    if (redactedOutput) {
      console.log(summarizeOutput(redactedOutput))
    }
    process.exit(failureStatus.exitCode)
  } finally {
    cleanupReadonlyFixture(fixture.fixtureDir)
  }
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
      fixture.prompt.includes('src/context.txt') &&
      fixture.prompt.includes('Reply in the terminal only') &&
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

async function runRealCodingFlowSmoke() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-smoke')
  renderCodingFlowPreflightNotice({ modelTurn: true, writableFixture: true })
  console.log('homeRead=false')
  console.log('defaultSmoke=skipped')
  console.log('realProviderHome=runtime-only')

  if (!realHome) {
    const status = {
      status: 'CONFIG',
      statusDetail: 'config-failure',
      exitCode: 3,
      failureCategory: 'auth/config failure',
      failureReason: 'config-failure: set PRIVATE_AGENTS_REAL_HOME on Linux/WSL before running coding flow smoke',
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: status.status,
      statusDetail: status.statusDetail,
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      writableFixture: false,
      failureCategory: status.failureCategory,
      failureReason: status.failureReason,
      ...buildCodingFlowContractFields({
        failureCategory: status.failureCategory,
        statusDetail: status.statusDetail,
      }),
    })
    console.log(`[${status.status}] real-coding-flow-smoke status=${status.statusDetail}`)
    console.log(status.failureReason)
    process.exit(status.exitCode)
  }

  const repoBefore = await readRepoStatusShort()
  if (!repoBefore.ok || repoBefore.status) {
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: 'FAIL',
      statusDetail: 'no-mutation-guard-failure',
      reportPath,
      realProviderExecution: false,
      modelTurn: false,
      writableFixture: false,
      failureCategory: 'no-mutation guard failure',
      failureReason: repoBefore.ok
        ? 'no-mutation guard failure: repository was not clean before smoke'
        : 'no-mutation guard failure: repository status could not be checked before smoke',
      ...buildCodingFlowContractFields({
        failureCategory: 'no-mutation guard failure',
        statusDetail: 'no-mutation-guard-failure',
        repoBefore,
      }),
      outputTail: repoBefore.outputTail,
    })
    console.log('[FAIL] real-coding-flow-smoke status=no-mutation-guard-failure')
    console.log('failureReason=no-mutation guard failure: repository must be clean before opt-in coding flow smoke')
    process.exit(1)
  }

  const preflight = await runProviderReadinessPreflight()
  const preflightStatus = buildCodingFlowPreflightStatus(preflight)
  console.log(`[${preflightStatus.status}] real-coding-flow-preflight status=${preflightStatus.statusDetail}`)
  if (!preflight.ok) {
    if (preflight.outputTail) {
      console.log(preflight.outputTail)
    }
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: preflightStatus.status,
      statusDetail: preflightStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: false,
      writableFixture: false,
      failureCategory: codingFlowFailureCategoryForStatus(
        preflightStatus.statusDetail,
        preflightStatus.failureCategory,
      ),
      failureReason: preflightStatus.failureReason,
      ...buildCodingFlowContractFields({
        failureCategory: codingFlowFailureCategoryForStatus(
          preflightStatus.statusDetail,
          preflightStatus.failureCategory,
        ),
        statusDetail: preflightStatus.statusDetail,
        repoBefore,
        output: preflight.outputTail,
      }),
      outputTail: preflight.outputTail,
    })
    process.exit(preflightStatus.exitCode)
  }

  const runtimeHome = createIsolatedCodingFlowRuntimeHome()
  const auditLogPath = createIsolatedCodingFlowAuditLogPath()
  const fixture = createCodingFlowFixture()
  try {
    const noteStatusBefore = readCodingFlowNoteStatus(fixture.fixtureDir)
    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const result = await run(process.execPath, [
      tsxCliPath,
      cliEntryPath,
      '--project',
      fixture.fixtureDir,
      '--non-interactive-approval',
      'allow-once',
      '--print',
      fixture.prompt,
    ], {
      cwd: tsShellRoot,
      env: {
        HOME: runtimeHome,
        USERPROFILE: runtimeHome,
        PRIVATE_AGENTS_HOME_OVERRIDE: realHome,
        PRIVATE_AGENTS_REAL_HOME: realHome,
        PRIVATE_AGENTS_PROVIDER_MODE: 'real',
        PRIVATE_AGENTS_AUDIT_LOG_PATH: auditLogPath,
      },
      timeoutMs: 420000,
    })
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noteStatusAfter = readCodingFlowNoteStatus(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const expected = assertOnlyExpectedCodingFixtureChanges(
      comparison,
      ['note.txt'],
      fixture.protectedFiles,
    )
    const noteContent = fs.readFileSync(path.join(fixture.fixtureDir, 'note.txt'), 'utf8')
    const redaction = redactAndAssertCodingProviderOutput(result.output)
    const redactedOutput = redaction.redacted
    const repoAfter = await readRepoStatusShort()
    const providerFailure = classifyProviderReadinessFailure(
      `coding flow model turn exited ${result.code}`,
      redactedOutput,
      'real',
    )

    if (result.code === 0 && !result.timedOut && !providerFailure) {
      const success = assertCodingFlowSmokeSuccess(
        redactedOutput,
        comparison,
        expected,
        noteContent,
        redaction,
        repoBefore,
        repoAfter,
      )
      const report = {
        generatedAt: new Date().toISOString(),
        capability: 'real-provider-coding-flow-smoke',
        provider: 'real',
        mode: 'opt-in-smoke',
        status: success.ok ? 'PASS' : 'FAIL',
        statusDetail: success.ok ? 'passed' : success.statusDetail,
        reportPath,
        realProviderExecution: true,
        modelTurn: true,
        writableFixture: true,
        runtimeHome: 'isolated-test-root',
        fixture: {
          files: fixture.files,
          editableFiles: fixture.editableFiles,
          protectedFiles: fixture.protectedFiles,
          added: comparison.added,
          removed: comparison.removed,
          changed: comparison.changed,
        },
        repositoryClean: repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status,
        terminalResultVisible: /(^|\r?\n)Result\s*(\r?\n|$)/.test(redactedOutput),
        changedFiles: expected.observed,
        verification: success.ok ? 'passed' : 'failed',
        redaction: {
          ok: redaction.ok,
          leaks: redaction.leaks,
        },
        failureCategory: success.failureCategory,
        failureReason: success.failures.join('; '),
        nextAction: nextActionForCodingFlowFailure(
          success.failureCategory,
          success.statusDetail,
        ),
        outputTail: summarizeOutput(redactedOutput),
        diagnostics: buildCodingFlowDiagnostics({
          result,
          redactedOutput,
          comparison,
          expected,
          noteStatusBefore,
          noteStatusAfter,
          runtimeHome,
          auditLogPath,
          repoAfter,
          prompt: fixture.prompt,
          failureCategory: success.failureCategory,
          statusDetail: success.statusDetail,
        }),
      }
      writeReport(report)
      console.log(`fixtureFiles=${fixture.files.join(',')}`)
      console.log(`changedFiles=${expected.observed.join(',')}`)
      console.log(`protectedUnchanged=${expected.protectedChanged.length === 0}`)
      console.log(`repositoryClean=${report.repositoryClean}`)
      console.log(`terminalResultVisible=${report.terminalResultVisible}`)
      console.log(`verification=${report.verification}`)
      console.log(`noteStatusBefore=${noteStatusBefore}`)
      console.log(`noteStatusAfter=${noteStatusAfter}`)
      console.log(`repoAwareSummaryDetected=${report.diagnostics.routing.repoAwareSummaryDetected}`)
      console.log(`enteredSessionRuntime=${report.diagnostics.routing.enteredSessionRuntime}`)
      console.log(`auditLogKind=${report.diagnostics.auditIsolation.auditLogKind}`)
      console.log(`repoAuditResidueDetected=${report.diagnostics.auditIsolation.repoAuditResidueDetected}`)
      console.log(`failureStage=${report.diagnostics.classification.failureStage}`)
      console.log(`outputMarkers=${JSON.stringify(report.diagnostics.process.outputMarkers)}`)
      console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
      if (!success.ok) {
        console.log(`failureReason=${report.failureReason}`)
      }
      console.log(`[${success.ok ? 'PASS' : 'FAIL'}] real-coding-flow-smoke`)
      process.exit(success.ok ? 0 : 1)
    }

    const failureStatus = buildCodingFlowSmokeFailureStatus(result, redactedOutput, redaction)
    writeReport({
      generatedAt: new Date().toISOString(),
      capability: 'real-provider-coding-flow-smoke',
      provider: 'real',
      mode: 'opt-in-smoke',
      status: failureStatus.status,
      statusDetail: failureStatus.statusDetail,
      reportPath,
      realProviderExecution: true,
      modelTurn: true,
      writableFixture: true,
      runtimeHome: 'isolated-test-root',
      fixture: {
        files: fixture.files,
        editableFiles: fixture.editableFiles,
        protectedFiles: fixture.protectedFiles,
        added: comparison.added,
        removed: comparison.removed,
        changed: comparison.changed,
      },
      failureCategory: failureStatus.failureCategory,
      failureReason: failureStatus.failureReason,
      ...buildCodingFlowContractFields({
        failureCategory: failureStatus.failureCategory,
        statusDetail: failureStatus.statusDetail,
        changedFiles: expected.observed,
        verification: expected.ok ? 'blocked' : 'failed',
        redaction,
        repoBefore,
        repoAfter,
        output: redactedOutput,
      }),
      outputTail: summarizeOutput(redactedOutput),
      diagnostics: buildCodingFlowDiagnostics({
        result,
        redactedOutput,
        comparison,
        expected,
        noteStatusBefore,
        noteStatusAfter,
        runtimeHome,
        auditLogPath,
        repoAfter,
        prompt: fixture.prompt,
        failureCategory: failureStatus.failureCategory,
        statusDetail: failureStatus.statusDetail,
      }),
    })
    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`changedFiles=${expected.observed.join(',')}`)
    console.log(`protectedUnchanged=${expected.protectedChanged.length === 0}`)
    console.log(`repositoryClean=${repoBefore.ok && !repoBefore.status && repoAfter.ok && !repoAfter.status}`)
    console.log(`terminalResultVisible=${/(^|\r?\n)Result\s*(\r?\n|$)/.test(redactedOutput)}`)
    console.log(`verification=${expected.ok ? 'blocked' : 'failed'}`)
    console.log(`noteStatusBefore=${noteStatusBefore}`)
    console.log(`noteStatusAfter=${noteStatusAfter}`)
    const failureDiagnostics = buildCodingFlowDiagnostics({
      result,
      redactedOutput,
      comparison,
      expected,
      noteStatusBefore,
      noteStatusAfter,
      runtimeHome,
      auditLogPath,
      repoAfter,
      prompt: fixture.prompt,
      failureCategory: failureStatus.failureCategory,
      statusDetail: failureStatus.statusDetail,
    })
    console.log(`repoAwareSummaryDetected=${failureDiagnostics.routing.repoAwareSummaryDetected}`)
    console.log(`enteredSessionRuntime=${failureDiagnostics.routing.enteredSessionRuntime}`)
    console.log(`auditLogKind=${failureDiagnostics.auditIsolation.auditLogKind}`)
    console.log(`repoAuditResidueDetected=${failureDiagnostics.auditIsolation.repoAuditResidueDetected}`)
    console.log(`failureStage=${deriveCodingFlowFailureStage({
      failureCategory: failureStatus.failureCategory,
      statusDetail: failureStatus.statusDetail,
      output: redactedOutput,
      expected,
      noteStatusAfter,
    })}`)
    console.log(`redaction=${redaction.ok ? 'pass' : 'fail'}`)
    console.log(`[${failureStatus.status}] real-coding-flow-smoke status=${failureStatus.statusDetail}`)
    if (redactedOutput) {
      console.log(summarizeOutput(redactedOutput))
    }
    process.exit(failureStatus.exitCode)
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
    cleanupIsolatedCodingFlowRuntimeHome(runtimeHome)
    cleanupIsolatedCodingFlowAuditLog(auditLogPath)
  }
}

function runRealCodingFlowDryRun() {
  console.log('gate name=real-user-capabilities')
  console.log('mode=real-coding-flow-dry-run')
  console.log('homeRead=false')
  console.log('real-provider execution skipped')
  console.log('modelTurn=false')
  console.log('reportWritten=false')
  console.log('defaultSmoke=skipped')

  const fixture = createCodingFlowFixture()
  try {
    const before = snapshotCodingFlowFixture(fixture.fixtureDir)
    const noMutation = compareCodingFlowSnapshots(before, before)
    fs.writeFileSync(
      path.join(fixture.fixtureDir, 'note.txt'),
      'status: ready\nowner: fixture\n',
      'utf8',
    )
    const after = snapshotCodingFlowFixture(fixture.fixtureDir)
    const comparison = compareCodingFlowSnapshots(before, after)
    const expected = assertOnlyExpectedCodingFixtureChanges(
      comparison,
      ['note.txt'],
      fixture.protectedFiles,
    )
    const redaction = redactAndAssertCodingProviderOutput(
      [
        'Authorization: Bearer sk-live-secret-123456789',
        'api_key=sk-url-secret-123456789',
        'refresh_token=refresh-secret',
        'access_token=access-secret',
        'D:/Test/home-sf/.private-agents/config.json',
        '/home/example/.private-agents-real/.private-agents/config.json',
        '/home/wang/.private-agents-real/.private-agents/sessions/session-1/transcript.jsonl',
      ].join('\n'),
    )
    const contract = buildCodingFlowDryRunContract(fixture)
    const terminalSurface = buildTerminalResultSurface({
      status: 'PASS',
      provider: 'real',
      failureCategory: 'none',
      failureReason: '',
      outputTail: 'Result\n- Outcome: success\n- Changed files: note.txt\n- Verification: passed',
    })
    const followup = buildCodingFlowFailureFollowupContext({
      status: 'FAIL',
      provider: 'real',
      statusDetail: 'provider-network-inconclusive',
      failureCategory: 'provider-network-inconclusive',
      failureReason: 'provider-readiness:network: provider endpoint was unreachable during this turn',
      changedFiles: [],
      verification: 'blocked',
      outputTail: 'provider-network-inconclusive',
    }, 'retry the same fixture task after api_key=sk-live-secret-123456789 recovers', fixture)
    const dryRunAuditLogPath = getRealCodingFlowAuditLogPath('dry-run')
    const diagnostics = buildCodingFlowDiagnostics({
      result: {
        code: 0,
        timedOut: false,
        stdout: 'Action result unavailable',
        stderr: '',
        output: 'Action result unavailable',
      },
      redactedOutput: 'Action result unavailable',
      comparison,
      expected,
      noteStatusBefore: 'draft',
      noteStatusAfter: 'ready',
      runtimeHome: path.join(getTestRoot(), 'real-provider-coding-flow-runtime-home', 'dry-run'),
      auditLogPath: dryRunAuditLogPath,
      repoAfter: { ok: true, status: '', outputTail: '' },
      prompt: fixture.prompt,
      failureCategory: 'none',
      statusDetail: 'passed',
    })
    const noteContent = fs.readFileSync(path.join(fixture.fixtureDir, 'note.txt'), 'utf8')
    const promptOk =
      fixture.prompt.includes('Edit only note.txt') &&
      fixture.prompt.includes('status: ready') &&
      fixture.prompt.includes('Do not modify README.md') &&
      fixture.prompt.includes('Do not modify LOCKED.md')
    const contractOk =
      contract.optInRequired &&
      !contract.realProviderExecution &&
      !contract.modelTurn &&
      contract.skip.defaultGate &&
      contract.runtimeHome === 'isolated-test-root' &&
      contract.configHome === 'explicit-real-provider-home' &&
      contract.expectedChangedFiles.length === 1 &&
      contract.expectedChangedFiles[0] === 'note.txt' &&
      contract.expectedVerification === 'passed'
    const surfaceOk =
      terminalSurface.outcome === 'success' &&
      terminalSurface.nextAction === 'Continue with the next task.'
    const failureAttributionOk =
      followup.previousOutcome === 'provider-failure' &&
      followup.blocker === 'provider-network-inconclusive' &&
      followup.statusDetail === 'provider-network-inconclusive' &&
      followup.redaction.ok
    const diagnosticsOk =
      diagnostics.process.modelTurnExitCode === 0 &&
      diagnostics.fixture.expectedChangedFiles.join(',') === 'note.txt' &&
      diagnostics.fixture.fixtureChangedFiles.join(',') === 'note.txt' &&
      diagnostics.fixture.noteStatusBefore === 'draft' &&
      diagnostics.fixture.noteStatusAfter === 'ready' &&
      diagnostics.runtime.runtimeHomeKind === 'isolated-test-root' &&
      diagnostics.runtime.realProviderHomeUsedForRuntime === false &&
      diagnostics.runtime.configHomeKind === 'explicit-real-provider-home' &&
      diagnostics.auditIsolation.auditLogKind === 'isolated-test-root' &&
      diagnostics.auditIsolation.repoAuditResidueDetected === false &&
      diagnostics.mutation.mutationInstructionPresent === true
    const passed =
      noMutation.ok &&
      expected.ok &&
      noteContent.includes('status: ready') &&
      redaction.ok &&
      promptOk &&
      contractOk &&
      surfaceOk &&
      failureAttributionOk &&
      diagnosticsOk

    console.log(`fixtureFiles=${fixture.files.join(',')}`)
    console.log(`changedFiles=${expected.observed.join(',')}`)
    console.log(`protectedUnchanged=${expected.protectedChanged.length === 0}`)
    console.log(`terminalResultSurface=${surfaceOk ? 'pass' : 'fail'}`)
    console.log(`failureFollowupContext=${failureAttributionOk ? 'pass' : 'fail'}`)
    console.log(`diagnosticsShape=${diagnosticsOk ? 'pass' : 'fail'}`)
    console.log(`redaction=${redaction.ok && followup.redaction.ok ? 'pass' : 'fail'}`)
    console.log(`skipReason=${contract.skip.reason}`)
    console.log(`[${passed ? 'PASS' : 'FAIL'}] real-coding-flow-dry-run-contract`)
    process.exit(passed ? 0 : 1)
  } finally {
    cleanupCodingFlowFixture(fixture.fixtureDir)
  }
}

async function main() {
  if (showHelp) {
    printHelp()
    return
  }
  if (realReadonlyCodingPreflightSelfTest) {
    runRealReadonlyCodingPreflightSelfTest()
    return
  }
  if (realReadonlyCodingFailureAttributionSelfTest) {
    runRealReadonlyCodingFailureAttributionSelfTest()
    return
  }
  if (realCodingFlowFailureAttributionSelfTest) {
    runRealCodingFlowFailureAttributionSelfTest()
    return
  }
  if (realCodingFlowFollowupContextSelfTest) {
    runRealCodingFlowFollowupContextSelfTest()
    return
  }
  if (realCodingFlowFollowupSmokeDryRun) {
    runRealCodingFlowFollowupSmokeDryRun()
    return
  }
  if (realCodingFlowDiagnosticsSelfTest) {
    runRealCodingFlowDiagnosticsSelfTest()
    return
  }
  if (realCodingFlowAuditIsolationSelfTest) {
    runRealCodingFlowAuditIsolationSelfTest()
    return
  }
  if (realReadonlyCodingPreflight) {
    await runRealReadonlyCodingPreflight()
    return
  }
  if (realReadonlyCodingSmoke) {
    await runRealReadonlyCodingSmoke()
    return
  }
  if (realReadonlyCodingDryRun) {
    runRealReadonlyCodingDryRun()
    return
  }
  if (realCodingFlowSmoke) {
    await runRealCodingFlowSmoke()
    return
  }
  if (realCodingFlowFollowupSmoke) {
    await runRealCodingFlowFollowupSmoke()
    return
  }
  if (realCodingFlowDryRun) {
    runRealCodingFlowDryRun()
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
  console.log(`real HOME=${realHome ?? 'not-configured'}`)
  const homeCreated = ensureDirIfNeeded(syntheticHome)
  console.log(`homeCreated=${homeCreated}`)
  console.log(`candidateMode=${includeCandidates ? 'include-candidates' : includeContinueSmoke ? 'include-continue-smoke' : 'off'}`)

  try {
    ensureHome(syntheticHome, 'synthetic')
    if (!realHome) {
      throw Object.assign(
        new Error('real provider home is not configured; set PRIVATE_AGENTS_REAL_HOME on Linux/WSL to opt in'),
        { configFailure: true },
      )
    }
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

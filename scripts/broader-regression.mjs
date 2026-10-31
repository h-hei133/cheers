#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { inspectRuntimeConfig } from './support/config.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
const mainRepoRoot = 'D:/LenovoSoftstore/pyproject/source-claudecode/private-coding-agents'
const testRoot = 'D:/Test'
const projectRoot = 'D:/Test'
const resultsDir = path.join(testRoot, 'test-results')
const tsShellCwd = path.join(repoRoot, 'packages', 'ts-shell')
const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const cliEntryPath = path.join(tsShellCwd, 'src', 'entrypoints', 'cli.tsx')
const now = new Date()
const dateStamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
const runId = `${dateStamp}T${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}-${process.pid}`
const CONNECT_FIRST_RESPONSE_MAX_MS = 45000
const VALID_TIERS = new Set(['p0', 'p1', 'full'])

const canonicalEvidence = [
  'Line 1: This file is for continuity contract checks.',
  'Line 2: It contains both summary-worthy and explain-worthy clues.',
  'Line 3: The purpose is to test whether follow-up intent switching is stable.',
  'Line 4: Final evidence line A.',
  'Line 5: Final evidence line B.',
].join('\n') + '\n'

fs.mkdirSync(resultsDir, { recursive: true })
fs.writeFileSync(path.join(testRoot, 'tmp-evidence-read.txt'), canonicalEvidence, 'utf8')

function normalizePath(value) {
  return path.resolve(value).replaceAll('\\', '/').toLowerCase()
}

function ensureEnvironmentBoundary() {
  const normalized = {
    cwd: normalizePath(process.cwd()),
    repoRoot: normalizePath(repoRoot),
    mainRepoRoot: normalizePath(mainRepoRoot),
    projectRoot: normalizePath(projectRoot),
    testRoot: normalizePath(testRoot),
  }

  const cwdIsMainRepo = normalized.cwd === normalized.mainRepoRoot
  const scriptRepoIsMainRepo = normalized.repoRoot === normalized.mainRepoRoot
  const projectRootIsTestRoot = normalized.projectRoot === normalized.testRoot
  const executionFromTestRepoCopy =
    normalized.cwd.startsWith(`${normalized.testRoot}/`) &&
    normalized.cwd.includes('cheers')

  const violations = []
  if (!cwdIsMainRepo) violations.push('cwd-not-main-repo')
  if (!scriptRepoIsMainRepo) violations.push('script-reporoot-not-main-repo')
  if (!projectRootIsTestRoot) violations.push('project-root-not-d-test')
  if (executionFromTestRepoCopy) violations.push('executing-from-d-test-repo-copy')

  return {
    ...normalized,
    cwdIsMainRepo,
    scriptRepoIsMainRepo,
    projectRootIsTestRoot,
    executionFromTestRepoCopy,
    violations,
    passed: violations.length === 0,
  }
}

function parseTierArg(argv) {
  const tierIndex = argv.indexOf('--tier')
  const requested = tierIndex >= 0 ? argv[tierIndex + 1] : 'full'
  if (!VALID_TIERS.has(requested)) {
    throw new Error(`Unsupported --tier value "${requested}". Expected one of: p0, p1, full.`)
  }
  return requested
}

async function resolveHomeDir() {
  const forced = process.env.CHEERS_TEST_HOME
  if (forced) return forced
  const candidates = ['D:/Test/home-daily', 'D:/Test/home-fulltest2', 'D:/Test/home-fulltest', 'D:/Test/home-sf']
  for (const home of candidates) {
    const result = await inspectRuntimeConfig(home, projectRoot)
    if (result.ok && result.present) return home
  }
  const fallback = 'D:/Test/home-daily'
  fs.mkdirSync(path.join(fallback, '.cheers'), { recursive: true })
  return fallback
}

const homeDir = await resolveHomeDir()

function runProcess(command, args, options = {}) {
  const { cwd, env, input, timeoutMs = 120000 } = options
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, timeoutMs)

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })

    child.on('close', (code, signal) => {
      clearTimeout(timer)
      resolve({
        code: code ?? -1,
        signal: signal ?? null,
        timedOut,
        stdout,
        stderr,
        output: `${stdout}${stderr}`,
      })
    })

    if (typeof input === 'string') {
      child.stdin.write(input)
      child.stdin.end()
    } else {
      child.stdin.end()
    }
  })
}

async function runCli(args, options = {}) {
  return runProcess(process.execPath, [tsxCliPath, cliEntryPath, ...args], {
    cwd: tsShellCwd,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      CHEERS_PROVIDER_MODE: 'real',
    },
    ...options,
  })
}

function shouldRetryTransientCliFailure(result) {
  if (!result) return false
  if (result.timedOut) return true
  const output = result.output ?? ''
  if (output.trim().length === 0) return true
  return /provider-readiness:network/i.test(output)
}

async function runCliWithRetry(args, options = {}, maxAttempts = 2) {
  let last = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await runCli(args, options)
    last = current
    if (!shouldRetryTransientCliFailure(current) || attempt === maxAttempts) return current
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
  return last
}

function writeLog(name, content) {
  const file = path.join(resultsDir, `${name}.log`)
  fs.writeFileSync(file, content, 'utf8')
  return file
}

function writeJson(name, value) {
  const file = path.join(resultsDir, `${name}.json`)
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8')
  return file
}

function toRel(p) {
  return p.replaceAll('\\', '/')
}

function readPromptFileUtf8(file) {
  return fs.readFileSync(file, 'utf8')
}

function hasSuccessResult(output) {
  return output.includes('Result: success (completed)')
}

function hasProviderDrift(output) {
  return /provider-readiness|missing-key|authentication was rejected/i.test(output)
}

async function readActiveConnectionId() {
  const result = await inspectRuntimeConfig(homeDir, projectRoot)
  if (!result.ok) throw new Error('Selected configuration cannot be read; no connection substitute was chosen.')
  return result.activeConnectionId
}

function extractSessionId(output) {
  const match = output.match(/Session:\s*(sess_[^\s\r\n]+)/)
  return match?.[1] ?? null
}

function extractSessionIds(output) {
  const matches = output.matchAll(/Session:\s*(sess_[^\s\r\n]+)/g)
  const sessions = []
  for (const match of matches) sessions.push(match[1])
  return sessions
}

function buildReplayPromptFile(name, lines) {
  const file = path.join(resultsDir, `${name}.txt`)
  fs.writeFileSync(file, lines.join('\n') + '\n', 'utf8')
  return file
}

function evaluateGroundedContinuity(output) {
  const summaryOk = /Summary of|Summary\s*:/i.test(output)
  const explainOk = /Explanation for/i.test(output) && !/Caravel|chip design|check_wrapper/i.test(output)
  const readBlocks = Array.from(output.matchAll(/Read result for[^\n]*\n```text\n([\s\S]*?)\n```/g))
  const readTailScope = readBlocks.length > 0 ? String(readBlocks[readBlocks.length - 1]?.[1] ?? '') : output
  const hasLine4 = readTailScope.includes('Line 4: Final evidence line A.')
  const hasLine5 = readTailScope.includes('Line 5: Final evidence line B.')
  const wronglyIncludesHead =
    readTailScope.includes('Line 1: This file is for continuity contract checks.') ||
    readTailScope.includes('Line 2: It contains both summary-worthy and explain-worthy clues.')
  const tailOk = hasLine4 && hasLine5 && !wronglyIncludesHead
  const noCorruption = !/\?{4,}|no context|don.?t have .*context|I don.?t currently have direct access to local files/i.test(output)
  const acceptable = summaryOk && explainOk && tailOk && noCorruption
  return { acceptable, summaryOk, explainOk, tailOk, noCorruption }
}

function evaluateAmbiguousContinuity(output) {
  const lostContext = /don.?t have any context|give me more context|start fresh/i.test(output)
  const genericDrift = /philosophical|creative ideas|just a chat|pick a direction|let.?s chat|we can discuss anything|\u63a8\u8350\u4e00\u4e9b\u521b\u610f|\u804a\u70b9\u522b\u7684/i.test(output)
  const recoversTask = /Summary of tmp-evidence-read.txt|Summary of \.\/tmp-evidence-read.txt/i.test(output)
  const acceptable = !lostContext && !genericDrift && recoversTask
  return { acceptable, lostContext, genericDrift, recoversTask }
}

async function runNonTtyCheck() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tsxCliPath, cliEntryPath, '--project', projectRoot, '--provider', 'openai-compatible'], {
      cwd: tsShellCwd,
      env: {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
        CHEERS_PROVIDER_MODE: 'real',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      output += chunk.toString()
    })

    setTimeout(() => {
      const result = {
        hasPrompt: output.includes('Type your prompt'),
        hasStdinWaitHint: output.includes('Non-TTY stdin mode: waiting for newline-delimited prompts'),
        hasAnyOutput: output.length > 0,
        sample: output.slice(0, 1600),
      }
      child.kill('SIGKILL')
      resolve(result)
    }, 8000)
  })
}

function scanSessions(currentRunSessionSet) {
  const sessionsRoot = path.join(homeDir, '.cheers', 'sessions')
  if (!fs.existsSync(sessionsRoot)) {
    return {
      runId,
      currentRun: { sessions: [], mismatches: [] },
      historical: { sessions: [], mismatches: [] },
    }
  }

  const currentRunSessions = []
  const currentRunMismatches = []
  const historicalSessions = []
  const historicalMismatches = []

  for (const entry of fs.readdirSync(sessionsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !entry.name.startsWith('sess_')) continue

    const sessionDir = path.join(sessionsRoot, entry.name)
    const statePath = path.join(sessionDir, 'state.json')
    const txPath = path.join(sessionDir, 'transcript.jsonl')
    if (!fs.existsSync(statePath)) continue

    let state
    try {
      state = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    } catch {
      continue
    }

    let assistantNotCompleted = false
    let transcriptStopSignal = false
    if (fs.existsSync(txPath)) {
      const tx = fs.readFileSync(txPath, 'utf8')
      let lastQueryCompleted = null
      for (const rawLine of tx.split(/\r?\n/)) {
        const line = rawLine.trim()
        if (!line) continue
        try {
          const event = JSON.parse(line)
          if (event?.type === 'query-event' && event?.event?.type === 'query.completed') {
            lastQueryCompleted = event.event.result ?? null
          }
        } catch {
          // Ignore malformed lines; fallback below if no completed event is found.
        }
      }

      if (lastQueryCompleted) {
        const finalOutput = String(lastQueryCompleted.finalOutput ?? '')
        const stopReason = String(lastQueryCompleted.stopReason ?? '')
        const terminalClassification = String(lastQueryCompleted.terminalClassification ?? '')
        assistantNotCompleted = /Task not completed/i.test(finalOutput)
        transcriptStopSignal =
          /insufficient-evidence|Workflow stopped on blocker\/failure|Escalation denied by user/i.test(
            stopReason,
          ) || /^(stopped|error)$/i.test(terminalClassification)
      } else {
        assistantNotCompleted = /Task not completed/i.test(tx)
        transcriptStopSignal =
          /insufficient-evidence|Workflow stopped on blocker\/failure|Escalation denied by user|"terminalClassification":"(stopped|error)"/i.test(
            tx,
          )
      }
    }

    const record = {
      session: entry.name,
      status: state.status ?? null,
      terminalClassification: state.terminalClassification ?? null,
      terminalReason: state.terminalReason ?? null,
      assistantNotCompleted,
      transcriptStopSignal,
    }

    const isCurrentRun = currentRunSessionSet.has(entry.name)
    if (isCurrentRun) currentRunSessions.push(record)
    else historicalSessions.push(record)

    if ((assistantNotCompleted || transcriptStopSignal) && state.terminalClassification === 'success') {
      if (isCurrentRun) currentRunMismatches.push(record)
      else historicalMismatches.push(record)
    }
  }

  currentRunSessions.sort((a, b) => a.session.localeCompare(b.session))
  historicalSessions.sort((a, b) => a.session.localeCompare(b.session))

  return {
    runId,
    currentRun: { sessions: currentRunSessions, mismatches: currentRunMismatches },
    historical: { sessions: historicalSessions, mismatches: historicalMismatches },
  }
}

function createCheck(input) {
  return {
    contractId: input.contractId,
    name: input.name,
    tier: input.tier,
    gateClass: input.gateClass,
    passed: input.passed,
    failureReasons: input.failureReasons ?? [],
    logs: (input.logs ?? []).map(toRel),
    details: input.details ?? {},
  }
}

async function runReplayScenario(def, currentRunSessionIds) {
  const promptFile = buildReplayPromptFile(`${def.batch}-${dateStamp}-${runId}-${def.contractId}-prompts`, def.lines)
  const run = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', promptFile], { timeoutMs: def.timeoutMs ?? 180000 }, 2)
  const log = writeLog(`${def.batch}-${dateStamp}-${runId}-${def.contractId}`, run.output)
  for (const sessionId of extractSessionIds(run.output)) currentRunSessionIds.add(sessionId)
  const evaluated = def.evaluate(run.output)
  return createCheck({
    contractId: def.contractId,
    name: def.name,
    tier: def.tier,
    gateClass: def.gateClass,
    passed: evaluated.passed,
    failureReasons: evaluated.failureReasons,
    logs: [log, promptFile],
    details: evaluated.details,
  })
}

async function runP0Checks(currentRunSessionIds) {
  const checks = []

  const aSmoke = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'reply exactly: broader-ok'], { timeoutMs: 90000 }, 3)
  const aSmokeLog = writeLog(`A-${dateStamp}-${runId}-smoke`, aSmoke.output)
  for (const session of extractSessionIds(aSmoke.output)) currentRunSessionIds.add(session)

  const aExplain = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'explain ./tmp-evidence-read.txt'], { timeoutMs: 90000 }, 3)
  const aExplainLog = writeLog(`A-${dateStamp}-${runId}-explain`, aExplain.output)
  for (const session of extractSessionIds(aExplain.output)) currentRunSessionIds.add(session)

  const aSummarize = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'summarize ./tmp-evidence-read.txt'], { timeoutMs: 90000 }, 3)
  const aSummarizeLog = writeLog(`A-${dateStamp}-${runId}-summarize`, aSummarize.output)
  for (const session of extractSessionIds(aSummarize.output)) currentRunSessionIds.add(session)

  const aFailureReasons = []
  if (aSmoke.timedOut || aExplain.timedOut || aSummarize.timedOut) aFailureReasons.push('timeout')
  if (!hasSuccessResult(aSmoke.output) || !hasSuccessResult(aExplain.output) || !hasSuccessResult(aSummarize.output)) aFailureReasons.push('missing-success-result')
  if (hasProviderDrift(aSmoke.output + aExplain.output + aSummarize.output)) aFailureReasons.push('provider-drift')

  checks.push(
    createCheck({
      contractId: 'p0.a.mainline-health',
      name: 'A-lite mainline health',
      tier: 'p0',
      gateClass: 'hard',
      passed: aFailureReasons.length === 0,
      failureReasons: aFailureReasons,
      logs: [aSmokeLog, aExplainLog, aSummarizeLog],
    }),
  )

  const groundedLines = [
    '\u603b\u7ed3\u4e00\u4e0b ./tmp-evidence-read.txt \u6587\u4ef6\u5185\u5bb9',
    '\u6240\u4ee5\u4f60\u7684\u603b\u7ed3\u5462\uff1f',
    '\u4e0d\u8981\u603b\u7ed3\u4e86\uff0c\u76f4\u63a5\u89e3\u91ca\u8fd9\u4e2a\u6587\u4ef6\u5728\u505a\u4ec0\u4e48',
    '\u7ee7\u7eed\u8bfb\u53d6\u540e\u4e24\u884c',
  ]
  const ambiguousLines = ['summarize ./tmp-evidence-read.txt', 'then?', 'go on', '\u7ee7\u7eed']
  const stdinProbeToken = '\u7ee7\u7eed-\u4e2d\u6587\u63a2\u9488-broader-2026'
  const stdinProbePrompt = `\u8bf7\u4e25\u683c\u539f\u6837\u8f93\u51fa\u8fd9\u6bb5\u6587\u672c\uff0c\u4e0d\u8981\u6dfb\u52a0\u5185\u5bb9\uff1a${stdinProbeToken}`

  const groundedReplayPrompt = buildReplayPromptFile(`B-${dateStamp}-${runId}-grounded-replay-prompts`, groundedLines)
  const groundedReplay = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', groundedReplayPrompt], { timeoutMs: 180000 })
  const groundedReplayLog = writeLog(`B-${dateStamp}-${runId}-grounded-replay`, groundedReplay.output)
  for (const session of extractSessionIds(groundedReplay.output)) currentRunSessionIds.add(session)

  const groundedStdin = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible'], { input: readPromptFileUtf8(groundedReplayPrompt), timeoutMs: 180000 })
  const groundedStdinLog = writeLog(`B-${dateStamp}-${runId}-grounded-stdin`, groundedStdin.output)
  for (const session of extractSessionIds(groundedStdin.output)) currentRunSessionIds.add(session)

  const ambiguousReplayPrompt = buildReplayPromptFile(`B-${dateStamp}-${runId}-ambiguous-replay-prompts`, ambiguousLines)
  const ambiguousReplay = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', ambiguousReplayPrompt], { timeoutMs: 180000 })
  const ambiguousReplayLog = writeLog(`B-${dateStamp}-${runId}-ambiguous-replay`, ambiguousReplay.output)
  for (const session of extractSessionIds(ambiguousReplay.output)) currentRunSessionIds.add(session)

  const ambiguousStdin = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible'], { input: readPromptFileUtf8(ambiguousReplayPrompt), timeoutMs: 180000 })
  const ambiguousStdinLog = writeLog(`B-${dateStamp}-${runId}-ambiguous-stdin`, ambiguousStdin.output)
  for (const session of extractSessionIds(ambiguousStdin.output)) currentRunSessionIds.add(session)

  const stdinProbePromptFile = buildReplayPromptFile(`B-${dateStamp}-${runId}-stdin-probe-prompts`, [stdinProbePrompt])
  const stdinProbe = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible'], { input: readPromptFileUtf8(stdinProbePromptFile), timeoutMs: 120000 })
  const stdinProbeLog = writeLog(`B-${dateStamp}-${runId}-stdin-probe`, stdinProbe.output)
  for (const session of extractSessionIds(stdinProbe.output)) currentRunSessionIds.add(session)

  const groundedReplayEval = evaluateGroundedContinuity(groundedReplay.output)
  const groundedStdinEval = evaluateGroundedContinuity(groundedStdin.output)
  const ambiguousReplayEval = evaluateAmbiguousContinuity(ambiguousReplay.output)
  const ambiguousStdinEval = evaluateAmbiguousContinuity(ambiguousStdin.output)
  const stdinProbeEchoed = stdinProbe.output.includes(stdinProbeToken)

  const bFailureReasons = []
  if (!groundedReplayEval.acceptable) bFailureReasons.push('groundedReplayEval=false')
  if (!groundedStdinEval.acceptable) bFailureReasons.push('groundedStdinEval=false')
  if (!ambiguousReplayEval.acceptable) bFailureReasons.push('ambiguousReplayEval=false')
  if (!ambiguousStdinEval.acceptable) bFailureReasons.push('ambiguousStdinEval=false')
  if (!stdinProbeEchoed) bFailureReasons.push('stdinIntegrityProbe=false')

  checks.push(
    createCheck({
      contractId: 'p0.b.continuity-contract',
      name: 'Batch B continuity contract',
      tier: 'p0',
      gateClass: 'hard',
      passed: bFailureReasons.length === 0,
      failureReasons: bFailureReasons,
      logs: [
        groundedReplayLog,
        groundedStdinLog,
        ambiguousReplayLog,
        ambiguousStdinLog,
        stdinProbeLog,
        groundedReplayPrompt,
        ambiguousReplayPrompt,
        stdinProbePromptFile,
      ],
      details: {
        groundedReplayEval,
        groundedStdinEval,
        ambiguousReplayEval,
        ambiguousStdinEval,
        stdinIntegrityProbe: { token: stdinProbeToken, echoed: stdinProbeEchoed },
      },
    }),
  )

  const activeConnectionId = await readActiveConnectionId()
  const cPromptFile = buildReplayPromptFile(`C-${dateStamp}-${runId}-connect-prompts`, [
    '/connect status',
    '/connect list',
    activeConnectionId ? `/connect use ${activeConnectionId}` : '/connect use missing-connection-id',
    'reply exactly: connect-ok',
  ])

  const cStart = Date.now()
  const cRun = await runCli(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', cPromptFile], { timeoutMs: 180000 })
  const cElapsedMs = Date.now() - cStart
  const cLog = writeLog(`C-${dateStamp}-${runId}-connect`, cRun.output)
  for (const session of extractSessionIds(cRun.output)) currentRunSessionIds.add(session)

  const cFailureReasons = []
  if (!activeConnectionId) cFailureReasons.push('missing-active-connection-id')
  if (!cRun.output.includes('Active connection switched to')) cFailureReasons.push('connect-switch-not-confirmed')
  if (!hasSuccessResult(cRun.output)) cFailureReasons.push('missing-success-result')
  if (hasProviderDrift(cRun.output)) cFailureReasons.push('provider-drift')
  if (cElapsedMs > CONNECT_FIRST_RESPONSE_MAX_MS) cFailureReasons.push('connect-first-response-timeout-threshold')

  checks.push(
    createCheck({
      contractId: 'p0.c.connect-truth',
      name: 'Connect truth with active provider',
      tier: 'p0',
      gateClass: 'hard',
      passed: cFailureReasons.length === 0,
      failureReasons: cFailureReasons,
      logs: [cLog, cPromptFile],
      details: { activeConnectionId, elapsedMs: cElapsedMs },
    }),
  )

  const dPromptFile = buildReplayPromptFile(`D-${dateStamp}-${runId}-approval-prompts`, ['Use shell command node --version and report the exact output.'])
  const dRun = await runCli(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', dPromptFile], { timeoutMs: 180000 })
  const dLog = writeLog(`D-${dateStamp}-${runId}-approval`, dRun.output)
  for (const session of extractSessionIds(dRun.output)) currentRunSessionIds.add(session)

  const dSessionId = extractSessionId(dRun.output)
  let dState = null
  let dStateOk = false
  if (dSessionId) {
    const sessionDir = path.join(homeDir, '.cheers', 'sessions', dSessionId)
    const statePath = path.join(sessionDir, 'state.json')
    const txPath = path.join(sessionDir, 'transcript.jsonl')
    let tx = ''
    if (fs.existsSync(statePath)) dState = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    if (fs.existsSync(txPath)) tx = fs.readFileSync(txPath, 'utf8')
    const hasStopSignal = /Task not completed|insufficient-evidence|Escalation denied by user|Workflow stopped on blocker\/failure/i.test(dRun.output + tx)
    dStateOk = !hasStopSignal || (dState && dState.terminalClassification !== 'success')
  }

  const dFailureReasons = []
  if (!dSessionId) dFailureReasons.push('missing-session-id')
  if (!dStateOk) dFailureReasons.push('state-durability-mismatch')
  checks.push(
    createCheck({
      contractId: 'p0.d.approval-state-consistency',
      name: 'Approval and state durability consistency',
      tier: 'p0',
      gateClass: 'hard',
      passed: dFailureReasons.length === 0,
      failureReasons: dFailureReasons,
      logs: [dLog, dPromptFile],
      details: { sessionId: dSessionId, state: dState },
    }),
  )

  const eResult = await runNonTtyCheck()
  const eJsonPath = writeJson(`E-${dateStamp}-${runId}-nontty`, eResult)
  const eFailureReasons = []
  if (!eResult.hasAnyOutput) eFailureReasons.push('no-output-within-8s')
  if (!(eResult.hasPrompt || eResult.hasStdinWaitHint)) eFailureReasons.push('missing-operable-prompt-or-stdin-hint')
  checks.push(
    createCheck({
      contractId: 'p0.e.non-tty-startup',
      name: 'Non-TTY startup operability',
      tier: 'p0',
      gateClass: 'hard',
      passed: eFailureReasons.length === 0,
      failureReasons: eFailureReasons,
      logs: [eJsonPath],
      details: eResult,
    }),
  )

  return checks
}

function evaluateScenarioOutput(expectations, output) {
  const reasons = []
  for (const pattern of expectations.mustInclude ?? []) {
    if (!pattern.test(output)) reasons.push(`missing:${pattern}`)
  }
  for (const pattern of expectations.mustNotInclude ?? []) {
    if (pattern.test(output)) reasons.push(`unexpected:${pattern}`)
  }
  return reasons
}

async function runP1P2Checks(currentRunSessionIds) {
  const scenarioDefs = [
    {
      contractId: 'p1.session-rebind.lifecycle',
      name: 'Session rebind/recovery lifecycle',
      tier: 'p1',
      gateClass: 'hard',
      batch: 'P1',
      lines: [
        'Assume previous task was interrupted.',
        'Show recoverable candidate behavior and explicit --session-id rebind command if available.',
        'If candidate cannot be recovered, answer with restart-required and explain why.',
      ],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustInclude: [/(--session-id|recoverable|restart-required|No recoverable session found|Recovery blocked)/i],
            mustNotInclude: [/authentication was rejected|missing-key|\/connect login --account/i],
          },
          output,
        )
        return {
          passed: reasons.length === 0,
          failureReasons: reasons,
          details: { markerHit: /(--session-id|recoverable|restart-required|No recoverable session found|Recovery blocked)/i.test(output) },
        }
      },
    },
    {
      contractId: 'p1.freshness-boundary.precedence',
      name: 'Freshness boundary and precedence',
      tier: 'p1',
      gateClass: 'hard',
      batch: 'P1',
      lines: [
        'Previous task context: edit alpha.ts replacing foo with bar.',
        'New task: summarize ./tmp-evidence-read.txt only.',
        'Do not continue the old edit task. If boundary reset applies, state it explicitly.',
      ],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustInclude: [/Summary of .*tmp-evidence-read\.txt|Summary\s*:/i],
            mustNotInclude: [/\balpha\.ts\b/i, /continue the old edit/i],
          },
          output,
        )
        return { passed: reasons.length === 0, failureReasons: reasons, details: { summaryHit: /Summary of .*tmp-evidence-read\.txt|Summary\s*:/i.test(output) } }
      },
    },
    {
      contractId: 'p1.safety.stale-replan',
      name: 'Safety gate for unsafe stale replan',
      tier: 'p1',
      gateClass: 'hard',
      batch: 'P1',
      lines: [
        'Assume stale transform old=>new was already applied and verification failed.',
        'Provide next action safely; if unsafe to proceed, explicitly block and explain.',
      ],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustInclude: [/(block|blocked|unsafe|safe next action|replan)/i],
          },
          output,
        )
        return { passed: reasons.length === 0, failureReasons: reasons, details: { safetySignalHit: /(block|blocked|unsafe|safe next action|replan)/i.test(output) } }
      },
    },
    {
      contractId: 'p1.provenance.canonicalization',
      name: 'Resume provenance and canonicalization',
      tier: 'p1',
      gateClass: 'observe',
      batch: 'P1',
      lines: [
        'Report the active session id and canonical project root/path context if available.',
        'Include provenance-style explanation of where this session resumed from.',
      ],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustInclude: [/Session:\s*sess_/i, /Project root:/i],
          },
          output,
        )
        return { passed: reasons.length === 0, failureReasons: reasons, details: { hasSession: /Session:\s*sess_/i.test(output), hasRoot: /Project root:/i.test(output) } }
      },
    },
    {
      contractId: 'p1.same-file.lineage-slot',
      name: 'Same-file lineage with slot clarify',
      tier: 'p1',
      gateClass: 'observe',
      batch: 'P1',
      lines: [
        'We have two subtasks on the same file src/app.ts: A rename variable, B adjust comments.',
        'If slot is ambiguous, ask clarify before applying lineage.',
      ],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustInclude: [/(same file|slot|clarify|clarification|lineage)/i],
          },
          output,
        )
        return { passed: reasons.length === 0, failureReasons: reasons, details: { lineageSignalHit: /(same file|slot|clarify|clarification|lineage)/i.test(output) } }
      },
    },
    {
      contractId: 'p1.weak-cue.blocker-boundary',
      name: 'Weak-cue activation and blocker boundary',
      tier: 'p1',
      gateClass: 'observe',
      batch: 'P1',
      lines: [
        'Continue that tweak in utils.ts and ui.ts whichever is safer.',
        'If weak cue is insufficient across files, state blocker boundary or ask clarify.',
      ],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustInclude: [/(clarify|blocker|boundary|insufficient)/i],
          },
          output,
        )
        return { passed: reasons.length === 0, failureReasons: reasons, details: { boundarySignalHit: /(clarify|blocker|boundary|insufficient)/i.test(output) } }
      },
    },
    {
      contractId: 'p2.observability.explainability',
      name: 'Observability and explainability completeness',
      tier: 'p2',
      gateClass: 'observe',
      batch: 'P2',
      lines: ['Explain ./tmp-evidence-read.txt and include concise reasoning markers.'],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustInclude: [/Provider:\s*/i, /Model:\s*/i, /Explanation for/i],
          },
          output,
        )
        return { passed: reasons.length === 0, failureReasons: reasons, details: { hasProviderHeader: /Provider:\s*/i.test(output), hasModelHeader: /Model:\s*/i.test(output) } }
      },
    },
    {
      contractId: 'p2.masking.polish',
      name: 'Masking and output polish trend',
      tier: 'p2',
      gateClass: 'observe',
      batch: 'P2',
      lines: ['/connect status', '/connect list'],
      evaluate: (output) => {
        const reasons = evaluateScenarioOutput(
          {
            mustNotInclude: [/credential=sk-[^\s]+/i],
          },
          output,
        )
        return { passed: reasons.length === 0, failureReasons: reasons, details: { leakedCredentialPattern: /credential=sk-[^\s]+/i.test(output) } }
      },
    },
  ]

  const checks = []
  for (const scenario of scenarioDefs) {
    const check = await runReplayScenario(scenario, currentRunSessionIds)
    checks.push(check)
  }
  return checks
}

function deriveFindings(checks, sessionScan) {
  const findings = { P0: [], P1: [], P2: [] }
  for (const check of checks) {
    if (check.passed) continue
    if (check.gateClass === 'hard') {
      if (check.tier === 'p0') findings.P0.push(`${check.contractId} failed: ${check.failureReasons.join(', ') || 'unknown'}`)
      else findings.P1.push(`${check.contractId} failed: ${check.failureReasons.join(', ') || 'unknown'}`)
    } else {
      findings.P2.push(`${check.contractId} observation failed: ${check.failureReasons.join(', ') || 'unknown'}`)
    }
  }

  if (sessionScan.currentRun.mismatches.length > 0) {
    findings.P1.push(`session-scan current-run mismatch count=${sessionScan.currentRun.mismatches.length}`)
  }
  if (sessionScan.historical.mismatches.length > 0) {
    findings.P2.push(`session-scan historical mismatch trend count=${sessionScan.historical.mismatches.length}`)
  }
  return findings
}

async function main() {
  const boundaryCheck = ensureEnvironmentBoundary()
  if (!boundaryCheck.passed) {
    const detail = `environment-boundary-violation: ${boundaryCheck.violations.join(', ')}`
    console.error(detail)
    console.error(JSON.stringify(boundaryCheck, null, 2))
    process.exit(1)
  }

  const tier = parseTierArg(process.argv.slice(2))
  const currentRunSessionIds = new Set()
  const checks = []

  if (tier === 'p0' || tier === 'full') {
    checks.push(...(await runP0Checks(currentRunSessionIds)))
  }
  if (tier === 'p1' || tier === 'full') {
    checks.push(...(await runP1P2Checks(currentRunSessionIds)))
  }

  const sessionScan = scanSessions(currentRunSessionIds)

  const evidence = {
    meta: {
      date: dateStamp,
      runId,
      tier,
      boundaryCheck,
      homeDir,
      providerMode: 'real',
      projectRoot,
      repoRoot,
      connectFirstResponseMaxMs: CONNECT_FIRST_RESPONSE_MAX_MS,
    },
    checks,
    findings: deriveFindings(checks, sessionScan),
    gateRules: {
      hard: [
        'p0.a.mainline-health',
        'p0.b.continuity-contract',
        'p0.c.connect-truth',
        'p0.d.approval-state-consistency',
        'p0.e.non-tty-startup',
        'p1.session-rebind.lifecycle',
        'p1.freshness-boundary.precedence',
        'p1.safety.stale-replan',
      ],
      observe: [
        'p1.provenance.canonicalization',
        'p1.same-file.lineage-slot',
        'p1.weak-cue.blocker-boundary',
        'p2.observability.explainability',
        'p2.masking.polish',
      ],
    },
  }

  const evidenceIndexPath = path.join(resultsDir, `${dateStamp}-${runId}-evidence-index.json`)
  fs.writeFileSync(evidenceIndexPath, JSON.stringify(evidence, null, 2), 'utf8')

  const scenarioResults = {
    runId,
    tier,
    scenarios: checks.map((check) => ({
      contractId: check.contractId,
      tier: check.tier,
      gateClass: check.gateClass,
      passed: check.passed,
      failureReasons: check.failureReasons,
      logs: check.logs,
    })),
  }
  const scenarioResultsPath = path.join(resultsDir, `${dateStamp}-${runId}-scenario-results.json`)
  fs.writeFileSync(scenarioResultsPath, JSON.stringify(scenarioResults, null, 2), 'utf8')

  const sessionScanPath = path.join(resultsDir, `${dateStamp}-${runId}-session-scan.json`)
  fs.writeFileSync(sessionScanPath, JSON.stringify(sessionScan, null, 2), 'utf8')

  const summaryPath = path.join(resultsDir, `${dateStamp}-${runId}-summary.md`)
  const checksByTier = {
    p0: checks.filter((item) => item.tier === 'p0'),
    p1: checks.filter((item) => item.tier === 'p1'),
    p2: checks.filter((item) => item.tier === 'p2'),
  }
  const summaryLines = [
    `# Broader Regression Summary (${dateStamp})`,
    '',
    `- Run ID: ${runId}`,
    `- Tier: ${tier}`,
    `- Test root: ${testRoot}`,
    `- Project root: ${projectRoot}`,
    `- Home: ${homeDir}`,
    '- Provider mode: real (openai-compatible via existing connection)',
    '',
    '## Tier Results',
    `- P0 checks: ${checksByTier.p0.filter((x) => x.passed).length}/${checksByTier.p0.length} passed`,
    `- P1 checks: ${checksByTier.p1.filter((x) => x.passed).length}/${checksByTier.p1.length} passed`,
    `- P2 checks: ${checksByTier.p2.filter((x) => x.passed).length}/${checksByTier.p2.length} passed`,
    '',
    '## P0 Findings',
    ...(evidence.findings.P0.length ? evidence.findings.P0.map((item) => `- ${item}`) : ['- none']),
    '',
    '## P1 Findings',
    ...(evidence.findings.P1.length ? evidence.findings.P1.map((item) => `- ${item}`) : ['- none']),
    '',
    '## P2 Findings',
    ...(evidence.findings.P2.length ? evidence.findings.P2.map((item) => `- ${item}`) : ['- none']),
    '',
    '## Artifacts',
    `- summary: ${toRel(summaryPath)}`,
    `- evidence index: ${toRel(evidenceIndexPath)}`,
    `- session scan: ${toRel(sessionScanPath)}`,
    `- scenario results: ${toRel(scenarioResultsPath)}`,
  ]
  fs.writeFileSync(summaryPath, summaryLines.join('\n') + '\n', 'utf8')

  console.log(summaryLines.join('\n'))
  process.exit(evidence.findings.P0.length + evidence.findings.P1.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

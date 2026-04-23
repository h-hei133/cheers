#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, '..')
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

const canonicalEvidence = [
  'Line 1: This file is for continuity contract checks.',
  'Line 2: It contains both summary-worthy and explain-worthy clues.',
  'Line 3: The purpose is to test whether follow-up intent switching is stable.',
  'Line 4: Final evidence line A.',
  'Line 5: Final evidence line B.'
].join('\n') + '\n'

fs.mkdirSync(resultsDir, { recursive: true })
fs.writeFileSync(path.join(testRoot, 'tmp-evidence-read.txt'), canonicalEvidence, 'utf8')

function resolveHomeDir() {
  const forced = process.env.PRIVATE_AGENTS_TEST_HOME
  if (forced && fs.existsSync(path.join(forced, '.private-agents', 'config.json'))) {
    return forced
  }

  const candidates = [
    'D:/Test/home-daily',
    'D:/Test/home-fulltest2',
    'D:/Test/home-fulltest',
    'D:/Test/home-sf'
  ]

  for (const home of candidates) {
    if (fs.existsSync(path.join(home, '.private-agents', 'config.json'))) {
      return home
    }
  }

  const target = 'D:/Test/home-daily'
  fs.mkdirSync(path.join(target, '.private-agents'), { recursive: true })
  return target
}

const homeDir = resolveHomeDir()

function runProcess(command, args, options = {}) {
  const { cwd, env, input, timeoutMs = 120000 } = options
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    })

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
      resolve({ code: code ?? -1, signal: signal ?? null, timedOut, stdout, stderr, output: `${stdout}${stderr}` })
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
      PRIVATE_AGENTS_PROVIDER_MODE: 'real'
    },
    ...options
  })
}

function shouldRetryTransientCliFailure(result) {
  if (!result) {
    return false
  }
  if (result.timedOut) {
    return true
  }
  const output = result.output ?? ''
  if (output.trim().length === 0) {
    return true
  }
  return /provider-readiness:network/i.test(output)
}

async function runCliWithRetry(args, options = {}, maxAttempts = 2) {
  let last = null
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const current = await runCli(args, options)
    last = current
    if (!shouldRetryTransientCliFailure(current) || attempt === maxAttempts) {
      return current
    }
    await new Promise((resolve) => setTimeout(resolve, 1200))
  }
  return last
}

function writeLog(name, content) {
  const file = path.join(resultsDir, `${name}.log`)
  fs.writeFileSync(file, content, 'utf8')
  return file
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

function readActiveConnectionId() {
  const configPath = path.join(homeDir, '.private-agents', 'config.json')
  if (!fs.existsSync(configPath)) {
    return null
  }

  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))
    return config.activeProviderConnectionId ?? null
  } catch {
    return null
  }
}

function extractSessionId(output) {
  const match = output.match(/Session:\s*(sess_[^\s\r\n]+)/)
  return match?.[1] ?? null
}

function extractSessionIds(output) {
  const matches = output.matchAll(/Session:\s*(sess_[^\s\r\n]+)/g)
  const sessions = []
  for (const match of matches) {
    sessions.push(match[1])
  }
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
  const readBlocks = Array.from(
    output.matchAll(/Read result for[^\n]*\n```text\n([\s\S]*?)\n```/g),
  )
  const readTailScope =
    readBlocks.length > 0
      ? String(readBlocks[readBlocks.length - 1]?.[1] ?? '')
      : output
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
  const genericDrift = /philosophical|creative ideas|just a chat|pick a direction|let.?s chat|we can discuss anything|推荐一些创意|聊点别的/i.test(output)
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
        PRIVATE_AGENTS_PROVIDER_MODE: 'real'
      },
      stdio: ['pipe', 'pipe', 'pipe']
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
        sample: output.slice(0, 1500)
      }
      child.kill('SIGKILL')
      resolve(result)
    }, 8000)
  })
}

function scanSessions(currentRunSessionSet) {
  const sessionsRoot = path.join(homeDir, '.private-agents', 'sessions')
  if (!fs.existsSync(sessionsRoot)) {
    return {
      runId,
      currentRun: { sessions: [], mismatches: [] },
      historical: { sessions: [], mismatches: [] }
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
      assistantNotCompleted = /Task not completed/i.test(tx)
      transcriptStopSignal = /insufficient-evidence|Workflow stopped on blocker\/failure|Escalation denied by user|"terminalClassification":"(stopped|error)"/i.test(tx)
    }

    const record = {
      session: entry.name,
      status: state.status ?? null,
      terminalClassification: state.terminalClassification ?? null,
      terminalReason: state.terminalReason ?? null,
      assistantNotCompleted,
      transcriptStopSignal
    }

    const isCurrentRun = currentRunSessionSet.has(entry.name)
    if (isCurrentRun) {
      currentRunSessions.push(record)
    } else {
      historicalSessions.push(record)
    }

    if ((assistantNotCompleted || transcriptStopSignal) && state.terminalClassification === 'success') {
      if (isCurrentRun) {
        currentRunMismatches.push(record)
      } else {
        historicalMismatches.push(record)
      }
    }
  }

  currentRunSessions.sort((a, b) => a.session.localeCompare(b.session))
  historicalSessions.sort((a, b) => a.session.localeCompare(b.session))
  return {
    runId,
    currentRun: { sessions: currentRunSessions, mismatches: currentRunMismatches },
    historical: { sessions: historicalSessions, mismatches: historicalMismatches }
  }
}

function toRel(p) {
  return p.replaceAll('\\\\', '/')
}

async function main() {
  const evidence = {
    meta: { date: dateStamp, runId, homeDir, providerMode: 'real', projectRoot, repoRoot, connectFirstResponseMaxMs: CONNECT_FIRST_RESPONSE_MAX_MS },
    batches: {}
  }

  const currentRunSessionIds = new Set()
  const findings = { P0: [], P1: [], P2: [] }

  const aSmoke = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'reply exactly: daily-ok'], { timeoutMs: 90000 }, 3)
  const aSmokeLog = writeLog(`A-${dateStamp}-${runId}-smoke`, aSmoke.output)
  for (const session of extractSessionIds(aSmoke.output)) currentRunSessionIds.add(session)

  const aExplain = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'explain ./tmp-evidence-read.txt'], { timeoutMs: 90000 }, 3)
  const aExplainLog = writeLog(`A-${dateStamp}-${runId}-explain`, aExplain.output)
  for (const session of extractSessionIds(aExplain.output)) currentRunSessionIds.add(session)

  const aSummarize = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--print', 'summarize ./tmp-evidence-read.txt'], { timeoutMs: 90000 }, 3)
  const aSummarizeLog = writeLog(`A-${dateStamp}-${runId}-summarize`, aSummarize.output)
  for (const session of extractSessionIds(aSummarize.output)) currentRunSessionIds.add(session)

  const aFailureReasons = []
  const aPassed =
    !aSmoke.timedOut &&
    !aExplain.timedOut &&
    !aSummarize.timedOut &&
    hasSuccessResult(aSmoke.output) &&
    hasSuccessResult(aExplain.output) &&
    hasSuccessResult(aSummarize.output) &&
    !hasProviderDrift(aSmoke.output + aExplain.output + aSummarize.output)
  if (aSmoke.timedOut || aExplain.timedOut || aSummarize.timedOut) aFailureReasons.push('timeout')
  if (!hasSuccessResult(aSmoke.output) || !hasSuccessResult(aExplain.output) || !hasSuccessResult(aSummarize.output)) aFailureReasons.push('missing-success-result')
  if (hasProviderDrift(aSmoke.output + aExplain.output + aSummarize.output)) aFailureReasons.push('provider-drift')
  evidence.batches.A = { passed: aPassed, failureReasons: aFailureReasons, logs: [aSmokeLog, aExplainLog, aSummarizeLog].map(toRel) }
  if (!aPassed) findings.P0.push('Batch A failed: main real-provider health check is not stable.')

  const groundedLines = [
    '\u603B\u7ED3\u4E00\u4E0B ./tmp-evidence-read.txt \u6587\u4EF6\u5185\u5BB9',
    '\u6240\u4EE5\u4F60\u7684\u603B\u7ED3\u5462\uFF1F',
    '\u4E0D\u8981\u603B\u7ED3\u4E86\uFF0C\u76F4\u63A5\u89E3\u91CA\u8FD9\u4E2A\u6587\u4EF6\u5728\u505A\u4EC0\u4E48',
    '\u7EE7\u7EED\u8BFB\u53D6\u540E\u4E24\u884C'
  ]
  const ambiguousLines = [
    'summarize ./tmp-evidence-read.txt',
    'then?',
    'go on',
    '\u7EE7\u7EED'
  ]

  const bGroundedReplayPrompt = buildReplayPromptFile(`B-${dateStamp}-${runId}-grounded-replay-prompts`, groundedLines)
  const bGroundedReplay = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', bGroundedReplayPrompt], { timeoutMs: 180000 })
  const bGroundedReplayLog = writeLog(`B-${dateStamp}-${runId}-grounded-replay`, bGroundedReplay.output)
  for (const session of extractSessionIds(bGroundedReplay.output)) currentRunSessionIds.add(session)

  const bGroundedStdin = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible'], { input: readPromptFileUtf8(bGroundedReplayPrompt), timeoutMs: 180000 })
  const bGroundedStdinLog = writeLog(`B-${dateStamp}-${runId}-grounded-stdin`, bGroundedStdin.output)
  for (const session of extractSessionIds(bGroundedStdin.output)) currentRunSessionIds.add(session)

  const bAmbiguousReplayPrompt = buildReplayPromptFile(`B-${dateStamp}-${runId}-ambiguous-replay-prompts`, ambiguousLines)
  const bAmbiguousReplay = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', bAmbiguousReplayPrompt], { timeoutMs: 180000 })
  const bAmbiguousReplayLog = writeLog(`B-${dateStamp}-${runId}-ambiguous-replay`, bAmbiguousReplay.output)
  for (const session of extractSessionIds(bAmbiguousReplay.output)) currentRunSessionIds.add(session)

  const bAmbiguousStdin = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible'], { input: readPromptFileUtf8(bAmbiguousReplayPrompt), timeoutMs: 180000 })
  const bAmbiguousStdinLog = writeLog(`B-${dateStamp}-${runId}-ambiguous-stdin`, bAmbiguousStdin.output)
  for (const session of extractSessionIds(bAmbiguousStdin.output)) currentRunSessionIds.add(session)

  const stdinProbeToken = '\u7ee7\u7eed-\u4e2d\u6587\u63a2\u9488-2026'
  const stdinProbePrompt = `\u8bf7\u4e25\u683c\u539f\u6837\u8f93\u51fa\u8fd9\u6bb5\u6587\u672c\uff0c\u4e0d\u8981\u6dfb\u52a0\u5185\u5bb9\uff1a${stdinProbeToken}`
  const bStdinProbePrompt = buildReplayPromptFile(`B-${dateStamp}-${runId}-stdin-probe-prompts`, [stdinProbePrompt])
  const bStdinProbe = await runCliWithRetry(['--project', projectRoot, '--provider', 'openai-compatible'], { input: readPromptFileUtf8(bStdinProbePrompt), timeoutMs: 120000 })
  const bStdinProbeLog = writeLog(`B-${dateStamp}-${runId}-stdin-probe`, bStdinProbe.output)
  for (const session of extractSessionIds(bStdinProbe.output)) currentRunSessionIds.add(session)
  const stdinIntegrityProbe = {
    token: stdinProbeToken,
    echoed: bStdinProbe.output.includes(stdinProbeToken),
    outputSample: bStdinProbe.output.slice(0, 500)
  }

  const groundedReplayEval = evaluateGroundedContinuity(bGroundedReplay.output)
  const groundedStdinEval = evaluateGroundedContinuity(bGroundedStdin.output)
  const ambiguousReplayEval = evaluateAmbiguousContinuity(bAmbiguousReplay.output)
  const ambiguousStdinEval = evaluateAmbiguousContinuity(bAmbiguousStdin.output)

  const bCorePassed =
    groundedReplayEval.acceptable &&
    groundedStdinEval.acceptable &&
    ambiguousReplayEval.acceptable &&
    ambiguousStdinEval.acceptable
  const bPassed = bCorePassed && stdinIntegrityProbe.echoed
  const bFailureReasons = []
  if (!groundedReplayEval.acceptable) bFailureReasons.push('groundedReplayEval=false')
  if (!groundedStdinEval.acceptable) bFailureReasons.push('groundedStdinEval=false')
  if (!ambiguousReplayEval.acceptable) bFailureReasons.push('ambiguousReplayEval=false')
  if (!ambiguousStdinEval.acceptable) bFailureReasons.push('ambiguousStdinEval=false')
  if (!stdinIntegrityProbe.echoed) bFailureReasons.push('stdinIntegrityProbe=false')

  evidence.batches.B = {
    passed: bPassed,
    failureReasons: bFailureReasons,
    logs: [bGroundedReplayLog, bGroundedStdinLog, bAmbiguousReplayLog, bAmbiguousStdinLog, bStdinProbeLog].map(toRel),
    checks: { groundedReplayEval, groundedStdinEval, ambiguousReplayEval, ambiguousStdinEval, stdinIntegrityProbe }
  }
  if (!bPassed) findings.P1.push('Batch B failed: continuity contract is not stable across replay/stdin.')

  const activeConnectionId = readActiveConnectionId()
  const cPromptFile = buildReplayPromptFile(`C-${dateStamp}-${runId}-connect-prompts`, [
    '/connect status',
    '/connect list',
    activeConnectionId ? `/connect use ${activeConnectionId}` : '/connect use missing-connection-id',
    'reply exactly: connect-ok'
  ])
  const cStart = Date.now()
  const cRun = await runCli(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', cPromptFile])
  const cElapsedMs = Date.now() - cStart
  const cLog = writeLog(`C-${dateStamp}-${runId}-connect`, cRun.output)
  for (const session of extractSessionIds(cRun.output)) currentRunSessionIds.add(session)

  const cFailureReasons = []
  const cHasSwitch = cRun.output.includes('Active connection switched to')
  if (!activeConnectionId) cFailureReasons.push('missing-active-connection-id')
  if (!cHasSwitch) cFailureReasons.push('connect-switch-not-confirmed')
  if (!hasSuccessResult(cRun.output)) cFailureReasons.push('missing-success-result')
  if (hasProviderDrift(cRun.output)) cFailureReasons.push('provider-drift')
  if (cElapsedMs > CONNECT_FIRST_RESPONSE_MAX_MS) cFailureReasons.push('connect-first-response-timeout-threshold')
  const cPassed = cFailureReasons.length === 0
  evidence.batches.C = { passed: cPassed, failureReasons: cFailureReasons, logs: [cLog].map(toRel), activeConnectionId, elapsedMs: cElapsedMs }
  if (!cPassed) findings.P0.push('Batch C failed: connect truth regression.')

  const dPromptFile = buildReplayPromptFile(`D-${dateStamp}-${runId}-approval-prompts`, ['Use shell command node --version and report the exact output.'])
  const dRun = await runCli(['--project', projectRoot, '--provider', 'openai-compatible', '--replay-file', dPromptFile])
  const dLog = writeLog(`D-${dateStamp}-${runId}-approval`, dRun.output)
  for (const session of extractSessionIds(dRun.output)) currentRunSessionIds.add(session)

  const sessionId = extractSessionId(dRun.output)
  let dState = null
  let dStateOk = false

  if (sessionId) {
    const sessionDir = path.join(homeDir, '.private-agents', 'sessions', sessionId)
    const statePath = path.join(sessionDir, 'state.json')
    const txPath = path.join(sessionDir, 'transcript.jsonl')
    let tx = ''

    if (fs.existsSync(statePath)) dState = JSON.parse(fs.readFileSync(statePath, 'utf8'))
    if (fs.existsSync(txPath)) tx = fs.readFileSync(txPath, 'utf8')

    const hasStopSignal = /Task not completed|insufficient-evidence|Escalation denied by user|Workflow stopped on blocker\/failure/i.test(dRun.output + tx)
    dStateOk = !hasStopSignal || (dState && dState.terminalClassification !== 'success')
  }

  const dFailureReasons = []
  if (!sessionId) dFailureReasons.push('missing-session-id')
  if (!dStateOk) dFailureReasons.push('state-durability-mismatch')
  evidence.batches.D = { passed: dStateOk, failureReasons: dFailureReasons, logs: [dLog].map(toRel), sessionId, state: dState }
  if (!dStateOk) findings.P1.push('Batch D failed: state durability mismatch for stop/error outcomes.')

  const eResult = await runNonTtyCheck()
  const eJsonPath = path.join(resultsDir, `E-${dateStamp}-${runId}-nontty.json`)
  fs.writeFileSync(eJsonPath, JSON.stringify(eResult, null, 2), 'utf8')
  const ePassed = eResult.hasAnyOutput && (eResult.hasPrompt || eResult.hasStdinWaitHint)
  const eFailureReasons = []
  if (!eResult.hasAnyOutput) eFailureReasons.push('no-output-within-8s')
  if (!(eResult.hasPrompt || eResult.hasStdinWaitHint)) eFailureReasons.push('missing-operable-prompt-or-stdin-hint')
  evidence.batches.E = { passed: ePassed, failureReasons: eFailureReasons, logs: [toRel(eJsonPath)] }
  if (!ePassed) findings.P0.push('Batch E failed: non-TTY startup deadlock detected.')

  const sessionScan = scanSessions(currentRunSessionIds)
  const sessionScanPath = path.join(resultsDir, `${dateStamp}-${runId}-session-scan.json`)
  fs.writeFileSync(sessionScanPath, JSON.stringify(sessionScan, null, 2), 'utf8')
  if (sessionScan.currentRun.mismatches.length > 0) findings.P1.push(`Session scan found ${sessionScan.currentRun.mismatches.length} current-run success-persistence mismatch case(s).`)
  if (sessionScan.historical.mismatches.length > 0) findings.P2.push(`Historical mismatch trend: ${sessionScan.historical.mismatches.length} case(s).`)

  if (/credential=sk-[^\s]+/i.test(cRun.output)) {
    findings.P2.push('Connect output exposes more key fingerprint than expected masking baseline.')
  }

  evidence.findings = findings
  const evidenceIndexPath = path.join(resultsDir, `${dateStamp}-${runId}-evidence-index.json`)
  fs.writeFileSync(evidenceIndexPath, JSON.stringify(evidence, null, 2), 'utf8')

  const evidenceFromDisk = JSON.parse(fs.readFileSync(evidenceIndexPath, 'utf8'))
  const summaryPath = path.join(resultsDir, `${dateStamp}-${runId}-summary.md`)
  const summaryLines = [
    `# Daily Regression Summary (${dateStamp})`,
    '',
    `- Run ID: ${evidenceFromDisk.meta.runId}`,
    `- Test root: ${testRoot}`,
    `- Project root: ${projectRoot}`,
    `- Home: ${homeDir}`,
    '- Provider mode: real (openai-compatible expected via connection)',
    '',
    '## Batch Results',
    `- A mainline health: ${evidenceFromDisk.batches.A.passed ? 'PASS' : 'FAIL'}`,
    `- B continuity contract: ${evidenceFromDisk.batches.B.passed ? 'PASS' : 'FAIL'}`,
    `- C connect truth: ${evidenceFromDisk.batches.C.passed ? 'PASS' : 'FAIL'}`,
    `- D approval/state durability: ${evidenceFromDisk.batches.D.passed ? 'PASS' : 'FAIL'}`,
    `- E non-tty stability: ${evidenceFromDisk.batches.E.passed ? 'PASS' : 'FAIL'}`,
    '',
    '## P0',
    ...(evidenceFromDisk.findings.P0.length ? evidenceFromDisk.findings.P0.map((x) => `- ${x}`) : ['- none']),
    '',
    '## P1',
    ...(evidenceFromDisk.findings.P1.length ? evidenceFromDisk.findings.P1.map((x) => `- ${x}`) : ['- none']),
    '',
    '## P2',
    ...(evidenceFromDisk.findings.P2.length ? evidenceFromDisk.findings.P2.map((x) => `- ${x}`) : ['- none']),
    '',
    '## Failure Reasons',
    `- A: ${(evidenceFromDisk.batches.A.failureReasons ?? []).length ? evidenceFromDisk.batches.A.failureReasons.join(', ') : 'none'}`,
    `- B: ${(evidenceFromDisk.batches.B.failureReasons ?? []).length ? evidenceFromDisk.batches.B.failureReasons.join(', ') : 'none'}`,
    `- C: ${(evidenceFromDisk.batches.C.failureReasons ?? []).length ? evidenceFromDisk.batches.C.failureReasons.join(', ') : 'none'}`,
    `- D: ${(evidenceFromDisk.batches.D.failureReasons ?? []).length ? evidenceFromDisk.batches.D.failureReasons.join(', ') : 'none'}`,
    `- E: ${(evidenceFromDisk.batches.E.failureReasons ?? []).length ? evidenceFromDisk.batches.E.failureReasons.join(', ') : 'none'}`,
    '',
    '## Artifacts',
    `- summary: ${toRel(summaryPath)}`,
    `- evidence index: ${toRel(evidenceIndexPath)}`,
    `- session scan: ${toRel(sessionScanPath)}`
  ]
  fs.writeFileSync(summaryPath, summaryLines.join('\n') + '\n', 'utf8')

  console.log(summaryLines.join('\n'))
  process.exit(evidenceFromDisk.findings.P0.length + evidenceFromDisk.findings.P1.length === 0 ? 0 : 1)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

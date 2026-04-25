#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const defaultSyntheticHome = 'D:/Test/pca-home-synth'
const defaultRealHome = 'D:/Test/home-sf'

function parseArgs(argv) {
  const options = {
    home: defaultSyntheticHome,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--log-file') options.logFile = argv[++index]
    else if (arg === '--gate') options.gate = argv[++index]
    else if (arg === '--command') options.command = argv[++index]
    else if (arg === '--exit-code') options.exitCode = Number(argv[++index])
    else if (arg === '--home') options.home = argv[++index]
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function redact(input) {
  return String(input ?? '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-REDACTED')
    .replace(/(api[_-]?key|token|authorization|password)([=:]\s*)([^\s,;]+)/gi, '$1$2REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED')
}

function truncate(input, max = 360) {
  const text = redact(input).replace(/\s+$/g, '')
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

function firstMatch(text, patterns) {
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match?.[1]) return match[1].trim()
  }
  return undefined
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function classify(text, exitCode) {
  if (exitCode === 2 || /\[provider-network-inconclusive\]|provider-network-inconclusive|network inconclusive|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed|socket hang up|provider.*unreachable/i.test(text)) {
    return 'provider-network-inconclusive'
  }
  if (exitCode === 3 || /\[config-failure\]|config-failure|environment failure|missing.*config|credential missing|HOME.*wrong|toolchain|cargo.*missing|rustc.*missing/i.test(text)) {
    return 'config-failure'
  }
  if (/\[product-regression\]|product-regression|AssertionError|expected .* to|missing=|should not|failed assertion/i.test(text)) {
    return 'product-regression'
  }
  if (exitCode && exitCode !== 0) return 'product-regression'
  return 'unknown'
}

function extractKeyLines(text) {
  const interesting = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) =>
      /\[(product-regression|provider-network-inconclusive|config-failure|pass)\]|missing=|failed|error|timed out|Outcome:|Result|Verification:|degraded-reason=|tool-result=|approval-event=|transcript-path=|state-path=|target project=|project-root=|session-id=|session-dir=/i.test(line),
    )
  return unique(interesting).slice(-20)
}

function buildInspectorCommands({ text, home }) {
  const sessionDir = firstMatch(text, [/session-dir=([^\r\n]+)/i])
  const sessionId = firstMatch(text, [/session-id=([^\r\n]+)/i])
  const projectRoot = firstMatch(text, [/project-root=([^\r\n]+)/i, /target project=([^\r\n]+)/i])
  const commands = []
  if (sessionDir) commands.push(`npm run evidence:inspect -- --session-dir "${redact(sessionDir)}"`)
  if (sessionId) commands.push(`npm run evidence:inspect -- --home ${home} --session-id ${redact(sessionId)}`)
  if (projectRoot) commands.push(`npm run evidence:inspect -- --home ${home} --project "${redact(projectRoot)}"`)
  return unique(commands)
}

function nextAction(failureClass, hasInspectorCommand) {
  if (failureClass === 'provider-network-inconclusive') {
    return 'Check provider/network reachability and rerun the smoke gate; do not classify this as product regression without a reachable provider.'
  }
  if (failureClass === 'config-failure') {
    return 'Fix local environment/config/home/toolchain first, then rerun the gate; do not change product code until config passes.'
  }
  if (hasInspectorCommand) {
    return 'Run the evidence inspector command above, compare transcript/state/tool-result/approval-event markers, then fix the product regression.'
  }
  if (failureClass === 'product-regression') {
    return 'Inspect key markers/stderr above and rerun the focused gate after fixing the product regression.'
  }
  return 'Review key markers and rerun the focused gate with a captured log file.'
}

function printHelp() {
  console.log(`Usage:
  npm run failure:handoff -- --log-file <path> --gate <gate-name> --command "<command>" --exit-code <code>

This is a local, read-only failure handoff generator. It does not rerun gates,
upload artifacts, or modify session data. It summarizes a captured gate log and
prints a redacted handoff with failure class, key markers, artifact pointers,
evidence inspector commands, and next action.`)
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    process.exit(0)
  }
  if (!options.logFile) throw new Error('Missing --log-file')
  if (!fs.existsSync(options.logFile)) throw new Error(`Log file not found: ${options.logFile}`)
  const text = fs.readFileSync(options.logFile, 'utf8')
  const gateName = options.gate ?? firstMatch(text, [/gate name=([^\r\n]+)/i]) ?? 'unknown'
  const command = options.command ?? 'unknown'
  const exitCode = Number.isFinite(options.exitCode) ? options.exitCode : undefined
  const failureClass = classify(text, exitCode)
  const inspectorCommands = buildInspectorCommands({ text, home: options.home })
  const keyLines = extractKeyLines(text)
  const transcriptPath = firstMatch(text, [/transcript-path=([^\r\n]+)/i])
  const statePath = firstMatch(text, [/state-path=([^\r\n]+)/i])
  const projectRoot = firstMatch(text, [/project-root=([^\r\n]+)/i, /target project=([^\r\n]+)/i])
  const sessionId = firstMatch(text, [/session-id=([^\r\n]+)/i])
  const sessionDir = firstMatch(text, [/session-dir=([^\r\n]+)/i])

  console.log('release failure handoff')
  console.log(`repo=${repoRoot}`)
  console.log(`gate-name=${redact(gateName)}`)
  console.log(`command=${redact(command)}`)
  console.log(`exit-code=${exitCode ?? 'unknown'}`)
  console.log(`failure-class=${failureClass}`)
  console.log(`log-file=${redact(path.resolve(options.logFile))}`)
  console.log(`synthetic-home=${defaultSyntheticHome}`)
  console.log(`real-provider-home=${defaultRealHome}`)
  if (projectRoot) console.log(`project-root=${redact(projectRoot)}`)
  if (sessionId) console.log(`session-id=${redact(sessionId)}`)
  if (sessionDir) console.log(`session-dir=${redact(sessionDir)}`)
  if (transcriptPath) console.log(`transcript-path=${redact(transcriptPath)}`)
  if (statePath) console.log(`state-path=${redact(statePath)}`)
  console.log(`key-marker-count=${keyLines.length}`)
  for (const line of keyLines) console.log(`key-marker=${truncate(line)}`)
  if (inspectorCommands.length === 0) {
    console.log('evidence-inspector-command=none')
  } else {
    for (const inspectorCommand of inspectorCommands) {
      console.log(`evidence-inspector-command=${inspectorCommand}`)
    }
  }
  console.log(`next-action=${nextAction(failureClass, inspectorCommands.length > 0)}`)
  console.log('handoff-exit-semantics=exit 0 means handoff summary was printed; it does not mean the failed gate passed.')
  process.exit(0)
} catch (error) {
  console.error(`[failure-handoff:error] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

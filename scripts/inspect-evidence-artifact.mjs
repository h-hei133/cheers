#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function normalizeForCompare(input) {
  const normalized = path.resolve(input).replace(/\\/g, '/')
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

function readOptionalJson(file, label) {
  if (!fs.existsSync(file)) {
    return { value: undefined, warnings: [`missing-${label}`], status: 'missing' }
  }
  try {
    return { value: readJson(file), warnings: [], status: 'present' }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    return { value: undefined, warnings: [`invalid-${label}:${detail}`], status: 'invalid' }
  }
}

function readJsonlTolerant(file) {
  if (!fs.existsSync(file)) {
    return { value: [], warnings: ['missing-transcript'], status: 'missing', lineCount: 0, parsedCount: 0 }
  }
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/)
  const events = []
  const warnings = []
  let nonEmptyLineCount = 0
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    if (!line.trim()) continue
    nonEmptyLineCount += 1
    try {
      events.push(JSON.parse(line))
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      warnings.push(`transcript-parse-warning:line=${index + 1}:${detail}`)
    }
  }
  return {
    value: events,
    warnings,
    status: warnings.length > 0 ? 'partial' : 'present',
    lineCount: nonEmptyLineCount,
    parsedCount: events.length,
  }
}

function redact(input) {
  return String(input ?? '')
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, 'sk-REDACTED')
    .replace(/(api[_-]?key|token|authorization|password)([=:]\s*)([^\s,;]+)/gi, '$1$2REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED')
}

function truncate(input, max = 240) {
  const text = redact(input)
  return text.length > max ? `${text.slice(0, max - 3)}...` : text
}

function parseArgs(argv) {
  const options = {
    home: process.env.HOME || process.env.USERPROFILE || '',
    latest: false,
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--home') options.home = argv[++index]
    else if (arg === '--session-dir') options.sessionDir = argv[++index]
    else if (arg === '--session-id') options.sessionId = argv[++index]
    else if (arg === '--project') options.project = argv[++index]
    else if (arg === '--latest') options.latest = true
    else if (arg === '--help' || arg === '-h') options.help = true
    else throw new Error(`Unknown argument: ${arg}`)
  }
  return options
}

function sessionsRoot(home) {
  return path.join(home, '.cheers', 'sessions')
}

function findSession(options) {
  if (options.sessionDir) {
    return path.resolve(options.sessionDir)
  }

  const root = sessionsRoot(options.home)
  if (!fs.existsSync(root)) {
    throw new Error(`Sessions root not found: ${root}`)
  }

  const sessions = fs
    .readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const sessionDir = path.join(root, entry.name)
      const metadataPath = path.join(sessionDir, 'metadata.json')
      if (!fs.existsSync(metadataPath)) return null
      try {
        const metadata = readJson(metadataPath)
        const stat = fs.statSync(sessionDir)
        return { sessionDir, metadata, mtimeMs: stat.mtimeMs }
      } catch {
        return null
      }
    })
    .filter(Boolean)

  if (options.sessionId) {
    const match = sessions.find((session) => session.metadata.id === options.sessionId || path.basename(session.sessionDir) === options.sessionId)
    if (!match) throw new Error(`Session id not found: ${options.sessionId}`)
    return match.sessionDir
  }

  if (options.project) {
    const normalizedProject = normalizeForCompare(options.project)
    const matches = sessions
      .filter((session) => normalizeForCompare(session.metadata.projectRoot ?? '') === normalizedProject)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
    if (matches.length === 0) throw new Error(`No sessions found for project: ${options.project}`)
    return matches[0].sessionDir
  }

  if (options.latest) {
    const latest = sessions.sort((a, b) => b.mtimeMs - a.mtimeMs)[0]
    if (!latest) throw new Error(`No sessions found in: ${root}`)
    return latest.sessionDir
  }

  throw new Error('Provide one of --session-dir, --session-id, --project, or --latest.')
}

function flattenQueryEvents(transcript) {
  return transcript
    .filter((entry) => entry.type === 'query-event')
    .map((entry) => entry.event)
}

function findLast(items, predicate) {
  for (let index = items.length - 1; index >= 0; index -= 1) {
    if (predicate(items[index])) return items[index]
  }
  return undefined
}

function unique(values) {
  return [...new Set(values.filter(Boolean))]
}

function summarize(sessionDir) {
  const metadataPath = path.join(sessionDir, 'metadata.json')
  const transcriptPath = path.join(sessionDir, 'transcript.jsonl')
  const statePath = path.join(sessionDir, 'state.json')

  if (!fs.existsSync(metadataPath)) throw new Error(`metadata.json not found: ${metadataPath}`)

  const metadata = readJson(metadataPath)
  const transcriptResult = readJsonlTolerant(transcriptPath)
  const stateResult = readOptionalJson(statePath, 'state')
  const transcript = transcriptResult.value
  const state = stateResult.value ?? {}
  const queryEvents = flattenQueryEvents(transcript)
  const queryCompleted = findLast(queryEvents, (event) => event.type === 'query.completed')
  const latestCoderTurn = findLast(
    queryEvents.map((event) => (event.type === 'turn.completed' ? event.output : undefined)).filter(Boolean),
    (output) => Boolean(output?.codingResult),
  )
  const codingResult = queryCompleted?.result?.codingResult ?? latestCoderTurn?.codingResult
  const latestToolResults = queryEvents.filter((event) => event.type === 'tool.result').slice(-8)
  const latestApprovalEvents = queryEvents.filter((event) => event.type === 'approval.resolved').slice(-8)
  const approvalAudit = state?.workingMemory?.approvalAudit
  const continuity = state?.workingMemory?.continuity
  const changedFiles = unique([
    ...(codingResult?.changedFiles ?? []),
    ...(codingResult?.changeSet?.changedFiles ?? []),
    ...(continuity?.recentChangedFiles ?? []),
  ])
  const failedFiles = codingResult?.failedFiles ?? continuity?.recentFailedFiles ?? []
  const evidence = [
    ...(codingResult?.evidence ?? []),
    ...(codingResult?.continuation?.evidence ?? []),
    ...(continuity?.lastContinuationEvidence ?? []),
  ]
  const warnings = [
    ...transcriptResult.warnings,
    ...stateResult.warnings,
  ]
  if (!queryCompleted) warnings.push('missing-query-completed')
  else if (!queryCompleted.result) warnings.push('incomplete-query-completed-result')
  if (!codingResult) warnings.push('missing-coding-result')

  return {
    metadata,
    sessionDir,
    transcriptPath,
    statePath,
    transcriptStatus: transcriptResult.status,
    transcriptLineCount: transcriptResult.lineCount,
    transcriptParsedCount: transcriptResult.parsedCount,
    stateStatus: stateResult.status,
    artifactStatus: warnings.length > 0 ? 'degraded' : 'complete',
    warnings,
    state,
    queryEvents,
    queryCompleted,
    codingResult,
    latestToolResults,
    latestApprovalEvents,
    approvalAudit,
    continuity,
    changedFiles,
    failedFiles,
    evidence: unique(evidence).slice(-18),
  }
}

function printSummary(summary) {
  const status = summary.queryCompleted?.result?.status ?? (summary.queryCompleted ? 'incomplete' : summary.state?.status ?? 'unknown')
  const terminalClassification =
    summary.queryCompleted?.result?.terminalClassification ??
    summary.state?.terminalClassification ??
    'unknown'
  const terminalReason =
    summary.queryCompleted?.result?.terminalReason ??
    summary.state?.terminalReason ??
    'unknown'
  const finalOutput = summary.queryCompleted?.result?.finalOutput ?? ''
  const verification = summary.codingResult?.verification

  console.log('evidence inspector')
  console.log(`repo=${repoRoot}`)
  console.log(`session-id=${summary.metadata.id}`)
  console.log(`project-root=${summary.metadata.projectRoot}`)
  console.log(`session-dir=${summary.sessionDir}`)
  console.log(`transcript-path=${summary.transcriptPath}`)
  console.log(`transcript-status=${summary.transcriptStatus}`)
  console.log(`transcript-lines=${summary.transcriptLineCount}`)
  console.log(`transcript-parsed-events=${summary.transcriptParsedCount}`)
  console.log(`state-path=${summary.statePath}`)
  console.log(`state-status=${summary.stateStatus}`)
  console.log(`artifact-status=${summary.artifactStatus}`)
  for (const warning of summary.warnings) console.log(`degraded-reason=${truncate(warning, 320)}`)
  console.log(`latest-query-status=${status}`)
  console.log(`latest-terminal-classification=${terminalClassification}`)
  console.log(`latest-terminal-reason=${terminalReason}`)
  console.log(`latest-task-kind=${summary.codingResult?.taskKind ?? 'none'}`)
  console.log(`query-result-status=${summary.queryCompleted?.result ? 'present' : summary.queryCompleted ? 'incomplete' : 'missing'}`)
  console.log(`coding-result-status=${summary.codingResult ? 'present' : 'missing'}`)
  console.log(`final-output=${truncate(finalOutput || 'none')}`)
  console.log(`changed-files-count=${summary.changedFiles.length}`)
  for (const file of summary.changedFiles) console.log(`changed-file=${redact(file)}`)
  console.log(`failed-files-count=${summary.failedFiles.length}`)
  for (const file of summary.failedFiles) console.log(`failed-file=${redact(file.path ?? file)} reason=${truncate(file.reason ?? '')}`)
  console.log(`verification-status=${verification?.status ?? summary.continuity?.lastVerificationStatus ?? 'none'}`)
  if (verification?.blockerKind || summary.continuity?.lastVerificationBlockerKind) {
    console.log(`blocker-kind=${verification?.blockerKind ?? summary.continuity?.lastVerificationBlockerKind}`)
  }
  if (verification?.reason || summary.continuity?.lastVerificationReason) {
    console.log(`verification-reason=${truncate(verification?.reason ?? summary.continuity?.lastVerificationReason)}`)
  }
  console.log(`approval-decision=${summary.approvalAudit?.decision ?? summary.continuity?.lastApprovalDecision ?? 'none'}`)
  if (summary.approvalAudit) {
    console.log(`approval-persistent=${summary.approvalAudit.persistent}`)
    console.log(`approval-cache-effect=${summary.approvalAudit.cacheEffect}`)
    console.log(`approval-cache-key=${redact(summary.approvalAudit.cacheKey)}`)
    console.log(`approval-scope=${redact(summary.approvalAudit.scopeLabel)}`)
  }
  for (const event of summary.latestApprovalEvents) {
    console.log(`approval-event=${event.toolName}:${event.outcome}`)
  }
  for (const event of summary.latestToolResults) {
    console.log(`tool-result=${event.toolName}:${event.success ? 'success' : 'failed'}`)
  }
  console.log(`query-event-count=${summary.queryEvents.length}`)
  console.log(`evidence-count=${summary.evidence.length}`)
  for (const item of summary.evidence) {
    console.log(`evidence=${truncate(item, 320)}`)
  }
  console.log('inspector-exit-semantics=exit 0 means a read-only diagnostic summary was printed; artifact-status=degraded means evidence is incomplete, not repaired.')
  if (summary.artifactStatus === 'degraded') {
    console.log('triage-next-action=Inspect degraded-reason lines first, then open transcript-path/state-path; do not treat final-output as complete when query-result-status or coding-result-status is missing.')
  } else {
    console.log('triage-next-action=Use transcript-path/state-path plus changed-file/tool-result/approval-event lines to correlate the run with release gate failures.')
  }
}

function printHelp() {
  console.log(`Usage:
  npm run evidence:inspect -- --home <home> --project <project>
  npm run evidence:inspect -- --home <home> --session-id <session-id>
  npm run evidence:inspect -- --session-dir <session-dir>
  npm run evidence:inspect -- --home <home> --latest

What to use:
  --project     Find the latest session for a project root.
  --session-id  Inspect a known session id under the selected home.
  --session-dir Inspect an exact session artifact directory.
  --latest      Inspect the latest session under the selected home.

This is a read-only local artifact inspector. It reads metadata.json,
transcript.jsonl, and state.json, then prints a redacted triage summary.

Status semantics:
  artifact-status=complete  transcript/state/query/coding evidence was readable.
  artifact-status=degraded  at least one artifact is missing, partial, or incomplete.
  exit 0                    diagnostic summary printed, including degraded summaries.
  exit 1                    the session could not be found or metadata could not be read.

Typical triage:
  1. Start with transcript-path and state-path.
  2. Check latest-terminal-classification, query-result-status, and coding-result-status.
  3. For failures, check approval-event, tool-result, blocker-kind, and degraded-reason.
  4. Do not treat final-output as complete when artifact-status=degraded.`)
}

try {
  const options = parseArgs(process.argv.slice(2))
  if (options.help) {
    printHelp()
    process.exit(0)
  }
  const sessionDir = findSession(options)
  printSummary(summarize(sessionDir))
} catch (error) {
  console.error(`[evidence-inspector:error] ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

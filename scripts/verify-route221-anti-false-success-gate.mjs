#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const docs = {
  patterns: 'docs/implementation-context/route221-false-success-patterns.md',
  tasks: 'docs/implementation-context/frozen-capability-tasks-route221.json',
  schema: 'docs/implementation-context/capability-evidence-schema-route221.md',
  referenceTemplate: 'docs/implementation-context/reference-adoption-template-route221.md',
  reportTemplate: 'docs/implementation-context/future-route-report-template-route221.md',
}

const reportFixtureDir = 'docs/implementation-context/route221b-report-fixtures'
const goodReportFixture = `${reportFixtureDir}/good-report.json`
const badReportFixtures = [
  `${reportFixtureDir}/bad-unknown-frozen-task.json`,
  `${reportFixtureDir}/bad-route-local-primary.json`,
  `${reportFixtureDir}/bad-unknown-evidence-level.json`,
  `${reportFixtureDir}/bad-missing-negative-controls.json`,
  `${reportFixtureDir}/bad-partial-override.json`,
  `${reportFixtureDir}/bad-repair-continuation-success.json`,
  `${reportFixtureDir}/bad-apply-without-verification.json`,
  `${reportFixtureDir}/bad-fake-focused-live.json`,
]

const provenanceReportFixtureDir = 'docs/implementation-context/route221c-report-fixtures'
const goodProvenanceReportFixture = `${provenanceReportFixtureDir}/good-provenance-report.json`
const badProvenanceReportFixtures = [
  `${provenanceReportFixtureDir}/bad-frozen-task-not-loaded.json`,
  `${provenanceReportFixtureDir}/bad-route-local-benchmark-primary.json`,
  `${provenanceReportFixtureDir}/bad-route-local-script-product-proven.json`,
  `${provenanceReportFixtureDir}/bad-helper-only-product-proven.json`,
  `${provenanceReportFixtureDir}/bad-hardcoded-repair-proposal.json`,
  `${provenanceReportFixtureDir}/bad-harness-boolean-confirmation.json`,
  `${provenanceReportFixtureDir}/bad-fixture-readback-verification.json`,
  `${provenanceReportFixtureDir}/bad-route-local-harness-no-primary.json`,
  `${provenanceReportFixtureDir}/bad-old-route222-style.json`,
]

const knownEvidenceLevels = [
  'product-proven',
  'live-provider-proven',
  'selected-workspace-proven',
  'frozen-task-proven',
  'benchmark-proven',
  'route-local-benchmark',
  'focused-only',
  'fake/focused-only',
  'deterministic-only',
  'review-only',
  'partial',
  'blocked',
  'not-proven',
]

const requiredTaskFields = [
  'id',
  'taskType',
  'userPrompt',
  'expectedProductPath',
  'allowedFilesOrModuleArea',
  'requiredEvidence',
  'verificationExpectation',
  'negativeControls',
  'disallowedShortcuts',
  'successCriteria',
  'partialCriteria',
  'failureCriteria',
]

const requiredTaskTypes = [
  'lower-bound-stable',
  'upper-bound-challenge',
  'negative-control',
  'unsupported-broad-task',
  'command-only-bypass',
  'explicit-no-provider-no-apply',
  'live-provider-opt-in-case',
  'multi-file-case',
  'verification-failure-repair-case',
  'selected-workspace-authority-case',
  'context-session-continuity-case',
]

const requiredSchemaPhrases = [
  'Apply without verification is not success.',
  'Verification failure is not success.',
  'Repair continuation is not repair success.',
  'Repair proposal is not repair applied.',
  'Route-local benchmark is not product-proven.',
  'Fake/focused is never live.',
  'Default-safe is not completed work.',
  'Final status follows the weakest required frozen-task capability.',
  'Audit `PARTIAL` cannot be overridden unless an independent rerun returns `PASS`.',
]

const requiredNegativeControlKeys = [
  'routeLocalBenchmarkOnlyCompleteRejected',
  'fakeFocusedLabeledLiveRejected',
  'repairContinuationLabeledRepairSuccessRejected',
  'applyWithoutVerificationRejected',
  'commandOnlyBypassRejected',
  'auditPartialOverrideRejected',
]

const requiredPrimaryEvidenceFields = [
  'source',
  'frozenTaskLoadedFromFile',
  'frozenTaskId',
  'executionEntrypoint',
  'productConsumer',
  'routeLocalHarnessUsed',
  'helperOnlyComposition',
  'proposalSource',
  'confirmationSource',
  'verificationSource',
]

const knownPrimaryEvidenceSources = [
  'frozen-task-product-path',
  'product-proven',
  'selected-workspace-product-path',
  'live-provider-product-path',
  'route-local-benchmark',
  'focused-only',
  'not-proven',
]

const productExecutionEntrypoints = [
  'product-runtime',
  'product-composition-root',
  'route-gate',
]

const knownExecutionEntrypoints = [
  ...productExecutionEntrypoints,
  'helper-composition',
  'route-local-script-only',
]

const knownProposalSources = [
  'live-provider',
  'deterministic-from-product-read-evidence',
  'deterministic-from-failure-evidence',
  'route-local-hardcoded',
  'fake-focused',
  'not-applicable',
]

const knownConfirmationSources = [
  'product-approval',
  'explicit-authority-contract',
  'harness-boolean',
  'none',
]

const knownVerificationSources = [
  'task-relevant-command',
  'product-verification-route',
  'runtime-readback',
  'fixture-readback-only',
  'marker-only',
  'not-run',
]

function relPath(filePath) {
  return path.join(repoRoot, filePath)
}

function readText(filePath) {
  return fs.readFileSync(relPath(filePath), 'utf8')
}

function fail(checks, name, detail) {
  checks.push({ name, ok: false, detail })
  console.log(`[fail] ${name} - ${detail}`)
}

function pass(checks, name, detail = '') {
  checks.push({ name, ok: true, detail })
  const suffix = detail ? ` - ${detail}` : ''
  console.log(`[pass] ${name}${suffix}`)
}

function assertFileExists(checks, name, filePath) {
  if (!fs.existsSync(relPath(filePath))) {
    fail(checks, name, `${filePath} missing`)
    return false
  }
  pass(checks, name, filePath)
  return true
}

function arrayHasValue(value) {
  return Array.isArray(value) && value.length > 0
}

function parseArgs(argv) {
  const args = { reports: [] }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--report') {
      const reportPath = argv[index + 1]
      if (!reportPath) throw new Error('--report requires a path')
      args.reports.push(reportPath)
      index += 1
    } else if (arg === '--help' || arg === '-h') {
      args.help = true
    } else {
      throw new Error(`unknown argument: ${arg}`)
    }
  }
  return args
}

function printHelp() {
  console.log('usage: node scripts/verify-route221-anti-false-success-gate.mjs [--report <path> ...]')
  console.log('without --report, validates Route221 harness files plus built-in good/bad report fixtures')
}

function loadJsonFile(filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : relPath(filePath)
  return JSON.parse(fs.readFileSync(absolutePath, 'utf8'))
}

function loadTaskPack() {
  return loadJsonFile(docs.tasks)
}

function schemaEvidenceLevels() {
  const schema = readText(docs.schema)
  return new Set(knownEvidenceLevels.filter((level) => schema.includes(`\`${level}\``)))
}

function validateTasks(checks) {
  let taskPack
  try {
    taskPack = JSON.parse(readText(docs.tasks))
  } catch (error) {
    fail(checks, 'frozen-task-pack-json', error.message)
    return
  }
  pass(checks, 'frozen-task-pack-json', `schemaVersion=${taskPack.schemaVersion}`)

  if (!arrayHasValue(taskPack.tasks)) {
    fail(checks, 'frozen-task-pack-tasks', 'tasks must be a non-empty array')
    return
  }
  pass(checks, 'frozen-task-pack-tasks', `count=${taskPack.tasks.length}`)

  const seenIds = new Set()
  const taskTypes = new Set()
  let negativeControlCount = 0
  let routeLocalProductProofCount = 0
  const unknownEvidence = new Set()
  const missingFieldReports = []

  for (const task of taskPack.tasks) {
    if (typeof task.id === 'string') {
      if (seenIds.has(task.id)) fail(checks, 'frozen-task-ids-unique', `duplicate=${task.id}`)
      seenIds.add(task.id)
    }
    for (const field of requiredTaskFields) {
      if (task[field] === undefined || task[field] === '' || (Array.isArray(task[field]) && task[field].length === 0)) {
        missingFieldReports.push(`${task.id ?? '<missing-id>'}.${field}`)
      }
    }
    if (typeof task.taskType === 'string') taskTypes.add(task.taskType)
    if (task.taskType === 'negative-control' || /negative-control|bypass|unsupported/.test(`${task.id} ${task.taskType}`)) {
      negativeControlCount += 1
    }
    for (const level of task.requiredEvidence ?? []) {
      if (!knownEvidenceLevels.includes(level)) unknownEvidence.add(level)
    }
    if ((task.origin === 'route-local' || task.routeLocal === true) && (task.requiredEvidence ?? []).includes('product-proven')) {
      routeLocalProductProofCount += 1
    }
  }

  if (missingFieldReports.length > 0) {
    fail(checks, 'frozen-task-required-fields', missingFieldReports.join(', '))
  } else {
    pass(checks, 'frozen-task-required-fields')
  }

  const coveredTypeText = [...taskTypes, ...taskPack.tasks.map((task) => task.id)].join(' ')
  const missingTaskTypes = requiredTaskTypes.filter((type) => !coveredTypeText.includes(type))
  if (missingTaskTypes.length > 0) {
    fail(checks, 'frozen-task-required-coverage', `missing=${missingTaskTypes.join(', ')}`)
  } else {
    pass(checks, 'frozen-task-required-coverage')
  }

  if (negativeControlCount < 2) {
    fail(checks, 'negative-controls-present', `count=${negativeControlCount}`)
  } else {
    pass(checks, 'negative-controls-present', `count=${negativeControlCount}`)
  }

  if (unknownEvidence.size > 0) {
    fail(checks, 'task-evidence-levels-known', `unknown=${[...unknownEvidence].join(', ')}`)
  } else {
    pass(checks, 'task-evidence-levels-known')
  }

  if (routeLocalProductProofCount > 0) {
    fail(checks, 'route-local-not-product-proven', `violations=${routeLocalProductProofCount}`)
  } else {
    pass(checks, 'route-local-not-product-proven')
  }
}

function validateSchema(checks) {
  const schema = readText(docs.schema)
  const missingLevels = knownEvidenceLevels.filter((level) => !schema.includes(`\`${level}\``))
  if (missingLevels.length > 0) {
    fail(checks, 'schema-known-evidence-levels', `missing=${missingLevels.join(', ')}`)
  } else {
    pass(checks, 'schema-known-evidence-levels')
  }

  const missingPhrases = requiredSchemaPhrases.filter((phrase) => !schema.includes(phrase))
  if (missingPhrases.length > 0) {
    fail(checks, 'schema-required-rules', `missing=${missingPhrases.join(' | ')}`)
  } else {
    pass(checks, 'schema-required-rules')
  }

  for (const field of [
    'context',
    'providerProposal',
    'exactReadyAnchor',
    'confirmation',
    'apply',
    'verification',
    'repair',
    'sessionResultEvidence',
    'finalVerdict',
    'notProvenClaims',
  ]) {
    if (!schema.includes(`\`${field}\``)) {
      fail(checks, 'schema-task-verdict-fields', `missing=${field}`)
      return
    }
  }
  pass(checks, 'schema-task-verdict-fields')
}

function validateTemplates(checks) {
  const patterns = readText(docs.patterns)
  const report = readText(docs.reportTemplate)
  const reference = readText(docs.referenceTemplate)

  const patternPhrases = [
    'Route-local benchmark evidence is never primary `COMPLETE` evidence by itself.',
    'Audit `PARTIAL` remains `PARTIAL` unless an independent rerun returns `PASS`.',
    'Repair continuation is not repair success.',
  ]
  const missingPatternPhrases = patternPhrases.filter((phrase) => !patterns.includes(phrase))
  if (missingPatternPhrases.length > 0) {
    fail(checks, 'false-success-patterns-required-rules', `missing=${missingPatternPhrases.join(' | ')}`)
  } else {
    pass(checks, 'false-success-patterns-required-rules')
  }

  const reportPhrases = [
    'Frozen Tasks Attempted',
    'Route-Local Tasks Added',
    'Evidence Classification',
    'Required Negative Controls',
    'Machine-Checkable Report Artifact',
    'Evidence Provenance',
    'primaryEvidence',
    'npm run verify:route221-anti-false-success-gate -- --report',
    'If audit returned `PARTIAL`, rerun audit result',
    'Route-local evidence cannot be primary COMPLETE evidence.',
    'Frozen task id reference is not proof that the frozen task definition was loaded.',
    'Helper-only composition cannot be product-proven.',
    'A hardcoded route-local repair proposal cannot prove frozen repair-to-success.',
    'A harness boolean cannot prove product confirmation.',
  ]
  const missingReportPhrases = reportPhrases.filter((phrase) => !report.includes(phrase))
  if (missingReportPhrases.length > 0) {
    fail(checks, 'future-route-report-template-required-sections', `missing=${missingReportPhrases.join(' | ')}`)
  } else {
    pass(checks, 'future-route-report-template-required-sections')
  }

  const completeMentions = report.match(/COMPLETE/g)?.length ?? 0
  const hasCompleteGuard = report.includes('Final status if no independent `PASS` rerun after `PARTIAL`: `PARTIAL`') &&
    report.includes('route-local benchmark-only `COMPLETE`') &&
    report.includes('Frozen task id')
  if (completeMentions > 0 && !hasCompleteGuard) {
    fail(checks, 'template-complete-guard', 'COMPLETE appears without frozen/product/audit guard text')
  } else {
    pass(checks, 'template-complete-guard')
  }

  const referenceColumns = [
    'Capability area',
    'Reference repo',
    'File or subsystem inspected',
    'Pattern adopted',
    'Local seam changed',
    'Pattern rejected',
    'Reason',
    'Evidence produced',
  ]
  const missingReferenceColumns = referenceColumns.filter((column) => !reference.includes(column))
  if (missingReferenceColumns.length > 0) {
    fail(checks, 'reference-adoption-template-columns', `missing=${missingReferenceColumns.join(', ')}`)
  } else {
    pass(checks, 'reference-adoption-template-columns')
  }
}

function collectEvidenceLevelsFromReport(report) {
  const levels = []
  for (const item of report.frozenTasksAttempted ?? []) {
    if (typeof item.evidenceLevel === 'string') levels.push(['frozenTasksAttempted', item.id, item.evidenceLevel])
  }
  for (const item of report.routeLocalTasksAdded ?? []) {
    if (typeof item.evidenceLevel === 'string') levels.push(['routeLocalTasksAdded', item.id, item.evidenceLevel])
  }
  for (const item of report.taskVerdicts ?? []) {
    if (typeof item.evidenceLevel === 'string') levels.push(['taskVerdicts', item.taskId, item.evidenceLevel])
  }
  return levels
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0
}

function includesOneOf(value, needles) {
  const text = String(value ?? '')
  return needles.some((needle) => text.includes(needle))
}

function reportClaimsFrozenPrimaryComplete(report) {
  return (report.frozenTasksAttempted ?? []).some((task) => task.primaryCompleteEvidence === true || task.evidenceLevel === 'frozen-task-proven')
}

function reportClaimsProductProven(report, primaryEvidence) {
  if (primaryEvidence?.source === 'frozen-task-product-path' || primaryEvidence?.source === 'product-proven') {
    return true
  }
  return collectEvidenceLevelsFromReport(report).some(([, , level]) => level === 'product-proven')
}

function reportClaimsFrozenRepairToSuccessComplete(report) {
  const frozenRepairTaskComplete = (report.frozenTasksAttempted ?? []).some((task) => {
    return task.primaryCompleteEvidence === true &&
      task.verdict === 'COMPLETE' &&
      includesOneOf(task.requiredClaim, ['repair-to-success'])
  })
  const repairVerdictComplete = (report.taskVerdicts ?? []).some((verdict) => {
    return verdict.finalVerdict === 'COMPLETE' &&
      (verdict.repair?.reportedRepairSuccess === true || includesOneOf(verdict.taskId, ['verification-failure-repair-case']))
  })
  return frozenRepairTaskComplete || repairVerdictComplete
}

function validatePrimaryEvidence(report, options) {
  const errors = []
  const label = options.label
  const frozenTaskIds = options.frozenTaskIds
  const finalStatus = report.finalStatus
  const routeType = report.routeType ?? 'capability'
  const primaryEvidence = report.primaryEvidence

  if (finalStatus === 'COMPLETE' && isCapabilityLikeRouteType(routeType) && (primaryEvidence === undefined || primaryEvidence === null)) {
    errors.push(`${label}: COMPLETE capability report must include primaryEvidence`)
    return errors
  }
  if (primaryEvidence === undefined || primaryEvidence === null) return errors
  if (typeof primaryEvidence !== 'object' || Array.isArray(primaryEvidence)) {
    errors.push(`${label}: primaryEvidence must be an object`)
    return errors
  }

  for (const field of requiredPrimaryEvidenceFields) {
    if (!(field in primaryEvidence)) {
      errors.push(`${label}: primaryEvidence.${field} is required`)
    }
  }

  const valueChecks = [
    ['source', knownPrimaryEvidenceSources],
    ['executionEntrypoint', knownExecutionEntrypoints],
    ['proposalSource', knownProposalSources],
    ['confirmationSource', knownConfirmationSources],
    ['verificationSource', knownVerificationSources],
  ]
  for (const [field, values] of valueChecks) {
    if (field in primaryEvidence && !values.includes(primaryEvidence[field])) {
      errors.push(`${label}: primaryEvidence.${field} has unknown value ${primaryEvidence[field]}`)
    }
  }

  for (const field of ['frozenTaskLoadedFromFile', 'routeLocalHarnessUsed', 'helperOnlyComposition']) {
    if (field in primaryEvidence && typeof primaryEvidence[field] !== 'boolean') {
      errors.push(`${label}: primaryEvidence.${field} must be boolean`)
    }
  }

  if (primaryEvidence.frozenTaskId !== null && primaryEvidence.frozenTaskId !== undefined && !frozenTaskIds.has(primaryEvidence.frozenTaskId)) {
    errors.push(`${label}: primaryEvidence.frozenTaskId must be a known frozen task id`)
  }

  if (finalStatus !== 'COMPLETE') return errors

  const frozenPrimaryComplete = reportClaimsFrozenPrimaryComplete(report)
  const productProven = reportClaimsProductProven(report, primaryEvidence)
  const frozenRepairToSuccessComplete = reportClaimsFrozenRepairToSuccessComplete(report)

  if (primaryEvidence.source === 'route-local-benchmark') {
    errors.push(`${label}: primaryEvidence.source=route-local-benchmark cannot support COMPLETE`)
  }

  if (frozenPrimaryComplete) {
    if (primaryEvidence.frozenTaskLoadedFromFile !== true) {
      errors.push(`${label}: frozen task primary COMPLETE evidence must set primaryEvidence.frozenTaskLoadedFromFile=true`)
    }
    if (!frozenTaskIds.has(primaryEvidence.frozenTaskId)) {
      errors.push(`${label}: frozen task primary COMPLETE evidence must identify a known primaryEvidence.frozenTaskId`)
    }
  }

  if (productProven) {
    if (primaryEvidence.executionEntrypoint === 'route-local-script-only') {
      errors.push(`${label}: product-proven COMPLETE cannot use primaryEvidence.executionEntrypoint=route-local-script-only`)
    }
    if (primaryEvidence.helperOnlyComposition === true || primaryEvidence.executionEntrypoint === 'helper-composition') {
      errors.push(`${label}: product-proven COMPLETE cannot use helper-only composition`)
    }
  }

  if (frozenRepairToSuccessComplete) {
    if (primaryEvidence.proposalSource === 'route-local-hardcoded' || primaryEvidence.proposalSource === 'fake-focused') {
      errors.push(`${label}: frozen repair-to-success COMPLETE cannot use primaryEvidence.proposalSource=${primaryEvidence.proposalSource}`)
    }
    if (primaryEvidence.confirmationSource === 'harness-boolean') {
      errors.push(`${label}: frozen repair-to-success COMPLETE cannot use primaryEvidence.confirmationSource=harness-boolean`)
    }
    if (['fixture-readback-only', 'marker-only', 'not-run'].includes(primaryEvidence.verificationSource)) {
      errors.push(`${label}: frozen repair-to-success COMPLETE cannot use primaryEvidence.verificationSource=${primaryEvidence.verificationSource}`)
    }
  }

  if (primaryEvidence.routeLocalHarnessUsed === true) {
    const hasSeparateFrozenEvidence = primaryEvidence.frozenTaskLoadedFromFile === true && frozenTaskIds.has(primaryEvidence.frozenTaskId)
    const hasSeparateProductEvidence = productExecutionEntrypoints.includes(primaryEvidence.executionEntrypoint) &&
      primaryEvidence.helperOnlyComposition === false &&
      isNonEmptyString(primaryEvidence.productConsumer)
    if (!hasSeparateFrozenEvidence || !hasSeparateProductEvidence) {
      errors.push(`${label}: route-local harness evidence requires separate primary frozen/product evidence for COMPLETE`)
    }
  }

  return errors
}

function isCapabilityLikeRouteType(routeType) {
  return routeType === 'capability' || routeType === 'capstone-capability'
}

function validateRouteReport(report, options) {
  const errors = []
  const frozenTaskIds = options.frozenTaskIds
  const evidenceLevels = options.evidenceLevels
  const label = options.label

  if (report === null || typeof report !== 'object' || Array.isArray(report)) {
    return [`${label}: report must be a JSON object`]
  }

  const routeType = report.routeType ?? 'capability'
  const finalStatus = report.finalStatus
  const frozenTasks = report.frozenTasksAttempted
  if (!arrayHasValue(frozenTasks)) {
    errors.push(`${label}: frozenTasksAttempted must be a non-empty array`)
  } else {
    for (const task of frozenTasks) {
      if (!frozenTaskIds.has(task.id)) {
        errors.push(`${label}: unknown frozen task id ${task.id ?? '<missing>'}`)
      }
      if (!arrayHasValue(task.negativeControls)) {
        errors.push(`${label}: frozen task ${task.id ?? '<missing>'} must include negativeControls`)
      }
    }
  }

  for (const [section, id, level] of collectEvidenceLevelsFromReport(report)) {
    if (!evidenceLevels.has(level)) {
      errors.push(`${label}: unknown evidence level ${level} in ${section}:${id ?? '<missing>'}`)
    }
  }

  for (const routeLocalTask of report.routeLocalTasksAdded ?? []) {
    if (routeLocalTask.secondary !== true) {
      errors.push(`${label}: route-local task ${routeLocalTask.id ?? '<missing>'} must set secondary=true`)
    }
    if (routeLocalTask.evidenceLevel !== 'route-local-benchmark') {
      errors.push(`${label}: route-local task ${routeLocalTask.id ?? '<missing>'} must use route-local-benchmark evidence`)
    }
    if (routeLocalTask.primaryCompleteEvidence !== false) {
      errors.push(`${label}: route-local task ${routeLocalTask.id ?? '<missing>'} cannot be primary COMPLETE evidence`)
    }
  }

  if (isCapabilityLikeRouteType(routeType)) {
    if (report.requiredNegativeControls === undefined || report.requiredNegativeControls === null) {
      errors.push(`${label}: capability report must include requiredNegativeControls`)
    } else {
      for (const key of requiredNegativeControlKeys) {
        if (report.requiredNegativeControls[key] !== true) {
          errors.push(`${label}: requiredNegativeControls.${key} must be true`)
        }
      }
    }
  }

  if (report.independentAuditResult === 'PARTIAL' && finalStatus === 'COMPLETE') {
    const rerun = report.independentPassRerun
    if (!rerun || rerun.result !== 'PASS') {
      errors.push(`${label}: audit PARTIAL cannot become COMPLETE without independentPassRerun.result=PASS`)
    }
  }

  for (const verdict of report.taskVerdicts ?? []) {
    if (verdict.taskId && !frozenTaskIds.has(verdict.taskId) && !String(verdict.taskId).startsWith('route')) {
      errors.push(`${label}: task verdict references unknown task ${verdict.taskId}`)
    }

    const providerClass = String(verdict.providerEvidenceClass ?? '')
    const providerMode = String(verdict.providerMode ?? '')
    if (
      verdict.evidenceLevel === 'live-provider-proven' &&
      (/fake|focused/.test(providerClass) || /fake|synthetic/.test(providerMode))
    ) {
      errors.push(`${label}: fake/focused provider evidence cannot be live-provider-proven for ${verdict.taskId ?? '<missing>'}`)
    }

    const repair = verdict.repair ?? {}
    if (repair.reportedRepairSuccess === true) {
      const repairApplied = repair.applied === true
      const repairVerified = repair.postRepairVerification === 'passed'
      if (!repairApplied || !repairVerified) {
        errors.push(`${label}: repair continuation/proposal alone cannot be reported as repair success for ${verdict.taskId ?? '<missing>'}`)
      }
    }

    const apply = verdict.apply ?? {}
    if (apply.reportedSuccess === true) {
      const applied = apply.status === 'applied'
      const verified = apply.verificationStatus === 'passed'
      if (!applied || !verified) {
        errors.push(`${label}: apply without passed verification cannot be reported as success for ${verdict.taskId ?? '<missing>'}`)
      }
    }
  }

  errors.push(...validatePrimaryEvidence(report, { label, frozenTaskIds }))

  return errors
}

function validateReportFile(checks, filePath, options = {}) {
  let report
  try {
    report = loadJsonFile(filePath)
  } catch (error) {
    fail(checks, `route-report-json:${filePath}`, error.message)
    return false
  }

  const errors = validateRouteReport(report, {
    frozenTaskIds: options.frozenTaskIds,
    evidenceLevels: options.evidenceLevels,
    label: filePath,
  })
  if (errors.length > 0) {
    fail(checks, `route-report:${filePath}`, errors.join(' | '))
    return false
  }
  pass(checks, `route-report:${filePath}`)
  return true
}

function validateReportFixtures(checks, options) {
  assertFileExists(checks, 'route221b-good-report-fixture-exists', goodReportFixture)
  for (const fixture of badReportFixtures) {
    assertFileExists(checks, `route221b-bad-report-fixture-exists:${path.basename(fixture)}`, fixture)
  }
  if (checks.some((check) => !check.ok)) return

  validateReportFile(checks, goodReportFixture, options)

  for (const fixture of badReportFixtures) {
    let report
    try {
      report = loadJsonFile(fixture)
    } catch (error) {
      fail(checks, `route221b-bad-report-json:${fixture}`, error.message)
      continue
    }
    const errors = validateRouteReport(report, {
      frozenTaskIds: options.frozenTaskIds,
      evidenceLevels: options.evidenceLevels,
      label: fixture,
    })
    if (errors.length === 0) {
      fail(checks, `route221b-bad-report-rejected:${path.basename(fixture)}`, 'bad report unexpectedly passed')
    } else {
      pass(checks, `route221b-bad-report-rejected:${path.basename(fixture)}`, errors[0])
    }
  }

  assertFileExists(checks, 'route221c-good-provenance-report-fixture-exists', goodProvenanceReportFixture)
  for (const fixture of badProvenanceReportFixtures) {
    assertFileExists(checks, `route221c-bad-provenance-report-fixture-exists:${path.basename(fixture)}`, fixture)
  }
  if (checks.some((check) => !check.ok)) return

  validateReportFile(checks, goodProvenanceReportFixture, options)

  for (const fixture of badProvenanceReportFixtures) {
    let report
    try {
      report = loadJsonFile(fixture)
    } catch (error) {
      fail(checks, `route221c-bad-provenance-report-json:${fixture}`, error.message)
      continue
    }
    const errors = validateRouteReport(report, {
      frozenTaskIds: options.frozenTaskIds,
      evidenceLevels: options.evidenceLevels,
      label: fixture,
    })
    if (errors.length === 0) {
      fail(checks, `route221c-bad-provenance-report-rejected:${path.basename(fixture)}`, 'bad report unexpectedly passed')
    } else {
      pass(checks, `route221c-bad-provenance-report-rejected:${path.basename(fixture)}`, errors[0])
    }
  }
}

function main() {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error.message)
    printHelp()
    process.exit(1)
  }
  if (args.help) {
    printHelp()
    process.exit(0)
  }

  console.log('gate name=route221-anti-false-success')
  console.log(args.reports.length > 0 ? 'mode=route-report' : 'mode=static-harness')
  console.log(`repo=${repoRoot}`)

  const checks = []
  for (const [name, filePath] of Object.entries(docs)) {
    assertFileExists(checks, `${name}-exists`, filePath)
  }

  if (checks.some((check) => !check.ok)) {
    console.log('[fail] route221-anti-false-success-gate')
    process.exit(1)
  }

  validateTasks(checks)
  validateSchema(checks)
  validateTemplates(checks)

  let taskPack
  try {
    taskPack = loadTaskPack()
  } catch (error) {
    fail(checks, 'route-report-task-pack-load', error.message)
  }
  const frozenTaskIds = new Set((taskPack?.tasks ?? []).map((task) => task.id))
  const evidenceLevels = schemaEvidenceLevels()

  if (args.reports.length > 0) {
    for (const reportPath of args.reports) {
      validateReportFile(checks, reportPath, { frozenTaskIds, evidenceLevels })
    }
  } else {
    validateReportFixtures(checks, { frozenTaskIds, evidenceLevels })
  }

  const ok = checks.every((check) => check.ok)
  console.log(`[${ok ? 'pass' : 'fail'}] route221-anti-false-success-gate`)
  process.exit(ok ? 0 : 1)
}

main()

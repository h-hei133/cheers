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
    'If audit returned `PARTIAL`, rerun audit result',
    'Route-local evidence cannot be primary COMPLETE evidence.',
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

function main() {
  console.log('gate name=route221-anti-false-success')
  console.log('mode=static-harness')
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

  const ok = checks.every((check) => check.ok)
  console.log(`[${ok ? 'pass' : 'fail'}] route221-anti-false-success-gate`)
  process.exit(ok ? 0 : 1)
}

main()

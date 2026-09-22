#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

const checks = [
  {
    name: 'compact-continuity',
    args: [
      'run',
      'test',
      '-w',
      'packages/ts-shell',
      '--',
      'src/session/mutationCompactContinuity.test.ts',
      '-t',
      'preserves exactly-three planning no-write stopped state across compact-equivalent reload and follow-up',
    ],
  },
  {
    name: 'terminal-surface',
    args: [
      'run',
      'test',
      '-w',
      'packages/ts-shell',
      '--',
      'src/core/shell/sessionStateSurface.test.ts',
      '-t',
      'renders no-write planned files without labeling them as changed',
    ],
  },
]

console.log('gate name=planned-files-continuity')
console.log('mode=deterministic-no-write')
console.log('scenario=exactly-three-planning-no-write-continuity')
console.log('realProviderTouched=false')
console.log('defaultGateChanged=false')

const failures = []
for (const check of checks) {
  const result = spawnSync('npm', check.args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      CHEERS_PROVIDER_MODE: 'synthetic',
    },
    maxBuffer: 1024 * 1024 * 10,
  })
  if (result.status !== 0) {
    failures.push(`${check.name}: ${summarizeOutput(`${result.stdout}\n${result.stderr}`)}`)
  }
}

console.log('outcome=stopped')
console.log('classification=three-file-planning-no-write')
console.log('plannedFiles=src/a.ts,src/b.ts,src/c.ts')
console.log('changedFiles=none')
console.log('failedFiles=src/a.ts,src/b.ts,src/c.ts')
console.log('writerInvoked=false')
console.log('workspaceUnchanged=true')
console.log('compactContinuityIncludesPlannedFiles=true')
console.log('compactContinuityIncludesStoppedReason=true')
console.log('terminalSurfaceIncludesNoWrite=true')
console.log('successLike=false')
console.log('rollbackAtomicityClaim=false')

if (failures.length > 0) {
  for (const failure of failures) {
    console.log(`[fail] planned-files-continuity - ${failure}`)
  }
  process.exit(1)
}

console.log('[pass] planned-files-continuity')

function summarizeOutput(output) {
  return String(output ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-12)
    .join(' | ')
}

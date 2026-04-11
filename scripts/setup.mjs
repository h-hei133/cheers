#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function runStep(name, command, args) {
  console.log(`\n=== ${name} ===`)
  const result = spawnSync(command, args, {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false,
  })

  if (result.error) {
    throw result.error
  }
  if (result.status !== 0) {
    throw new Error(`${name} failed with exit code ${result.status}`)
  }
}

try {
  runStep('Bootstrap workspace', process.execPath, ['scripts/bootstrap.mjs'])
  runStep('Validate structure', process.execPath, ['scripts/validate-structure.mjs'])
  runStep('Run doctor', process.execPath, ['scripts/doctor.mjs'])
  console.log('\n✓ Setup completed successfully')
} catch (error) {
  console.error(`\n✗ Setup failed: ${error instanceof Error ? error.message : String(error)}`)
  process.exitCode = 1
}

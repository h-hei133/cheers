#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { detectCargo } from './toolchain.mjs'

const cargo = detectCargo()
if (!cargo.ok) {
  console.error(`Cargo not found. ${cargo.output}`)
  process.exit(1)
}

const result = spawnSync(cargo.command, process.argv.slice(2), {
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 0)

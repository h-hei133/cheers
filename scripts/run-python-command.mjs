#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { detectPython } from './toolchain.mjs'

const python = detectPython()
if (!python.ok) {
  console.error(`Python not found. ${python.output}`)
  process.exit(1)
}

const result = spawnSync(python.command, process.argv.slice(2), {
  stdio: 'inherit',
  shell: false,
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}

process.exit(result.status ?? 0)

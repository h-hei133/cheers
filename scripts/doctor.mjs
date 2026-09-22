#!/usr/bin/env node

import { fileURLToPath } from 'node:url'
import path from 'node:path'
import fs from 'node:fs'
import {
  detectCargo,
  detectNode,
  detectPython,
  detectRustup,
  getExecutionPathLabel,
} from './toolchain.mjs'
import { getGitWorkflowContext } from './git-workflow.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')

function statusLine(ok, label, detail) {
  return `${ok ? '✓' : '✗'} ${label}: ${detail}`
}

function checkFile(relativePath) {
  return fs.existsSync(path.join(rootDir, relativePath))
}

const node = detectNode()
const python = detectPython()
const cargo = detectCargo()
const rustup = detectRustup()
const gitContext = getGitWorkflowContext(rootDir)

const checks = [
  { label: 'Node.js', result: node, required: true },
  { label: 'Python', result: python, required: true },
  { label: 'Cargo', result: cargo, required: true },
  { label: 'Rustup', result: rustup, required: false },
]

console.log('🩺 Cheers Doctor\n')
console.log(`Workspace: ${rootDir}`)
console.log(`Execution path: ${getExecutionPathLabel()}`)
console.log('')

let hasRequiredFailures = false
for (const check of checks) {
  const ok = check.result.ok
  const detail = ok ? `${check.result.command} -> ${check.result.output}` : check.result.output
  console.log(statusLine(ok, check.label, detail))
  if (!ok && check.required) {
    hasRequiredFailures = true
  }
}

console.log('')
console.log(statusLine(checkFile('package.json'), 'Root package.json', 'workspace manifest present'))
console.log(statusLine(checkFile('packages/ts-shell/package.json'), 'TS shell package', 'package manifest present'))
console.log(statusLine(checkFile('packages/rust-core/Cargo.toml'), 'Rust core package', 'Cargo manifest present'))
console.log(statusLine(checkFile('packages/python-eval/pyproject.toml'), 'Python eval package', 'pyproject present'))

if (gitContext.insideGit) {
  console.log(statusLine(true, 'Git branch', gitContext.branch ?? 'unknown'))
  console.log(statusLine(true, 'Workspace clean', gitContext.isClean ? 'yes' : 'no'))
}

console.log('\nNext steps:')
console.log('- npm run setup     # bootstrap + structure validation + doctor')
console.log('- npm run workflow:status  # inspect branch/worktree status')
console.log('- npm run build     # build/typecheck all workspaces')
console.log('- npm test          # run TS + Rust + Python verification')

if (hasRequiredFailures) {
  console.error('\nDoctor found required toolchain gaps. Fix the missing tools before daily use.')
  process.exitCode = 1
}

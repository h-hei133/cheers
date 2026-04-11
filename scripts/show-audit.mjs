#!/usr/bin/env node

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const auditPath = path.join(rootDir, '.sisyphus', 'audit', 'permissions.jsonl')
const limitArg = Number(process.argv[2] ?? '10')
const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 10

if (!fs.existsSync(auditPath)) {
  console.log(`No audit log found at ${auditPath}`)
  process.exit(0)
}

const lines = fs.readFileSync(auditPath, 'utf8').split('\n').filter(Boolean).slice(-limit)

console.log(`Recent audit entries (${lines.length}/${limit})\n`)
for (const line of lines) {
  const entry = JSON.parse(line)
  console.log(`[${new Date(entry.timestamp).toISOString()}] ${entry.eventType}`)
  console.log(`  tool=${entry.toolName} operation=${entry.operation}`)
  console.log(`  target=${entry.target}`)
  console.log(`  decision=${entry.decision}`)
  console.log(`  reason=${entry.reason}`)
  console.log('')
}

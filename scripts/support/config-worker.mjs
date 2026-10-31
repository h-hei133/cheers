import fs from 'node:fs'

// Import in this process, so the parent deadline kills the request owner directly.
let output
try {
  const { inspect } = await import('./config.ts')
  output = await inspect(JSON.parse(fs.readFileSync(0, 'utf8')))
} catch {
  output = { ok: false, status: 'config-failure', reason: 'Configuration could not be read or its captured source changed.' }
}
process.stdout.write(JSON.stringify(output), () => process.exit(0))

import { readdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { validatePayload } from './validator.js'

const ROOT = path.resolve(process.cwd(), 'contracts', 'tests', 'fixtures')
const VALID_DIR = path.join(ROOT, 'valid')
const INVALID_DIR = path.join(ROOT, 'invalid')

async function listJsonFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.endsWith('.json'))
    .map(entry => path.join(dir, entry.name))
}

async function loadJson(filePath) {
  const raw = await readFile(filePath, 'utf8')
  return JSON.parse(raw)
}

async function run() {
  const validFiles = await listJsonFiles(VALID_DIR)
  const invalidFiles = await listJsonFiles(INVALID_DIR)

  const report = {
    valid: [],
    invalid: [],
  }

  for (const filePath of validFiles) {
    const payload = await loadJson(filePath)
    const errors = validatePayload(payload)
    if (errors.length > 0) {
      throw new Error(
        `Expected valid fixture to pass: ${path.basename(filePath)} -> ${JSON.stringify(errors)}`,
      )
    }
    report.valid.push({ fixture: path.basename(filePath), status: 'pass' })
  }

  for (const filePath of invalidFiles) {
    const payload = await loadJson(filePath)
    const errors = validatePayload(payload)
    if (errors.length === 0) {
      throw new Error(`Expected invalid fixture to fail: ${path.basename(filePath)}`)
    }
    report.invalid.push({
      fixture: path.basename(filePath),
      status: 'fail-as-expected',
      errors,
    })
  }

  const validSummary = report.valid.map(item => `PASS ${item.fixture}`).join('\n')
  const invalidSummary = report.invalid
    .map(item => {
      const first = item.errors[0]
      return `REJECT ${item.fixture} ${first.code} ${first.path ?? '/'}`
    })
    .join('\n')

  const validEvidencePath = path.resolve(
    process.cwd(),
    '.sisyphus',
    'evidence',
    'task-1-valid-schema.txt',
  )
  const invalidEvidencePath = path.resolve(
    process.cwd(),
    '.sisyphus',
    'evidence',
    'task-1-invalid-schema-error.txt',
  )

  await writeFile(validEvidencePath, `${validSummary}\n`, 'utf8')
  await writeFile(invalidEvidencePath, `${invalidSummary}\n`, 'utf8')

  process.stdout.write(`${validSummary}\n${invalidSummary}\n`)
}

run().catch(error => {
  process.stderr.write(`${error.message}\n`)
  process.exitCode = 1
})

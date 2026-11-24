import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const ci = fs.readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
const release = fs.readFileSync(path.join(root, '.github/workflows/release.yml'), 'utf8')

test('release builds wait for successful main CI on the exact commit', () => {
  assert.match(release, /verify-ci:[\s\S]*?--branch main --commit "\$GITHUB_SHA"/)
  assert.match(release, /\.headSha == \$sha and \.event == "push"/)
  assert.match(release, /Build & Test,Validate NormProof Architecture/)
  assert.match(release, /build:[\s\S]*?needs: verify-ci/)
  assert.match(release, /publish:[\s\S]*?needs: \[verify-ci, build\]/)
})

test('build and release workflows use maintained action runtimes', () => {
  assert.match(ci, /actions\/checkout@v7/)
  assert.match(ci, /actions\/setup-node@v7/)
  assert.doesNotMatch(ci, /actions\/(?:checkout|setup-node)@v4/)
  assert.match(release, /actions\/upload-artifact@v7/)
  assert.match(release, /actions\/download-artifact@v8/)
  assert.match(release, /actions\/checkout@v7/)
  assert.match(release, /actions\/setup-node@v7/)
  assert.doesNotMatch(release, /actions\/(?:checkout|setup-node|upload-artifact|download-artifact)@v4/)
})

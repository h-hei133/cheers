import fs from 'node:fs'
import path from 'node:path'

export function firstExistingPath(candidates) {
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? candidates[0]
}

export function resolveVitestPath(repoRoot, tsShellRoot) {
  return firstExistingPath([
    path.join(tsShellRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    path.join(repoRoot, 'node_modules', 'vitest', 'vitest.mjs'),
  ])
}

export function pathsEqual(left, right) {
  const normalize = (value) => path.resolve(value).replace(/\\/g, '/')
  const leftNormalized = normalize(left)
  const rightNormalized = normalize(right)
  return process.platform === 'win32'
    ? leftNormalized.toLowerCase() === rightNormalized.toLowerCase()
    : leftNormalized === rightNormalized
}

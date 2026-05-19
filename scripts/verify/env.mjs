import path from 'node:path'
import { spawnSync } from 'node:child_process'

export function createVerifierPaths({ entrypointUrl, testRoot, runId, platform = process.platform }) {
  const repoRoot = path.resolve(path.dirname(entrypointUrl), '..', '..')
  const tsShellRoot = path.join(repoRoot, 'packages', 'ts-shell')
  const tsxCliPath = path.join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs')
  const cliEntryPath = path.join(tsShellRoot, 'src', 'entrypoints', 'cli.tsx')
  const reportPath = path.join(testRoot, 'test-results', 'real-user-capabilities-report.json')
  const npmBin = platform === 'win32' ? 'npm.cmd' : 'npm'
  return {
    repoRoot,
    tsShellRoot,
    tsxCliPath,
    cliEntryPath,
    npmBin,
    toolAvailability: {
      node: { bin: process.execPath, available: true },
      npm: { bin: npmBin, available: commandAvailable(npmBin, ['--version']) },
      rtk: { bin: 'rtk', available: commandAvailable('rtk', ['--version']) },
    },
    reportPath,
    residuePaths: [
      '.sisyphus/audit/permissions.jsonl',
      path.join(testRoot, 'real-user-capabilities-audit'),
      path.join(testRoot, 'route03-cli-evidence-audit'),
      path.join(testRoot, 'route08-unsupported-audit'),
    ],
    runId,
  }
}

function commandAvailable(command, args) {
  const result = spawnSync(command, args, {
    stdio: 'ignore',
    shell: false,
    timeout: 3000,
  })
  return !result.error
}

export function parseBooleanFlags(argv, names) {
  const flags = {}
  for (const name of names) {
    flags[name] = argv.includes(`--${name}`)
  }
  return flags
}

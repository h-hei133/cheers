#!/usr/bin/env node

import fs from 'node:fs'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import path from 'node:path'

function checkExecutable(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: false,
  })

  if (result.error || result.status !== 0) {
    return {
      ok: false,
      command,
      output: result.stderr || result.stdout || result.error?.message || '',
    }
  }

  return {
    ok: true,
    command,
    output: (result.stdout || result.stderr || '').trim(),
  }
}

function candidateCommands(candidates, args = ['--version']) {
  for (const candidate of candidates) {
    const checked = checkExecutable(candidate, args)
    if (checked.ok) {
      return checked
    }
  }

  return {
    ok: false,
    command: candidates[0],
    output: `Tried: ${candidates.join(', ')}`,
  }
}

export function detectPython() {
  const configured = process.env.CHEERS_PYTHON
  const knownConda = 'D:\\conda-envs\\coding_agents\\python.exe'
  const candidates = configured
    ? [configured, knownConda, 'python', 'py']
    : [knownConda, 'python', 'py']

  return candidateCommands(candidates, ['--version'])
}

export function detectCargo() {
  const userProfile = process.env.USERPROFILE ?? ''
  return candidateCommands([
    path.join(userProfile, '.cargo', 'bin', 'cargo.exe'),
    'cargo',
  ])
}

export function detectRustup() {
  const userProfile = process.env.USERPROFILE ?? ''
  return candidateCommands([
    path.join(userProfile, '.cargo', 'bin', 'rustup.exe'),
    'rustup',
  ])
}

export function detectNode() {
  return checkExecutable(process.execPath, ['--version'])
}

export function detectVitestModule(rootDir) {
  return path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs')
}

export function getExecutionPathLabel(rootDir = process.cwd()) {
  const candidates = [
    path.join(os.homedir(), '.cheers', 'config.json'),
    path.join(rootDir, '.cheers.json'),
  ]

  let daemonEnabledFromConfig
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) {
      continue
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'))
      if (typeof parsed.daemonEnabled === 'boolean') {
        daemonEnabledFromConfig = parsed.daemonEnabled
      }
    } catch {
      // doctor should stay readable even if config parsing fails elsewhere
    }
  }

  const daemonEnabled = process.env.DAEMON_ENABLED === undefined
    ? daemonEnabledFromConfig ?? true
    : process.env.DAEMON_ENABLED === '1'

  return daemonEnabled ? 'rust-daemon' : 'ts-local'
}

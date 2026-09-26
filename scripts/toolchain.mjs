#!/usr/bin/env node

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

export function detectNode() {
  return checkExecutable(process.execPath, ['--version'])
}

export function detectVitestModule(rootDir) {
  return path.join(rootDir, 'node_modules', 'vitest', 'vitest.mjs')
}

/**
 * Which execution path commands run through.
 *
 * There is only one. It used to answer `rust-daemon` or `ts-local` depending on
 * a config flag and whether `cargo` was on the PATH; the daemon is gone, so the
 * question no longer has two answers. Kept as a function rather than inlined
 * because callers print it as a fact about the build, and a fact is easier to
 * change in one place than in three.
 */
export function getExecutionPathLabel() {
  return 'ts-local'
}

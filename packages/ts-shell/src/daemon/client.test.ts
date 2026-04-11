import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isRustDaemonEnabled } from './client.js'
import { getExecutionPathLabel } from '../../../../scripts/toolchain.mjs'

describe('rust daemon feature flag', () => {
  const originalUserProfile = process.env.USERPROFILE
  const originalHome = process.env.HOME
  let fakeHome = ''
  let fakeRoot = ''

  beforeEach(() => {
    fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-daemon-home-'))
    fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'private-agents-daemon-root-'))
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome
    delete process.env.DAEMON_ENABLED
  })

  afterEach(() => {
    process.env.USERPROFILE = originalUserProfile
    process.env.HOME = originalHome
    delete process.env.DAEMON_ENABLED
    fs.rmSync(fakeHome, { recursive: true, force: true })
    fs.rmSync(fakeRoot, { recursive: true, force: true })
  })

  it('reads the daemon flag from the environment', () => {
    process.env.DAEMON_ENABLED = '1'
    expect(isRustDaemonEnabled()).toBe(true)
    process.env.DAEMON_ENABLED = '0'
    expect(isRustDaemonEnabled()).toBe(false)
    delete process.env.DAEMON_ENABLED
  })

  it('reports rust-daemon by default when no config disables it', () => {
    expect(getExecutionPathLabel(fakeRoot)).toBe('rust-daemon')
  })

  it('reports ts-local when project config disables daemon mode', () => {
    fs.writeFileSync(
      path.join(fakeRoot, '.private-agents.json'),
      JSON.stringify({ daemonEnabled: false }),
      'utf8',
    )

    expect(getExecutionPathLabel(fakeRoot)).toBe('ts-local')
  })

  it('lets env override project config for execution-path reporting', () => {
    fs.writeFileSync(
      path.join(fakeRoot, '.private-agents.json'),
      JSON.stringify({ daemonEnabled: false }),
      'utf8',
    )
    process.env.DAEMON_ENABLED = '1'

    expect(getExecutionPathLabel(fakeRoot)).toBe('rust-daemon')
    expect(isRustDaemonEnabled()).toBe(true)
  })
})

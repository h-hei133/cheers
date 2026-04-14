import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('treats cargo on PATH as available when the home cargo binary is missing', async () => {
    vi.resetModules()
    vi.doMock('node:child_process', () => ({
      execFile: vi.fn(),
      execFileSync: vi.fn((command: string) => {
        if (command.includes('.cargo')) {
          throw new Error('ENOENT')
        }

        return Buffer.from('cargo 1.0.0')
      }),
    }))

    try {
      const { checkRustDaemonAvailability } = await import('./client.js')
      expect(checkRustDaemonAvailability()).toEqual({ available: true })
    } finally {
      vi.doUnmock('node:child_process')
      vi.resetModules()
    }
  })

  it('executes through cargo on PATH when the home cargo binary is missing', async () => {
    const daemonPayload = JSON.stringify({
      status: 'completed',
      exitCode: 0,
      stdout: 'daemon path via PATH cargo',
      stderr: '',
      failureKind: undefined,
    })

    const execFileMock = vi.fn((command: string, args: string[], _options: unknown, callback: (error: unknown, stdout?: string, stderr?: string) => void) => {
      expect(['cargo', 'cargo.exe']).toContain(path.basename(command).toLowerCase())
      expect(command.includes('.cargo')).toBe(false)
      expect(args).toContain('--manifest-path')
      callback(null, daemonPayload, '')
    })
    const promisifiedExecFileMock = vi.fn(async (command: string, args: string[]) => {
      expect(['cargo', 'cargo.exe']).toContain(path.basename(command).toLowerCase())
      expect(args).toContain('--manifest-path')
      return { stdout: daemonPayload, stderr: '' }
    })
    execFileMock[Symbol.for('nodejs.util.promisify.custom') as unknown as 'custom'] = promisifiedExecFileMock

    vi.resetModules()
    vi.doMock('node:child_process', () => ({
      execFile: execFileMock,
      execFileSync: vi.fn((command: string) => {
        if (command.includes('.cargo')) {
          throw new Error('ENOENT')
        }

        return Buffer.from('cargo 1.0.0')
      }),
    }))

    try {
      const { executeViaRustDaemon } = await import('./client.js')
      const result = await executeViaRustDaemon({
        command: 'cmd',
        args: ['/C', 'echo ok'],
        cwd: fakeRoot,
        workspaceRoot: fakeRoot,
        timeoutMs: 1000,
      })

      expect(result).toEqual({
        status: 'completed',
        exitCode: 0,
        stdout: 'daemon path via PATH cargo',
        stderr: '',
        failureKind: undefined,
      })
      expect(promisifiedExecFileMock).toHaveBeenCalledOnce()
    } finally {
      vi.doUnmock('node:child_process')
      vi.resetModules()
    }
  })

  it('preserves structured failure kind from daemon payload', async () => {
    const daemonPayload = JSON.stringify({
      status: 'failed',
      exitCode: null,
      stdout: '',
      stderr: 'wording drifted completely',
      failureKind: 'sandbox_preflight',
    })

    const execFileMock = vi.fn((command: string, args: string[], _options: unknown, callback: (error: unknown, stdout?: string, stderr?: string) => void) => {
      expect(['cargo', 'cargo.exe']).toContain(path.basename(command).toLowerCase())
      expect(args).toContain('--manifest-path')
      callback(null, daemonPayload, '')
    })
    const promisifiedExecFileMock = vi.fn(async () => ({ stdout: daemonPayload, stderr: '' }))
    execFileMock[Symbol.for('nodejs.util.promisify.custom') as unknown as 'custom'] = promisifiedExecFileMock

    vi.resetModules()
    vi.doMock('node:child_process', () => ({
      execFile: execFileMock,
      execFileSync: vi.fn(() => Buffer.from('cargo 1.0.0')),
    }))

    try {
      const { executeViaRustDaemon } = await import('./client.js')
      const result = await executeViaRustDaemon({
        command: 'cmd',
        args: ['/C', 'echo ignored'],
        cwd: fakeRoot,
        workspaceRoot: fakeRoot,
        timeoutMs: 1000,
      })

      expect(result).toEqual({
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: 'wording drifted completely',
        failureKind: 'sandbox_preflight',
      })
    } finally {
      vi.doUnmock('node:child_process')
      vi.resetModules()
    }
  })
})

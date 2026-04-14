import { describe, expect, it } from 'vitest'
import { executeLocally, executeViaRustDaemon } from './client.js'

describe('TS/Rust execution parity (B5)', () => {
  it('returns aligned success semantics for a trivial command', async () => {
    const local = await executeLocally({
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: process.platform === 'win32' ? ['/C', 'echo parity-ok'] : ['-c', 'printf parity-ok'],
      cwd: process.cwd(),
      timeoutMs: 1000,
    })

    const rust = await executeViaRustDaemon({
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: process.platform === 'win32' ? ['/C', 'echo parity-ok'] : ['-c', 'printf parity-ok'],
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 1000,
    })

    expect(local.status).toBe('completed')
    expect(rust.status).toBe('completed')
    expect(local.stdout.toLowerCase()).toContain('parity-ok')
    expect(rust.stdout.toLowerCase()).toContain('parity-ok')
  }, 20000)

  it('returns aligned timeout semantics', async () => {
    const local = await executeLocally({
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: process.platform === 'win32'
        ? ['/C', 'ping -n 3 127.0.0.1 >NUL']
        : ['-c', 'sleep 2'],
      cwd: process.cwd(),
      timeoutMs: 50,
    })

    const rust = await executeViaRustDaemon({
      command: process.platform === 'win32' ? 'cmd' : 'sh',
      args: process.platform === 'win32'
        ? ['/C', 'ping -n 3 127.0.0.1 >NUL']
        : ['-c', 'sleep 2'],
      cwd: process.cwd(),
      workspaceRoot: process.cwd(),
      timeoutMs: 50,
    })

    expect(local.status).toBe('timeout')
    expect(rust.status).toBe('timeout')
    expect(rust.failureKind).toBe('timeout')
  }, 20000)
})

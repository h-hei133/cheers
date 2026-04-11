import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { safeRemoveDir } from '../test-utils/cleanup.js'

describe('tool registry rust bridge', () => {
  let workspaceRoot = ''

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'private-agents-rust-bridge-'))
  })

  afterEach(async () => {
    delete process.env.DAEMON_ENABLED
    await safeRemoveDir(workspaceRoot)
    vi.resetModules()
    vi.unmock('../daemon/client.js')
  })

  it('routes bash through the rust daemon when the feature flag is enabled', async () => {
    process.env.DAEMON_ENABLED = '1'
    vi.resetModules()
    vi.doMock('../daemon/client.js', () => ({
      executeViaRustDaemon: vi.fn().mockResolvedValue({
        status: 'completed',
        exitCode: 0,
        stdout: 'daemon path',
        stderr: '',
      }),
      isRustDaemonEnabled: () => true,
      checkRustDaemonAvailability: () => ({ available: true }),
    }))

    const { createMvpToolRegistry } = await import('./registry.js')
    const registry = createMvpToolRegistry()
    const bashTool = registry.get('bash')
    if (!bashTool) {
      throw new Error('bash tool missing from registry')
    }

    const result = await bashTool.execute(
      { command: 'echo ok' },
      { taskId: 'task_bridge', workspaceRoot },
    )

    expect(result.success).toBe(true)
    expect(result.output).toBe('daemon path')
    expect(result.metadata).toMatchObject({ executionPath: 'rust-daemon' })
  })

  it('keeps local TS execution available when the feature flag is disabled', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    process.env.DAEMON_ENABLED = '0'
    vi.doUnmock('../daemon/client.js')
    vi.resetModules()

    const { createMvpToolRegistry } = await import('./registry.js')
    const registry = createMvpToolRegistry()
    const bashTool = registry.get('bash')
    if (!bashTool) {
      throw new Error('bash tool missing from registry')
    }

    const result = await bashTool.execute(
      { command: process.platform === 'win32' ? 'echo ts-local' : 'printf ts-local' },
      { taskId: 'task_local', workspaceRoot },
    )

    expect(result.success).toBe(true)
    expect(result.output?.toLowerCase()).toContain('ts-local')
    expect(result.metadata).toMatchObject({ executionPath: 'ts-local' })
  }, 15000)

  it('falls back to local execution when rust daemon is unavailable', async () => {
    await fs.mkdir(workspaceRoot, { recursive: true })
    process.env.DAEMON_ENABLED = '1'
    vi.doMock('../daemon/client.js', async () => {
      const actual = await vi.importActual<typeof import('../daemon/client.js')>('../daemon/client.js')
      return {
        ...actual,
        executeViaRustDaemon: vi.fn().mockRejectedValue(new Error('daemon boot failed')),
        isRustDaemonEnabled: () => true,
        checkRustDaemonAvailability: () => ({ available: true }),
      }
    })
    vi.resetModules()

    const { createMvpToolRegistry } = await import('./registry.js')
    const registry = createMvpToolRegistry()
    const bashTool = registry.get('bash')
    if (!bashTool) {
      throw new Error('bash tool missing from registry')
    }

    const result = await bashTool.execute(
      { command: process.platform === 'win32' ? 'echo fallback-ok' : 'printf fallback-ok' },
      { taskId: 'task_fallback', workspaceRoot },
    )

    expect(result.success).toBe(true)
    expect(result.output?.toLowerCase()).toContain('fallback-ok')
    expect(result.metadata).toMatchObject({ executionPath: 'ts-local-fallback' })
    expect(result.metadata).toHaveProperty('recoveryReason')
  }, 15000)
})

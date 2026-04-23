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

  it('forwards abortSignal from tool runtime context into rust daemon execution', async () => {
    process.env.DAEMON_ENABLED = '1'
    const executeViaRustDaemonMock = vi.fn().mockResolvedValue({
      status: 'completed',
      exitCode: 0,
      stdout: 'daemon path',
      stderr: '',
    })
    vi.resetModules()
    vi.doMock('../daemon/client.js', () => ({
      executeViaRustDaemon: executeViaRustDaemonMock,
      isRustDaemonEnabled: () => true,
      checkRustDaemonAvailability: () => ({ available: true }),
    }))

    const { createMvpToolRegistry } = await import('./registry.js')
    const registry = createMvpToolRegistry()
    const bashTool = registry.get('bash')
    if (!bashTool) {
      throw new Error('bash tool missing from registry')
    }

    const abortController = new AbortController()
    await bashTool.execute(
      { command: 'echo ok' },
      { taskId: 'task_abort_forward', workspaceRoot, abortSignal: abortController.signal },
    )

    expect(executeViaRustDaemonMock).toHaveBeenCalledTimes(1)
    const firstCall = executeViaRustDaemonMock.mock.calls[0]?.[0] as
      | { abortSignal?: AbortSignal }
      | undefined
    expect(firstCall?.abortSignal).toBe(abortController.signal)
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

  it('fails closed when rust daemon execution is unavailable', async () => {
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

    expect(result.success).toBe(false)
    expect(result.error?.toLowerCase()).toContain('rust daemon execution failed')
    expect(result.metadata).toMatchObject({
      executionPath: 'rust-daemon',
      status: 'failed',
      exitCode: null,
      failureKind: 'execution_failure',
    })
    expect(result.metadata).toHaveProperty('recoveryReason')
  }, 15000)

  it('surfaces stable failure metadata when rust-daemon fails closed', async () => {
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
      { command: process.platform === 'win32' ? 'echo should-not-run' : 'printf should-not-run' },
      { taskId: 'task_fallback_failure', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.metadata).toMatchObject({
      executionPath: 'rust-daemon',
      status: 'failed',
      exitCode: null,
      failureKind: 'execution_failure',
    })
    expect(result.metadata).toHaveProperty('recoveryReason')
  }, 15000)

  it.each([
    { status: 'timeout', expectedFailureKind: 'timeout' },
    { status: 'cancelled', expectedFailureKind: 'cancelled' },
  ] as const)('surfaces stable rust-daemon failure metadata for %s results', async ({ status, expectedFailureKind }) => {
    process.env.DAEMON_ENABLED = '1'
    vi.resetModules()
    vi.doMock('../daemon/client.js', () => ({
      executeViaRustDaemon: vi.fn().mockResolvedValue({
        status,
        exitCode: null,
        stdout: '',
        stderr: status,
        failureKind: expectedFailureKind,
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
      { command: 'echo ignored' },
      { taskId: `task_${status}`, workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.metadata).toMatchObject({
      executionPath: 'rust-daemon',
      status,
      exitCode: null,
      failureKind: expectedFailureKind,
    })
  })

  it('prefers structured failureKind over stderr wording for rust-daemon failures', async () => {
    process.env.DAEMON_ENABLED = '1'
    vi.resetModules()
    vi.doMock('../daemon/client.js', () => ({
      executeViaRustDaemon: vi.fn().mockResolvedValue({
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: 'totally different message',
        failureKind: 'sandbox_preflight',
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
      { command: 'echo ignored' },
      { taskId: 'task_failure_kind_precedence', workspaceRoot },
    )

    expect(result.success).toBe(false)
    expect(result.metadata).toMatchObject({
      executionPath: 'rust-daemon',
      status: 'failed',
      exitCode: null,
      failureKind: 'sandbox_preflight',
    })
  })
})

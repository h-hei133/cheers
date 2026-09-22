import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { executeLocally, isRustDaemonEnabled } from './client.js'
function getExecutionPathLabel(rootDir: string): string {
  const configFile = path.join(rootDir, '.private-agents.json')
  let daemonEnabledFromConfig: boolean | undefined
  if (fs.existsSync(configFile)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configFile, 'utf8'))
      if (typeof parsed.daemonEnabled === 'boolean') {
        daemonEnabledFromConfig = parsed.daemonEnabled
      }
    } catch {}
  }
  const daemonEnabled = process.env.DAEMON_ENABLED === undefined
    ? daemonEnabledFromConfig ?? true
    : process.env.DAEMON_ENABLED === '1'
  return daemonEnabled ? 'rust-daemon' : 'ts-local'
}

interface MockDaemonHarness {
  readonly spawnMock: ReturnType<typeof vi.fn>
  readonly emitResponse: (payload: unknown) => void
}

function createResidentDaemonHarness(): MockDaemonHarness {
  const stdoutEmitter = new EventEmitter()
  const readlineEmitter = new EventEmitter() as EventEmitter & { close: () => void }
  readlineEmitter.close = () => undefined
  const responseQueue: unknown[] = []

  const stdin = Object.assign(new EventEmitter(), {
    write: vi.fn((_chunk: string, callback?: (error?: Error | null) => void) => {
      const next = responseQueue.shift()
      if (next !== undefined) {
        setImmediate(() => {
          readlineEmitter.emit('line', JSON.stringify(next))
        })
      }
      callback?.(null)
      return true
    }),
    unref: vi.fn(),
  })
  const processEmitter = new EventEmitter() as EventEmitter & {
    stdin: typeof stdin
    stdout: EventEmitter
    stderr: EventEmitter
    killed: boolean
    exitCode: number | null
    signalCode: string | null
    kill: () => void
  }
  processEmitter.stdin = stdin
  processEmitter.stdout = stdoutEmitter
  processEmitter.stderr = new EventEmitter() as EventEmitter & { unref: () => void }
  ;(processEmitter.stdout as EventEmitter & { unref?: () => void }).unref = vi.fn()
  ;(processEmitter.stderr as EventEmitter & { unref: () => void }).unref = vi.fn()
  processEmitter.killed = false
  processEmitter.exitCode = null
  processEmitter.signalCode = null
  processEmitter.kill = () => {
    processEmitter.killed = true
  }
  ;(processEmitter as EventEmitter & { unref?: () => void }).unref = vi.fn()

  const spawnMock = vi.fn(() => processEmitter)

  vi.doMock('node:readline', () => ({
    default: {
      createInterface: vi.fn(() => readlineEmitter),
    },
    createInterface: vi.fn(() => readlineEmitter),
  }))

  const emitResponse = (payload: unknown) => {
    responseQueue.push(payload)
  }

  vi.doMock('node:child_process', () => ({
    execFile: vi.fn(),
    execFileSync: vi.fn(() => Buffer.from('cargo 1.0.0')),
    spawn: spawnMock,
  }))

  return { spawnMock, emitResponse }
}

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
    vi.doUnmock('node:child_process')
    vi.doUnmock('node:readline')
    vi.resetModules()
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

  it('reuses the same resident daemon across sequential requests', async () => {
    const harness = createResidentDaemonHarness()
    vi.resetModules()
    const { executeViaRustDaemon } = await import('./client.js')

    const firstCall = executeViaRustDaemon({
      command: 'cmd',
      args: ['/C', 'echo one'],
      cwd: fakeRoot,
      workspaceRoot: fakeRoot,
      timeoutMs: 1000,
    })
    harness.emitResponse({
      type: 'health',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 1,
    })
    await Promise.resolve()
    harness.emitResponse({
      type: 'exec_started',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 2,
      executionId: 'exec-1',
    })
    harness.emitResponse({
      type: 'execution_status',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 3,
      executionId: 'exec-1',
      state: 'finished',
      result: {
        status: 'completed',
        exitCode: 0,
        stdout: 'one',
        stderr: '',
      },
    })
    const firstResult = await firstCall

    const secondCall = executeViaRustDaemon({
      command: 'cmd',
      args: ['/C', 'echo two'],
      cwd: fakeRoot,
      workspaceRoot: fakeRoot,
      timeoutMs: 1000,
    })
    harness.emitResponse({
      type: 'health',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 3,
    })
    await Promise.resolve()
    harness.emitResponse({
      type: 'exec_started',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 4,
      executionId: 'exec-2',
    })
    harness.emitResponse({
      type: 'execution_status',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 5,
      executionId: 'exec-2',
      state: 'finished',
      result: {
        status: 'completed',
        exitCode: 0,
        stdout: 'two',
        stderr: '',
      },
    })
    const secondResult = await secondCall

    expect(harness.spawnMock).toHaveBeenCalledOnce()
    expect(firstResult.daemonInstanceId).toBe('daemon-1')
    expect(secondResult.daemonInstanceId).toBe('daemon-1')
    expect(firstResult.daemonRequestSeq).toBe(3)
    expect(secondResult.daemonRequestSeq).toBe(5)
  }, 15000)

  it('fails closed on invalid daemon response payload', async () => {
    const harness = createResidentDaemonHarness()
    vi.resetModules()
    const { executeViaRustDaemon } = await import('./client.js')

    const pending = executeViaRustDaemon({
      command: 'cmd',
      args: ['/C', 'echo ignored'],
      cwd: fakeRoot,
      workspaceRoot: fakeRoot,
      timeoutMs: 1000,
    })
    harness.emitResponse({
      type: 'health',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 1,
    })
    await Promise.resolve()
    harness.emitResponse({
      type: 'exec_started',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 2,
      executionId: 'exec-invalid',
    })
    harness.emitResponse({
      type: 'execution_status',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 3,
      executionId: 'exec-invalid',
      state: 'finished',
      result: {
        status: 'failed',
        exitCode: null,
        stdout: '',
        stderr: '',
        failureKind: 'unknown_kind',
      },
    })

    await expect(pending).rejects.toThrow(/Invalid daemon result failureKind/)
  }, 15000)

  it('routes abort through daemon cancel and returns cancelled result from rust', async () => {
    const harness = createResidentDaemonHarness()
    vi.resetModules()
    const { executeViaRustDaemon } = await import('./client.js')
    const abortController = new AbortController()

    const pending = executeViaRustDaemon({
      command: 'cmd',
      args: ['/C', 'echo ignored'],
      cwd: fakeRoot,
      workspaceRoot: fakeRoot,
      timeoutMs: 1000,
      abortSignal: abortController.signal,
    })

    harness.emitResponse({
      type: 'health',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 1,
    })
    await Promise.resolve()
    harness.emitResponse({
      type: 'exec_started',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 2,
      executionId: 'exec-cancel',
    })
    abortController.abort()
    harness.emitResponse({
      type: 'cancel',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 3,
      executionId: 'exec-cancel',
      outcome: 'cancelled',
    })
    harness.emitResponse({
      type: 'execution_status',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 4,
      executionId: 'exec-cancel',
      state: 'finished',
      result: {
        status: 'cancelled',
        exitCode: null,
        stdout: '',
        stderr: 'Command cancelled',
        failureKind: 'cancelled',
      },
    })

    const result = await pending
    expect(result.status).toBe('cancelled')
    expect(result.failureKind).toBe('cancelled')
    const writes = (harness.spawnMock.mock.results[0]?.value.stdin.write as ReturnType<typeof vi.fn>).mock.calls
      .map(call => String(call[0]))
      .join('\n')
    expect(writes).toContain('"type":"cancel"')
    expect(writes).toContain('"execution_id":"exec-cancel"')
  }, 15000)

  it('treats timeout as rust terminal outcome (not local wait timeout)', async () => {
    const harness = createResidentDaemonHarness()
    vi.resetModules()
    const { executeViaRustDaemon } = await import('./client.js')

    const pending = executeViaRustDaemon({
      command: 'cmd',
      args: ['/C', 'echo ignored'],
      cwd: fakeRoot,
      workspaceRoot: fakeRoot,
      timeoutMs: 1000,
    })

    harness.emitResponse({
      type: 'health',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 1,
    })
    await Promise.resolve()
    harness.emitResponse({
      type: 'exec_started',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 2,
      executionId: 'exec-timeout',
    })
    harness.emitResponse({
      type: 'execution_status',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 3,
      executionId: 'exec-timeout',
      state: 'running',
    })
    harness.emitResponse({
      type: 'execution_status',
      instanceId: 'daemon-1',
      pid: 4242,
      requestSeq: 4,
      executionId: 'exec-timeout',
      state: 'finished',
      terminalOutcome: 'timed_out',
      result: {
        status: 'timeout',
        exitCode: null,
        stdout: '',
        stderr: 'Command timed out',
        failureKind: 'timeout',
      },
    })

    const result = await pending
    expect(result.status).toBe('timeout')
    expect(result.failureKind).toBe('timeout')
  }, 15000)
})

describe("forwarding command output as it is produced", () => {
  it("forwards output while a command runs, not only at the end", async () => {
  const chunks: string[] = []
  const stamped: Array<{ at: number; text: string }> = []
  const started = Date.now()
  const result = await executeLocally({
    command: process.execPath,
    args: ['-e', 'let i=0;const t=setInterval(()=>{if(i++>=3){clearInterval(t);process.exit(0)}console.log("tick"+i)},60)'],
    cwd: process.cwd(),
    onOutput: (chunk) => {
      chunks.push(chunk)
      stamped.push({ at: Date.now() - started, text: chunk.trim() })
    },
  })
  console.log('chunks=' + JSON.stringify(stamped))
  expect(result.status).toBe('completed')
  // Output arrived spread over time, not in one burst at the end.
  expect(chunks.length).toBeGreaterThan(1)
  expect(stamped[0].at).toBeLessThan(stamped.at(-1)!.at)
  expect(result.stdout).toContain('tick3')
})

  it("reports the same result shape without a callback", async () => {
  const result = await executeLocally({
    command: process.execPath,
    args: ['-e', 'console.log("plain")'],
    cwd: process.cwd(),
  })
  expect(result.status).toBe('completed')
  expect(result.stdout).toContain('plain')
})

  it("reports a failing command with its exit code", async () => {
  const result = await executeLocally({
    command: process.execPath,
    args: ['-e', 'console.error("boom");process.exit(3)'],
    cwd: process.cwd(),
    onOutput: () => {},
  })
  expect(result.status).toBe('failed')
  expect(result.exitCode).toBe(3)
  expect(result.stderr).toContain('boom')
})
})

describe("stopping a command that outlives its own child", () => {
  /** A command whose shell is not its only process: the loop is a descendant. */
  const withDescendant = ['/bin/bash', '-c', 'sleep 30 & wait'];

  it("returns when a descendant holds the pipes past the timeout", async () => {
    const result = await executeLocally({
      command: withDescendant[0],
      args: withDescendant.slice(1),
      cwd: process.cwd(),
      timeoutMs: 300,
      onOutput: () => {},
    });
    // The shell is killed but its `sleep` inherits the pipes. Waiting for the
    // pipes to close meant waiting for that descendant, so nothing returned at
    // all and the turn hung on a tool that would never report.
    expect(result.status).toBe("timeout");
  }, 15000);

  it("reports a cancellation as cancelled rather than as a timeout", async () => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 200);
    const result = await executeLocally({
      command: withDescendant[0],
      args: withDescendant.slice(1),
      cwd: process.cwd(),
      timeoutMs: 60_000,
      onOutput: () => {},
      abortSignal: controller.signal,
    });
    // The caller stopped it. Saying "timeout" blamed the clock for a decision
    // the user made.
    expect(result.status).toBe("cancelled");
  }, 15000);
});

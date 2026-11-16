import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('../../core/shell/bootstrap.js', async () => ({
  ...await vi.importActual<typeof import('../../core/shell/bootstrap.js')>('../../core/shell/bootstrap.js'),
  bootstrapShellRuntime: vi.fn(),
}));
vi.mock('../../session/SessionManager.js', () => ({ SessionManager: vi.fn() }));
vi.mock('../../entrypoints/cliMcpModule.js', () => ({ createCliMcpGateway: vi.fn(() => ({ close: vi.fn() })) }));

import { bootstrapShellRuntime, SessionBootstrapError } from '../../core/shell/bootstrap.js';
import { createCliBootstrapRuntimeContext } from './cliBootstrapContext.js';
import { createCliOutput } from './output.js';
import { flushRawStdout, isStdoutTakenOver, restoreStdout } from '../../core/shell/outputGuard.js';

const root = '/tmp/cheers-test/output-bootstrap';
const context = { cwd: root, projectRoot: root, session: { id: 'output-session' } };
const rootContext = { runtimeBaseDir: root, workspaceRoot: root, gitContext: { root }, runtimeConfig: {} };

beforeEach(() => {
  vi.mocked(bootstrapShellRuntime).mockImplementation(() => {
    // Vitest replaces console; exercise the device used by Node's console in the CLI.
    process.stdout.write('dependency initialization\n');
    return { context, lifecycleNotices: [] } as never;
  });
});

afterEach(() => {
  restoreStdout();
  vi.restoreAllMocks();
});

function captureStreams() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const write = (target: string[]) => (chunk: string | Uint8Array,
    encodingOrCallback?: BufferEncoding | ((error?: Error | null) => void),
    callback?: (error?: Error | null) => void) => {
    if (String(chunk)) target.push(String(chunk));
    (typeof encodingOrCallback === 'function' ? encodingOrCallback : callback)?.();
    return true;
  };
  vi.spyOn(process.stdout, 'write').mockImplementation(write(stdout) as never);
  vi.spyOn(process.stderr, 'write').mockImplementation(write(stderr) as never);
  return { stdout, stderr };
}

function bootstrap(options: Record<string, unknown>) {
  return createCliBootstrapRuntimeContext({ options, rootContext, launchCwd: root,
    writeError: vi.fn(), exit: ((code: number) => { throw new Error(`exit ${code}`); }) as never } as never);
}

it('routes plain print through raw output while redirecting dependency noise', async () => {
  const streams = captureStreams();
  const boot = bootstrap({ printMode: true });
  boot.renderer.renderLine('line');
  boot.renderer.renderChunk('chunk');
  process.stdout.write('dependency after bootstrap\n');
  await flushRawStdout();
  expect(streams.stdout.join('')).toBe('line\nchunk');
  expect(streams.stderr.join('')).toBe('dependency initialization\ndependency after bootstrap\n');
  expect(boot.renderer.transcriptOwned).toBe(false);
});

it.each(['jsonEvents', 'rpcMode'])('preserves %s frames while redirecting third-party output', async option => {
  const streams = captureStreams();
  const boot = bootstrap({ [option]: true });
  boot.renderer.renderLine('line');
  boot.renderer.renderChunk('chunk');
  process.stdout.write('dependency after bootstrap\n');
  await flushRawStdout();
  const frames = streams.stdout.join('').trim().split('\n').map(line => JSON.parse(line));
  const output = option === 'jsonEvents' ? frames.map(frame => frame.facts) : frames;
  expect(output).toEqual([
    expect.objectContaining({ type: 'cli.output', text: 'line\n' }),
    expect.objectContaining({ type: 'cli.output', text: 'chunk' }),
  ]);
  expect(streams.stderr.join('')).toBe('dependency initialization\ndependency after bootstrap\n');
});

it.each(['printMode', 'jsonEvents', 'rpcMode'])('restores stdout when %s bootstrap fails', option => {
  const streams = captureStreams();
  const original = process.stdout.write;
  const failure = new Error('bootstrap failed');
  vi.mocked(bootstrapShellRuntime).mockImplementation(() => {
    process.stdout.write('dependency before failure\n');
    throw failure;
  });
  expect(() => bootstrap({ [option]: true })).toThrow(failure);
  expect(isStdoutTakenOver()).toBe(false);
  expect(process.stdout.write).toBe(original);
  expect(streams.stdout).toEqual([]);
  expect(streams.stderr.join('')).toBe('dependency before failure\n');
});

it('delivers exact bootstrap diagnostics and restores stdout before one original exit', async () => {
  const streams = captureStreams();
  const originalWrite = process.stdout.write;
  const terminalExit = new Error('fixture terminal exit');
  const expected = 'Session bootstrap blocked by root binding diagnostics.\n'
    + '- Root binding diagnostics:\n'
    + '  - blocked:root-binding-session-mismatch: BINDING_DIAGNOSTIC_CANARY\n'
    + '    nextAction: choose original root\n';
  const exit = vi.fn((code: number): never => {
    expect(code).toBe(1);
    expect(isStdoutTakenOver()).toBe(false);
    expect(process.stdout.write).toBe(originalWrite);
    expect(streams.stdout.join('')).toBe(expected);
    throw terminalExit;
  });
  const output = createCliOutput({ enabled: true, stdout: process.stdout, stderr: process.stderr,
    writeError: vi.fn(), exit });
  vi.mocked(bootstrapShellRuntime).mockImplementation(() => {
    throw new SessionBootstrapError({ code: 'session-root-mismatch', message: 'fixture mismatch',
      recoveryHint: 'choose original root', rootBindingDiagnostics: [{ severity: 'blocked', code: 'root-binding-session-mismatch',
        explanation: 'BINDING_DIAGNOSTIC_CANARY', nextAction: 'choose original root' }] });
  });
  await expect(output.run(async () => createCliBootstrapRuntimeContext({ options: { printMode: true },
    rootContext: rootContext as never, launchCwd: root, output: output.guard,
    writeError: vi.fn(), exit: output.exit }))).rejects.toBe(terminalExit);
  expect(exit).toHaveBeenCalledOnce();
  expect(streams.stderr).toEqual([]);
});

it('defers a captured exit until both its frame and device barrier callbacks settle', async () => {
  let frame: (() => void) | undefined;
  let barrier: (() => void) | undefined;
  const stdout = { write: (text: string, callback?: () => void) => {
    if (text) frame = callback; else barrier = callback;
    return true;
  } };
  const stderr = { write: () => true };
  const originalWrite = stdout.write;
  const terminalExit = new Error('fixture terminal exit');
  const exit = vi.fn((_code: number): never => { throw terminalExit; });
  const output = createCliOutput({ enabled: true, stdout: stdout as never, stderr: stderr as never,
    writeError: vi.fn(), exit });
  const pending = output.run(async () => { output.guard!.write('before exit'); output.exit(0); });
  void pending.catch(() => {});
  try {
    await vi.waitFor(() => { expect(frame).toBeDefined(); });
    expect(exit).not.toHaveBeenCalled();
    frame?.();
    await vi.waitFor(() => { expect(barrier).toBeDefined(); });
    expect(exit).not.toHaveBeenCalled();
    expect(isStdoutTakenOver()).toBe(true);
    barrier?.();
    await expect(pending).rejects.toBe(terminalExit);
    expect(exit.mock.calls).toEqual([[0]]);
    expect(stdout.write).toBe(originalWrite);
    expect(isStdoutTakenOver()).toBe(false);
  } finally {
    frame?.(); barrier?.(); restoreStdout();
    await pending.catch(() => {});
  }
});

it('consumes only its own operation exit sentinel', async () => {
  const terminalExit = new Error('fixture terminal exit');
  const exit = vi.fn((_code: number): never => { throw terminalExit; });
  const otherExit = vi.fn((_code: number): never => { throw terminalExit; });
  const input = { enabled: false, stdout: process.stdout, stderr: process.stderr, writeError: vi.fn() };
  const output = createCliOutput({ ...input, exit });
  const other = createCliOutput({ ...input, exit: otherExit });
  let sentinel: unknown;
  try { other.exit(2); } catch (error) { sentinel = error; }
  await expect(output.run(async () => { throw sentinel; })).rejects.toBe(sentinel);
  expect(exit).not.toHaveBeenCalled();
  expect(otherExit).not.toHaveBeenCalled();
  await expect(other.run(async () => { throw sentinel; })).rejects.toBe(terminalExit);
  expect(otherExit.mock.calls).toEqual([[2]]);
});

it('keeps a captured exit unsuccessful when its cleanup fails and reports safely', async () => {
  captureStreams();
  const terminalExit = new Error('fixture terminal exit');
  const exit = vi.fn((_code: number): never => { throw terminalExit; });
  const writeError = vi.fn();
  const output = createCliOutput({ enabled: true, stdout: process.stdout, stderr: process.stderr,
    writeError, exit });
  await expect(output.run(async () => output.exit(0), async () => {
    throw new Error('private cleanup detail');
  })).rejects.toBe(terminalExit);
  expect(exit.mock.calls).toEqual([[1]]);
  expect(writeError).toHaveBeenCalledWith('Resource cleanup failed; process exit was not verified.');
  expect(writeError.mock.calls.flat().join('')).not.toContain('private cleanup detail');
  expect(isStdoutTakenOver()).toBe(false);
});

it.each([false, true])('preserves the first operation error when cleanup also fails (protected=%s)', async enabled => {
  captureStreams();
  const originalWrite = process.stdout.write;
  const first = new Error('first operation failure');
  const cleanupFailure = new Error('private cleanup detail');
  const writeError = vi.fn();
  const exit = vi.fn((_code: number): never => { throw new Error('unexpected deferred exit'); });
  const output = createCliOutput({ enabled, stdout: process.stdout, stderr: process.stderr, writeError, exit });
  await expect(output.run(async () => { throw first; }, async () => { throw cleanupFailure; })).rejects.toBe(first);
  expect(writeError.mock.calls).toEqual([['Resource cleanup also failed; cleanup was not verified.']]);
  expect(exit).not.toHaveBeenCalled();
  expect(process.stdout.write).toBe(originalWrite);
  expect(isStdoutTakenOver()).toBe(false);
});

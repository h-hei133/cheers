import { EventEmitter } from 'node:events';
import { PassThrough, Writable } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { runLineLoop, type LineLoopOptions } from './lineLoop.js';
import { routeInteractiveCommand } from './interactiveCommandRouter.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import { executeResolvedPromptTurn } from '../../entrypoints/cliRuntimeModule.js';
import { QuestionBridge } from './questionBridge.js';
import { SubmissionQueue } from './inputQueue.js';
import { createStartupRecoveryHint } from '../bootstrap/recoveryHint.js';
import { attachGoalSubmission } from '../runtime/goalScheduling.js';
import { runCliMcpCommand } from '../../entrypoints/cliMcpModule.js';
import { runSshControl } from '../ssh/control.js';

vi.mock('./interactiveCommandRouter.js', () => ({ routeInteractiveCommand: vi.fn() }));
vi.mock('../runtime/goalScheduling.js', () => ({
  attachGoalSubmission: vi.fn(() => undefined),
}));
vi.mock('../../entrypoints/cliMcpModule.js', async importOriginal => ({
  ...await importOriginal<typeof import('../../entrypoints/cliMcpModule.js')>(),
  runCliMcpCommand: vi.fn(),
}));
vi.mock('../ssh/control.js', async importOriginal => ({
  ...await importOriginal<typeof import('../ssh/control.js')>(),
  runSshControl: vi.fn(),
}));
const loops: ReturnType<typeof setup>[] = [];
afterEach(async () => {
  for (const loop of loops.splice(0)) {
    loop.stdin.end();
    await loop.running.catch(() => undefined);
  }
  vi.resetAllMocks();
});

function setup(overrides: Partial<LineLoopOptions> = {}) {
  const stdin = new PassThrough();
  const stdout = overrides.stdout ?? new PassThrough();
  const renderer = overrides.renderer ?? new StreamingRenderer();
  const processEvents = new EventEmitter(); const exit = vi.fn();
  const running = runLineLoop({ stdin: stdin as never, stdout: stdout as never, process: processEvents as never,
    runtimeContext: { projectRoot: '/workspace', session: { id: 'sess_line' } } as never,
    sessionRuntime: { getAgentMode: () => 'build', getCurrentRunController: () => null, waitForIdle: async () => {},
      getState: () => 'idle', terminate: () => {}, cancelCurrentRun: () => {} } as never,
    sessionManager: { sessionExists: () => false } as never, renderer,
    logger: { error() {}, info() {}, warn() {} } as never, approvalTrustPolicy: {} as never, initialMcpGateway: {} as never,
    setReadline() {}, setActiveNonInteractiveApprovalMode() {}, exit, ...overrides });
  const loop = { stdin, stdout, renderer, processEvents, exit, running }; loops.push(loop); return loop;
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

it('writes the prompt to the provided stdout and reports the first frame after it', async () => {
  const events: string[] = [];
  const stdout = new PassThrough();
  const write = stdout.write.bind(stdout);
  stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    if (String(chunk).includes('>')) events.push('prompt');
    return write(chunk, ...args as never[]);
  }) as typeof stdout.write;
  const loop = setup({
    stdout: stdout as never,
    onFirstFrame: () => events.push('frame'),
  });
  let output = '';
  loop.stdout.on('data', chunk => { output += chunk.toString(); });

  await turn();

  expect(output).toContain('[workspace|line|build] > ');
  expect(events).toEqual(['prompt', 'frame']);
});

it('waits for the prompt write callback before reporting the first frame', async () => {
  let releaseWrite!: () => void;
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      if (chunk.length === 0) {
        releaseWrite = callback;
        return;
      }
      callback();
    },
  }) as NodeJS.WriteStream;
  const onFirstFrame = vi.fn();
  setup({ stdout, onFirstFrame });

  await turn();
  expect(onFirstFrame).not.toHaveBeenCalled();

  releaseWrite();
  await turn();
  expect(onFirstFrame).toHaveBeenCalledOnce();
});

it('routes renderer output to the provided stdout', async () => {
  const loop = setup();
  let output = '';
  loop.stdout.on('data', chunk => { output += chunk.toString(); });
  const stdoutWrite = vi.spyOn(process.stdout, 'write');

  loop.renderer.renderLine('renderer output');
  await turn();

  expect(output).toContain('renderer output');
  expect(stdoutWrite.mock.calls.some(([chunk]) => String(chunk).includes('renderer output'))).toBe(false);
  expect(loop.renderer.captured).toBe(true);
  expect(loop.renderer.transcriptOwned).toBe(false);
  stdoutWrite.mockRestore();
});

it('reports user intent once when raw input becomes a submitted line', async () => {
  vi.mocked(routeInteractiveCommand).mockResolvedValueOnce({ turnNumber: 1 });
  const onUserIntent = vi.fn();
  const loop = setup({ onUserIntent });

  loop.stdin.write('draft\n');
  await turn();
  await turn();

  expect(onUserIntent).toHaveBeenCalledOnce();
});

it('reports user intent when input closes without a submitted line', async () => {
  const onUserIntent = vi.fn();
  const loop = setup({ onUserIntent });

  loop.stdin.end();
  await loop.running;

  expect(onUserIntent).toHaveBeenCalledOnce();
});

it('restores the prompt after an idle SSH cancellation control', async () => {
  vi.mocked(runSshControl).mockResolvedValueOnce();
  const loop = setup();
  let output = '';
  loop.stdout.on('data', chunk => { output += chunk.toString(); });

  await turn();
  output = '';
  loop.stdin.write('/ssh cancel-pending\n');
  await vi.waitFor(() => expect(runSshControl).toHaveBeenCalledOnce());
  await turn();

  expect(output).toContain('[workspace|line|build] > ');
});

it('fences a delayed recovery hint when input closes after the first frame', async () => {
  let resolveHint!: (hint: unknown) => void;
  const getRecoveryHintAsync = vi.fn(() => new Promise(resolve => { resolveHint = resolve; }));
  const published: unknown[] = [];
  const recoveryHint = createStartupRecoveryHint({
    sessionManager: { getRecoveryHintAsync } as never,
    preferredProjectRoot: '/workspace',
    currentSessionId: 'sess_line',
    generation: () => 'stable',
    publish: hint => published.push(hint),
    logger: { warn() {} },
  });
  const loop = setup({
    sessionManager: {
      getRecoveryHintAsync,
      sessionExists: () => true,
    } as never,
    onFirstFrame: () => { void recoveryHint.start(); },
    onUserIntent: () => recoveryHint.noteUserIntent(),
  });

  await vi.waitFor(() => expect(getRecoveryHintAsync).toHaveBeenCalledOnce());
  loop.stdin.end();
  await loop.running;
  resolveHint({
    candidate: { id: 'sess_saved' },
    summary: { resumeDisposition: 'fully-resumable' },
  });
  await turn();

  expect(published).toEqual([]);
});

it('keeps the routing sink installed until an in-flight turn settles', async () => {
  let releaseTurn!: () => void;
  vi.mocked(routeInteractiveCommand).mockImplementationOnce(async input => {
    await new Promise<void>(resolve => { releaseTurn = resolve; });
    return { turnNumber: input.turnNumber };
  });
  const loop = setup();
  let output = '';
  loop.stdout.on('data', chunk => { output += chunk.toString(); });
  const stdoutWrite = vi.spyOn(process.stdout, 'write');

  loop.stdin.write('slow turn\n');
  await turn();
  loop.stdin.end();
  await turn();
  loop.renderer.renderLine('still routed');
  await turn();

  try {
    expect(output).toContain('still routed');
    expect(stdoutWrite.mock.calls.some(([chunk]) => String(chunk).includes('still routed'))).toBe(false);
  } finally {
    releaseTurn();
    await loop.running;
    stdoutWrite.mockRestore();
  }
});

it('restores the previous sink when line-loop initialization fails', async () => {
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const loop = setup({
    renderer,
    setReadline() {
      throw new Error('readline wiring failed');
    },
  });

  await expect(loop.running).rejects.toThrow('readline wiring failed');
  renderer.renderLine('after failure');

  expect(external).toEqual(['after failure']);
  expect(renderer.captured).toBe(true);
  expect(renderer.transcriptOwned).toBe(false);
});

it('restores the previous sink even when question-bridge cleanup throws', async () => {
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const bridge = Object.assign(new EventEmitter(), {
    close() {
      throw new Error('question bridge close failed');
    },
    prompt() {},
    question() {},
  });
  const asReadline = vi.spyOn(QuestionBridge.prototype, 'asReadline')
    .mockReturnValue(bridge as never);
  const loop = setup({
    renderer,
    setReadline() {
      throw new Error('readline wiring failed');
    },
  });

  try {
    await expect(loop.running).rejects.toThrow('readline wiring failed');
    expect(renderer.captured).toBe(true);
    expect(renderer.transcriptOwned).toBe(false);
  } finally {
    asReadline.mockRestore();
  }
});

it('does not turn prompt-write failure into a successful exit or stdout leak', async () => {
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdout = new PassThrough();
  const originalWrite = stdout.write.bind(stdout);
  let failPrompt = true;
  stdout.write = ((chunk: string | Uint8Array, ...args: unknown[]) => {
    const text = String(chunk);
    if (failPrompt && text.includes('>')) {
      failPrompt = false;
      throw new Error('prompt write failed');
    }
    return originalWrite(chunk, ...args as never[]);
  }) as typeof stdout.write;
  const stdoutWrite = vi.spyOn(process.stdout, 'write');
  const loop = setup({
    renderer,
    stdout: stdout as never,
    sessionManager: { sessionExists: () => true } as never,
  });

  try {
    await expect(loop.running).rejects.toThrow('prompt write failed');
    await turn();

    expect(stdoutWrite.mock.calls.some(([chunk]) => String(chunk).includes('--resume'))).toBe(false);
    expect(loop.exit).not.toHaveBeenCalled();
    expect(renderer.captured).toBe(true);
    expect(renderer.transcriptOwned).toBe(false);
  } finally {
    stdoutWrite.mockRestore();
  }
});

it('settles and rejects when the first-frame write callback reports an asynchronous failure', async () => {
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      callback(chunk.length === 0 ? new Error('async prompt write failed') : undefined);
    },
  }) as NodeJS.WriteStream;
  const loop = setup({ stdout, onFirstFrame: vi.fn() });

  await expect(Promise.race([
    loop.running,
    new Promise((_, reject) => setTimeout(() => reject(new Error('line loop did not settle')), 1_000)),
  ])).rejects.toThrow('async prompt write failed');

  expect(loop.exit).not.toHaveBeenCalled();
});

it('settles and rejects when the output stream emits an asynchronous error', async () => {
  const loop = setup();
  await turn();

  loop.stdout.emit('error', new Error('async stdout failed'));

  await expect(Promise.race([
    loop.running,
    new Promise((_, reject) => setTimeout(() => reject(new Error('line loop did not settle')), 1_000)),
  ])).rejects.toThrow('async stdout failed');

  expect(loop.exit).not.toHaveBeenCalled();
});

it('keeps normal close output on line stdout before restoring the previous sink', async () => {
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdout = new PassThrough();
  let output = '';
  stdout.on('data', chunk => { output += chunk.toString(); });
  const loop = setup({
    renderer,
    stdout: stdout as never,
    sessionManager: { sessionExists: () => true } as never,
  });

  loop.stdin.end();
  await loop.running;

  expect(output).toContain('--resume sess_line');
  expect(loop.exit).toHaveBeenCalledWith(0);
  expect(renderer.captured).toBe(true);
  expect(renderer.transcriptOwned).toBe(false);
});

it('restores the previous sink when stdout stays broken through failure teardown', async () => {
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdout = new PassThrough();
  stdout.write = (() => {
    throw new Error('stdout unavailable');
  }) as typeof stdout.write;
  const stdoutWrite = vi.spyOn(process.stdout, 'write');
  const loop = setup({
    renderer,
    stdout: stdout as never,
    sessionManager: { sessionExists: () => true } as never,
  });

  try {
    await expect(loop.running).rejects.toThrow('stdout unavailable');
    await turn();

    expect(loop.exit).not.toHaveBeenCalled();
    expect(stdoutWrite.mock.calls.some(([chunk]) => String(chunk).includes('--resume'))).toBe(false);
    expect(renderer.captured).toBe(true);
    expect(renderer.transcriptOwned).toBe(false);
  } finally {
    stdoutWrite.mockRestore();
  }
});

it('settles and restores the previous sink when stdout breaks before stdin close', async () => {
  const renderer = new StreamingRenderer();
  renderer.setSink({
    line: () => {},
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdout = new PassThrough();
  const loop = setup({ renderer, stdout: stdout as never });
  await turn();
  stdout.write = (() => {
    throw new Error('stdout unavailable');
  }) as typeof stdout.write;

  loop.stdin.end();
  await Promise.race([
    loop.running,
    new Promise((_, reject) => setTimeout(() => reject(new Error('line loop did not settle')), 1_000)),
  ]);

  expect(renderer.captured).toBe(true);
  expect(renderer.transcriptOwned).toBe(false);
});

it('settles and restores the previous sink when stdout breaks during line input', async () => {
  const renderer = new StreamingRenderer();
  renderer.setSink({
    line: () => {},
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdout = new PassThrough();
  const loop = setup({ renderer, stdout: stdout as never });
  await turn();
  stdout.write = (() => {
    throw new Error('stdout unavailable');
  }) as typeof stdout.write;

  loop.stdin.write('\n');
  await expect(Promise.race([
    loop.running,
    new Promise((_, reject) => setTimeout(() => reject(new Error('line loop did not settle')), 1_000)),
  ])).rejects.toThrow('stdout unavailable');

  expect(loop.exit).not.toHaveBeenCalled();
  expect(renderer.captured).toBe(true);
  expect(renderer.transcriptOwned).toBe(false);
});

it('does not report a delayed first frame after the loop has closed', async () => {
  let releaseWrite!: () => void;
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      if (chunk.length === 0) {
        releaseWrite = callback;
        return;
      }
      callback();
    },
  }) as NodeJS.WriteStream;
  const onFirstFrame = vi.fn();
  const loop = setup({ stdout, onFirstFrame });

  await turn();
  loop.stdin.end();
  await loop.running;
  releaseWrite();
  await turn();

  expect(onFirstFrame).not.toHaveBeenCalled();
});

it('does not report a delayed first frame while an in-flight turn keeps cleanup pending', async () => {
  let releaseWrite!: () => void;
  let releaseTurn!: () => void;
  const stdout = new Writable({
    write(chunk, _encoding, callback) {
      if (chunk.length === 0) {
        releaseWrite = callback;
        return;
      }
      callback();
    },
  }) as NodeJS.WriteStream;
  vi.mocked(routeInteractiveCommand).mockImplementationOnce(async input => {
    await new Promise<void>(resolve => { releaseTurn = resolve; });
    return { turnNumber: input.turnNumber };
  });
  const onFirstFrame = vi.fn();
  const loop = setup({ stdout, onFirstFrame });

  await turn();
  loop.stdin.write('slow turn\n');
  await turn();
  loop.stdin.end();
  await turn();
  releaseWrite();
  await turn();

  expect(onFirstFrame).not.toHaveBeenCalled();
  releaseTurn();
  await loop.running;
});

it('rejects and removes signal handlers when synchronous line handling fails', async () => {
  const push = vi.spyOn(SubmissionQueue.prototype, 'push').mockImplementationOnce(() => {
    throw new Error('line handler failed');
  });
  const loop = setup();

  try {
    loop.stdin.write('fail\n');
    await expect(loop.running).rejects.toThrow('line handler failed');

    expect(loop.exit).not.toHaveBeenCalled();
    expect(loop.processEvents.listenerCount('SIGINT')).toBe(0);
  } finally {
    push.mockRestore();
  }
});

it('rejects and removes signal handlers when asynchronous line handling fails', async () => {
  vi.mocked(routeInteractiveCommand).mockRejectedValueOnce(new Error('async line handler failed'));
  const renderer = new StreamingRenderer();
  const loop = setup({ renderer });

  loop.stdin.write('/queue failed\n');
  await expect(loop.running).rejects.toThrow('async line handler failed');

  expect(loop.exit).not.toHaveBeenCalled();
  expect(loop.processEvents.listenerCount('SIGINT')).toBe(0);
  expect(renderer.captured).toBe(false);
});

it('ignores a delayed asynchronous control rejection after normal close', async () => {
  let rejectControl!: (error: Error) => void;
  vi.mocked(routeInteractiveCommand).mockImplementationOnce(() => new Promise((_, reject) => {
    rejectControl = reject;
  }));
  const renderer = new StreamingRenderer();
  const loop = setup({ renderer });

  loop.stdin.write('/queue slow\n');
  await turn();
  loop.stdin.end();
  await turn();
  rejectControl(new Error('late control failure'));
  await loop.running;

  expect(loop.exit).toHaveBeenCalledWith(0);
  expect(renderer.captured).toBe(false);
});

it('keeps delayed asynchronous control output on the line sink until close cleanup', async () => {
  let releaseControl!: () => void;
  vi.mocked(routeInteractiveCommand).mockImplementationOnce(async input => {
    await new Promise<void>(resolve => { releaseControl = resolve; });
    input.renderer.renderLine('late control output');
    return { turnNumber: input.turnNumber };
  });
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdout = new PassThrough();
  let output = '';
  stdout.on('data', chunk => { output += chunk.toString(); });
  const loop = setup({ renderer, stdout: stdout as never });

  loop.stdin.write('/queue slow\n');
  await turn();
  loop.stdin.end();
  await turn();
  releaseControl();
  await loop.running;

  expect(output).toContain('late control output');
  expect(external).toEqual([]);
  expect(renderer.captured).toBe(true);
  expect(renderer.transcriptOwned).toBe(false);
});

it('cancels pending MCP control when the stop signal aborts', async () => {
  let signal: AbortSignal | undefined;
  vi.mocked(runCliMcpCommand).mockImplementationOnce(input => new Promise((_, reject) => {
    signal = input.signal;
    input.signal?.addEventListener('abort', () => reject(new Error('MCP control cancelled')), { once: true });
  }));
  const stop = new AbortController();
  const renderer = new StreamingRenderer();
  const loop = setup({ renderer, stopSignal: stop.signal });

  loop.stdin.write('/mcp cancel\n');
  await vi.waitFor(() => expect(runCliMcpCommand).toHaveBeenCalledOnce());
  stop.abort();
  await Promise.race([
    loop.running,
    new Promise((_, reject) => setTimeout(() => reject(new Error('line loop did not settle')), 1_000)),
  ]);

  expect(signal?.aborted).toBe(true);
  expect(renderer.captured).toBe(false);
});

it('cancels a pending goal round when the stop signal aborts', async () => {
  let submitGoal!: (prompt: string, metadata: Record<string, unknown>) => Promise<void>;
  let settleGoal!: () => void;
  let releaseSubmission!: () => void;
  const releaseGoal = vi.fn(() => {
    releaseSubmission();
    settleGoal();
  });
  vi.mocked(attachGoalSubmission).mockImplementationOnce((_runtime, host) => {
    submitGoal = host.submit;
    settleGoal = host.settled!;
    return releaseGoal;
  });
  vi.mocked(routeInteractiveCommand).mockImplementationOnce(async input => {
    await new Promise<void>(resolve => { releaseSubmission = resolve; });
    return { turnNumber: input.turnNumber };
  });
  const stop = new AbortController();
  const renderer = new StreamingRenderer();
  const loop = setup({ renderer, stopSignal: stop.signal });

  await turn();
  const submission = submitGoal('goal continuation', { source: 'goal-continuation' });
  await turn();
  stop.abort();
  await Promise.race([
    loop.running,
    new Promise((_, reject) => setTimeout(() => reject(new Error('line loop did not settle')), 1_000)),
  ]);
  await submission;

  expect(releaseGoal).toHaveBeenCalledOnce();
  await vi.waitFor(() => expect(renderer.captured).toBe(false));
});

it('keeps the line sink until a goal submission and its settlement finish after close', async () => {
  let submitGoal!: (prompt: string, metadata: Record<string, unknown>) => Promise<void>;
  let settleGoal!: () => void;
  vi.mocked(attachGoalSubmission).mockImplementationOnce((_runtime, host) => {
    submitGoal = host.submit;
    settleGoal = host.settled!;
    return vi.fn();
  });
  let releaseSubmission!: () => void;
  vi.mocked(routeInteractiveCommand).mockImplementationOnce(async input => {
    await new Promise<void>(resolve => { releaseSubmission = resolve; });
    input.renderer.renderLine('late goal output');
    return { turnNumber: input.turnNumber };
  });
  const renderer = new StreamingRenderer();
  const external: string[] = [];
  renderer.setSink({
    line: line => external.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const stdout = new PassThrough();
  let output = '';
  stdout.on('data', chunk => { output += chunk.toString(); });
  const loop = setup({ renderer, stdout: stdout as never });

  await turn();
  const submission = submitGoal('goal continuation', { source: 'goal-continuation' });
  await turn();
  loop.stdin.end();
  await turn();
  releaseSubmission();
  await submission;
  renderer.renderLine('goal settlement output');
  settleGoal();
  await loop.running;

  expect(output).toContain('late goal output');
  expect(output).toContain('goal settlement output');
  expect(external).toEqual([]);
  expect(renderer.captured).toBe(true);
  expect(renderer.transcriptOwned).toBe(false);
});

it('keeps turn boundaries in line mode even while renderer output is routed', async () => {
  const renderer = new StreamingRenderer();
  const lines: string[] = [];
  renderer.setSink({
    line: line => lines.push(line),
    chunk: () => {},
  }, { ownsTranscript: false });
  const executePrompt = vi.fn(async () => undefined);

  await executeResolvedPromptTurn({
    source: 'interactive',
    effectivePrompt: 'line mode turn',
    sessionManager: {
      buildPromptContinuitySnapshot: () => ({}),
    } as never,
    setActiveNonInteractiveApprovalMode: () => {},
    runtimeContext: { session: { id: 'sess_line' } } as never,
    sessionRuntime: {
      executePrompt,
      getState: () => 'idle',
    } as never,
    logger: {
      info: () => {},
      error: () => {},
    } as never,
    printMode: false,
    renderer,
    turnNumber: 1,
  });

  expect(executePrompt).toHaveBeenCalledOnce();
  expect(lines).toContain('\n=== Turn 1 ===');
  expect(lines).toContain('Execution started...');
  expect(lines).toContain('=== End Turn 1 ===\n');
});

it('routes canonical and alias goal controls ahead of a pending question on actual line input', async () => {
  const controls: string[] = []; const answers: string[] = [];
  vi.mocked(routeInteractiveCommand).mockImplementation(async input => {
    if (input.prompt === 'ask') {
      await new Promise<void>(resolve => input.readline!.question('Question?', answer => { answers.push(answer); resolve(); }));
    } else controls.push(input.prompt);
    return { turnNumber: input.turnNumber };
  });
  const loop = setup(); loop.stdin.write('ask\n'); await turn();
  for (const command of ['/objective pause', '/target show', '/goal complete', '/goal drop']) {
    loop.stdin.write(command + '\n'); await turn();
  }
  expect(controls).toEqual(['/objective pause', '/target show', '/goal complete', '/goal drop']);
  expect(answers).toEqual([]);
  loop.stdin.write('Human answer\n'); await turn(); expect(answers).toEqual(['Human answer']);
});

it.each(['', '  preserve raw answer  '])('preserves a pending question answer %j', async answer => {
  const answers: string[] = [];
  vi.mocked(routeInteractiveCommand).mockImplementation(async input => {
    await new Promise<void>(resolve => input.readline!.question('Question?', value => { answers.push(value); resolve(); }));
    return { turnNumber: input.turnNumber };
  });
  const loop = setup(); loop.stdin.write('ask\n'); await turn(); loop.stdin.write(answer + '\n'); await turn();
  expect(answers).toEqual([answer]);
});

it('removes signal handlers and completes exit when the actual line input closes', async () => {
  const loop = setup(); expect(loop.processEvents.listenerCount('SIGINT')).toBe(1);
  loop.stdin.end(); await loop.running;
  expect(loop.exit.mock.calls).toEqual([[0]]); expect(loop.processEvents.listenerCount('SIGINT')).toBe(0);
});

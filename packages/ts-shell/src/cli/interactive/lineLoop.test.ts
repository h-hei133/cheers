import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';
import { runLineLoop } from './lineLoop.js';
import { routeInteractiveCommand } from './interactiveCommandRouter.js';

vi.mock('./interactiveCommandRouter.js', () => ({ routeInteractiveCommand: vi.fn() }));
const loops: ReturnType<typeof setup>[] = [];
afterEach(async () => {
  for (const loop of loops.splice(0)) { loop.stdin.end(); await loop.running; }
  vi.resetAllMocks();
});

function setup() {
  const stdin = new PassThrough(); const processEvents = new EventEmitter(); const exit = vi.fn();
  const running = runLineLoop({ stdin: stdin as never, process: processEvents as never,
    runtimeContext: { projectRoot: '/workspace', session: { id: 'sess_line' } } as never,
    sessionRuntime: { getAgentMode: () => 'build', getCurrentRunController: () => null, waitForIdle: async () => {},
      getState: () => 'idle', terminate: () => {} } as never,
    sessionManager: { sessionExists: () => false } as never, renderer: { renderLine() {}, renderChunk() {} } as never,
    logger: { error() {}, info() {} } as never, approvalTrustPolicy: {} as never, initialMcpGateway: {} as never,
    setReadline() {}, setActiveNonInteractiveApprovalMode() {}, exit });
  const loop = { stdin, processEvents, exit, running }; loops.push(loop); return loop;
}
const turn = () => new Promise<void>(resolve => setImmediate(resolve));

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

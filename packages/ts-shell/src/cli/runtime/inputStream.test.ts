import { PassThrough } from 'node:stream';
import { expect, it } from 'vitest';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { tokenizeCommandArgs } from '../../core/commands/arguments.js';
import { queueCommandFor } from './inputQueue.js';
import { runPromptInputStream } from './inputStream.js';

it('edits, moves and cancels the real pipe consumer queue while an ordinary prompt is held', async () => {
  const stdin = new PassThrough(); const seen: string[] = []; const lines: string[] = [];
  let release!: () => void; let started!: () => void; let submitted!: () => void;
  const holding = new Promise<void>(resolve => { release = resolve; });
  const first = new Promise<void>(resolve => { started = resolve; });
  const added = new Promise<void>(resolve => { submitted = resolve; });
  const context = { session: { id: 'pipe', createdAt: '2026-10-01T00:00:00Z', projectRoot: '/workspace' },
    projectRoot: '/workspace', cwd: '/workspace' } as ShellRuntimeContext;
  const runtime = { getCurrentRunController: () => null, waitForIdle: async () => {} } as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime,
    renderer: { renderLine: (line: string) => lines.push(line) } as never, logger: { info: () => {} } as never,
    runPrompt: async prompt => {
      if (prompt.startsWith('/queue')) {
        const rawCommandArgs = prompt.slice('/queue'.length).trimStart();
        const result = await queueCommandFor(context, runtime)(tokenizeCommandArgs(rawCommandArgs), {
          cwd: '/workspace', projectRoot: '/workspace', sessionId: 'pipe', rawCommandArgs,
        });
        if (result.kind === 'local') lines.push(result.output);
        if (lines.filter(line => line.startsWith('Queued ')).length === 3) submitted();
        return;
      }
      seen.push(prompt); if (prompt === 'INITIAL') { started(); await holding; }
    } });
  stdin.write('INITIAL\n'); await first;
  stdin.write('/queue add A\n/queue add B\n/queue add C\n'); await added;
  const ids = lines.filter(line => line.startsWith('Queued ')).map(line => line.slice(7, -1));
  stdin.write(`/queue edit ${ids[0]} A_EDITED\n/queue move ${ids[1]} ${ids[0]}\n/queue cancel ${ids[2]}\n`);
  await new Promise<void>(resolve => setImmediate(resolve)); release(); stdin.end(); await run;
  expect(seen).toEqual(['INITIAL', 'B', 'A_EDITED']);
});

it('preserves fenced, literal multiline and EOF ordering through the same pipe queue', async () => {
  const stdin = new PassThrough(); const seen: string[] = [];
  const context = { session: { id: 'pipe', createdAt: '2026-10-01T00:00:00Z', projectRoot: '/workspace' }, projectRoot: '/workspace' } as ShellRuntimeContext;
  const run = runPromptInputStream({ stdin, runtimeContext: context,
    sessionRuntime: { waitForIdle: async () => {} } as ShellSessionRuntime,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never,
    runPrompt: async prompt => { seen.push(prompt); } });
  stdin.end('```text\n/queue add literal\n```\nwrite exact content:\nfirst\nsecond\n\nlast\n'); await run;
  expect(seen).toEqual(['```text\n/queue add literal\n```', 'write exact content:\nfirst\nsecond', 'last']);
});

it('awaits asynchronous control routing and its actual queued work after immediate EOF', async () => {
  const stdin = new PassThrough(); const seen: string[] = [];
  const context = { session: { id: 'pipe', createdAt: '2026-10-01T00:00:00Z', projectRoot: '/workspace' },
    projectRoot: '/workspace', cwd: '/workspace' } as ShellRuntimeContext;
  const runtime = { getCurrentRunController: () => null, waitForIdle: async () => {} } as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never,
    runPrompt: async prompt => {
      if (!prompt.startsWith('/queue')) { seen.push(prompt); return; }
      await new Promise<void>(resolve => setImmediate(resolve));
      const rawCommandArgs = prompt.slice('/queue'.length).trimStart();
      await queueCommandFor(context, runtime)(tokenizeCommandArgs(rawCommandArgs), {
        cwd: '/workspace', projectRoot: '/workspace', sessionId: 'pipe', rawCommandArgs,
      });
    } });
  stdin.end('/queue add EXACT_EOF_INPUT\n');
  await run;
  expect(seen).toEqual(['EXACT_EOF_INPUT']);
});

it('serializes planning controls in input order without waiting behind a held model turn', async () => {
  const stdin = new PassThrough(); const seen: string[] = [];
  let release!: () => void; let started!: () => void; let controlsDone!: () => void;
  const holding = new Promise<void>(resolve => { release = resolve; });
  const first = new Promise<void>(resolve => { started = resolve; });
  const controls = new Promise<void>(resolve => { controlsDone = resolve; });
  const context = { session: { id: 'pipe', createdAt: '2026-10-01T00:00:00Z', projectRoot: '/workspace' },
    projectRoot: '/workspace' } as ShellRuntimeContext;
  const run = runPromptInputStream({ stdin, runtimeContext: context,
    sessionRuntime: { waitForIdle: async () => {} } as ShellSessionRuntime,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never,
    runPrompt: async prompt => {
      if (prompt === 'INITIAL') { started(); await holding; return; }
      seen.push(`start:${prompt}`);
      await new Promise<void>(resolve => setImmediate(resolve));
      seen.push(`end:${prompt}`);
      if (prompt === '/guided-goal show') controlsDone();
    } });
  stdin.write('INITIAL\n'); await first;
  stdin.end('/plan set FIRST\n/plan show\n/guided-goal show\n');
  await controls;
  expect(seen).toEqual(['start:/plan set FIRST', 'end:/plan set FIRST', 'start:/plan show', 'end:/plan show',
    'start:/guided-goal show', 'end:/guided-goal show']);
  release(); await run;
});
it('dispatches parsed agent lifecycle controls in order while the ordinary turn is held', async () => {
  const stdin = new PassThrough(); const seen: string[] = [];
  let release!: () => void; let started!: () => void; let finishControls!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }); const first = new Promise<void>(resolve => { started = resolve; });
  const controls = new Promise<void>(resolve => { finishControls = resolve; });
  const context = { session: { id: 'pipe', projectRoot: '/workspace' }, projectRoot: '/workspace' } as ShellRuntimeContext;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: { waitForIdle: async () => {} } as ShellSessionRuntime,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, runPrompt: async prompt => {
      if (prompt === 'HELD') { started(); await held; return; }
      seen.push(prompt); await new Promise<void>(resolve => setImmediate(resolve));
      if (prompt === '/agents edit project review updated.md') finishControls();
    } });
  stdin.write('HELD\n'); await first;
  stdin.write('/agents disable project review\n/agents edit project review updated.md\n'); await controls;
  expect(seen).toEqual(['/agents disable project review', '/agents edit project review updated.md']);
  release(); stdin.end(); await run;
});

it('cancels earlier queued MCP configuration controls and retains later explicit input', async () => {
  const stdin = new PassThrough(); const seen: string[] = []; const lines: string[] = [];
  let release!: () => void; let started!: () => void;
  const held = new Promise<void>(resolve => { release = resolve; }); const first = new Promise<void>(resolve => { started = resolve; });
  const context = { session: { id: 'pipe', projectRoot: '/workspace' }, projectRoot: '/workspace' } as ShellRuntimeContext;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: { waitForIdle: async () => {} } as ShellSessionRuntime,
    renderer: { renderLine: (line: string) => lines.push(line) } as never, logger: { info: () => {} } as never, runPrompt: async prompt => {
      seen.push(prompt); if (prompt === '/plan show') { started(); await held; }
    } });
  stdin.write('/plan show\n'); await first;
  stdin.end('/mcp disable project earlier\n/mcp cancel\n/mcp enable project later\n');
  release(); await run;
  expect(seen).toEqual(['/plan show', '/mcp cancel', '/mcp enable project later']);
  expect(lines).toContain('Queued MCP configuration command cancelled before dispatch.');
});
it('dispatches evaluation status and stop during a held check and cancels queued evaluation edits', async () => {
  const stdin = new PassThrough(); const seen: string[] = [];
  let started!: () => void; let release!: () => void; let stopped!: () => void;
  const first = new Promise<void>(resolve => { started = resolve; }); const held = new Promise<void>(resolve => { release = resolve; });
  const stop = new Promise<void>(resolve => { stopped = resolve; });
  const context = { session: { id: 'pipe', projectRoot: '/workspace' }, projectRoot: '/workspace' } as ShellRuntimeContext;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: { waitForIdle: async () => {} } as ShellSessionRuntime,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, runPrompt: async prompt => {
      seen.push(prompt);
      if (prompt === '/improve check') { started(); await held; }
      if (prompt === '/improve stop') { stopped(); release(); }
    } });
  stdin.write('/improve check\n'); await first;
  stdin.end('/improve patch pending.patch\n/improve status\n/improve stop\n');
  await Promise.race([stop, new Promise(resolve => setTimeout(resolve, 250))]);
  const dispatchedWhileHeld = seen.includes('/improve stop'); release(); await run;
  expect(dispatchedWhileHeld).toBe(true);
  expect(seen).toEqual(['/improve check', '/improve status', '/improve stop']);
});

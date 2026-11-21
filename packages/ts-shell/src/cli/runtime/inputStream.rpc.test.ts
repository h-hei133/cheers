import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { getRuntimeConfig } from '../../config/runtimeConfig.js';
import type { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { initialConfiguration } from '../../core/shell/configuration.js';
import * as outputGuard from '../../core/shell/outputGuard.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import { SessionManager } from '../../session/SessionManager.js';
import { runTurn, type TurnInput } from '../../turn/session.js';
import type { RpcResponse, RpcUiBridge } from '../rpc/protocol.js';
import { runPromptInputStream } from './inputStream.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { registerCatalogContribution } from '../../core/catalog/contributions.js';
import { extensionCommandFor, installExtensionRuntime, startExtensionsFor, closeExtensionsFor } from './extensions.js';

let directory: string;
let context: ShellRuntimeContext;
let manager: SessionManager;
let frames: RpcResponse[];
const inputs: PassThrough[] = [];

beforeEach(() => {
  const temporaryRoot = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(temporaryRoot, { recursive: true });
  directory = fs.mkdtempSync(path.join(temporaryRoot, 'rpc-input-'));
  const home = path.join(directory, 'home'); fs.mkdirSync(home);
  vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('CHEERS_TEST_ROOT', directory);
  vi.stubEnv('GIT_CEILING_DIRECTORIES', directory);
  manager = new SessionManager();
  const seed = { cwd: directory, originalCwd: directory, projectRoot: directory, session: manager.createNew(directory),
    runtimeConfig: getRuntimeConfig(directory) };
  context = { ...seed, configuration: initialConfiguration(seed) } as ShellRuntimeContext;
  frames = [];
  vi.spyOn(outputGuard, 'writeRawStdout').mockImplementation(text => { const frame = JSON.parse(text); if (frame.type === 'response') frames.push(frame); });
});

afterEach(() => {
  for (const input of inputs.splice(0)) input.destroy();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true });
});

it('routes JSONL clear_queue into the running turn before EOF drains later explicit prompts', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  let active: TurnInput | undefined; let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const requests: string[][] = [];
  const runtime = { input: () => active, waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    runPrompt: async prompt => {
      const turn = runTurn({ sessionId: context.session.id, workspaceRoot: directory, prompt, history: [],
        onMessage: () => {}, tools: new Map(), maxSteps: 6, signal: new AbortController().signal,
        steeringMode: 'all', followUpMode: 'all', permissionScope: 'ask',
        hooks: { dispatch: async () => ({ decision: 'allow', stopChecks: [] }) } as unknown as HookDispatcher,
        step: async messages => {
          requests.push(messages.filter(message => message.role === 'user').map(message => String(message.content).split('\n\n').at(-1)!));
          if (requests.length === 1) await hold;
          return { text: 'answer', toolCalls: [], stopReason: 'stop' };
        } });
      active = turn;
      try { for await (const _event of turn.events) { /* Drain the live product stream. */ } }
      finally { active = undefined; }
    } });
  try {
    stdin.write('{"id":"initial","type":"prompt","message":"INITIAL"}\n');
    await vi.waitFor(() => expect(requests).toHaveLength(1));
    stdin.write('{"id":"s","type":"steer","message":"OLD_STEER"}\n'
      + '{"id":"f","type":"follow_up","message":"OLD_FOLLOW"}\n'
      + '{"id":"p","type":"prompt","message":"OLD_PENDING"}\n'
      + '{"id":"clear","type":"clear_queue"}\n');
    await vi.waitFor(() => expect(frames.find(frame => frame.id === 'clear')).toBeDefined());
    expect(frames.find(frame => frame.id === 'clear')).toMatchObject({ success: true,
      data: { cleared: 3, steering: ['OLD_STEER'], followUp: ['OLD_FOLLOW', 'OLD_PENDING'] } });
    expect(active?.pending()).toEqual({ steering: [], followUps: [] });
    stdin.write('{"id":"fresh","type":"prompt","message":"AFTER_CLEAR"}\n');
    await vi.waitFor(() => expect(frames.find(frame => frame.id === 'fresh')?.success).toBe(true));
  } finally { release(); stdin.end(); await run; }
  expect(requests).toEqual([['INITIAL'], ['AFTER_CLEAR']]);
});

it('returns cancelled for refused JSONL session switching and preserves current selection', async () => {
  const original = context.session;
  const target = manager.createNew(directory); manager.setCurrentSessionForProject(directory, original.id);
  const stdin = new PassThrough(); inputs.push(stdin);
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    runPrompt: async () => {}, switchSession: async () => ({ status: 'cancelled', reason: 'Synthetic refusal' }) });
  stdin.end(JSON.stringify({ id: 'switch', type: 'switch_session', sessionPath: target.id }) + '\n');
  await run;
  expect(frames.find(frame => frame.id === 'switch')).toMatchObject({ success: true, data: { cancelled: true } });
  expect(context.session).toBe(original);
  expect(manager.getCurrentSessionForProject(directory)?.id).toBe(original.id);
});

it('lets JSONL abort reach a pending session replacement while EOF still joins its response', async () => {
  const commands = new ShellCommandRuntime(), source = context.session;
  let entered!: () => void; const ready = new Promise<void>(resolve => { entered = resolve; });
  const stdin = new PassThrough(); inputs.push(stdin);
  const runtime = { commands, waitForIdle: async () => { await commands.current?.settled; }, getCurrentRunController: () => commands.current?.controller ?? null,
    isRunning: () => Boolean(commands.current), cancelCurrentRun: () => commands.current?.controller.abort() } as unknown as ShellSessionRuntime;
  const running = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true, runPrompt: async () => {},
    switchSession: () => commands.run(async signal => {
      entered(); await new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
      return { status: 'cancelled', reason: 'Aborted before activation' };
    }, 'session-change') });
  stdin.write('{"id":"changing","type":"new_session"}\n'); await ready;
  try {
    stdin.write('{"id":"abort-changing","type":"abort"}\n');
    await vi.waitFor(() => expect(commands.current?.controller.signal.aborted ?? true).toBe(true));
  } finally { commands.current?.controller.abort(); stdin.end(); await running; }
  expect(frames.find(frame => frame.id === 'changing')).toMatchObject({ success: true, data: { cancelled: true } });
  expect(frames.find(frame => frame.id === 'abort-changing')?.success).toBe(true); expect(context.session).toBe(source);
});

it('prepares startup only after binding RPC input and waits before dispatching ordinary prompts', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  const prompts: string[] = []; let bridge: RpcUiBridge | undefined, started = false, confirmed = false;
  let ready!: () => void; const reached = new Promise<void>(resolve => { ready = resolve; });
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const options = { stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    onRpcUiBridge: (value: RpcUiBridge) => { bridge = value; }, runPrompt: async (prompt: string) => { prompts.push(prompt); },
    onInputReady: async () => {
      started = true; expect(bridge).toBeDefined();
      const confirming = bridge!.confirm('STARTUP_READY', 'Input can answer'); ready();
      confirmed = await confirming;
    } };
  const running = runPromptInputStream(options);
  try {
    await vi.waitFor(() => expect(started).toBe(true)); await reached;
    stdin.write('{"id":"during-start","type":"prompt","message":"WAIT_FOR_START"}\n');
    await vi.waitFor(() => expect(frames.some(frame => frame.id === 'during-start')).toBe(true));
    expect(prompts).toEqual([]);
    // The bridge is live before startup; answer its captured current request.
    const request = (outputGuard.writeRawStdout as unknown as { mock: { calls: string[][] } }).mock.calls
      .map(([text]) => JSON.parse(text)).find(frame => frame.type === 'extension_ui_request' && frame.title === 'STARTUP_READY');
    stdin.write(JSON.stringify({ type: 'extension_ui_response', id: request.id, confirmed: true }) + '\n');
    await vi.waitFor(() => expect(prompts).toEqual(['WAIT_FOR_START'])); expect(confirmed).toBe(true);
  } finally { stdin.end(); await running; }
});

it('lets RPC abort cancel a pending content reload while EOF joins its response', async () => {
  const stdin=new PassThrough(); inputs.push(stdin); const commands=new ShellCommandRuntime();
  const runtime={commands,isRunning:() => Boolean(commands.current),input:() => undefined,getPermissionScope:() => 'ask',waitForIdle:async () => {},
    getCurrentRunController:() => commands.current?.controller ?? null,cancelCurrentRun:() => commands.current?.controller.abort(),cancelAndWait:async () => {}} as unknown as ShellSessionRuntime;
  installExtensionRuntime(context,runtime,() => ({sessionId:context.session.id,workspaceRoot:directory,hooks:{dispatch:async () => ({decision:'allow'})} as never,emit(){},permissionScope:'ask'}),manager);
  const retire=registerCatalogContribution({root:directory,sessionId:context.session.id,commands:[],tools:[],skills:() => [],onEvent:async event => {
    if (event==='session_shutdown') await new Promise<void>(() => {});
  }});
  await startExtensionsFor(context); let outcome: Awaited<ReturnType<ReturnType<typeof extensionCommandFor>>> | undefined;
  const running=runPromptInputStream({stdin,runtimeContext:context,sessionRuntime:runtime,sessionManager:manager,rpcMode:true,
    renderer:{renderLine:() => {}} as never,logger:{info:() => {}} as never,
    runPrompt:async () => {outcome=await extensionCommandFor(context)('plugin',['reload'],{cwd:directory,sessionId:context.session.id});}});
  try {
    stdin.write('{"id":"reload","type":"prompt","message":"/plugin reload"}\n');
    await vi.waitFor(() => expect(commands.current?.kind).toBe('extension-reload'));
    stdin.write('{"id":"abort-reload","type":"abort"}\n');
    await vi.waitFor(() => expect(frames.find(frame => frame.id==='abort-reload')?.success).toBe(true));
    expect(commands.current?.controller.signal.aborted ?? true).toBe(true);
  } finally {stdin.end(); await running; retire(); await closeExtensionsFor(context).catch(() => {});}
  expect(outcome?.output).toContain('unknown');
});

it('joins accepted RPC responses on EOF even while startup is cancelled', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  let started!: () => void, finish!: () => void, entered!: () => void;
  const startupReady = new Promise<void>(resolve => { started = resolve; }), responseReady = new Promise<void>(resolve => { entered = resolve; });
  const held = new Promise<void>(resolve => { finish = resolve; });
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const retire = registerCatalogContribution({ root: directory, sessionId: context.session.id, commands: [], tools: [],
    skills: async () => { entered(); await held; return []; } });
  const running = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true, runPrompt: async () => {},
    onInputReady: async () => { started(); await new Promise<void>(() => {}); },
  });
  let returned = false; const result = running.then(() => { returned = true; }, () => { returned = true; });
  try {
    await startupReady; stdin.write('{"id":"held","type":"get_commands"}\n'); await responseReady;
    stdin.end(); await new Promise(resolve => setImmediate(resolve));
    expect(returned).toBe(false); finish(); await result;
    expect(frames.some(frame => frame.id === 'held')).toBe(true);
  } finally { finish(); retire(); stdin.end(); await result; }
});

it.each([
  { type: 'steer', message: 'STARTUP_STEER' },
  { type: 'follow_up', message: 'STARTUP_FOLLOW_UP' },
  { type: 'prompt', message: 'STARTUP_PROMPT_STEER', streamingBehavior: 'steer' },
  { type: 'prompt', message: 'STARTUP_PROMPT_FOLLOW_UP', streamingBehavior: 'followUp' },
])('holds $type input outside an active startup child until startup completes', async command => {
  const stdin = new PassThrough(); inputs.push(stdin);
  let entered!: () => void, finish!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { finish = resolve; });
  const steer = vi.fn(), followUp = vi.fn(), prompts: string[] = [];
  const runtime = { input: () => ({ steer, followUp }), waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const running = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    onInputReady: async () => { entered(); await held; }, runPrompt: async prompt => { prompts.push(prompt); } });
  try {
    await reached; stdin.write(JSON.stringify({ id: 'early-stream', ...command }) + '\n');
    await vi.waitFor(() => expect(frames.find(frame => frame.id === 'early-stream')?.success).toBe(true));
    expect(steer).not.toHaveBeenCalled(); expect(followUp).not.toHaveBeenCalled(); expect(prompts).toEqual([]);
    finish(); await vi.waitFor(() => expect(prompts).toEqual([command.message]));
  } finally { finish(); stdin.end(); await running; }
});

it('holds slash controls received as prompt input until startup completes', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  let entered!: () => void, finish!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; }), held = new Promise<void>(resolve => { finish = resolve; });
  const prompts: string[] = [];
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const running = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    onInputReady: async () => { entered(); await held; }, runPrompt: async prompt => { prompts.push(prompt); } });
  try {
    await reached; stdin.write('{"id":"early-slash","type":"prompt","message":"/queue add held"}\n');
    await vi.waitFor(() => expect(frames.find(frame => frame.id === 'early-slash')?.success).toBe(true));
    expect(prompts).toEqual([]); finish(); await vi.waitFor(() => expect(prompts).toEqual(['/queue add held']));
  } finally { finish(); stdin.end(); await running; }
});

it('cancels pending startup on RPC abort and does not dispatch a later prompt', async () => {
  const stdin = new PassThrough(); inputs.push(stdin); let entered!: () => void;
  const reached = new Promise<void>(resolve => { entered = resolve; });
  let finish!: () => void; const held = new Promise<void>(resolve => { finish = resolve; });
  const prompts: string[] = [];
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null, cancelCurrentRun() {} } as unknown as ShellSessionRuntime;
  let returned = false;
  const running = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    onInputReady: async () => { entered(); await held; }, runPrompt: async prompt => { prompts.push(prompt); } }).then(() => { returned = true; }, () => { returned = true; });
  try {
    await reached; stdin.write('{"id":"startup-abort","type":"abort"}\n{"id":"late-start","type":"prompt","message":"UNACCEPTED_STARTUP"}\n');
    await vi.waitFor(() => expect(returned).toBe(true)); expect(prompts).toEqual([]);
  } finally { finish(); stdin.end(); await running; }
});

it.each([
  { line: '{"id":"broken","type":"prompt","message":"PRIVATE_RPC_INPUT"', command: 'parse', id: undefined },
  { line: '["PRIVATE_RPC_INPUT"]', command: 'parse', id: undefined },
  { line: '{"id":"missing-type","message":"PRIVATE_RPC_INPUT"}', command: 'unknown', id: 'missing-type' },
  { line: '{"id":"bad-bash","type":"bash","command":17,"private":"PRIVATE_RPC_INPUT"}', command: 'bash', id: 'bad-bash' },
  { line: '{"id":"bad-type","type":"unused_command","private":"PRIVATE_RPC_INPUT"}', command: 'unused_command', id: 'bad-type' },
  { line: '{"id":"bad-ui","type":"extension_ui_response","confirmed":"PRIVATE_RPC_INPUT"}', command: 'extension_ui_response', id: 'bad-ui' },
  { line: 'PRIVATE_RPC_INPUT', command: 'parse', id: undefined },
])('rejects invalid RPC input $command without dispatching a model prompt', async ({ line, command, id }) => {
  const stdin = new PassThrough(); inputs.push(stdin);
  const prompts: string[] = [];
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    runPrompt: async prompt => { prompts.push(prompt); } });
  stdin.end(`${line}\n`);
  await run;
  expect(prompts).toEqual([]);
  expect(frames).toHaveLength(1);
  expect(frames[0]).toMatchObject({ type: 'response', command, success: false, error: expect.any(String) });
  expect(frames[0]?.id).toBe(id);
  expect(frames[0]?.data).toBeUndefined();
  expect(JSON.stringify(frames)).not.toContain('PRIVATE_RPC_INPUT');
});

it('keeps invalid RPC input separate from subsequent valid controls and explicit prompts through EOF', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  const prompts: string[] = [];
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    runPrompt: async prompt => { prompts.push(prompt); } });
  stdin.end('{"id":"bad","type":"bash","command":17}\n'
    + '{"id":"read","type":"get_messages"}\n'
    + '{"id":"accepted","type":"prompt","message":"EXPLICIT_PROMPT"}\n');
  await run;
  expect(prompts).toEqual(['EXPLICIT_PROMPT']);
  expect(frames.find(frame => frame.id === 'bad')).toMatchObject({ command: 'bash', success: false });
  expect(frames.find(frame => frame.id === 'read')).toMatchObject({ success: true, data: { messages: [] } });
  expect(frames.find(frame => frame.id === 'accepted')).toMatchObject({ success: true });
});

it('keeps a valid trace parent attached to its RPC prompt until turn dispatch', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  const traceParent = `00-${'1'.repeat(32)}-${'2'.repeat(16)}-01`;
  const prompts: Array<{ readonly text: string; readonly attachments?: { readonly images: readonly unknown[]; readonly traceParent?: string } }> = [];
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    runPrompt: async (prompt, attachments) => { prompts.push({ text: prompt, attachments }); } });
  try {
    stdin.write(JSON.stringify({ id: 'traced-prompt', type: 'prompt', message: 'kept only as prompt text', traceParent }) + '\n');
    await vi.waitFor(() => expect(frames.find(frame => frame.id === 'traced-prompt')?.success).toBe(true));
  } finally { stdin.end(); await run; }
  expect(prompts).toEqual([{ text: 'kept only as prompt text', attachments: { images: [], traceParent } }]);
  expect(manager.getSession(context.session.id)?.turns).toEqual([]);
});

it('leaves a pending RPC dialog live after rejecting a malformed answer and accepts its later valid answer', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  const prompts: string[] = [];
  let bridge!: RpcUiBridge;
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never, rpcMode: true,
    onRpcUiBridge: value => { bridge = value; }, runPrompt: async prompt => { prompts.push(prompt); } });
  const answer = bridge.confirm('Confirm action', 'Proceed with this action?');
  const request = vi.mocked(outputGuard.writeRawStdout).mock.calls.map(([text]) => JSON.parse(text))
    .find(frame => frame.type === 'extension_ui_request');
  expect(request).toBeDefined();
  try {
    stdin.write(JSON.stringify({ type: 'extension_ui_response', id: request.id, confirmed: 'PRIVATE_RPC_INPUT' }) + '\n');
    await vi.waitFor(() => expect(frames.find(frame => frame.id === request.id)?.success).toBe(false));
    expect(prompts).toEqual([]);
    expect(bridge.pendingCount()).toBe(1);
    expect(JSON.stringify(frames)).not.toContain('PRIVATE_RPC_INPUT');
    stdin.write(JSON.stringify({ type: 'extension_ui_response', id: request.id, confirmed: true }) + '\n');
    expect(await answer).toBe(true);
    expect(bridge.pendingCount()).toBe(0);
  } finally { stdin.end(); await run; }
});

it('retains newline prompt transport for ordinary non-RPC stdin', async () => {
  const stdin = new PassThrough(); inputs.push(stdin);
  const prompts: string[] = [];
  const runtime = { waitForIdle: async () => {}, getCurrentRunController: () => null } as unknown as ShellSessionRuntime;
  const run = runPromptInputStream({ stdin, runtimeContext: context, sessionRuntime: runtime, sessionManager: manager,
    renderer: { renderLine: () => {} } as never, logger: { info: () => {} } as never,
    runPrompt: async prompt => { prompts.push(prompt); } });
  stdin.end('ORDINARY_PROMPT\n');
  await run;
  expect(prompts).toEqual(['ORDINARY_PROMPT']);
  expect(frames).toEqual([]);
});

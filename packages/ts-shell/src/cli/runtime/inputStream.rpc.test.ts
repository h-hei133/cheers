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
import type { RpcResponse } from '../rpc/protocol.js';
import { runPromptInputStream } from './inputStream.js';

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
    runPrompt: async () => {}, switchSession: () => false });
  stdin.end(JSON.stringify({ id: 'switch', type: 'switch_session', sessionPath: target.id }) + '\n');
  await run;
  expect(frames.find(frame => frame.id === 'switch')).toMatchObject({ success: true, data: { cancelled: true } });
  expect(context.session).toBe(original);
  expect(manager.getCurrentSessionForProject(directory)?.id).toBe(original.id);
});

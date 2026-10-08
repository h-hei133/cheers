import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createDesktopToolDefinition } from './tool.js';
import { desktopConfig } from './config.js';
import { desktopState } from './state.js';
import { createDefaultExecutionService } from '../runtime/execution/service.js';
import { evaluateToolPermissionScope, planModeBlock } from '../core/query/toolPolicy.js';
import { validateToolArguments } from '../core/tools/arguments.js';
import type { CommandExecutionRequest, CommandExecutionResult } from '../runtime/execution/types.js';

let root: string;
let focus: string;
const requests: CommandExecutionRequest[] = [];
const contexts: Array<{ workspaceRoot: string; sessionId: string; taskId: string }> = [];
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), 'desktop-tool-')); focus = '42'; requests.length = 0;
  for (const utility of ['xdotool', 'ffmpeg', 'xclip']) { const target = path.join(root, utility); await fs.writeFile(target, '#!/bin/sh\nexit 0\n', { mode: 0o700 }); vi.stubEnv(`CHEERS_DESKTOP_${utility.toUpperCase()}_PATH`, target); }
  const authority = path.join(root, 'authority'); await fs.writeFile(authority, 'synthetic-secret-cookie');
  vi.stubEnv('CHEERS_DESKTOP_DISPLAY', '127.0.0.1:99'); vi.stubEnv('CHEERS_DESKTOP_XAUTHORITY', authority);
});
afterEach(async () => {
  for (const context of contexts.splice(0)) await desktopState(context).close();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); await fs.rm(root, { recursive: true, force: true });
});

function setup() {
  const context = { workspaceRoot: root, sessionId: `test-${contexts.length}`, taskId: 'desktop' }; contexts.push(context);
  const service = createDefaultExecutionService();
  const run = vi.spyOn(service, 'runCommand').mockImplementation(async request => {
    requests.push(request);
    let output = Buffer.alloc(0);
    switch (request.args[0]) {
      case 'getdisplaygeometry': output = Buffer.from('800 600\n'); break;
      case 'getwindowfocus': output = Buffer.from(`${focus}\n`); break;
      case 'getwindowgeometry': output = Buffer.from('WINDOW=42\nX=20\nY=30\nWIDTH=400\nHEIGHT=300\nSCREEN=0\n'); break;
      case 'getwindowname': output = Buffer.from('synthetic-window'); break;
      case 'search': output = Buffer.from('42\n'); break;
      case 'windowfocus': focus = request.args[2]!; break;
      case '-selection': output = Buffer.from('PRIVATE CLIPBOARD'); break;
      case '-nostdin': output = png(400, 300); break;
    }
    request.onStdout?.(output);
    return { status: 'completed', exitCode: 0, stdout: '', stderr: '' } as CommandExecutionResult;
  });
  const tool = createDesktopToolDefinition(service);
  const execute = (args: Record<string, unknown>) => tool.prepare!(args, context).execute(context);
  return { context, tool, run, execute };
}

function png(width: number, height: number): Buffer {
  const result = Buffer.alloc(24); Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(result); result.writeUInt32BE(width, 16); result.writeUInt32BE(height, 20); return result;
}
async function observe(item: ReturnType<typeof setup>): Promise<string> {
  const result = await item.execute({ action: 'observe', scope: 'window', windowId: '42' }); expect(result.success).toBe(true);
  return JSON.parse(result.output!).snapshotId as string;
}

it('requires explicit opt-in config and executable identity; capabilities is passive and only plan-eligible action', async () => {
  const item = setup(); expect((await item.execute({ action: 'capabilities' })).success).toBe(true); expect(requests).toHaveLength(0);
  expect(evaluateToolPermissionScope('desktop', { action: 'screenshot' }, 'accept-edits').requiresEscalation).toBe(true);
  expect(planModeBlock('plan', 'desktop', { action: 'capabilities' })).toBeUndefined();
  expect(planModeBlock('plan', 'desktop', { action: 'observe' })).toContain('Blocked');
  item.run.mockResolvedValueOnce({ status: 'failed', exitCode: 1, stdout: '', stderr: 'synthetic-private-authority-denied' } as CommandExecutionResult);
  const deniedAccess = await item.execute({ action: 'observe', scope: 'screen' });
  expect(deniedAccess).toMatchObject({ success: false, metadata: { desktopAction: { state: 'unavailable', code: 'unavailable', effect: 'none', cleanup: 'complete' } } });
  expect(JSON.stringify(deniedAccess)).not.toContain('synthetic-private-authority-denied');
  vi.stubEnv('CHEERS_DESKTOP_DISPLAY', undefined); vi.stubEnv('DISPLAY', ':0'); vi.stubEnv('WAYLAND_DISPLAY', 'real-wayland');
  expect(() => desktopConfig()).toThrow('explicit local X11'); expect(() => desktopConfig({}, 'darwin')).toThrow('unavailable');
  expect((await item.execute({ action: 'observe', scope: 'screen' })).metadata?.desktopAction).toMatchObject({ state: 'unavailable', effect: 'none' });
});

it('captures bounded native masks and maps clicks exactly from a current image revision', async () => {
  const item = setup(); const snapshotId = await observe(item);
  const image = await item.execute({ action: 'screenshot', snapshotId, reviewedMasks: true, masks: [{ x: 0, y: 0, width: 40, height: 20 }] });
  expect(image.images?.[0]).toMatchObject({ type: 'image', mimeType: 'image/png' });
  const frame = JSON.parse(image.output!); expect(frame).toMatchObject({ frame: { x: 20, y: 30, width: 400, height: 300 }, coordinatesAvailable: true });
  expect(frame.snapshotId).not.toBe(snapshotId);
  const native = requests.find(request => path.basename(request.command) === 'ffmpeg')!;
  expect(native.args).toContain('127.0.0.1:99+20,30'); expect(native.args).toContain('drawbox=x=0:y=0:w=40:h=20:color=black:t=fill');
  expect(native.env).toEqual({ DISPLAY: '127.0.0.1:99', XAUTHORITY: path.join(root, 'authority'), PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' });
  const result = await item.execute({ action: 'click', snapshotId: frame.snapshotId, x: 5, y: 7 });
  expect(result).toMatchObject({ success: true, metadata: { desktopAction: { effect: 'confirmed', cleanup: 'complete' } } });
  expect(requests.find(request => request.args[0] === 'mousemove')!.args).toEqual(['mousemove', '--sync', '25', '37', 'click', '--clearmodifiers', '1']);
  expect(() => item.tool.prepare!({ action: 'click', snapshotId: frame.snapshotId, x: 5, y: 7 }, item.context)).toThrow('current desktop snapshotId');
});

it('fully redacts unreviewed screenshots and refuses their coordinates or changed focus/auth after approval', async () => {
  const item = setup(); const snapshotId = await observe(item);
  const image = await item.execute({ action: 'screenshot', snapshotId }); const revision = JSON.parse(image.output!).snapshotId;
  expect(JSON.parse(image.output!).coordinatesAvailable).toBe(false);
  expect(requests.find(request => path.basename(request.command) === 'ffmpeg')!.args).toContain('drawbox=x=0:y=0:w=400:h=300:color=black:t=fill');
  expect(await item.execute({ action: 'click', snapshotId: revision, x: 1, y: 1 })).toMatchObject({ success: false, error: expect.stringContaining('reviewed screenshot') });
  const current = await observe(item); const prepared = item.tool.prepare!({ action: 'type', snapshotId: current, text: 'approved' }, item.context);
  focus = '99'; expect(await prepared.execute(item.context)).toMatchObject({ success: false, error: expect.stringContaining('focus, window identity or geometry changed') });
  expect(requests.some(request => request.args[0] === 'type')).toBe(false);
  focus = '42'; const authBound = item.tool.prepare!({ action: 'key', snapshotId: current, key: 'Return' }, item.context);
  await fs.writeFile(path.join(root, 'authority'), 'changed-cookie');
  expect(await authBound.execute(item.context)).toMatchObject({ success: false, error: expect.stringContaining('authority changed after approval') });
});

it('owns immutable approval arguments and sends literal type bytes through stdin; clipboard plaintext stays redacted', async () => {
  const item = setup(); const snapshotId = await observe(item); const args = { action: 'type', snapshotId, text: 'literal $()\n-flag' };
  const prepared = item.tool.prepare!(args, item.context); args.text = 'changed';
  expect(prepared.preview).toContain('literal $()'); expect(prepared.preview).not.toContain('synthetic-secret-cookie');
  const input: Buffer[] = []; const existing = item.run.getMockImplementation()!;
  item.run.mockImplementation(async request => {
    request.onStdin?.({ write: async bytes => { input.push(Buffer.from(bytes)); }, end: () => {} }); return existing(request);
  });
  expect((await prepared.execute(item.context)).success).toBe(true);
  expect(input).toEqual([Buffer.from('literal $()\n-flag')]); expect(requests.find(request => request.args[0] === 'type')!.args).toEqual(['type', '--clearmodifiers', '--file', '-']);
  const next = await observe(item); const clipboard = await item.execute({ action: 'clipboard', snapshotId: next });
  expect(clipboard.metadata?.clipboard).toMatchObject({ bytes: 17, redacted: true }); expect(JSON.stringify(clipboard)).not.toContain('PRIVATE CLIPBOARD');
  expect(() => validateToolArguments(item.tool.argsSchema, { action: 'run', code: 'arbitrary()' })).toThrow();
  expect(await item.execute({ action: 'key', snapshotId: next, key: '--exec' })).toMatchObject({ success: false, error: expect.stringContaining('key allowlist') });
});

it('retains possible input effects during cancellation and does not complete close before native work settles', async () => {
  const item = setup(); const snapshotId = await observe(item); const controller = new AbortController();
  let started!: () => void; const ready = new Promise<void>(resolve => { started = resolve; }); let finish!: () => void;
  const original = item.run.getMockImplementation()!;
  item.run.mockImplementation(async request => {
    if (request.args[0] !== 'type') return original(request);
    started(); await new Promise<void>(resolve => { finish = resolve; });
    return { status: 'cancelled', exitCode: null, stdout: '', stderr: '' } as CommandExecutionResult;
  });
  const prepared = item.tool.prepare!({ action: 'type', snapshotId, text: 'pending' }, item.context);
  const work = prepared.execute({ ...item.context, abortSignal: controller.signal }); await ready; controller.abort();
  let closed = false; const close = item.tool.execute({ action: 'close' }, item.context).then(result => { closed = true; return result; });
  await Promise.resolve(); expect(closed).toBe(false); finish();
  expect(await work).toMatchObject({ success: false, metadata: { desktopAction: { state: 'cancelled', effect: 'possible' } } }); expect((await close).success).toBe(true);
});

it('reports native cleanup uncertainty and blocks subsequent actions without claiming close completed', async () => {
  const item = setup(); const snapshotId = await observe(item); const original = item.run.getMockImplementation()!; const controller = new AbortController();
  item.run.mockImplementation(async request => {
    if (request.args[0] !== 'key') return original(request);
    controller.abort(); return { status: 'failed', exitCode: null, stdout: '', stderr: '', terminationFailed: true } as CommandExecutionResult;
  });
  const work = item.tool.prepare!({ action: 'key', snapshotId, key: 'Return' }, item.context);
  expect(await work.execute({ ...item.context, abortSignal: controller.signal })).toMatchObject({ success: false, metadata: { desktopAction: { state: 'cancelled', effect: 'possible', cleanup: 'unknown' } } });
  const calls = requests.length;
  expect((await item.execute({ action: 'observe', scope: 'window', windowId: '42' })).success).toBe(false); expect(requests).toHaveLength(calls);
  expect(await item.tool.execute({ action: 'close' }, item.context)).toMatchObject({ success: false, metadata: { desktopAction: { state: 'failed', cleanup: 'unknown' } } });
});

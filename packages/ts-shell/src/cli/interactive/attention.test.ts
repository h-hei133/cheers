import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InteractiveMode } from './interactiveMode.js';
import * as router from './interactiveCommandRouter.js';
import { createShellRuntimeContext, refreshShellRuntimeConfig } from '../../core/shell/runtimeContext.js';
import { getRuntimeConfig, getUserRuntimeConfigPath } from '../../config/runtimeConfig.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { StructuredLogger } from '../../observability/structuredLogger.js';
import type { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import type { CliMcpGateway } from '../../entrypoints/cliMcpModule.js';
import type { PickerHost } from './picker/registry.js';
import type { Picker, OverlayHost } from './overlay.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import type { InteractiveView } from '../../presentation/tui/surface/contract.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { SubmissionQueue } from './inputQueue.js';
import { RecordingTerminal } from '../../test-utils/terminalDouble.js';

let root: string;
let file: string;
let now: number;
const modes: InteractiveMode[] = [];
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'attention-'));
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root);
  file = getUserRuntimeConfigPath(); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '{}');
  now = 10000; vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => { modes.splice(0).forEach(mode => mode.stop()); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); });

function build() {
  const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, rootMode: 'direct', targetPathBase: root, gitRoot: null,
    gitContext: { insideGit: false, root: null, branch: null, isClean: true }, runtimeConfig: getRuntimeConfig(root),
    session: { id: 'attention-session', createdAt: 'now', updatedAt: 'now', status: 'active', turns: [] },
  });
  const terminal = new RecordingTerminal();
  const mode = new InteractiveMode({ runtimeContext: context,
    sessionRuntime: { observeEvents: () => () => {}, getAgentMode: () => 'build', getPermissionScope: () => 'ask', getCurrentRunController: () => null } as unknown as ShellSessionRuntime,
    sessionManager: { sessionExists: () => false } as unknown as SessionManager,
    renderer: new StreamingRenderer(), terminal, setReadline: () => {},
    logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as ApprovalTrustPolicy, initialMcpGateway: {} as CliMcpGateway,
  });
  modes.push(mode); mode.start();
  const host = mode as unknown as { run(text: string): Promise<void>; pickerHost(): PickerHost; applyPicker(picker: Picker, ids: readonly string[]): void; queue: SubmissionQueue; pickerPending: boolean; view: InteractiveView; overlay: OverlayHost };
  return { context, terminal, mode, host, notifications: () => terminal.writes.filter(text => text.includes('\x1b]777;notify;')) };
}

it.each([29999, 30000])('emits the real terminal sequence only at the enabled 30s boundary (%i ms)', async duration => {
  fs.writeFileSync(file, '{"attentionOnIdle":true}');
  const { host, notifications } = build();
  vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => { now += duration; return { turnNumber: input.turnNumber + 1 }; });
  await host.run('synthetic turn');
  expect(notifications()).toEqual(duration < 30000 ? [] : ['\x07\x1b]777;notify;cheers;Turn finished (30s)\x07']);
});

it('keeps the default quiet for an actual long operation', async () => {
  const { host, notifications } = build();
  vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => { now += 40000; return { turnNumber: input.turnNumber + 1 }; });
  await host.run('synthetic turn'); expect(notifications()).toEqual([]);
});

it.each(['queue', 'picker', 'stopped'] as const)('does not notify while %s prevents an idle live terminal', async kind => {
  fs.writeFileSync(file, '{"attentionOnIdle":true}');
  const { host, mode, notifications } = build();
  const route = vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => {
    if (route.mock.calls.length === 1) {
      now += 30000;
      if (kind === 'queue') host.queue.push('follow up');
      if (kind === 'picker') host.pickerPending = true;
      if (kind === 'stopped') mode.stop();
    }
    return { turnNumber: input.turnNumber + 1 };
  });
  await host.run('synthetic turn'); await Promise.resolve();
  expect(notifications()).toEqual([]);
  expect(route).toHaveBeenCalledTimes(kind === 'queue' ? 2 : 1);
});

it.each([true, false])('pins the notification preference for the current operation (%s)', async initial => {
  fs.writeFileSync(file, JSON.stringify({ attentionOnIdle: initial }));
  const { context, host, notifications } = build();
  vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => {
    fs.writeFileSync(file, JSON.stringify({ attentionOnIdle: !initial }));
    expect(refreshShellRuntimeConfig(context).status).toBe('applied');
    now += 30000; return { turnNumber: input.turnNumber + 1 };
  });
  await host.run('synthetic turn'); expect(notifications()).toHaveLength(initial ? 1 : 0);
});

it('connects actual Settings input and confirmation to the accepted value and next long operation', async () => {
  const { context, host, terminal, notifications } = build();
  terminal.input('/settings\r'); await Promise.resolve(); await Promise.resolve();
  expect(context.runtimeConfig.attentionOnIdle).toBe(false);
  expect(fs.readFileSync(file, 'utf8')).toBe('{}');
  // Choosing the field and value only stages it; Apply is a separate action.
  terminal.input('attentionOnIdle'); terminal.input('\r');
  await vi.waitFor(() => expect(stripAnsi(host.overlay.render(80, 24).join('\n'))).toContain('Choose true'));
  terminal.input('\r');
  await vi.waitFor(() => expect(stripAnsi(host.overlay.render(80, 24).join('\n'))).toContain('Pending: true'));
  expect(context.runtimeConfig.attentionOnIdle).toBe(false);
  terminal.input('\r');
  await vi.waitFor(() => expect(context.runtimeConfig.attentionOnIdle).toBe(true));
  expect(getRuntimeConfig(root).attentionOnIdle).toBe(true);
  vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => { now += 30000; return { turnNumber: input.turnNumber + 1 }; });
  await host.run('synthetic turn'); expect(notifications()).toHaveLength(1);
});

it('keeps pasted advanced values out of the prompt and queues work until Apply finishes', async () => {
  const { context, host, terminal } = build();
  const route = vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => ({ turnNumber: input.turnNumber + 1 }));
  const screen = () => stripAnsi(host.overlay.render(80, 24).join('\n'));
  terminal.input('/settings\r'); await vi.waitFor(() => expect(screen()).toContain('Settings'));
  terminal.input('\x1b[200~maxTurns\x1b[201~'); terminal.input('\r');
  await vi.waitFor(() => expect(screen()).toContain('Edit value'));
  host.queue.push('queued operation'); terminal.input('\r');
  await vi.waitFor(() => expect(screen()).toContain('JSON integer'));
  expect(route).not.toHaveBeenCalled(); expect(host.view.editor.getText()).toBe('');
  terminal.input('\x15'); terminal.input('\x1b[200~27\x1b[201~'); terminal.input('\r');
  await vi.waitFor(() => expect(screen()).toContain('Pending: 27'));
  expect(context.runtimeConfig.maxTurns).toBe(15); expect(host.view.editor.getText()).toBe('');
  expect(route).not.toHaveBeenCalled(); terminal.input('\r');
  await vi.waitFor(() => expect(context.runtimeConfig.maxTurns).toBe(27));
  await vi.waitFor(() => expect(route).toHaveBeenCalledOnce());
});

it.each(['replaced', 'stopped'] as const)('does not reopen a stale continuation when the overlay is %s', async state => {
  const { host, mode } = build(); let finish!: (value: { next: Picker }) => void;
  const pending = new Promise<{ next: Picker }>(resolve => { finish = resolve; });
  const next: Picker = { title: 'stale-next', form: 'panel', empty: '', load: async () => [], apply: async () => undefined };
  host.applyPicker({ ...next, exclusive: true, apply: () => pending }, ['value']);
  if (state === 'replaced') host.overlay.open({ ...next, title: 'replacement' }); else mode.stop();
  finish({ next }); await Promise.resolve(); await Promise.resolve();
  expect(stripAnsi(host.overlay.render(80, 24).join('\n'))).not.toContain('stale-next');
});

it('retains input ownership for Enter and bracketed paste in the same transition chunk', async () => {
  const { host, terminal } = build();
  const route = vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => ({ turnNumber: input.turnNumber + 1 }));
  terminal.input('/settings\r');
  await vi.waitFor(() => expect(stripAnsi(host.overlay.render(80, 24).join('\n'))).toContain('Settings'));
  terminal.input('maxTurns\rtyped-must-not-submit\r\x1b[200~must-not-become-a-prompt\x1b[201~\r');
  await vi.waitFor(() => expect(stripAnsi(host.overlay.render(80, 24).join('\n'))).toContain('Edit value'));
  expect(host.view.editor.getText()).toBe(''); expect(host.queue.control.entries()).toEqual([]); expect(route).not.toHaveBeenCalled();
  terminal.input('\x1b'); await Promise.resolve(); expect(route).not.toHaveBeenCalled();
});

it('preserves typed and pasted prompt queueing during ordinary exclusive picker operations', async () => {
  const { host, terminal } = build(); let finish!: () => void;
  const pending = new Promise<undefined>(resolve => { finish = () => resolve(undefined); });
  const route = vi.spyOn(router, 'routeInteractiveCommand').mockImplementation(async input => ({ turnNumber: input.turnNumber + 1 }));
  host.applyPicker({ title: 'Navigate session', form: 'panel', empty: '', exclusive: true,
    load: async () => [], apply: () => pending }, ['session']);
  terminal.input('typed prompt\r\x1b[200~pasted prompt\x1b[201~\r');
  expect(host.queue.control.entries().map(entry => entry.text)).toEqual(['typed prompt', 'pasted prompt']); expect(route).not.toHaveBeenCalled();
  finish(); await vi.waitFor(() => expect(route).toHaveBeenCalledTimes(2));
  expect(host.queue.control.entries()).toEqual([]);
});

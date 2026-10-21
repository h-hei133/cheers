import type { EscalationPrompt } from '../../core/shell/approval/contract.js';
import type { Pager } from '../../presentation/tui/chrome/pager.js';
import { withConfiguration } from "../../test-utils/configuration.js";
import { completionEdit } from "./completion.js";
import { describe, expect, it, vi } from "vitest";
import { InteractiveMode } from "./interactiveMode.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import type { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import type { SessionManager } from "../../session/SessionManager.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { ManualScheduler, RecordingTerminal } from "../../test-utils/terminalDouble.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import type { OverlayHost, Picker } from "./overlay.js";
import type { PickerHost } from "./picker/registry.js";
import type { InteractiveView } from "../../presentation/tui/surface/contract.js";
import * as fileWalk from "../../runtime/execution/fileWalk.js";
import { currentTheme } from '../../presentation/theme/theme.js';
import { isThemePreviewActive, selectTheme } from '../../presentation/theme/selection.js';
import { helpPicker } from './picker/help.js';
import { toolsPicker } from './picker/tools.js';
import { restorePicker } from './picker/restore.js';
import * as toolCatalog from '../../core/tools/catalog.js';
import { createReport, span } from '../../core/commands/report/projection.js';
import type { PickerOutcome } from './overlay.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import * as management from '../../session/lifecycle/management.js';
import * as undoService from '../../edit/recovery/undo/service.js';
import type { UndoPreview } from '../../edit/recovery/operation/preview.js';
import * as goalScheduling from '../runtime/goalScheduling.js';
import * as sessionNavigation from '../../session/query/navigation.js';
import { parseKeyEvent } from '../../presentation/tui/input/keys.js';
import type { SubmissionQueue } from './inputQueue.js';
import type { InteractiveApprovalResult } from './picker/approval.js';
import * as extensionRuntime from '../runtime/extensions.js';
import { pluginPicker } from './picker/plugins.js';
import type { ExtensionManager } from '../../extensions/view/model.js';

function build(overrides: {
  observeEvents?: () => () => void;
  exit?: (code?: number) => void;
  scheduler?: ManualScheduler;
} = {}): {
  mode: InteractiveMode;
  renderer: StreamingRenderer;
  readline: { current: unknown };
  terminal: RecordingTerminal;
  approval: { current: ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>) | undefined };
} {
  const renderer = new StreamingRenderer();
  const readline: { current: unknown } = { current: null };
  const terminal = new RecordingTerminal();
  const approval: { current: ((prompt: EscalationPrompt) => Promise<InteractiveApprovalResult>) | undefined } = { current: undefined };
  const mode = new InteractiveMode({
    runtimeContext: withConfiguration({
      cwd: "/workspace",
      projectRoot: "/workspace",
      session: { id: "sess_1" },
      gitContext: { branch: "main" },
      runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64_000, configDiagnostics: [] },
    } as unknown as ShellRuntimeContext),
    sessionRuntime: {
      observeEvents: overrides.observeEvents ?? (() => () => {}),
      cancelCurrentRun: () => {},
      getAgentMode: () => "build",
      getPermissionScope: () => "ask",
      getCurrentRunController: () => null,
      terminate: () => {},
    } as unknown as ShellSessionRuntime,
    sessionManager: { sessionExists: () => false } as unknown as SessionManager,
    renderer,
    logger: { info: () => {}, warn: () => {}, error: () => {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as unknown as ApprovalTrustPolicy,
    initialMcpGateway: {} as unknown as CliMcpGateway,
    terminal,
    exit: overrides.exit,
    scheduler: overrides.scheduler,
    setInteractiveApprovalPrompt: handler => { approval.current = handler; },
    setReadline: (value) => {
      readline.current = value;
    },
  });
  return { mode, renderer, readline, terminal, approval };
}

describe("session wiring", () => {
  it('binds the extension management port to both real picker aliases and retains the settled ordinary approval result', async () => {
    const { mode } = build();
    const host = mode as unknown as { pickerHost(): PickerHost; overlay: OverlayHost; view: InteractiveView; applyPicker(picker: Picker, ids: readonly string[]): void };
    const apply = vi.fn(async () => {
      host.overlay.open({ title: 'Ordinary approval', form: 'panel', empty: '', load: async () => [], apply: async () => undefined });
      host.overlay.close();
      return 'Effect: saved; durability: confirmed.';
    });
    const manager: ExtensionManager = { read: () => ({ state: 'ready', snapshot: {
      version: 'v1', mutationBlocked: false, notices: [], install: { id: 'install', label: 'install', detail: '' },
      items: [{ id: 'one', label: 'installed', description: 'real service port', status: 'enabled', detail: [],
        actions: [{ id: 'disable', label: 'disable installed', detail: '' }] }],
    } }), subscribe: () => () => {}, prepare: async () => ({ title: 'disable installed', preview: [], apply }) };
    const port = vi.spyOn(extensionRuntime, 'extensionManagerFor').mockReturnValue(manager);
    try {
      expect(host.pickerHost().extensions).toBe(manager);
      const picker = pluginPicker(host.pickerHost().extensions); await picker.load();
      const actions = (await picker.apply(['one']))!.next!; await actions.load();
      const confirm = (await actions.apply(['disable']))!.next!; await confirm.load();
      host.applyPicker(confirm, ['continue']);
      await vi.waitFor(() => expect(host.view.transcript.all().some(block => block.kind === 'command' && block.title === 'Confirm disable installed'
        && block.text === 'Effect: saved; durability: confirmed.')).toBe(true));
      expect(apply).toHaveBeenCalledTimes(1);
    } finally { port.mockRestore(); host.overlay.close(); }
  });
  it('routes confirmed account sign-in through the normal command host with exact argument quoting', async () => {
    const { mode } = build();
    const host = mode as unknown as { pickerHost(): PickerHost; run(line: string): Promise<void> };
    const run = vi.spyOn(host, 'run').mockResolvedValue();
    await host.pickerHost().signIn!(['login', 'openai', '--account']);
    expect(run).toHaveBeenCalledWith('/connect "login" "openai" "--account"');
    run.mockRestore();
  });
  it.each(['cleanse', 'debug'])('opens bare %s while work runs, keeps argument commands queued, and preserves pending overlays', command => {
    const { mode } = build();
    const host = mode as unknown as { busy: boolean; pickerPending: boolean; queue: SubmissionQueue; overlay: OverlayHost; onSubmit(text: string): void; openPicker(command: string): void };
    host.busy = true;
    const open = vi.spyOn(host, 'openPicker').mockImplementation(() => undefined);
    host.onSubmit(`/${command}`);
    expect(open).toHaveBeenCalledOnce();
    expect(host.queue.shift()).toBeUndefined();
    host.onSubmit(`/${command} verify scan-1`);
    expect(open).toHaveBeenCalledOnce();
    expect(host.queue.shift()).toBe(`/${command} verify scan-1`);
    host.pickerPending = true;
    host.onSubmit(`/${command}`);
    expect(open).toHaveBeenCalledOnce();
    expect(host.queue.shift()).toBe(`/${command}`);
    host.pickerPending = false;
    host.overlay.open({ title: 'Pending permission', form: 'panel', empty: 'pending', load: async () => [], apply: async () => undefined });
    host.onSubmit(`/${command}`);
    expect(open).toHaveBeenCalledOnce();
    expect(host.queue.shift()).toBe(`/${command}`);
    host.overlay.close();
  });

  it('opens queued cleanse through the real picker without starting a turn', async () => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(text: string): Promise<void>; pickerHost(): PickerHost; sink: { begin(): void } };
    const original = host.pickerHost(); const begin = vi.spyOn(host.sink, 'begin');
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original, security: {
      read: () => ({ state: 'ready', snapshot: { identity: { sessionId: 'sess_1', workspaceRoot: '/workspace' }, version: 'v1', items: [] } }),
      subscribe: () => () => undefined,
    } });
    await host.run('/cleanse');
    await vi.waitFor(() => expect(stripAnsi(host.overlay.render(120, 30).join('\n'))).toContain('No retained security scans'));
    expect(begin).not.toHaveBeenCalled();
    host.overlay.close();
  });

  it('opens queued debug through the real picker without starting a turn or reading diagnostic storage', async () => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(text: string): Promise<void>; pickerHost(): PickerHost; sink: { begin(): void } };
    const begin = vi.spyOn(host.sink, 'begin');
    const original = host.pickerHost();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original, commandContext: { cwd: '/workspace', admission: () => undefined } });
    await host.run('/debug');
    await vi.waitFor(() => expect(stripAnsi(host.overlay.render(120, 30).join('\n'))).toContain('inspect recent structured log records'));
    expect(begin).not.toHaveBeenCalled();
    host.overlay.close();
  });

  it.each(['success', 'failure'])('suppresses a guarded picker %s when its binding expires before host publication', async settlement => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; applyPicker(picker: Picker, ids: readonly string[]): void;
      view: InteractiveView; pager: Pager; pickerInputPending: Map<number, number>; options: { sessionManager: SessionManager } };
    const save = vi.fn(() => 'saved' as const);
    host.options.sessionManager.captureReportWriter = () => save;
    let current = true;
    const report = createReport({ title: 'Old diagnostics', lines: [], facts: {} });
    const picker: Picker = { title: 'Debug probe', form: 'panel', empty: '', holdInput: true, isCurrent: () => current,
      load: async () => [], apply: () => {
        queueMicrotask(() => { current = false; });
        return settlement === 'success' ? Promise.resolve({ note: 'old owner note', report, draft: 'old draft' }) : Promise.reject(new Error('old source failure'));
      } };
    host.overlay.open(picker);
    const before = [...host.view.transcript.all()];
    host.applyPicker(picker, ['summary']);
    await vi.waitFor(() => expect(host.pickerInputPending.size).toBe(0));
    expect(host.view.transcript.all()).toEqual(before);
    expect(host.view.editor.getText()).toBe('');
    expect(host.pager.active).toBe(false);
    expect(save).not.toHaveBeenCalled();
    host.overlay.close();
  });

  it.each(['overlay', 'stopped', 'throw'])('suppresses obsolete guarded picker failure after %s without stranding input', async change => {
    const { mode } = build();
    const host = mode as unknown as { stopped: boolean; overlay: OverlayHost; applyPicker(picker: Picker, ids: readonly string[]): void;
      view: InteractiveView; pickerInputPending: Map<number, number> };
    let fail!: () => void;
    let throws = false;
    const picker: Picker = { title: 'Debug probe', form: 'panel', empty: '', holdInput: true,
      isCurrent: () => { if (throws) throw new Error('private admission error'); return true; }, load: async () => [],
      apply: () => new Promise((_, reject) => { fail = () => reject(new Error('old private source')); }) };
    host.overlay.open(picker);
    const before = [...host.view.transcript.all()];
    host.applyPicker(picker, ['summary']);
    if (change === 'overlay') host.overlay.open({ ...picker, title: 'New overlay' });
    else if (change === 'stopped') host.stopped = true;
    else throws = true;
    fail();
    await vi.waitFor(() => expect(host.pickerInputPending.size).toBe(0));
    expect(host.view.transcript.all()).toEqual(before);
    host.overlay.close();
  });

  it('keeps active-run cancellation available while the debug tool catalog is pending', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { busy: boolean; overlay: OverlayHost; openPicker(command: string): void; pickerHost(): PickerHost;
      options: { sessionRuntime: ShellSessionRuntime } };
    let finish!: () => void;
    const pool = new Promise<ReadonlyMap<string, never>>(resolve => { finish = () => resolve(new Map()); });
    const original = host.pickerHost();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original, commandContext: { cwd: '/workspace', getToolPool: () => pool } });
    const cancel = vi.fn(async () => undefined);
    host.options.sessionRuntime.cancelAndWait = cancel;
    mode.start();
    try {
      host.busy = true;
      host.openPicker('/debug');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(120, 30).join('\n'))).toContain('inspect the current tool catalog'));
      terminal.input('tools'); terminal.input('\r');
      await vi.waitFor(() => expect(host.overlay.active).toBe(false));
      terminal.input('\x03');
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      finish();
    } finally { finish(); mode.stop(); }
  });

  it('interrupts goal scheduling between rounds without discarding the human draft', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { options: { sessionRuntime: ShellSessionRuntime }; view: InteractiveView };
    const cancel = vi.fn(); host.options.sessionRuntime.cancelCurrentRun = cancel;
    vi.spyOn(goalScheduling, 'schedulerForRuntime').mockReturnValue({ ownerToken: () => 'fixture-owner' } as never);
    mode.start();
    try {
      terminal.input('draft'); terminal.input('\x1b');
      await vi.waitFor(() => expect(cancel).toHaveBeenCalledOnce());
      expect(host.view.editor.getText()).toBe('draft');
    } finally { mode.stop(); vi.restoreAllMocks(); }
  });

  it('shows undo preview above confirmation and requires a separate Restore selection', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; pager: Pager; view: InteractiveView;
      openPicker(command: string): void };
    const receipt = { operationId: 'op-preview', sessionId: 'sess_1', createdAt: '2026-10-08T00:00:00Z',
      status: 'committed', undo: 'none', files: [{ path: 'a.txt', workspace: { path: '/workspace' }, kind: 'update',
        status: 'committed', undo: 'none', before: { state: 'exists', hash: 'a'.repeat(64), mode: 0o644 },
        after: { state: 'exists', hash: 'b'.repeat(64), mode: 0o644 } }] } as UndoPreview['receipt'];
    const preview: UndoPreview = { receipt, revision: 'c'.repeat(64), canRestore: true, blockers: [], files: [{ file: receipt.files[0]!,
      prepared: { content: 'before\n' } as never, current: { state: 'exists', content: 'after\n' } as never }] };
    vi.spyOn(undoService, 'prepareUndo').mockResolvedValue({ preview, note: 'Review every file.' });
    const restore = vi.spyOn(undoService, 'executeUndo').mockResolvedValue({ result: {
      status: 'restored-verified', operationId: receipt.operationId, files: [{ path: 'a.txt', status: 'restored-verified' }] } });
    mode.start();
    try {
      host.openPicker('/undo');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 30).join('\n'))).toContain('Review latest file operation'));
      terminal.input('\x1b[B\r');
      await vi.waitFor(() => expect(host.pager.active).toBe(true));
      const report = host.view.transcript.all().find(block => block.report?.facts.status === 'preview')!;
      expect(report.text).toContain('-"after"'); expect(report.text).toContain('+"before"');
      expect(stripAnsi(host.overlay.render(100, 30).join('\n'))).toContain('Confirm file undo');
      expect(restore).not.toHaveBeenCalled();
      terminal.input('\r'); // Closing the reader leaves Cancel selected underneath.
      expect(host.pager.active).toBe(false); expect(host.overlay.active).toBe(true);
      terminal.input('\r'); expect(host.overlay.active).toBe(false); expect(restore).not.toHaveBeenCalled();
      host.openPicker('/undo');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 30).join('\n'))).toContain('Review latest file operation'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(host.pager.active).toBe(true));
      terminal.input('\r\x1b[B\x1b[B\r');
      await vi.waitFor(() => expect(restore).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(host.view.transcript.all().some(block => block.report?.facts.status === 'restored-verified')).toBe(true));
    } finally { mode.stop(); vi.restoreAllMocks(); }
  });

  it.each(['/new', '/clear'])('keeps the conversation and shows workspace refusal for %s without rejecting the terminal run', async command => {
    const { mode } = build();
    const host = mode as unknown as { run(text: string): Promise<void>; view: InteractiveView;
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    const context = host.options.runtimeContext;
    context.session.turns = [{ role: 'user', content: 'Retained conversation' }];
    context.workspaceAdmission = () => 'Saved workspace changed. Reopen the session.';
    const create = vi.fn(); Object.assign(host.options.sessionManager, { createNew: create });
    mode.start();
    try {
      await expect(host.run(command)).resolves.toBeUndefined();
      expect(create).not.toHaveBeenCalled(); expect(context.session.id).toBe('sess_1');
      const text = host.view.transcript.all().map(block => block.text).join('\n');
      expect(text).toContain('Retained conversation'); expect(text).toContain('Saved workspace changed. Reopen the session.');
    } finally { mode.stop(); }
  });

  it('keeps queued input behind the session title editor until it is dismissed', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { busy: boolean; pickerPending: boolean; queue: SubmissionQueue; overlay: OverlayHost;
      pickerHost(): PickerHost; run(text: string): Promise<void> };
    const prepare = vi.spyOn(management, 'prepareSessionManagement').mockResolvedValue({ preview: {
      action: 'rename', session: { id: 'sess_1', projectRoot: '/workspace', title: 'Current title', turns: [],
        createdAt: '2026-10-08T00:00:00Z', updatedAt: '2026-10-08T00:00:00Z', status: 'active' },
      expected: { sessionId: 'sess_1', projectRoot: '/workspace', busy: false }, layout: {} as never, version: 'fixture',
    } });
    vi.spyOn(host, 'pickerHost').mockReturnValue({ sessionManager: {},
      sessionContext: () => ({ sessionId: 'sess_1', projectRoot: '/workspace', busy: host.busy && !host.pickerPending }),
    } as unknown as PickerHost);
    const run = host.run.bind(host);
    const dispatch = vi.spyOn(host, 'run').mockImplementation(text => text === '/help' ? Promise.resolve() : run(text));
    mode.start();
    try {
      await host.run('/rename');
      await vi.waitFor(() => expect(prepare).toHaveBeenCalled());
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 30).join('\n'))).toContain('Edit session title'));
      host.queue.push('/help'); terminal.input('\x1b[B'); terminal.input('\r');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 30).join('\n'))).toContain('Session title'));
      expect(dispatch).not.toHaveBeenCalledWith('/help'); expect(host.queue.control.entries().map(entry => entry.text)).toEqual(['/help']);
      terminal.input('\x1b');
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith('/help'));
      expect(host.queue.control.entries()).toEqual([]);
    } finally { mode.stop(); vi.restoreAllMocks(); }
  });
  it.each([false, true])('restores saved reports in the first frame with message history=%s', withMessages => {
    const { mode } = build();
    const host = mode as unknown as { view: InteractiveView; sink: { begin(): void }; options: { runtimeContext: ShellRuntimeContext } };
    const context = host.options.runtimeContext;
    const report = createReport({ title: 'Saved observation', lines: [{ kind: 'text', spans: [span('Retained report body')] }], facts: { count: 3 } });
    context.session.turns = withMessages ? [{ id: 'user-one', role: 'user', content: 'Earlier user request' }] : [];
    context.session.reports = [{ id: 'report-one', sourceEntryId: withMessages ? 'user-one' : 'sess_1:root',
      timestamp: '2026-10-07T00:00:00.000Z', text: 'Retained report body', report }];
    context.runtimeConfig.configDiagnostics.push('Retained startup warning');
    const begin = vi.spyOn(host.sink, 'begin');
    mode.start();
    try {
      const frame = stripAnsi(host.view.renderFrame({ columns: 100, rows: 40 }).rows.join('\n'));
      expect(frame).toContain('Cheers'); expect(frame).toContain('Saved report');
      expect(frame).toContain('Retained report body'); expect(frame).toContain('Retained startup warning');
      expect(host.view.transcript.all().find(block => block.report)?.report).toBe(report);
      expect(host.view.transcript.all().filter(block => block.kind === 'user')).toHaveLength(withMessages ? 1 : 0);
      if (withMessages) expect(frame).toContain('Earlier user request');
      expect(begin).not.toHaveBeenCalled();
      expect(context.session.turns).toHaveLength(withMessages ? 1 : 0);
    } finally { mode.stop(); }
  });

  it('preserves safe load failure in the queued tools chooser', async () => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; openPicker(command: string, queued: boolean): void; pickerHost(): PickerHost };
    const original = host.pickerHost();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original, commandContext: { ...original.commandContext,
      getToolPool: async () => { throw new Error('PRIVATE_RESPONSE_BODY'); } } });
    mode.start();
    try {
      host.openPicker('/tools', true);
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('Tool catalog unavailable. Reopen /tools to retry.'));
      expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).not.toContain('PRIVATE_RESPONSE_BODY');
      expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).not.toContain('No matching tools');
    } finally { mode.stop(); }
  });

  it.each(['/tree', '/history'])('reads the current tree focus after loading %s through the queued command path', async command => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void> };
    const navigation = vi.spyOn(sessionNavigation, 'readSessionNavigation').mockReturnValue({
      points: [
        { entryId: 'older', label: 'Older question', depth: 0, current: false, prompt: 'older' },
        { entryId: 'current', label: 'Current question', depth: 1, current: true, prompt: 'current' },
      ],
    } as ReturnType<typeof sessionNavigation.readSessionNavigation>);
    mode.start();
    try {
      await host.run(command);
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('Current question'));
      const selected = vi.fn();
      host.overlay.handleKey(parseKeyEvent('\r'), selected);
      expect(selected).toHaveBeenCalledWith(expect.objectContaining({ exclusive: true }), ['current']);
    } finally { mode.stop(); navigation.mockRestore(); }
  });

  it('reports queued history read failures without exposing storage errors or claiming empty history', async () => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void> };
    vi.spyOn(sessionNavigation, 'readSessionNavigation').mockImplementation(() => { throw new Error('PRIVATE_STORAGE_BODY'); });
    mode.start();
    try {
      await host.run('/history');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('Session history unavailable. Reopen /history to retry.'));
      const frame = stripAnsi(host.overlay.render(100, 24).join('\n'));
      expect(frame).not.toContain('PRIVATE_STORAGE_BODY');
      expect(frame).not.toContain('No saved session history');
    } finally { mode.stop(); }
  });

  it.each([true, false])('distinguishes queued history no-match from an empty tree (saved=%s)', async saved => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void> };
    vi.spyOn(sessionNavigation, 'readSessionNavigation').mockReturnValue({ points: saved
      ? [{ entryId: 'saved', depth: 0, label: 'Saved question', current: true }]
      : [] } as ReturnType<typeof sessionNavigation.readSessionNavigation>);
    mode.start();
    try {
      await host.run('/history');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n')))
        .toContain(saved ? 'Saved question' : 'No saved session history is available.'));
      if (saved) {
        host.overlay.handlePaste('no-match-query');
        const frame = stripAnsi(host.overlay.render(100, 24).join('\n'));
        expect(frame).toContain('No session history entries match this search.');
        expect(frame).not.toContain('No saved session history is available.');
      }
    } finally { mode.stop(); }
  });

  it('inspects the host tool pool through the real picker and retains a copyable report without taking the turn sink', async () => {
    const tool = { name: 'only_visible_tool', description: 'Visible metadata.', argsSchema: { type: 'object' }, execute: vi.fn() };
    const catalog = vi.spyOn(toolCatalog, 'loadToolCatalog').mockResolvedValue({ skills: new Map(), tools: new Map([[tool.name, tool]]) });
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; pager: Pager; pickerHost(): PickerHost; sink: { begin(): void }; onSubmit(text: string): void; options: { runtimeContext: ShellRuntimeContext } };
    // This test crosses admission, unlike the minimal presentation fixtures.
    const context = host.options.runtimeContext; const binding = configurationBinding(context);
    context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
    const begin = vi.spyOn(host.sink, 'begin'); const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
    mode.start();
    try {
      host.view.editor.setText('original draft');
      host.overlay.open(toolsPicker(host.pickerHost().commandContext));
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain(tool.name));
      terminal.input('\r\x1b[200~transition paste\x1b[201~');
      await vi.waitFor(() => expect(host.pager.active).toBe(true));
      const block = host.view.transcript.all().find(item => item.report)!;
      expect(host.view.transcript.last()?.text).toBe('Report shown; it was not saved to session history.');
      expect(block.report?.facts.name).toBe(tool.name); expect(block.text).toContain('Visible metadata.');
      expect(block.collapsed).toBe(true); expect(catalog).toHaveBeenCalledTimes(2);
      expect(host.overlay.active).toBe(false); expect(begin).not.toHaveBeenCalled(); expect(tool.execute).not.toHaveBeenCalled();
      expect(host.view.editor.getText()).toBe('original draft'); expect(submit).not.toHaveBeenCalled();
      terminal.input('\x1b'); await vi.waitFor(() => expect(host.pager.active).toBe(false));
      expect(host.view.editor.getText()).toBe('original draft');
    } finally { mode.stop(); catalog.mockRestore(); }
  });

  it.each(['replaced', 'question', 'stopped'] as const)('discards a delayed report after %s', async state => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; pager: Pager; view: InteractiveView;
      applyPicker(picker: Picker, ids: readonly string[]): void; onQuestion(text: string): void };
    let resolve!: (value: PickerOutcome) => void;
    const pending = new Promise<PickerOutcome>(done => { resolve = done; });
    const report = createReport({ title: 'stale report', lines: [{ kind: 'text', spans: [span('stale body')] }], facts: {} });
    mode.start();
    try {
      host.applyPicker({ title: 'Tools', form: 'panel', empty: '', holdInput: true, load: async () => [], apply: () => pending }, ['read']);
      if (state === 'replaced') host.overlay.open(helpPicker());
      else if (state === 'question') {
        host.onQuestion('Answer required');
        terminal.input('typed\x1b[200~ pasted\x1b[201~');
        expect(host.view.editor.getText()).toBe('typed pasted');
      }
      else mode.stop();
      resolve({ report }); await new Promise(done => setTimeout(done, 0));
      expect(host.pager.active).toBe(false);
      expect(host.view.transcript.all().some(block => block.report === report)).toBe(false);
    } finally { mode.stop(); }
  });

  it('holds composer typing and paste until a delayed restore preview draft settles', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; applyPicker(picker: Picker, ids: readonly string[]): void };
    let resolve!: (value: PickerOutcome) => void;
    const pending = new Promise<PickerOutcome>(done => { resolve = done; });
    mode.start();
    try {
      host.view.editor.setText('original draft');
      host.applyPicker({ ...restorePicker('/workspace'), apply: () => pending }, ['edit-a:record-a']);
      terminal.input('typed\x1b[200~ pasted\x1b[201~');
      expect(host.view.editor.getText()).toBe('original draft');
      resolve({ draft: '/restore preview --authority-id=edit-a --record=record-a' });
      await new Promise(done => setTimeout(done, 0));
      expect(host.view.editor.getText()).toContain('/restore preview');
      terminal.input('!');
      await vi.waitFor(() => expect(host.view.editor.getText()).toContain('--record=record-a!'));
    } finally { mode.stop(); }
  });

  it.each([['/models', '/model ', undefined, '/model'], ['/recall', '/recall ', '<query>', '/recall '], ['/exit', '/exit ', undefined, '/exit']])(
    'inserts the help choice %s and executes only on a second explicit submission', async (filter, command, usage, submitted) => {
      const exit = vi.fn(); const { mode, terminal } = build({ exit });
      const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; onSubmit(text: string): void };
      const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
      mode.start();
      try {
        host.view.editor.setText('preserved draft'); host.overlay.open(helpPicker());
        await new Promise(resolve => setTimeout(resolve, 0));
        terminal.input(`\x1b[200~\x1b[31m${filter}\x1b[0m\x1b[201~`);
        expect(host.view.editor.getText()).toBe('preserved draft');
        terminal.input('\r');
        await vi.waitFor(() => expect(host.view.editor.getText()).toBe(command));
        expect(host.overlay.active).toBe(false); expect(host.view.suggestionsOpen).toBe(false);
        expect(submit).not.toHaveBeenCalled(); expect(exit).not.toHaveBeenCalled();
        if (usage) expect(stripAnsi(host.view.renderFrame({ columns: 100, rows: 24 }).rows.join('\n'))).toContain(`Usage: ${command}${usage}`);
        terminal.input('\r'); expect(submit).toHaveBeenCalledOnce(); expect(submit).toHaveBeenCalledWith(submitted, undefined, undefined);
      } finally { mode.stop(); }
    });

  it('gives help the remaining rows after a multiline composer and preserves the draft on escape', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; toast?: string };
    mode.start();
    try {
      const draft = 'first\nsecond\nthird\nfourth\nfifth\nsixth\nseventh\neighth'; host.view.editor.setText(draft); host.overlay.open(helpPicker());
      host.toast = 'A session notice remains visible';
      await new Promise(resolve => setTimeout(resolve, 0));
      const frame = stripAnsi(host.view.renderFrame({ columns: 100, rows: 16 }).rows.join('\n'));
      expect(frame).toContain('Slash commands'); expect(frame).toContain('more'); expect(frame).toContain('Esc to close');
      expect(frame).toContain('A session notice remains visible');
      terminal.input('\x1b'); await vi.waitFor(() => expect(host.overlay.active).toBe(false));
      expect(host.view.editor.getText()).toBe(draft);
    } finally { mode.stop(); }
  });

  it('ends an active theme preview before stopping its follower', async () => {
    selectTheme('dark'); const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; pickerHost(): PickerHost; theme: { refresh(): void; stop(): void } };
    const refresh = vi.spyOn(host.theme, 'refresh'); const stop = vi.spyOn(host.theme, 'stop');
    const lease = host.pickerHost().themes!.begin();
    host.overlay.open({ title: 'Theme preview', form: 'panel', empty: '', load: async () => [{ id: 'light', label: 'Light' }],
      apply: async () => undefined, previewChange: () => { lease.show('light'); }, previewEnd: lease.end });
    await Promise.resolve(); await Promise.resolve(); expect(currentTheme()).toBe('light');
    mode.stop(); expect(currentTheme()).toBe('dark'); expect(isThemePreviewActive()).toBe(false);
    expect(refresh.mock.invocationCallOrder.at(-1)).toBeLessThan(stop.mock.invocationCallOrder.at(-1)!);
    refresh.mockClear(); selectTheme('light'); expect(lease.show('dark')).toBe(false); lease.end();
    expect(refresh).not.toHaveBeenCalled(); selectTheme('dark');
  });

  it("loads file references only on demand and accepts the async quoted candidate without submission", async () => {
    const walk = vi.spyOn(fileWalk, "listWorkspaceFiles").mockResolvedValue(['my file.ts']);
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      expect(walk).not.toHaveBeenCalled();
      terminal.input('@my');
      await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe('@my file.ts'));
      terminal.input('\t');
      expect(host.view.editor.getText()).toBe('@"my file.ts" ');
      expect(submit).not.toHaveBeenCalled();
      expect(walk).toHaveBeenCalledTimes(1);
    } finally { mode.stop(); walk.mockRestore(); }
  });

  it.each(['escape', 'stop'])('cancels a pending reference walk on actual %s and ignores late results', async action => {
    let resolve!: (files: readonly string[]) => void;
    const walk = vi.spyOn(fileWalk, "listWorkspaceFiles").mockImplementation(() => new Promise(done => { resolve = done; }));
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView };
    mode.start();
    try {
      terminal.input('@late');
      await vi.waitFor(() => expect(walk).toHaveBeenCalledTimes(1));
      const signal = walk.mock.calls[0]?.[1]?.abortSignal;
      if (action === 'stop') mode.stop(); else terminal.input('\x1b');
      // A lone Escape is dispatched after the input buffer's sequence timeout.
      await vi.waitFor(() => expect(signal?.aborted).toBe(true));
      resolve(['late-file']);
      await new Promise(done => setTimeout(done, 0));
      expect(host.view.suggestions.current()?.value).not.toBe('@late-file');
    } finally { mode.stop(); walk.mockRestore(); }
  });

  it.each([["cp", "[text]"], ["recall", "<query>"], ["retain", "<statement>"]])("keeps /%s usage informational and submits the literal body once", (name, hint) => {
    const scheduler = new ManualScheduler();
    const { mode, terminal } = build({ scheduler });
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      terminal.input(`/${name} `);
      scheduler.flush();
      expect(host.view.suggestionsOpen).toBe(false);
      expect(stripAnsi(host.view.renderFrame({ columns: 100, rows: 24 }).rows.join("\n"))).toContain(`Usage: /${name} ${hint}`);
      terminal.input("\t");
      expect(submit).not.toHaveBeenCalled();
      expect(host.view.editor.getText()).toBe(`/${name} `);
      const body = "  a  'quote'\\path\n\t中文  ";
      terminal.input(`\x1b[200~${body}\x1b[201~`);
      terminal.input("\r");
      expect(submit).toHaveBeenCalledOnce();
      expect(submit.mock.calls[0]?.[0]).toBe(`/${name} ` + body);
      terminal.input("/btw ");
      scheduler.flush();
      const next = stripAnsi(host.view.renderFrame({ columns: 100, rows: 24 }).rows.join("\n"));
      expect(next).toContain("Usage: /btw <question>");
      expect(next).not.toContain(`Usage: /${name}`);
    } finally { mode.stop(); }
  });

  it("publishes a loaded theme menu without another key and accepts without submission", async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      terminal.input("/theme dark-c");
      await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe("dark-contrast"));
      terminal.input("\t");
      expect(host.view.editor.getText()).toBe("/theme dark-contrast ");
      expect(submit).not.toHaveBeenCalled();
    } finally { mode.stop(); }
  });

  it.each(["panel", "modal"] as const)("routes actual mouse input to %s rows without applying on click", async (form) => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView };
    const apply = vi.fn(async () => undefined);
    mode.start();
    try {
      host.overlay.open({ title: "Mouse choices", form, empty: "none", apply,
        load: async () => [{ id: "a", label: "alpha-choice" }, { id: "b", label: "beta-choice" }],
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      const frame = host.view.renderFrame({ columns: 80, rows: 24 });
      const row = frame.rows.findIndex((line) => stripAnsi(line).includes("beta-choice"));
      expect(row).toBeGreaterThan(0);
      terminal.input(`\x1b[<0;6;${row + 1}M\x1b[<0;6;${row + 1}m`);
      expect(apply).not.toHaveBeenCalled();
      terminal.input("\r");
      await vi.waitFor(() => expect(apply).toHaveBeenCalledWith(["b"]));
    } finally { mode.stop(); }
  });

  it("routes a completion click through selection and Enter acceptance without submission", () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, "onSubmit").mockImplementation(() => {});
    mode.start();
    try {
      host.view.editor.setText("/m");
      host.view.suggestions.setItems([{ value: "/model", label: "model-choice" }, { value: "/memory", label: "memory-choice" }].map(candidate => completionEdit(candidate, host.view.editor.snapshot(), 0, 2)));
      host.view.setSuggesting(true);
      const frame = host.view.renderFrame({ columns: 80, rows: 24 });
      const row = frame.rows.findIndex((line) => stripAnsi(line).includes("memory-choice"));
      expect(row).toBeGreaterThan(0);
      terminal.input(`\x1b[<0;6;${row + 1}M\x1b[<0;6;${row + 1}m`);
      expect(host.view.editor.getText()).toBe("/m");
      terminal.input("\r");
      expect(host.view.editor.getText()).toBe("/memory ");
      expect(host.view.suggestions.current()?.value).toBe("view");
      expect(submit).not.toHaveBeenCalled();
    } finally { mode.stop(); }
  });

  it.each([
    ["navigation", "dismiss"], ["navigation", "confirm"],
    ["command", "dismiss"], ["command", "confirm"],
  ])("opens queued back selectors after %s and resumes the queue after %s", async (operation, action) => {
    const { mode, terminal } = build();
    const host = mode as unknown as {
      busy: boolean;
      queue: SubmissionQueue;
      overlay: OverlayHost;
      pickerHost(): PickerHost;
      applyPicker(picker: Picker, ids: readonly string[]): void;
      run(text: string): Promise<void>;
    };
    let finishNext!: () => void;
    const nextNavigation = new Promise<undefined>((resolve) => { finishNext = () => resolve(undefined); });
    const rewind = vi.fn(() => nextNavigation);
    vi.spyOn(host, "pickerHost").mockReturnValue({
      sessionTurns: () => [
        { id: "first", role: "user", content: "First question" },
        { id: "second", role: "user", content: "Second question" },
      ], rewind,
    } as unknown as PickerHost);
    let finish!: () => void;
    const navigation = new Promise<undefined>((resolve) => { finish = () => resolve(undefined); });
    const run = host.run.bind(host);
    const dispatched = vi.spyOn(host, "run").mockImplementation((text) => text === "/help" ? Promise.resolve() : run(text));
    mode.start();
    try {
      host.applyPicker({ title: "Session tree", form: "modal", empty: "", exclusive: true,
        load: async () => [], apply: async () => {
          await navigation;
          if (operation === "command") await host.run("/resume missing-synthetic-session");
          return undefined;
        },
      }, ["first"]);
      host.queue.push("/back 2"); host.queue.push("/help");
      expect(host.busy).toBe(true);
      expect(dispatched).not.toHaveBeenCalled();
      finish();
      await vi.waitFor(() => expect(host.overlay.active).toBe(true));
      expect(stripAnsi(host.overlay.render(100, 30).join("\n"))).toContain("Ask again from");
      expect(dispatched).not.toHaveBeenCalledWith("/help");
      if (action === "confirm") {
        terminal.input("\r");
        await vi.waitFor(() => expect(rewind).toHaveBeenCalledWith(expect.objectContaining({ entryId: "first" })));
        expect(dispatched).not.toHaveBeenCalledWith("/help");
        finishNext();
      } else {
        terminal.input("\x1b");
        expect(rewind).not.toHaveBeenCalled();
      }
      await vi.waitFor(() => expect(dispatched).toHaveBeenCalledWith("/help"));
      expect(host.queue.control.entries()).toEqual([]);
    } finally { mode.stop(); }
  });

  it("does not submit buffered keys after an exit key in the same chunk", async () => {
    const { mode, terminal } = build();
    let finish!: () => void;
    Object.assign(terminal, { drainInput: () => new Promise<void>((resolve) => { finish = resolve; }) });
    const submit = vi.spyOn(mode as unknown as { onSubmit(text: string): void }, "onSubmit").mockImplementation(() => {});
    mode.start();
    terminal.input("\x04should-not-submit\r\x1b[200~pasted\x1b[201~\r");
    expect(submit).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(terminal.stopped).toBe(true));
  });

  it("waits for late input before closing the terminal on user exit", async () => {
    const { mode, terminal } = build();
    let finish!: () => void;
    const drain = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    Object.assign(terminal, { drainInput: drain });
    mode.start();
    terminal.input("\x04");
    terminal.input("\x04");
    expect(drain).toHaveBeenCalledOnce();
    expect(terminal.stopped).toBe(false);
    finish();
    await vi.waitFor(() => expect(terminal.stopped).toBe(true));
  });

  it("installs a readline stand-in that can answer runtime questions", () => {
    // Runtime code asks through readline.question; without a working stand-in the
    // approval flow throws instead of prompting.
    const { readline } = build();
    const stub = readline.current as { question?: unknown; close?: unknown };
    expect(typeof stub.question).toBe("function");
    expect(typeof stub.close).toBe("function");
  });

  it("subscribes to the structured event stream on start", () => {
    const observeEvents = vi.fn(() => () => {});
    const { mode } = build({ observeEvents });
    mode.start();
    expect(observeEvents).toHaveBeenCalledOnce();
    mode.stop();
  });

  it("leaves the renderer writing to stdout while idle", () => {
    const { mode, renderer } = build();
    mode.start();
    expect(renderer.captured).toBe(false);
    mode.stop();
  });
  it("releases the session event subscription on stop", () => {
    let released = 0;
    const { mode } = build({ observeEvents: () => () => {
      released += 1;
    } });
    mode.start();
    mode.stop();
    mode.stop();
    expect(released).toBe(1);
  });
  it("cleans up host resources when the terminal disconnects", () => {
    const exit = vi.fn();
    const { mode, renderer, readline, terminal } = build({ exit });
    mode.start();
    terminal.disconnect();
    expect(exit).toHaveBeenCalledWith(0);
    expect(terminal.stopped).toBe(true);
    expect(renderer.captured).toBe(false);
    const readlineInterface = readline.current;
    expect(readlineInterface && typeof readlineInterface === "object" && "close" in readlineInterface).toBe(true);
    mode.stop();
  });
});

describe("terminal attention", () => {
  it("sets the window title to the session and project on start", () => {
    const { mode, terminal } = build();
    mode.start();
    // One OSC 0 write naming the session and the project directory, so a
    // tab among many says which conversation it holds.
    const title = terminal.writes.find((write) => write.startsWith("\x1b]0;"));
    expect(title).toBeDefined();
    expect(title).toContain("sess_1");
    expect(title).toContain("workspace");
  });
});

describe("attention on idle", () => {
  it("leaves a session quiet when the flag is off, which is the default", () => {
    const { mode, terminal } = build();
    mode.start();
    // The build helper sets no attentionOnIdle, so the default — off — is
    // what runs. The title write happens once at start and nothing after it
    // may carry a BEL: a bell that fires when nobody asked is the failure.
    const title = terminal.writes.find((write) => write.startsWith("\x1b]0;"));
    const afterTitle = terminal.writes.slice(terminal.writes.indexOf(title!) + 1);
    expect(afterTitle.some((write) => write.includes("\x07"))).toBe(false);
  });
});


it('keeps real wheel and bracketed paste input in the reader and restores the untouched draft', async () => {
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { pager: Pager; view: InteractiveView; onSubmit(text: string): void };
  const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
  mode.start();
  try {
    host.view.editor.setText('untouched draft');
    host.pager.open('/log', Array.from({ length: 60 }, (_, i) => `record-${i}`).join('\n'));
    host.view.renderFrame({ columns: 80, rows: 24 });
    terminal.input('\x1b[<65;6;6M');
    expect(stripAnsi(host.view.renderFrame({ columns: 80, rows: 24 }).rows[2]!)).toContain('record-3');
    terminal.input('\x1b[200~record-42\x1b[201~');
    const filtered = stripAnsi(host.view.renderFrame({ columns: 80, rows: 24 }).rows.join('\n'));
    expect(filtered).toContain('record-42'); expect(filtered).not.toContain('record-3');
    expect(host.view.editor.getText()).toBe('untouched draft'); expect(submit).not.toHaveBeenCalled();
    terminal.input('\x1b');
    scheduler.flush();
    expect(host.pager.active).toBe(false);
    terminal.input('!');
    scheduler.flush();
    expect(host.view.editor.getText()).toBe('untouched draft!');
    expect(submit).not.toHaveBeenCalled();
  } finally { mode.stop(); }
});


it('shows the complete file plan and keeps approval pending when its reader closes', async () => {
  const { mode, terminal, approval } = build();
  const host = mode as unknown as { pager: Pager; overlay: OverlayHost; view: InteractiveView };
  const preview = Array.from({ length: 60 }, (_, index) => `planned endpoint ${index}`).join('\n');
  mode.start();
  try {
    let settled = false;
    const decision = approval.current!({ id: 'patch-approval', title: 'Patch', message: 'Confirm complete plan',
      context: { toolName: 'apply_patch', operation: 'write', target: '60 endpoints', preview }, options: [],
      defaultOption: 'deny', recommendedAction: 'deny', severity: 'medium' }).then(result => { settled = true; return result; });
    await Promise.resolve(); await Promise.resolve();
    expect(host.pager.text).toContain('planned endpoint 59');
    host.view.renderFrame({ columns: 55, rows: 18 }); terminal.input('\x1b[F');
    expect(stripAnsi(host.view.renderFrame({ columns: 55, rows: 18 }).rows.join('\n'))).toContain('planned endpoint 59');
    terminal.input('\r');
    await vi.waitFor(() => expect(host.pager.active).toBe(false));
    expect(settled).toBe(false); expect(host.overlay.active).toBe(true);
    terminal.input('\r');
    await vi.waitFor(() => expect(stripAnsi(host.overlay.render(80, 24).join('\n'))).toContain('Permission Denied:'));
    terminal.input('\r');
    await expect(decision).resolves.toEqual({ decision: 'deny' });
  } finally { mode.stop(); }
});

it('keeps pasted Vim commands literal and approval shortcuts outside Vim handling', async () => {
  const scheduler = new ManualScheduler();
  const { mode, terminal, approval } = build({ scheduler });
  const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView;
    options: { runtimeContext: ShellRuntimeContext } };
  host.options.runtimeContext.runtimeConfig.vimMode = true;
  mode.start();
  try {
    terminal.input("\x1b[200~dd\x1b[201~");
    expect(host.view.editor.getText()).toBe("dd");
    terminal.input("\x1b");
    scheduler.flush();
    const decision = approval.current!({ id: "vim-approval", title: "Write", message: "Confirm action",
      context: { toolName: "edit", operation: "write", target: "file.ts" }, options: [], defaultOption: "deny",
      recommendedAction: "deny", severity: "medium" });
    await vi.waitFor(() => expect(stripAnsi(host.overlay.render(80, 24).join('\n'))).toContain('Permission: edit'));
    terminal.input("y");
    scheduler.flush();
    await expect(decision).resolves.toEqual({ decision: "allow-once" });
  } finally { mode.stop(); }
});

it('yields a reader to runtime questions, permission prompts and queued pickers', async () => {
  const { mode, terminal, approval } = build();
  const host = mode as unknown as { pager: Pager; view: InteractiveView; onQuestion(text: string): void;
    run(text: string): Promise<void>; openPicker(text: string, wait: boolean): void };
  const open = () => host.pager.open('/log', 'read only');
  mode.start();
  try {
    open(); host.onQuestion('Need an answer'); expect(host.pager.active).toBe(false);
    expect(host.view.editor.placeholder).toContain('Answer above');
    open();
    const decision = approval.current!({ id: 'reader-approval', title: 'Write', message: 'Confirm action',
      context: { toolName: 'edit', operation: 'write', target: 'file.ts' }, options: [], defaultOption: 'deny',
      recommendedAction: 'deny', severity: 'medium' });
    expect(host.pager.active).toBe(false);
    await Promise.resolve(); await Promise.resolve();
    expect(stripAnsi(host.view.renderFrame({ columns: 80, rows: 24 }).rows.join('\n'))).toContain('Permission: edit');
    terminal.input('\x1b');
    await expect(decision).resolves.toEqual({ decision: 'deny' });
    open(); const picker = vi.spyOn(host, 'openPicker').mockImplementation(() => {});
    await host.run('/settings');
    expect(host.pager.active).toBe(false); expect(picker).toHaveBeenCalledWith('/settings', true);
    open(); mode.stop(); expect(host.pager.active).toBe(false);
  } finally { mode.stop(); }
});

import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { getRuntimeConfig, type RuntimeConfig } from '../../config/runtimeConfig.js';
import { ConfigState } from '../../config/state.js';
import { loadCatalog } from '../../core/models/catalogStore.js';
import { configurationBinding } from '../../core/shell/configuration.js';
import { ManualScheduler, RecordingTerminal } from '../../test-utils/terminalDouble.js';
import type { ShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import type { ShellSessionRuntime } from '../../core/shell/sessionRuntime.js';
import type { SessionManager } from '../../session/SessionManager.js';
import type { ApprovalTrustPolicy } from '../../core/shell/approvalTrustPolicy.js';
import type { CliMcpGateway } from '../../entrypoints/cliMcpModule.js';
import type { StructuredLogger } from '../../observability/structuredLogger.js';
import { StreamingRenderer } from '../../presentation/terminal/streaming.js';
import type { InteractiveSurface } from '../../presentation/tui/surface/view.js';
import { stripAnsi } from '../../presentation/tui/text/ansi.js';
import { InteractiveMode } from './interactiveMode.js';
import type { createExtensionUiAdapter } from './extensions.js';
import { ExtensionUiBinding } from './extensions/binding.js';
import type { Keybindings } from './keybindings.js';
import { closeExtensionsFor, extensionHostFor, installExtensionRuntime, waitForExtensionsFor } from '../runtime/extensions.js';
import { runExtensionFactory } from '../../extensions/runtime/inProcessLoader.js';
import { HookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { mediaFixture } from '../../test-utils/media/runtime.js';
import { installMediaSurface, closeMediaFor, mediaCommandFor } from '../runtime/media.js';
import { closeJobsFor } from '../runtime/jobs.js';
import { routeSlashCommand } from '../../core/commands/slashRouter.js';
import { decodeCast } from '../../media/record/codec.js';
import { recordingText } from '../../media/record/playback.js';
import { installSessionChange } from '../runtime/session/replacement.js';
import * as extensions from '../runtime/extensions.js';
import type { Transcript } from '../../presentation/tui/transcript/container.js';

function interactive(tuiMode: 'regular' | 'fullscreen' = 'fullscreen', root = '/workspace', recording?: {
  context: ShellRuntimeContext; terminal: RecordingTerminal; manager: SessionManager;
}, onInputReady?: () => Promise<void>) {
  const terminal = recording?.terminal ?? new RecordingTerminal();
  terminal.columns = 60; terminal.rows = 24;
  const startTerminal = terminal.start.bind(terminal);
  terminal.start = (...args) => { startTerminal(...args); args[3]?.onInputReady?.(); };
  const scheduler = new ManualScheduler();
  const exit = vi.fn();
  const seed = {
    cwd: root, projectRoot: root, session: { id: 'extension-ui-session', createdAt: '2026-11-14', projectRoot: root }, gitContext: { branch: 'main' },
    runtimeConfig: { ...getRuntimeConfig(root), provider: 'openai', providerCredentials: {}, contextWindow: 64_000, configDiagnostics: [], tuiMode } satisfies RuntimeConfig,
  };
  const context = recording?.context ?? { ...seed, configuration: new ConfigState(seed.runtimeConfig, configurationBinding(seed), loadCatalog()) } as unknown as ShellRuntimeContext;
  const sessionRuntime = {
    commands: new ShellCommandRuntime(), observeEvents: () => () => {}, cancelCurrentRun: () => {},
    getAgentMode: () => 'build', getPermissionScope: () => 'ask', getCurrentRunController: () => null, terminate: () => {},
  } as unknown as ShellSessionRuntime;
  const mode = new InteractiveMode({
    runtimeContext: context, sessionRuntime, renderer: new StreamingRenderer(), terminal, scheduler, exit,
    sessionManager: recording?.manager ?? { sessionExists: () => false } as unknown as SessionManager,
    logger: { info() {}, warn() {}, error() {} } as unknown as StructuredLogger,
    approvalTrustPolicy: {} as ApprovalTrustPolicy, initialMcpGateway: {} as CliMcpGateway,
    onInputReady,
  });
  const state = mode as unknown as { extensionUi: ReturnType<typeof createExtensionUiAdapter>; view: InteractiveSurface; extensionBinding: ExtensionUiBinding };
  return { mode, terminal, scheduler, exit, context, sessionRuntime, state, ui: state.extensionUi.host };
}

describe('interactive extension UI', () => {
  it.each(['regular', 'fullscreen'] as const)('dispatches only admitted free shortcuts on the %s terminal', async tuiMode => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/extension-shortcut-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const first = path.join(root, 'first.ts'), second = path.join(root, 'second.ts');
    fs.writeFileSync(first, `export default (api) => {
      api.registerShortcut({ key: 'alt+x', run: () => api.ui.notify('EARLIER_SHORTCUT') });
      api.registerShortcut({ key: 'x', run: () => api.ui.notify('PRINTABLE_SHORTCUT') });
      api.registerShortcut({ key: 'ctrl+t', run: () => api.ui.notify('BUILTIN_SHORTCUT') });
    };`);
    fs.writeFileSync(second, `export default (api) => {
      const shortcut = { key: 'Alt + X', run: () => api.ui.notify('CURRENT_SHORTCUT') };
      api.registerShortcut(shortcut);
      shortcut.run = () => api.ui.notify('MUTATED_SHORTCUT');
    };`);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const { mode, context, sessionRuntime, terminal, scheduler, state, ui } = interactive(tuiMode, root, undefined, () => held);
    context.cliExtensionPaths = [first, second];
    const host = mode as unknown as { preferences: { keybindings: Keybindings }; state: { transcript: Transcript } };
    const notices = () => host.state.transcript.all().flatMap(block => block.kind === 'notice' ? [block.text] : []);
    const observed = () => notices().filter(line => line.includes('_SHORTCUT'));
    try {
      installExtensionRuntime(context, sessionRuntime, () => ({ sessionId: context.session.id, workspaceRoot: root,
        hooks: new HookDispatcher(), emit() {}, permissionScope: 'ask' }));
      await waitForExtensionsFor(context);
      mode.start();
      terminal.input('\x1bx');
      expect(observed()).toEqual([]);
      release(); await mode.inputReady;
      terminal.input('x'); terminal.input('\x14'); terminal.input('\x1b[120;3:3u');
      expect(state.view.editor.getText()).toBe('x');
      expect(observed()).toEqual([]);
      const dialog = ui.input('Dialog owns the keyboard');
      expect(state.extensionUi.active).toBe(true);
      terminal.input('\x1bx');
      scheduler.flush();
      expect(observed()).toEqual([]);
      terminal.input('\x1b[27u');
      scheduler.flush();
      expect(state.extensionUi.active).toBe(false);
      expect(await dialog).toBeUndefined();
      terminal.input('\x1bx');
      scheduler.flush();
      expect(observed()).toEqual(expect.arrayContaining([expect.stringContaining('CURRENT_SHORTCUT')]));
      expect(observed()).toHaveLength(1);
      await new Promise(resolve => setImmediate(resolve));
      host.preferences.keybindings.setUserConfig({ 'tui.editor.deleteToLineStart': 'alt+x' });
      terminal.input('\x1bx');
      expect(state.view.editor.getText()).toBe('');
      expect(observed()).toHaveLength(1);
      host.preferences.keybindings.setUserConfig({});
      terminal.input('\x1bx');
      expect(observed()).toHaveLength(2);
    } finally {
      release(); mode.stop(); await closeExtensionsFor(context);
      vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('retires a running shortcut and accepts only the successor after extension reload', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/extension-shortcut-reload-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const entry = path.join(root, 'shortcut.ts');
    fs.writeFileSync(entry, `export default (api) => api.registerShortcut({ key: 'alt+x', async run() {
      await api.ui.input('Original shortcut');
      api.ui.notify('RETIRED_SHORTCUT');
    } });`);
    const { mode, context, sessionRuntime, terminal, scheduler, state } = interactive('fullscreen', root);
    context.cliExtensionPaths = [entry];
    sessionRuntime.isRunning = () => Boolean(sessionRuntime.commands.current);
    const host = mode as unknown as { state: { transcript: Transcript } };
    const notices = () => host.state.transcript.all().flatMap(block => block.kind === 'notice' ? [block.text] : []).join('\n');
    try {
      installExtensionRuntime(context, sessionRuntime, () => ({ sessionId: context.session.id, workspaceRoot: root,
        hooks: new HookDispatcher(), emit() {}, permissionScope: 'ask' }));
      mode.start(); await extensions.startExtensionsFor(context);
      terminal.input('\x1bx');
      scheduler.flush();
      await vi.waitFor(() => expect(state.extensionUi.active, notices()).toBe(true));
      fs.writeFileSync(entry, `export default (api) => api.registerShortcut({
        key: 'alt+x', run: () => api.ui.notify('SUCCESSOR_SHORTCUT')
      });`);
      const reload = await extensions.extensionCommandFor(context)('plugin', ['reload'], {
        cwd: root, projectRoot: root, sessionId: context.session.id,
      });
      expect(reload.output).toContain('reloaded');
      expect(state.extensionUi.active).toBe(false);
      expect(notices()).not.toContain('RETIRED_SHORTCUT');
      terminal.input('\x1bx');
      expect(notices()).toContain('SUCCESSOR_SHORTCUT');
      mode.stop(); terminal.input('\x1bx');
      expect(notices().match(/SUCCESSOR_SHORTCUT/g)).toHaveLength(1);
    } finally {
      mode.stop(); await closeExtensionsFor(context);
      vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('runs startup after terminal UI binding and holds ordinary input until it finishes', async () => {
    let mode!: InteractiveMode, ui!: ReturnType<typeof createExtensionUiAdapter>['host'];
    let started = false, confirmed = false;
    let finish!: () => void; const held = new Promise<void>(resolve => { finish = resolve; });
    const fixture = interactive('fullscreen', '/workspace', undefined, async () => {
      started = true; confirmed = await ui.confirm('STARTUP_BOUND', 'Ready?'); await held;
    });
    mode = fixture.mode; ui = fixture.ui;
    const host = mode as unknown as { onSubmit(text: string): void; state: { transcript: Transcript }; queue: { length: number } };
    const queued = vi.spyOn(mode as unknown as { runQueued(text: string): Promise<void> }, 'runQueued').mockResolvedValue(undefined);
    try {
      mode.start(); await vi.waitFor(() => expect(started).toBe(true));
      host.onSubmit('ORDINARY_AFTER_STARTUP');
      expect(host.queue.length).toBe(1);
      expect(host.state.transcript.all().some(block => block.kind === 'user' && block.text === 'ORDINARY_AFTER_STARTUP')).toBe(false);
      fixture.terminal.input('\x1b[B\r'); await new Promise(resolve => setImmediate(resolve));
      expect(confirmed).toBe(true); expect(queued).not.toHaveBeenCalled();
      finish(); await mode.inputReady;
      expect(queued).toHaveBeenCalledWith('ORDINARY_AFTER_STARTUP', undefined);
    } finally { finish(); mode.stop(); }
  });

  it('finishes clear projection before queued startup work and preserves successor extension chrome', async () => {
    const fixture = mediaFixture();
    Object.assign(fixture.context, { originalCwd: fixture.root, rootMode: 'direct', targetPathBase: fixture.root,
      gitContext: { insideGit: false, root: null, branch: null, isClean: true } });
    const { mode, context, sessionRuntime, state } = interactive('fullscreen', fixture.root, { ...fixture, terminal: new RecordingTerminal() });
    const host = mode as unknown as { busy: boolean; run(text: string): Promise<void>; runQueued(text: string): Promise<void>; state: { transcript: Transcript } };
    sessionRuntime.isRunning = () => Boolean(sessionRuntime.commands.current);
    sessionRuntime.input = () => undefined;
    installExtensionRuntime(context, sessionRuntime, () => ({ workspaceRoot: context.cwd, sessionId: context.session.id, hooks: new HookDispatcher(), emit() {}, permissionScope: 'ask' }), fixture.manager);
    installSessionChange(context, fixture.manager, sessionRuntime);
    const start = extensions.startExtensionsFor;
    const started = vi.spyOn(extensions, 'startExtensionsFor').mockImplementation(async (...args) => {
      await start(...args);
      extensionHostFor(context)!.ui!.setStatus!('current', 'Successor ready');
      await extensionHostFor(context)!.sendMessage!('Queued startup request');
    });
    const queued = vi.spyOn(host, 'runQueued').mockImplementation(async text => {
      expect(host.busy).toBe(false); host.state.transcript.append({ kind: 'user', text, finalized: true });
    });
    try {
      mode.start(); await start(context); await host.run('/clear');
      expect(context.workspaceIssue).toBeUndefined();
      expect(host.state.transcript.all().filter(block => block.kind === 'error')).toEqual([]);
      await vi.waitFor(() => expect(queued).toHaveBeenCalledWith('Queued startup request', undefined));
      expect(host.state.transcript.all().some(block => block.kind === 'user' && block.text === 'Queued startup request')).toBe(true);
      expect(state.extensionUi.chrome().status.join(' ')).toContain('Successor ready');
    } finally {
      started.mockRestore(); mode.stop(); await closeExtensionsFor(context); await closeJobsFor(context);
      vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(fixture.scratch, { recursive: true, force: true });
    }
  });

  it.each(['regular', 'fullscreen'] as const)('excludes extension input and editor text from actual %s recordings while retaining later output', async tuiMode => {
    const fixture = mediaFixture();
    const binding = configurationBinding(fixture.context);
    fixture.context.configuration.publish(fixture.context.configuration.begin(binding),
      { ...fixture.context.runtimeConfig, tuiMode }, binding);
    fixture.context.gitContext = { branch: 'main' } as ShellRuntimeContext['gitContext'];
    const stdout = new PassThrough(); const stderr = new PassThrough();
    stdout.resume(); stderr.resume();
    Object.assign(stdout, { columns: 60, rows: 24 });
    installMediaSurface(fixture.context, stdout as unknown as NodeJS.WriteStream, stderr as unknown as NodeJS.WriteStream);
    const terminal = new RecordingTerminal();
    const write = terminal.write.bind(terminal);
    terminal.write = (data, done) => { write(data); stdout.write(data, done); };
    const { mode, scheduler, ui, state } = interactive(tuiMode, fixture.root, { ...fixture, terminal });
    const command = (args: string) => routeSlashCommand(`/record ${args}`, {
      cwd: fixture.root, sessionId: fixture.context.session.id, mediaCommand: mediaCommandFor(fixture.context),
    });
    try {
      mode.start(); scheduler.flush(); terminal.drain();
      expect(await command('start private.cast --retain keep')).toMatchObject({
        kind: 'local', output: expect.stringContaining('recording started'),
      });
      const markers: string[] = [];
      for (const method of ['input', 'editor'] as const) {
        const marker = `private-${method}-orchid-9462`;
        markers.push(marker);
        const answer = ui[method]('Private dialog', '');
        expect(state.view.editor.getText()).toBe('');
        terminal.input(marker); scheduler.flush();
        expect(stripAnsi(terminal.drain())).toContain(marker);
        terminal.input('\x1b'); scheduler.flush();
        expect(await answer).toBeUndefined();
      }
      terminal.write('safe output after dialogs\n');
      await command('stop');
      const cast = decodeCast(fs.readFileSync(path.join(fixture.root, 'private.cast'), 'utf8'));
      const text = recordingText(cast);
      expect(cast.incomplete).toBe(false);
      for (const marker of markers) expect(text).not.toContain(marker);
      expect(text).toContain('safe output after dialogs');
    } finally {
      mode.stop(); await closeMediaFor(fixture.context); await closeJobsFor(fixture.context);
      stdout.destroy(); stderr.destroy(); vi.restoreAllMocks(); vi.unstubAllEnvs();
      fs.rmSync(fixture.scratch, { recursive: true, force: true });
    }
  });

  it('delivers a loaded factory tool through the CLI dynamic host into actual terminal UI', async () => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/extension-ui-');
    vi.stubEnv('HOME', path.join(root, 'home')); vi.stubEnv('USERPROFILE', path.join(root, 'home'));
    vi.stubEnv('CHEERS_MARKETPLACES_FILE', path.join(root, 'sources.json'));
    vi.stubEnv('CHEERS_EXTENSIONS_FILE', path.join(root, 'registry.json'));
    const { mode, context, sessionRuntime, terminal, scheduler, state } = interactive('regular', root);
    try {
      installExtensionRuntime(context, sessionRuntime, () => ({ sessionId: context.session.id, workspaceRoot: root,
        hooks: new HookDispatcher(), emit() {}, permissionScope: 'ask' }));
      await waitForExtensionsFor(context);
      const loaded = await runExtensionFactory({ workspaceRoot: root, host: extensionHostFor(context), factory(api) {
        api.registerTool({ name: 'interactive_choice', description: 'Choose', argsSchema: { type: 'object' },
          async execute() {
            api.ui.setStatus('factory', 'Factory status');
            const selected = await api.ui.select('Factory choice', ['Alpha', 'Beta']);
            return { success: true, output: selected ?? 'cancelled' };
          } });
      } });
      const toolContext = { taskId: 'fixture', workspaceRoot: root, sessionId: context.session.id };
      await expect(loaded.tools[0]!.execute({}, toolContext)).rejects.toThrow('Extension UI is unavailable.');
      mode.start();
      const selected = loaded.tools[0]!.execute({}, toolContext);
      void selected.catch(() => {});
      await vi.waitFor(() => expect(state.extensionUi.active).toBe(true));
      scheduler.flush(); expect(stripAnsi(terminal.drain())).toContain('Factory choice');
      terminal.input('\x1b[B\r'); expect(await selected).toMatchObject({ success: true, output: 'Beta' });
      scheduler.flush(); expect(stripAnsi(terminal.drain())).toContain('Factory status');
      const cancelled = loaded.tools[0]!.execute({}, toolContext);
      void cancelled.catch(() => {});
      await vi.waitFor(() => expect(state.extensionUi.active).toBe(true));
      const previousHost = extensionHostFor(context);
      context.session = { ...context.session, id: 'replacement-factory-session' };
      const binding = configurationBinding(context);
      context.configuration.transition(binding);
      const ticket = context.configuration.begin(binding);
      context.configuration.publish(ticket, context.runtimeConfig, binding);
      state.extensionBinding.refresh(state.extensionUi.host);
      expect(await cancelled).toMatchObject({ success: true, output: 'cancelled' });
      await waitForExtensionsFor(context);
      expect(extensionHostFor(context)).not.toBe(previousHost);
      const rebound = await runExtensionFactory({ workspaceRoot: root, host: extensionHostFor(context), factory(api) {
        api.registerTool({ name: 'rebound_choice', description: 'Current session', argsSchema: { type: 'object' },
          async execute() { return { success: true, output: await api.ui.select('New factory choice', ['Current']) ?? 'cancelled' }; } });
      } });
      const reboundContext = { ...toolContext, sessionId: context.session.id };
      const newChoice = rebound.tools[0]!.execute({}, reboundContext);
      void newChoice.catch(() => {});
      await vi.waitFor(() => expect(state.extensionUi.active).toBe(true));
      terminal.input('\r'); expect(await newChoice).toMatchObject({ success: true, output: 'Current' });
      const stopping = rebound.tools[0]!.execute({}, reboundContext);
      void stopping.catch(() => {});
      await vi.waitFor(() => expect(state.extensionUi.active).toBe(true));
      mode.stop(); expect(await stopping).toMatchObject({ success: true, output: 'cancelled' });
    } finally {
      mode.stop(); await closeExtensionsFor(context); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['regular', 'fullscreen'] as const)('paints and accepts selection/confirmation in the actual %s host', async tuiMode => {
    const fixture = interactive(tuiMode);
    const { mode, ui, terminal, scheduler, state, exit } = fixture;
    expect(() => ui.select('Early', ['A'])).toThrow('Extension UI is unavailable.');
    mode.start();
    try {
      state.view.editor.setDraftText('keep this draft');
      const choice = ui.select('Choose a target', ['Alpha', 'Beta']);
      scheduler.flush();
      expect(stripAnsi(terminal.drain())).toContain('Choose a target');
      terminal.input('\x1b[B\r');
      expect(await choice).toBe('Beta');
      expect(state.view.editor.getText()).toBe('keep this draft');
      const confirm = ui.confirm('Proceed?', 'This is a general confirmation');
      scheduler.flush();
      const screen = stripAnsi(terminal.drain());
      expect(screen).toContain('This is a general confirmation');
      expect(screen).toContain('No');
      expect(screen).not.toContain('Allow once');
      terminal.input('\x1b[B\r');
      expect(await confirm).toBe(true);
      state.view.editor.setDraftText('');
      const cancelled = ui.confirm('Cancel?', 'Keep working');
      terminal.input('\x03');
      expect(await cancelled).toBe(false);
      expect(exit).not.toHaveBeenCalled();
    } finally { mode.stop(); }
    expect(() => ui.notify('Late')).toThrow('Extension UI is unavailable.');
  });

  it('routes single-line and multiline input through overlays while preserving the composer', async () => {
    const { mode, ui, terminal, scheduler, state } = interactive();
    mode.start();
    try {
      ui.setEditorText('original composer');
      const input = ui.input('Name', 'Type a name');
      scheduler.flush();
      expect(stripAnsi(terminal.drain())).toContain('Type a name');
      terminal.input('hello\x1b[200~\nworld\x1b[201~\r');
      expect(await input).toBe('hello world');
      const editor = ui.editor('Edit note', 'first');
      terminal.input('\rsecond\x1b[200~\nthird\x1b[201~');
      scheduler.flush();
      const rows = state.view.renderFrame(terminal.getDimensions()).rows.map(stripAnsi).join('\n');
      expect(rows).toContain('Edit note');
      expect(rows).toContain('second');
      expect(rows).toContain('third');
      terminal.input('\x13');
      expect(await editor).toBe('first\nsecond\nthird');
      expect(state.view.editor.getText()).toBe('original composer');
      const cancelled = ui.editor('Discard', 'untouched');
      terminal.input('\x1b'); scheduler.flush();
      expect(await cancelled).toBeUndefined();
      expect(state.view.editor.getText()).toBe('original composer');
    } finally { mode.stop(); }
  });

  it.each(['regular', 'fullscreen'] as const)('renders keyed widgets/status in %s and keeps composer geometry aligned', tuiMode => {
    const { mode, ui, terminal, scheduler, state } = interactive(tuiMode);
    mode.start();
    try {
      terminal.drain();
      ui.setEditorText('draft text');
      ui.setWidget('above', ['Above widget']);
      ui.setWidget('below', ['Below widget'], 'belowEditor');
      ui.setStatus('one', 'Extension ready');
      ui.setStatus('two', 'Another status');
      ui.notify('Extension notice'); ui.setTitle('Extension title');
      scheduler.flush();
      const painted = stripAnsi(terminal.drain());
      expect(painted).toContain('Above widget'); expect(painted).toContain('Below widget');
      expect(painted).toContain('Extension ready'); expect(painted).toContain('Extension notice');
      const rows = state.view.renderFrame(terminal.getDimensions()).rows.map(stripAnsi);
      const composer = rows.findIndex(row => row.includes('draft text'));
      expect(rows.findIndex(row => row.includes('Above widget'))).toBeLessThan(composer);
      expect(rows.findIndex(row => row.includes('Below widget'))).toBeGreaterThan(composer);
      if (tuiMode === 'fullscreen') {
        const geometry = state.view.composerGeometry()!;
        const content = geometry.layout.rows.find(row => row.kind === 'content' && stripAnsi(row.rendered).includes('draft text'))!;
        expect(geometry.top + content.screenRow).toBe(composer);
      }
      ui.setWidget('above', ['Updated widget']); ui.setStatus('one', undefined); ui.setWidget('below', undefined);
      const changed = state.view.renderFrame(terminal.getDimensions()).rows.map(stripAnsi).join('\n');
      expect(changed).toContain('Updated widget'); expect(changed).toContain('Another status');
      expect(changed).not.toContain('Above widget'); expect(changed).not.toContain('Below widget');
      expect(changed).not.toContain('Extension ready');
      terminal.rows = 4;
      const tiny = state.view.renderFrame(terminal.getDimensions());
      expect(tiny.chromeRows!.length).toBeLessThanOrEqual(4);
    } finally { mode.stop(); }
  });

  it('releases dialogs on signal, timeout, session replacement and stop without accepting late input', async () => {
    const { mode, ui, terminal, state, context } = interactive();
    mode.start();
    try {
      const signal = new AbortController();
      const aborted = ui.input('Abort me', undefined, { signal: signal.signal });
      signal.abort(); expect(await aborted).toBeUndefined();
      const second = ui.select('Fresh selection', ['First', 'Second']);
      terminal.input('\r'); expect(await second).toBe('First');
      const timed = ui.editor('Deadline', 'initial', { timeout: 1 });
      expect(await timed).toBeUndefined();
      ui.setStatus('old', 'Old session status');
      const stale = ui.confirm('Stale session', 'Do not apply');
      context.session = { ...context.session, id: 'replacement-session' };
      terminal.input('\x1b[B\r');
      expect(await stale).toBe(false);
      state.view.renderFrame(terminal.getDimensions());
      expect(state.extensionUi.chrome().status).toEqual([]);
      expect(() => ui.setEditorText('late mutation')).toThrow('Extension UI is unavailable.');
      const binding = configurationBinding(context);
      context.configuration.transition(binding);
      const ticket = context.configuration.begin(binding);
      context.configuration.publish(ticket, context.runtimeConfig, binding);
      state.extensionBinding.refresh(ui);
      const rebound = ui.select('New session', ['Current']);
      terminal.input('\r'); expect(await rebound).toBe('Current');
    } finally { mode.stop(); }
    const stoppedFixture = interactive(); stoppedFixture.mode.start();
    const pending = stoppedFixture.ui.input('Stop me');
    stoppedFixture.mode.stop();
    expect(await pending).toBeUndefined();
    expect(stoppedFixture.state.extensionUi.active).toBe(false);
  });

  it('uses pointer bounds inside a framed list and rejects UI while another overlay owns input', async () => {
    const { mode, ui, terminal, state } = interactive();
    mode.start();
    try {
      const selection = ui.select('Pointer selection', ['Alpha', 'Beta']);
      const rows = state.view.renderFrame(terminal.getDimensions()).rows.map(stripAnsi);
      const row = rows.findIndex(line => line.includes('Beta'));
      const column = rows[row]!.indexOf('Beta');
      terminal.input(`\x1b[<0;${column + 1};${row + 1}M`);
      expect(await selection).toBe('Beta');
      const handle = mode.showOverlay({ render: () => ['another dialog'] });
      expect(() => ui.input('Must wait')).toThrow('Extension UI is unavailable.');
      handle.hide();
      const pending = ui.input('Stop while input drains');
      let finishDrain!: () => void;
      Object.assign(terminal, { drainInput: () => new Promise<void>(resolve => { finishDrain = resolve; }) });
      const shutdown = (mode as unknown as { shutdown(): Promise<void> }).shutdown();
      expect(await pending).toBeUndefined();
      expect(state.extensionUi.active).toBe(false);
      finishDrain(); await shutdown;
    } finally { mode.stop(); }
  });

  it('keeps options and the multiline caret visible in a short terminal', async () => {
    const { mode, ui, terminal, state } = interactive();
    mode.start(); terminal.rows = 6;
    try {
      const confirm = ui.confirm('Bounded', Array.from({ length: 20 }, () => 'Long explanatory message').join('\n'));
      const frame = state.view.renderFrame(terminal.getDimensions());
      const shown = frame.rows.map(stripAnsi).join('\n');
      expect(frame.fullScreen).toBe(true); expect(frame.rows).toHaveLength(6);
      expect(shown).toContain('No'); expect(shown).toContain('Yes');
      terminal.input('\x1b[B\r'); expect(await confirm).toBe(true);
      const editor = ui.editor('Long draft', Array.from({ length: 20 }, (_, index) => `line ${index}`).join('\n'));
      const editorFrame = state.view.renderFrame(terminal.getDimensions());
      expect(editorFrame.rows.join('\n')).toContain('\x1b_c\x07');
      expect(editorFrame.rows.map(stripAnsi).join('\n')).toContain('line 19');
      terminal.input('\x03'); expect(await editor).toBeUndefined();
    } finally { mode.stop(); }
  });

  it('recaptures after configuration retires a surface and keeps failed binding admission unavailable', async () => {
    const { mode, ui, context, terminal, state } = interactive();
    mode.start();
    try {
      ui.setStatus('old', 'Retired display status');
      context.configuration.recordDisplay({ theme: context.runtimeConfig.theme });
      expect(state.extensionBinding.needsRefresh()).toBe(true);
      expect(state.extensionBinding.admitted()).toBe(false);
      expect(state.extensionUi.chrome().status).toEqual([]);
      state.extensionBinding.refresh(ui);
      const current = ui.select('Fresh display binding', ['Current']);
      terminal.input('\r'); expect(await current).toBe('Current');
      await expect(ui.input('Invalid deadline', undefined, { timeout: 0 })).rejects.toThrow('Extension UI timeout must be positive and finite.');
      const release = vi.fn();
      const binding = new ExtensionUiBinding(context, release);
      context.configuration.transition(configurationBinding(context));
      binding.refresh(ui);
      expect(binding.admitted()).toBe(false);
      binding.dispose();
    } finally { mode.stop(); }
  });
});

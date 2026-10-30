import type { EscalationPrompt } from '../../core/shell/approval/contract.js';
import type { Pager } from '../../presentation/tui/chrome/pager.js';
import { withConfiguration } from "../../test-utils/configuration.js";
import { completionEdit } from "./completion.js";
import { describe, expect, it, vi } from "vitest";
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { InteractiveMode } from "./interactiveMode.js";
import type { ApprovalTrustPolicy } from "../../core/shell/approvalTrustPolicy.js";
import type { CliMcpGateway } from "../../entrypoints/cliMcpModule.js";
import type { ShellRuntimeContext } from "../../core/shell/runtimeContext.js";
import { ShellSessionRuntime } from "../../core/shell/sessionRuntime.js";
import { SessionManager } from "../../session/SessionManager.js";
import type { StructuredLogger } from "../../observability/structuredLogger.js";
import { StreamingRenderer } from "../../presentation/terminal/streaming.js";
import { ManualScheduler, RecordingTerminal } from "../../test-utils/terminalDouble.js";
import { stripAnsi } from "../../presentation/tui/text/ansi.js";
import { CURSOR_MARKER, cursorTarget } from '../../presentation/tui/render/paint.js';
import type { OverlayHost, Picker } from "./overlay.js";
import { pickerFor, type PickerHost } from "./picker/registry.js";
import type { InteractiveView } from "../../presentation/tui/surface/contract.js";
import * as fileWalk from "../../runtime/execution/fileWalk.js";
import { currentTheme } from '../../presentation/theme/theme.js';
import { isThemePreviewActive, selectTheme } from '../../presentation/theme/selection.js';
import { helpPicker } from './picker/help.js';
import { registerSlashCommand } from '../../entrypoints/slashCommandRegistry.js';
import { toolsPicker } from './picker/tools.js';
import { copyPicker } from './picker/copy.js';
import { restorePicker } from './picker/restore.js';
import { cleansePicker } from './picker/cleanse.js';
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
import { textBlock } from '../../presentation/tui/transcript/blocks.js';
import * as extensionRuntime from '../runtime/extensions.js';
import * as mcpRuntime from '../runtime/mcp.js';
import { pluginPicker } from './picker/plugins.js';
import type { ExtensionManager } from '../../extensions/view/model.js';
import { ShellCommandRuntime } from '../../core/shell/command.js';
import { HookDispatcher, defaultHookDispatcher } from '../../core/hooks/hookDispatcher.js';
import { installUsageRuntime } from '../runtime/usage.js';
import type { ProviderCredentialResolution } from '../../core/shell/providerCredentials.js';
import * as externalEditor from './externalEditor.js';
import { Clipboard } from './clipboard.js';
import * as promptRunner from './interactivePromptRunner.js';
import { StartupSurface } from './startup.js';
import { createShellRuntimeContext } from '../../core/shell/runtimeContext.js';
import { getProjectConfigPath, getRuntimeConfig, getUserRuntimeConfigPath, readRuntimeConfigEditAt, writeUserRuntimeConfigFile } from '../../config/runtimeConfig.js';
import { writeCatalogCache } from '../../core/models/catalogStore.js';
import { __setOpenAIProviderAuthLoginForTest } from '../../core/auth/providerAuthRuntime.js';
import { ConfigWriteError } from '../../config/outcome.js';
import * as startupTiming from '../../observability/startupTiming.js';
import * as contextPreview from '../runtime/context/preview.js';
import * as commandRouter from './interactiveCommandRouter.js';
import { contextMessageHash } from '../../session/context/selection.js';
import { readSessionModel } from '../../session/model/state.js';
import { resolveProviderCredential } from '../../core/shell/providerCredentials.js';
import { scanCommandArgs } from '../../core/commands/arguments.js';
import { promptTokens } from '../../core/prompts/tokens.js';
import * as modelState from '../../session/model/state.js';
import { SessionModelWriteError } from '../../session/model/outcome.js';
import * as configurationCommands from '../../core/commands/configuration.js';
import { filterVisibleToolNames } from '../../core/tools/prefilter.js';
import { researchHarness, cleanupResearch } from '../../test-utils/research.js';
import { researchFor } from '../runtime/research.js';
import { currentResearch, readResearch } from '../../research/run/store.js';
import * as modelDetails from './picker/model/details.js';
import { recordSessionUsage, resetSessionUsage } from '../../observability/usageTelemetry.js';
import { captureUsageAttribution } from '../../observability/usage/identity.js';
import type { Keybindings } from './keybindings.js';
import { buildToolEscalationPrompt } from '../../core/query/toolPolicy.js';
import { AgentRegistryScanner } from '../../core/messaging/agentRegistryScanner.js';

it.each(['regular', 'fullscreen'] as const)('suspends peer scans in the actual %s host while a picker or reader covers chrome', kind => {
  const scheduler = new ManualScheduler(), { mode } = build({ tuiMode: kind, scheduler });
  const host = mode as unknown as { overlay: OverlayHost; pager: Pager; view: InteractiveView;
    options: { runtimeContext: ShellRuntimeContext } };
  host.options.runtimeContext.session.id = `ambient-host-${kind}`;
  let now = 1000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const scan = vi.spyOn(AgentRegistryScanner.prototype, 'scanAllReachableAgents').mockReturnValue([]);
  const paint = () => host.view.renderFrame({ columns: 100, rows: 24 });
  mode.start();
  try {
    paint(); expect(scan).toHaveBeenCalledTimes(1);
    now += 2000; host.overlay.open({ ...helpPicker(), fullScreen: true });
    expect(paint().fullScreen).toBe(true); scheduler.flush();
    expect(scan).toHaveBeenCalledTimes(1);
    now += 2000; paint(); expect(scan).toHaveBeenCalledTimes(1);
    host.overlay.close(); paint(); expect(scan).toHaveBeenCalledTimes(2);
    now += 2000; host.pager.open('Whole reader', 'report line\n'.repeat(50));
    expect(paint().fullScreen).toBe(true);
    expect(scan).toHaveBeenCalledTimes(2);
    host.pager.close(); paint(); expect(scan).toHaveBeenCalledTimes(3);
  } finally { mode.stop(); scan.mockRestore(); clock.mockRestore(); }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind => ['g', '4', 'enter'].map(key => ({ kind, key }))))(
  'selects exact patch groups from a populated runtime approval in the actual $kind host with $key', async ({ kind, key }) => {
    const { mode, approval, terminal } = build({ tuiMode: kind });
    const host = mode as unknown as { overlay: OverlayHost & { model: { visible: readonly { id: string; note?: string }[] } };
      pager: Pager; view: InteractiveView };
    const request = buildToolEscalationPrompt('apply_patch', 'write', '/outside/a.txt, /outside/b.txt', 'Exact one-time selection');
    request.options = request.options.filter(option => option.value !== 'allow-always');
    request.context = { ...request.context, explicitApproval: true, preview: 'Full public fixture plan',
      selections: [{ id: 'group-a', label: 'Update A', files: ['/outside/a.txt'] },
        { id: 'group-b', label: 'Update B', files: ['/outside/b.txt'] }],
      selectionRevision: 'full', selectionPreview: ids => ({ preview: 'Only public fixture B', revision: ids.join(',') }) };
    mode.start();
    try {
      const pending = approval.current!(request), observe = vi.fn(); void pending.then(observe);
      expect(host.pager.active).toBe(true); terminal.input('\x1b');
      await vi.waitFor(() => expect(host.pager.active).toBe(false));
      await vi.waitFor(() => expect(host.overlay.model.visible.map(option => option.id)).toEqual(['choose-groups', 'allow-once', 'deny']));
      expect(observe).not.toHaveBeenCalled();
      terminal.input(key === 'enter' ? '\x1b[A\x1b[A\r' : key);
      await vi.waitFor(() => expect(host.overlay.model.visible.map(option => option.id)).toEqual(['group-a', 'group-b']));
      expect(observe).not.toHaveBeenCalled();
      terminal.input(' \r');
      await vi.waitFor(() => expect(host.pager.active).toBe(true));
      expect(host.pager.text).toContain('Only public fixture B');
      expect(observe).not.toHaveBeenCalled();
      terminal.input('\x1b'); await vi.waitFor(() => expect(host.pager.active).toBe(false));
      terminal.input('y');
      await expect(pending).resolves.toEqual({ decision: 'allow-once', selected: ['group-b'], selectionRevision: 'group-b' });
    } finally { mode.stop(); }
  });

it.each(['regular', 'fullscreen'] as const)('shows admitted thinking shortcuts and expands mixed streaming blocks in the actual %s host', kind => {
  const { mode, terminal } = build({ tuiMode: kind });
  const host = mode as unknown as { view: InteractiveView; preferences: { keybindings: Keybindings } };
  mode.start();
  try {
    const older = host.view.transcript.append({ kind: 'thinking', text: 'Older private thought', collapsed: false, finalized: true });
    const latest = host.view.transcript.append({ kind: 'thinking', text: 'New private thought', collapsed: true, finalized: false });
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 30 }).rows.join('\n'));
    expect(frame()).toContain('ctrl+t to expand');
    expect(frame()).not.toContain('click to expand');
    terminal.input('\x14');
    expect(older.collapsed).toBe(false); expect(latest.collapsed).toBe(false);
    expect(frame()).toContain('New private thought');
    terminal.input('\x14');
    expect(older.collapsed).toBe(true); expect(latest.collapsed).toBe(true);
    host.preferences.keybindings.setUserConfig({ 'app.thinking.toggle': 'f2' });
    expect(frame()).toContain('f2 to expand');
    expect(frame()).not.toContain('ctrl+t to expand');
    terminal.input('\x1bOQ');
    expect(older.collapsed).toBe(false); expect(latest.collapsed).toBe(false);
    terminal.input('\x1bOQ');
    host.preferences.keybindings.setUserConfig({ 'app.thinking.toggle': [] });
    expect(frame()).not.toContain('to expand');
    terminal.input('\x14'); terminal.input('\x1bOQ');
    expect(older.collapsed).toBe(true); expect(latest.collapsed).toBe(true);
  } finally { mode.stop(); }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['user', 'project'] as const).map(scope => ({ kind, scope }))))(
  'separates session choices from configuration fields in the actual $kind $scope settings host', async ({ kind, scope }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/settings-session-domain-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, providerConnections: [] },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    const project = getProjectConfigPath(root); fs.mkdirSync(path.dirname(project), { recursive: true });
    fs.writeFileSync(project, '{"schemaVersion":1,"topP":0.6}');
    writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://fixture.invalid/v1', models: [{ id: 'inspect-only' }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; pickerHost(): PickerHost;
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const userBytes = fs.readFileSync(getUserRuntimeConfigPath()), projectBytes = fs.readFileSync(project);
    const before = modelState.readSessionModelEdit(session.id), accepted = context.configuration.current;
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      let settings = pickerFor('/settings', host.pickerHost())!; await settings.load();
      if (scope === 'project') {
        const field = (await settings.apply(['maxTurns']))!.next!; await field.load();
        const scopes = (await field.apply(['scope']))!.next!; await scopes.load();
        settings = (await scopes.apply(['project']))!.next!.back!(); await settings.load();
      }
      host.overlay.open(settings);
      await vi.waitFor(() => expect(frame()).toContain(`Settings — ${scope} configuration`));
      host.view.editor.setDraftText('held scope draft');
      terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      expect(frame()).toContain(`Settings — current session — from ${scope} configuration`);
      expect(frame()).toContain('Session /');
      expect(frame()).not.toContain('Top P');
      terminal.input('\x1b');
      await vi.waitFor(() => expect(host.overlay.active).toBe(false));
      expect(host.view.editor.getText()).toBe('held scope draft');
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(userBytes); expect(fs.readFileSync(project)).toEqual(projectBytes);
      expect(modelState.readSessionModelEdit(session.id)).toEqual(before); expect(context.configuration.current).toBe(accepted);
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['user', 'project'] as const).flatMap(scope =>
    (['apply', 'discard'] as const).map(action => ({ kind, scope, action })))))(
  'retains status item staging through the actual $kind $scope settings editor and $action readback', async ({ kind, scope, action }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/status-settings-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, tui: { statusItems: ['model'] } },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    const project = getProjectConfigPath(root); fs.mkdirSync(path.dirname(project), { recursive: true });
    fs.writeFileSync(project, '{/* keep project comment */"tui":{"statusItems":["provider"]}}');
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView & { context: { statusItems(): readonly string[] } }; overlay: OverlayHost;
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const model = () => (host.overlay as unknown as { model: { current(): { id: string } | undefined;
      visible: readonly { id: string }[]; isChosen(id: string): boolean } }).model;
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    const focus = async (id: string) => {
      await vi.waitFor(() => expect(model().visible.some(row => row.id === id)).toBe(true));
      for (let index = 0; index < model().visible.length; index++) {
        if (model().current()?.id === id) return;
        terminal.input('\x1b[B');
      }
      throw new Error(`Status setting row not reachable: ${id}`);
    };
    const choose = async (id: string) => { await focus(id); terminal.input('\r'); };
    const originals = [getUserRuntimeConfigPath(), project].map(file => fs.readFileSync(file));
    const accepted = context.configuration.current, selection = JSON.stringify(modelState.readSessionModelEdit(session.id));
    const desired = ['provider', 'directory'];
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held status settings draft\nkept through edit and return');
      terminal.input('tui.statusItems'); await choose('tui.statusItems');
      if (scope === 'project') { await choose('scope'); await choose('project'); }
      await choose('edit'); await vi.waitFor(() => expect(frame()).toContain('Stage status items'));
      const initial = scope === 'user' ? 'model' : 'provider';
      await focus(initial); expect(model().isChosen(initial)).toBe(true); terminal.input(' ');
      await vi.waitFor(() => expect(model().isChosen(initial), 'initial item toggled off').toBe(false));
      for (const id of desired) {
        await focus(id); expect(model().isChosen(id), `before choosing ${id}`).toBe(false); terminal.input(' ');
        await vi.waitFor(() => expect(model().isChosen(id), `after choosing ${id}`).toBe(true));
      }
      expect(host.view.context.statusItems(), 'after selecting desired items').toEqual(desired);
      terminal.input('Directory'); await vi.waitFor(() => expect(model().visible.map(row => row.id)).toEqual(['directory']));
      expect(model().isChosen('provider')).toBe(true); terminal.input('\r');
      await vi.waitFor(() => expect(frame()).toContain('▸ Apply')); expect(frame()).toContain('Pending:');
      expect(host.view.context.statusItems(), 'after Enter stages filtered items').toEqual(desired);
      await choose('edit'); await focus('directory'); terminal.input(' ');
      await vi.waitFor(() => expect(host.view.context.statusItems()).toEqual(['provider'])); terminal.input('\x1b');
      await vi.waitFor(() => expect(frame()).toContain('▸ Apply'));
      expect(host.view.context.statusItems(), 'after Escape retains original pending items').toEqual(desired);
      expect(context.configuration.current).toBe(accepted);
      expect([getUserRuntimeConfigPath(), project].map(file => fs.readFileSync(file))).toEqual(originals);
      await choose(action); await vi.waitFor(() => expect(frame()).toContain('Settings —'));
      const stored = action === 'apply' ? desired : [initial];
      const effective = ['provider'];
      const requested = action === 'apply' && scope === 'project' ? desired : effective;
      expect(host.view.context.statusItems()).toEqual(effective);
      expect(context.runtimeConfig.tui?.statusItems).toEqual(effective);
      expect(context.configuration.current.requested.tui?.statusItems).toEqual(requested);
      expect(getRuntimeConfig(root).tui?.statusItems).toEqual(requested);
      const files = [getUserRuntimeConfigPath(), project], target = scope === 'user' ? 0 : 1;
      expect(readRuntimeConfigEditAt(files[target]).values.tui?.statusItems).toEqual(stored);
      expect(fs.readFileSync(files[1 - target])).toEqual(originals[1 - target]);
      if (action === 'discard') {
        expect(fs.readFileSync(files[target])).toEqual(originals[target]); expect(context.configuration.current).toBe(accepted);
      } else if (scope === 'project') expect(fs.readFileSync(project, 'utf8')).toContain('/* keep project comment */');
      const notes = host.view.transcript.all().map(block => block.text).join('\n');
      if (action === 'apply') {
        expect(notes).toContain(`Saved to your ${scope} configuration.`);
        if (scope === 'user') expect(notes).toContain('effective value differs');
        else expect(notes).toContain('Restart required.');
      } else expect(notes).not.toContain('Saved to your');
      await choose('tui.statusItems'); await focus('edit');
      if (action === 'apply' && scope === 'project') expect(frame()).toContain('restart required');
      await choose('edit'); await focus(initial);
      for (const id of ['model', 'provider', 'directory']) expect(model().isChosen(id)).toBe(stored.includes(id));
      expect(host.view.context.statusItems()).toEqual(effective);
      expect(context.runtimeConfig.topP).toBe(0.7);
      expect(JSON.stringify(modelState.readSessionModelEdit(session.id))).toBe(selection);
      expect(host.view.editor.getText()).toBe('held status settings draft\nkept through edit and return');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally { mode.stop(); vi.restoreAllMocks(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['close', 'replace', 'keep'] as const).map(ending => ({ kind, ending }))))(
  'keeps the actual $kind settings Escape return subordinate to theme cleanup that will $ending its host', async ({ kind, ending }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/settings-back-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, theme: 'dark', attentionOnIdle: false, topP: 0.7 },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    selectTheme('dark', root);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; theme: { refresh(): void };
      pickerLifecycles: { controllerFor(picker: Picker): AbortController | undefined };
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const before = fs.readFileSync(getUserRuntimeConfigPath()), accepted = context.configuration.current;
    const selection = JSON.stringify(modelState.readSessionModelEdit(session.id));
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    let refresh: ReturnType<typeof vi.spyOn> | undefined;
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held settings Escape draft\nkept through cleanup');
      terminal.input('theme'); await vi.waitFor(() => expect(frame()).toMatch(/▸ (?:● )?Theme/));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose'));
      for (let index = 0; index < 40; index++) terminal.input('\x1b[A');
      for (let index = 0; index < 40 && !frame().includes('▸ Choose "light"'); index++) terminal.input('\x1b[B');
      expect(frame()).toContain('▸ Choose "light"'); expect(currentTheme()).toBe('light');
      const current = (host.overlay as unknown as { picker: Picker }).picker;
      const owner = host.pickerLifecycles.controllerFor(current); expect(owner?.signal.aborted).toBe(false);
      refresh = vi.spyOn(host.theme, 'refresh').mockImplementation(() => {
        if (ending === 'close') host.overlay.close();
        else if (ending === 'replace') host.overlay.open({ title: 'Replacement panel', form: 'panel', empty: 'Replacement remains current',
          load: async () => [], apply: async () => undefined });
      });
      terminal.input('\x1b'); await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      expect(host.overlay.active).toBe(ending !== 'close');
      if (ending === 'replace') expect(frame()).toContain('Replacement remains current');
      if (ending === 'keep') await vi.waitFor(() => expect(frame()).toMatch(/▸ (?:● )?Theme/));
      expect(owner?.signal.aborted).toBe(ending !== 'keep');
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(context.configuration.current).toBe(accepted);
      expect(currentTheme()).toBe('dark'); expect(context.runtimeConfig.theme).toBe('dark');
      expect(JSON.stringify(modelState.readSessionModelEdit(session.id))).toBe(selection);
      expect(host.view.editor.getText()).toBe('held settings Escape draft\nkept through cleanup');
      expect(host.view.transcript.all().map(block => block.text).join('\n')).not.toContain('Saved to your user configuration.');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
      if (ending === 'keep') {
        terminal.input('attentionOnIdle'); await vi.waitFor(() => expect(frame()).toMatch(/▸ (?:● )?Attention on/));
        terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose false'));
        terminal.input('\x1b[A\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Apply'));
        terminal.input('\r'); await vi.waitFor(() => expect(context.runtimeConfig.attentionOnIdle).toBe(true));
        expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values.attentionOnIdle).toBe(true);
      }
    } finally {
      refresh?.mockRestore(); mode.stop(); vi.restoreAllMocks(); vi.unstubAllEnvs();
      selectTheme('dark'); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['theme', 'attentionOnIdle'] as const).flatMap(field =>
    (['close', 'replace', 'keep'] as const).map(ending => ({ kind, field, ending })))))(
  'fences settings Apply through the actual $kind host when $field refresh will $ending it', async ({ kind, field, ending }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/settings-apply-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, theme: 'dark', attentionOnIdle: false, topP: 0.7 },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    selectTheme('dark', root);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: true },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; busy: boolean; theme: { refresh(): void };
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const before = fs.readFileSync(getUserRuntimeConfigPath()), accepted = context.configuration.current;
    const selection = JSON.stringify(modelState.readSessionModelEdit(session.id));
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    let refresh: ReturnType<typeof vi.spyOn> | undefined;
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held settings draft\nkept through Apply');
      terminal.input(field); await vi.waitFor(() => expect(frame()).toMatch(field === 'theme' ? /▸ (?:● )?Theme/ : /▸ (?:● )?Attention on/));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose'));
      const label = field === 'theme' ? 'Choose "light"' : 'Choose true';
      for (let index = 0; index < 40; index++) terminal.input('\x1b[A');
      for (let index = 0; index < 40 && !frame().includes(`▸ ${label}`); index++) terminal.input('\x1b[B');
      expect(frame()).toContain(`▸ ${label}`); terminal.input('\r');
      await vi.waitFor(() => expect(frame()).toContain('▸ Apply'));
      if (field === 'theme') expect(currentTheme()).toBe('light');
      refresh = vi.spyOn(host.theme, 'refresh').mockImplementation(() => {
        if (ending === 'close') host.overlay.close();
        else if (ending === 'replace') host.overlay.open({ title: 'Replacement panel', form: 'panel', empty: 'Replacement remains current',
          load: async () => [], apply: async () => undefined });
      });
      terminal.input('\r'); await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
      await vi.waitFor(() => expect(host.busy).toBe(false));
      const cancelled = field === 'theme' && ending !== 'keep';
      const notes = host.view.transcript.all().map(block => block.text).join('\n');
      if (cancelled) {
        expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
        expect(context.configuration.current).toBe(accepted); expect(currentTheme()).toBe('dark');
        expect(notes).not.toContain('Saved to your user configuration.');
      } else {
        expect(readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values[field]).toBe(field === 'theme' ? 'light' : true);
        expect(notes).toContain('Saved to your user configuration.');
        expect(context.runtimeConfig[field]).toBe(field === 'theme' ? 'light' : true);
      }
      expect(host.overlay.active).toBe(ending !== 'close');
      if (ending === 'replace') expect(frame()).toContain('Replacement remains current');
      if (ending === 'keep') await vi.waitFor(() => expect(frame()).toMatch(field === 'theme' ? /▸ (?:● )?Theme/ : /▸ (?:● )?Attention on/));
      expect(context.runtimeConfig.topP).toBe(0.7);
      expect(JSON.stringify(modelState.readSessionModelEdit(session.id))).toBe(selection);
      expect(host.view.editor.getText()).toBe('held settings draft\nkept through Apply');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      refresh?.mockRestore(); mode.stop(); vi.restoreAllMocks(); vi.unstubAllEnvs();
      selectTheme('dark'); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each(['regular', 'fullscreen'] as const)('opens back from double Escape through the actual %s host', async kind => {
  const scheduler = new ManualScheduler(), { mode, terminal } = build({ tuiMode: kind, scheduler });
  const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; pickerHost(signal?: AbortSignal): PickerHost };
  const original = host.pickerHost(), rewind = vi.fn();
  let sourceSignal: AbortSignal | undefined, hostSignal: AbortSignal | undefined, now = 1_000;
  const clock = vi.spyOn(Date, 'now').mockImplementation(() => now);
  const read = vi.fn(async (signal?: AbortSignal) => {
    sourceSignal = signal;
    return { version: 'saved-v1', turns: [{ id: 'older', role: 'user' as const, content: 'Earlier saved question' },
      { id: 'newer', role: 'user' as const, content: 'Latest saved question' }] };
  });
  const wiring = vi.spyOn(host, 'pickerHost').mockImplementation(signal => {
    hostSignal = signal;
    return { ...original, commandContext: { ...original.commandContext, signal, admission: () => undefined }, sessionTurns: read, rewind };
  });
  mode.start();
  try {
    terminal.input('\x1b'); scheduler.flush();
    expect(host.overlay.active).toBe(false); expect(read).not.toHaveBeenCalled();
    now += 600; terminal.input('\x1b'); scheduler.flush();
    expect(host.overlay.active).toBe(false); expect(read).not.toHaveBeenCalled();
    now += 100; terminal.input('\x1b'); scheduler.flush();
    await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('Latest saved question'));
    expect(host.overlay.active).toBe(true); expect(read).toHaveBeenCalledOnce();
    const frame = stripAnsi(host.overlay.render(100, 24).join('\n'));
    expect(frame.indexOf('Latest saved question')).toBeLessThan(frame.indexOf('Earlier saved question'));
    expect(rewind).not.toHaveBeenCalled(); expect(host.view.editor.getText()).toBe('');
    expect(sourceSignal?.aborted).toBe(false); expect(hostSignal?.aborted).toBe(false);
    terminal.input('\x1b'); scheduler.flush();
    expect(host.overlay.active).toBe(false); expect(sourceSignal?.aborted).toBe(true); expect(hostSignal?.aborted).toBe(true);
    expect(rewind).not.toHaveBeenCalled();
    host.view.editor.setText('Keep this draft');
    now += 100; terminal.input('\x1b'); scheduler.flush();
    now += 100; terminal.input('\x1b'); scheduler.flush();
    expect(host.overlay.active).toBe(false); expect(read).toHaveBeenCalledOnce();
    expect(host.view.editor.getText()).toBe('Keep this draft');
  } finally { mode.stop(); wiring.mockRestore(); clock.mockRestore(); }
});

it('reports an unavailable picker and releases its original load lifetime', () => {
  const { mode } = build();
  const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView;
    openPicker(command: string): void; pickerHost(signal?: AbortSignal): PickerHost };
  const original = host.pickerHost(); let sourceSignal: AbortSignal | undefined;
  const wiring = vi.spyOn(host, 'pickerHost').mockImplementation(signal => { sourceSignal = signal; return original; });
  mode.start();
  try {
    host.openPicker('back');
    expect(host.overlay.active).toBe(false); expect(sourceSignal?.aborted).toBe(true);
    expect(host.view.transcript.all().at(-1)?.text).toBe('Picker unavailable. Use /help to find an available command.');
  } finally { mode.stop(); wiring.mockRestore(); }
});

function build(overrides: {
  observeEvents?: () => () => void;
  exit?: (code?: number) => void;
  scheduler?: ManualScheduler;
  startup?: StartupSurface;
  onFirstFrame?: () => void;
  tuiMode?: 'regular' | 'fullscreen';
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
      runtimeConfig: { provider: "openai", providerCredentials: {}, contextWindow: 64_000, configDiagnostics: [], tuiMode: overrides.tuiMode },
    } as unknown as ShellRuntimeContext),
    sessionRuntime: {
      commands: new ShellCommandRuntime(),
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
    startup: overrides.startup,
    onFirstFrame: overrides.onFirstFrame,
    setInteractiveApprovalPrompt: handler => { approval.current = handler; },
    setReadline: (value) => {
      readline.current = value;
    },
  });
  return { mode, renderer, readline, terminal, approval };
}

it.each(['regular', 'fullscreen'] as const)('binds unanswered approval to the current run cancellation in the actual %s host', async kind => {
  const { mode, approval, terminal } = build({ tuiMode: kind }), controller = new AbortController();
  const host = mode as unknown as { overlay: OverlayHost; options: { sessionRuntime: ShellSessionRuntime } };
  host.options.sessionRuntime.getCurrentRunController = () => controller;
  const request: EscalationPrompt = { id: 'fixture-cancelled-approval', title: 'Write approval', message: 'Write fixture',
    context: { toolName: 'write', operation: 'write', target: '/outside/fixture.txt', explicitApproval: true },
    options: [{ value: 'allow-once', label: 'Allow once' }, { value: 'deny', label: 'Deny' }],
    defaultOption: 'deny', recommendedAction: 'deny', severity: 'medium' };
  mode.start();
  try {
    const pending = approval.current!(request), observe = vi.fn(); void pending.then(observe);
    await vi.waitFor(() => expect(host.overlay.active).toBe(true));
    controller.abort(); await Promise.resolve();
    expect(observe).toHaveBeenCalledWith({ decision: 'deny', reason: 'Operation cancelled before approval.' });
    expect(host.overlay.active).toBe(false);
    terminal.input('y');
    expect(await pending).toMatchObject({ decision: 'deny' });
  } finally { mode.stop(); }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['approval', 'groups', 'preview'] as const).flatMap(stage => [false, true].map(rebound => ({ kind, stage, rebound })))))(
  'routes empty-draft exit before $stage ownership in the actual $kind host (rebound=$rebound)', async ({ kind, stage, rebound }) => {
    const exit = vi.fn(), { mode, approval, terminal } = build({ tuiMode: kind, exit });
    const host = mode as unknown as { overlay: OverlayHost & { model: { visible: readonly { id: string }[] } }; pager: Pager; view: InteractiveView;
      preferences: { keybindings: Keybindings }; options: { sessionRuntime: ShellSessionRuntime } };
    const controller = new AbortController(); host.options.sessionRuntime.getCurrentRunController = () => controller;
    const request: EscalationPrompt = { id: 'fixture-exit-approval', title: 'Patch', message: 'Review fixture',
      context: { toolName: 'apply_patch', operation: 'write', target: 'fixture.txt',
        ...(stage === 'preview' ? { preview: 'Public exact fixture plan' } : {}),
        ...(stage === 'groups' ? { selections: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }] } : {}) },
      options: [], defaultOption: 'deny', recommendedAction: 'deny', severity: 'medium' };
    mode.start();
    if (rebound) host.preferences.keybindings.setUserConfig({ 'app.exit': 'f2' });
    try {
      const pending = approval.current!(request);
      await vi.waitFor(() => expect(host.overlay.active).toBe(true));
      if (stage === 'groups') {
        await vi.waitFor(() => expect(host.overlay.model.visible.some(option => option.id === 'choose-groups')).toBe(true));
        terminal.input('\x1b[H\r'); await vi.waitFor(() => expect(host.overlay.model.visible.some(option => option.id === 'a')).toBe(true));
      }
      if (stage === 'preview') expect(host.pager.active).toBe(true);
      terminal.input(rebound ? '\x1bOQ' : '\x04');
      await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0));
      expect(exit).toHaveBeenCalledOnce(); expect(terminal.stopped).toBe(true);
      expect(host.overlay.active).toBe(false); expect(host.pager.active).toBe(false);
      expect(await pending).toMatchObject({ decision: 'deny' });
    } finally { mode.stop(); }
  });

it.each(['regular', 'fullscreen'] as const)('preserves a nonempty draft when the exit key arrives during %s approval', async kind => {
  const exit = vi.fn(), { mode, approval, terminal } = build({ tuiMode: kind, exit });
  const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView };
  mode.start();
  try {
    host.view.editor.setText('Held user draft');
    const pending = approval.current!({ id: 'held-draft-approval', title: 'Write', message: 'Review fixture',
      context: { toolName: 'write', operation: 'write', target: 'fixture.txt' }, options: [],
      defaultOption: 'deny', recommendedAction: 'deny', severity: 'medium' });
    await vi.waitFor(() => expect(host.overlay.active).toBe(true));
    terminal.input('\x04'); await Promise.resolve();
    expect(exit).not.toHaveBeenCalled(); expect(host.overlay.active).toBe(true);
    expect(host.view.editor.getText()).toBe('Held user draft');
    terminal.input('\x1b'); await expect(pending).resolves.toMatchObject({ decision: 'deny' });
  } finally { mode.stop(); }
});

it.each([false, true])('retains the active form caret through the host at one-row sizes (masked: %s)', async masked => {
  const { mode } = build();
  const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView };
  try {
    host.view.editor.setText('held prompt\nunchanged draft');
    host.overlay.open({ title: 'Edit value', form: 'panel', empty: '', load: async () => [], apply: async () => undefined,
      input: { initial: masked ? 'a😀éz' : 'first\nlast!', label: 'Value', masked, multiline: !masked,
        validate: () => undefined, apply: async () => undefined } });
    await Promise.resolve(); await Promise.resolve();
    for (const columns of [8, 40, 8]) {
      for (const rows of [1, 2, 4, 8, 24]) {
        for (const layout of ['document', 'viewport'] as const) {
          const frame = host.view.renderFrame({ columns, rows }, layout);
          expect(frame.rows.length).toBeLessThanOrEqual(rows);
          expect(frame.fullScreen).not.toBe(true);
          expect(frame.rows.some(row => row.includes(`${masked ? '••••' : 'last!'}${CURSOR_MARKER}`))).toBe(true);
          expect(cursorTarget(frame.rows, 0, rows)).not.toBeNull();
          expect(host.view.editor.getText()).toBe('held prompt\nunchanged draft');
        }
      }
    }
    host.overlay.close();
    const restored = host.view.renderFrame({ columns: 80, rows: 24 });
    expect(restored.rows.join('\n')).toContain(`unchanged draft${CURSOR_MARKER}`);
    expect(host.view.composerGeometry()).toBeDefined();
  } finally { mode.stop(); }
});

it('retains composed prose for the submission boundary instead of sending raw markers to a busy turn', () => {
  const { mode } = build();
  const host = mode as unknown as { busy: boolean; onSubmit(text: string): void; queue: SubmissionQueue;
    options: { sessionRuntime: ShellSessionRuntime }; view: InteractiveView };
  const followUp = vi.fn(), steer = vi.fn(); host.busy = true;
  host.options.sessionRuntime.input = () => ({ followUp, steer }) as never;
  try {
    host.onSubmit('正文 /skill:a /skill:b');
    expect(host.queue.shift()).toBe('正文 /skill:a /skill:b');
    expect(followUp).not.toHaveBeenCalled(); expect(steer).not.toHaveBeenCalled();
  } finally { mode.stop(); }
});

it('passes leading whitespace and second-line functional markers to prose dispatch', () => {
  const { mode } = build(); const host = mode as unknown as { busy: boolean; onSubmit(text: string): void; queue: SubmissionQueue };
  host.busy = true;
  try {
    host.onSubmit(' \n/model'); expect(host.queue.shift()).toBe(' \n/model');
    host.onSubmit(' /queue clear'); expect(host.queue.shift()).toBe(' /queue clear');
  } finally { mode.stop(); }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['role', 'thinking', 'assignment'] as const).flatMap(surface =>
    (surface === 'thinking' ? ['readable', 'unreadable'] as const : ['readable'] as const)
      .map(state => ({ kind, surface, state })))))(
  'returns an unverified role write through the actual $kind $surface host with $state state and permits a fresh explicit save', async ({ kind, surface, state }) => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  const root = fs.mkdtempSync('/tmp/cheers-test/role-write-host-');
  vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
  writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, activeProviderConnectionId: 'fixture', providerConnections: [{
    id: 'fixture', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-fixture', model: 'shared',
    baseUrl: 'https://fixture.invalid/v1', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
  }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
  writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }, { id: 'other', reasoning: true }] }]);
  const manager = new SessionManager(), session = manager.createNew(root);
  modelState.writeSessionModel(session.id, { connectionId: 'fixture', provider: 'openai', model: 'shared', thinkingEffort: 'high', roles: {
    advisor: { connectionId: 'fixture', provider: 'openai', model: 'shared', thinkingEffort: 'high' },
    summary: { connectionId: 'fixture', provider: 'openai', model: 'other', thinkingEffort: 'low' },
  } }, modelState.readSessionModelEdit(session.id));
  const baseline = readSessionModel(session.id)!, global = fs.readFileSync(getUserRuntimeConfigPath());
  const { mode, terminal } = build();
  const host = mode as unknown as { view: InteractiveView; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
  host.options.runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
    rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
    session, runtimeConfig: getRuntimeConfig(root) }); host.options.sessionManager = manager;
  const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
  const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
  const original = modelState.writeSessionModel, statePath = modelState.readSessionModelEdit(session.id).statePath;
  let persisted: Buffer | undefined;
  const writer = vi.spyOn(modelState, 'writeSessionModel').mockImplementationOnce((...args) => {
    original(...args);
    if (state === 'unreadable') {
      persisted = fs.readFileSync(statePath); fs.writeFileSync(statePath, '{unreadable');
    }
    throw new SessionModelWriteError('verification-failed', 'unknown');
  });
  const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
  mode.start();
  try {
    terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
    host.view.editor.setText('held draft\nkept through role editing');
    terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
    terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
    terminal.input('Advisor'); await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
    terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('advisor model'));
    if (surface === 'assignment') {
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('other'); await vi.waitFor(() => expect(frame()).toContain('▸ other'));
      terminal.input('\r');
    } else if (surface === 'thinking') {
      terminal.input('\x1b[B\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('Role thinking effort'));
      terminal.input('\x1b[A\x1b[A\r');
    } else terminal.input('\x1b[B\r');
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(frame()).toContain('unverified'));
    expect(frame()).toContain(new SessionModelWriteError('verification-failed', 'unknown').message);
    if (state === 'unreadable') {
      await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      expect(fs.readFileSync(statePath, 'utf8')).toBe('{unreadable');
      expect(writer).toHaveBeenCalledTimes(1); fs.writeFileSync(statePath, persisted!);
    }
    expect(readSessionModel(session.id)).toEqual({ ...baseline, roles: surface === 'role' ? { summary: baseline.roles!.summary }
      : { ...baseline.roles, advisor: { ...baseline.roles!.advisor!, ...(surface === 'assignment' ? { model: 'other' } : { thinkingEffort: 'low' }) } } });
    if (surface !== 'thinking' || state === 'unreadable') {
      await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      terminal.input('\r');
    } else expect(frame()).toContain('Reasoning effort: low');
    await vi.waitFor(() => expect(frame()).toContain('▸ Choose model'));
    terminal.input('\x1b[B\r');
    await vi.waitFor(() => expect(writer).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
    expect(readSessionModel(session.id)).toEqual({ ...baseline, roles: { summary: baseline.roles!.summary } });
    terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('Settings — current session — from user configuration'));
    expect(frame()).toContain('Session /');
    expect(frame()).toContain('▸ Models and roles'); expect(frame()).toContain('advisor follows the default');
    expect(host.view.editor.getText()).toBe('held draft\nkept through role editing');
    expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(global);
    expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
  } finally {
    mode.stop(); writer.mockRestore(); dispatch.mockRestore(); network.mockRestore();
    vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
  }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['account', 'configure'] as const).flatMap(route =>
    [false, true].map(unverified => ({ kind, route, unverified })))))(
  'retains the role sign-in result after unreadable state through the $kind $route host (unverified: $unverified)', async ({ kind, route, unverified }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/role-auth-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'anthropic', tuiMode: kind, activeProviderConnectionId: 'default', providerConnections: [{
      id: 'default', provider: 'anthropic', authType: 'api-key', apiKey: 'synthetic-default', model: 'default-model',
      status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'anthropic', models: [{ id: 'default-model', reasoning: true }] },
      { id: 'openai', models: [{ id: 'gpt-5.4-mini', reasoning: true }] }]);
    const manager = new SessionManager(), session = manager.createNew(root);
    const target = { connectionId: 'default', provider: 'anthropic' as const, model: 'default-model', thinkingEffort: 'low' as const };
    modelState.writeSessionModel(session.id, { connectionScope: 'session', ...target, thinkingEffort: 'high',
      roles: { advisor: target, summary: target, subagent: target } }, modelState.readSessionModelEdit(session.id));
    const original = readSessionModel(session.id)!, before = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    const statePath = modelState.readSessionModelEdit(session.id).statePath, stateBytes = fs.readFileSync(statePath);
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; busy: boolean;
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const publish = configurationCommands.configurationApplicationNotice;
    const publication = vi.spyOn(configurationCommands, 'configurationApplicationNotice').mockImplementationOnce((...args) => {
      const notice = publish(...args); fs.writeFileSync(statePath, '{unreadable');
      return unverified ? 'Configuration application outcome is unverified.' : notice;
    });
    __setOpenAIProviderAuthLoginForTest(async () => ({ accessToken: 'synthetic-role-host-access', refreshToken: 'synthetic-role-host-refresh',
      expiresAt: Date.now() + 3600000, authorizeUrl: 'https://auth.openai.com/authorize', callbackUrl: 'http://localhost:1455/auth/callback' }));
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held role sign-in draft\nkept through failure');
      terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('Advisor'); await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose model'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('gpt-5.4-mini'); await vi.waitFor(() => expect(frame()).toContain('▸ gpt-5.4-mini'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Account sign-in'));
      terminal.input(route === 'account' ? '\x1b[B\r' : '\x1b[B\x1b[B\r');
      await vi.waitFor(() => expect(frame()).toContain(route === 'account' ? 'Confirm account sign-in' : 'API key'));
      if (route === 'account') terminal.input('\x1b[B\r');
      else { terminal.input('synthetic-role-host-key'); await vi.waitFor(() => expect(frame()).toContain('••••')); terminal.input('\r'); }
      await vi.waitFor(() => expect(publication).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(host.busy).toBe(false));
      await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      if (unverified) expect(frame()).toContain('Configuration application outcome is unverified.');
      const messages = JSON.stringify(host.view.transcript.all());
      expect(messages).toContain(route === 'account' ? 'account-auth connected' : 'Connected provider openai.');
      expect(messages).not.toContain('Session model read-failed'); expect(messages).not.toContain('synthetic-role-host-');
      expect(fs.readFileSync(statePath, 'utf8')).toBe('{unreadable');
      const saved = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values, configBytes = fs.readFileSync(getUserRuntimeConfigPath());
      const connection = saved.providerConnections!.find(row => row.provider === 'openai')!;
      expect(connection).toMatchObject({ status: 'connected', autoSelect: false });
      if (route === 'configure') expect(connection.apiKey).toBe('synthetic-role-host-key');
      expect(saved.provider).toBe(before.provider); expect(saved.activeProviderConnectionId).toBe(before.activeProviderConnectionId);
      expect(saved.providerCredentials).toEqual(before.providerCredentials);
      expect(saved.providerConnections!.find(row => row.id === 'default')).toEqual(before.providerConnections![0]);
      fs.writeFileSync(statePath, stateBytes); expect(readSessionModel(session.id)).toEqual(original);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose model'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('gpt-5.4-mini'); await vi.waitFor(() => expect(frame()).toContain('▸ gpt-5.4-mini'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      expect(readSessionModel(session.id)).toEqual({ ...original, roles: { ...original.roles,
        advisor: { connectionId: connection.id, provider: 'openai', model: 'gpt-5.4-mini', thinkingEffort: 'low' } } });
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('Settings — current session — from user configuration'));
      expect(frame()).toContain('Session /');
      expect(frame()).toContain('▸ Models and roles'); expect(frame()).toContain('advisor uses');
      expect(host.view.editor.getText()).toBe('held role sign-in draft\nkept through failure');
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(configBytes);
      expect(resolveProviderCredential({ runtimeConfig: context.runtimeConfig }).model).toBe('default-model');
      expect(host.view.editor.getHistory()).not.toContain('synthetic-role-host-key');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); publication.mockRestore(); dispatch.mockRestore(); network.mockRestore(); __setOpenAIProviderAuthLoginForTest(undefined);
      vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['choose', 'default', 'thinking', 'effort'] as const).map(action => ({ kind, action }))))(
  'retains refused role $action navigation through the $kind settings host', async ({ kind, action }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/role-refusal-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, activeProviderConnectionId: 'ready', providerConnections: [{
      id: 'ready', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-ready', model: 'shared',
      status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }] }]);
    const manager = new SessionManager(), session = manager.createNew(root);
    const target = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const };
    modelState.writeSessionModel(session.id, { ...target, roles: { advisor: target, summary: target, subagent: target } },
      modelState.readSessionModelEdit(session.id));
    const before = modelState.readSessionModelEdit(session.id), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const accepted = context.configuration.current, dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held role refusal draft\nkept through cancellation');
      terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('Advisor'); await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose model'));
      if (action === 'effort') {
        terminal.input('\x1b[B\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('Role thinking effort'));
      }
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); writeUserRuntimeConfigFile({ ...edit.value, topP: 0.8 }, edit);
      const changed = fs.readFileSync(getUserRuntimeConfigPath());
      terminal.input(action === 'effort' ? '\x1b[A\x1b[A\r' : action === 'thinking' ? '\x1b[B\x1b[B\r' : action === 'default' ? '\x1b[B\r' : '\r');
      await vi.waitFor(() => expect(frame()).toContain(action === 'effort' ? '▸ Choose model' : '▸ Advisor'));
      expect(frame()).toContain('Model selection expired'); expect(modelState.readSessionModelEdit(session.id)).toEqual(before);
      expect(context.configuration.current).toBe(accepted); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed);
      if (action !== 'effort') { terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose model')); }
      if (action === 'effort') {
        terminal.input('\x1b[B\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('▸ high'));
        terminal.input('\x1b[A\x1b[A\r'); await vi.waitFor(() => expect(frame()).toContain('advisor uses'));
        expect(readSessionModel(session.id)).toEqual({ ...before.selection!, roles: { ...before.selection!.roles,
          advisor: { ...target, thinkingEffort: 'low' } } });
        terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      } else {
        terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('advisor follows the default'));
        await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
        expect(readSessionModel(session.id)).toEqual({ ...before.selection!, roles: { summary: target, subagent: target } });
      }
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      expect(host.view.editor.getText()).toBe('held role refusal draft\nkept through cancellation');
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed); expect(context.runtimeConfig.topP).toBe(0.8);
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each(['regular', 'fullscreen'] as const)(
  'renews a refused role browser transaction before an explicit assignment through the %s host', async kind => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/role-detail-retry-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, activeProviderConnectionId: 'ready', providerConnections: [{
      id: 'ready', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-ready', model: 'shared',
      baseUrl: 'https://ready.invalid/v1', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }, { id: 'other', reasoning: true }] },
      { id: 'relay', runtime: 'openai', baseUrl: 'https://unconfigured.invalid/v1', models: [{ id: 'inspect-me' }] }]);
    const manager = new SessionManager(), session = manager.createNew(root);
    const target = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'low' as const };
    modelState.writeSessionModel(session.id, { ...target, thinkingEffort: 'high', roles: { advisor: target, summary: target, subagent: target } },
      modelState.readSessionModelEdit(session.id));
    const before = modelState.readSessionModelEdit(session.id), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held role retry draft\nkept through admission');
      terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('Advisor'); await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Choose model'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('inspect-me'); await vi.waitFor(() => expect(frame()).toContain('▸ inspect-me'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); writeUserRuntimeConfigFile({ ...edit.value, topP: 0.8 }, edit);
      const changed = fs.readFileSync(getUserRuntimeConfigPath());
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('▸ inspect-me'));
      expect(frame()).toContain('Model selection expired'); expect(modelState.readSessionModelEdit(session.id)).toEqual(before);
      terminal.input('other'); await vi.waitFor(() => expect(frame()).toContain('▸ other'));
      expect(context.runtimeConfig.topP).toBe(0.7);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('advisor uses'));
      await vi.waitFor(() => expect(frame()).toContain('▸ Advisor'));
      expect(readSessionModel(session.id)).toEqual({ ...before.selection!, roles: { ...before.selection!.roles,
        advisor: { ...target, model: 'other' } } });
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed); expect(context.runtimeConfig.topP).toBe(0.8);
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      expect(host.view.editor.getText()).toBe('held role retry draft\nkept through admission');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['refusal', 'pre-close', 'pre-replace', 'post-close', 'post-replace'] as const).map(ending => ({ kind, ending }))))(
  'retains session thinking truth after $ending in the $kind settings host', async ({ kind, ending }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/thinking-ownership-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, activeProviderConnectionId: 'ready', providerConnections: [{
      id: 'ready', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-ready', model: 'shared',
      status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'openai', models: [{ id: 'shared', reasoning: true }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const target = { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'high' as const,
      roles: { advisor: { connectionId: 'ready', provider: 'openai' as const, model: 'shared', thinkingEffort: 'medium' as const } } };
    modelState.writeSessionModel(session.id, target, modelState.readSessionModelEdit(session.id));
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const selection = modelState.readSessionModelEdit(session.id), accepted = context.configuration.current, before = fs.readFileSync(getUserRuntimeConfigPath());
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    let switchHook: { mockRestore(): void } | undefined;
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held session thinking draft\nkept through return');
      terminal.input('Thinking effort'); await vi.waitFor(() => expect(frame()).toContain('▸ Thinking effort'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ high'));
      if (ending === 'refusal') {
        const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); writeUserRuntimeConfigFile({ ...edit.value, topP: 0.8 }, edit);
        const changed = fs.readFileSync(getUserRuntimeConfigPath());
        terminal.input('\x1b[A\x1b[A\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Thinking effort'));
        expect(frame()).toContain('Model selection expired'); expect(modelState.readSessionModelEdit(session.id)).toEqual(selection);
        expect(context.configuration.current).toBe(accepted); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed);
        terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ high'));
        terminal.input('\x1b[A\x1b[A\r'); await vi.waitFor(() => expect(frame()).toContain('Reasoning effort: low'));
        await vi.waitFor(() => expect(frame()).toContain('▸ Thinking effort'));
        expect(readSessionModel(session.id)).toEqual({ ...target, thinkingEffort: 'low' });
        expect(context.runtimeConfig.topP).toBe(0.8); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed);
      } else {
        const eventName = ending.startsWith('pre-') ? 'PreModelSwitch' : 'PostModelSwitch';
        const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
          if (event.eventName === eventName) {
            if (ending.endsWith('close')) host.overlay.close();
            else host.overlay.open({ title: 'Replacement panel', form: 'panel', empty: 'Replacement remains current',
              load: async () => [], apply: async () => undefined });
          }
          return undefined;
        });
        switchHook = hook; terminal.input('\x1b[A\x1b[A\r');
        await vi.waitFor(() => expect(hook).toHaveBeenCalledWith(expect.objectContaining({ eventName })));
        await vi.waitFor(() => expect(frame()).toMatch(/Reasoning effort: low|Model switch blocked:/));
        if (eventName === 'PreModelSwitch') {
          expect(JSON.stringify(modelState.readSessionModelEdit(session.id))).toBe(JSON.stringify(selection));
          expect(context.configuration.current).toBe(accepted); expect(frame()).toContain('Model switch blocked');
        } else {
          expect(readSessionModel(session.id)).toEqual({ ...target, thinkingEffort: 'low' });
          expect(frame()).toContain('Reasoning effort: low');
        }
        expect(host.overlay.active).toBe(ending.endsWith('replace'));
        if (ending.endsWith('replace')) expect(frame()).toContain('Replacement remains current');
        expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
      }
      expect(host.view.editor.getText()).toBe('held session thinking draft\nkept through return');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      switchHook?.mockRestore(); mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['model', 'settings'] as const).flatMap(entry =>
    (['close', 'replace', 'reopen'] as const).map(ending => ({ kind, entry, ending })))))(
  'fences ready model activation after hook $ending through the $kind $entry Enter host', async ({ kind, entry, ending }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true }); const root = fs.mkdtempSync('/tmp/cheers-test/ready-model-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, activeProviderConnectionId: 'main',
      providerConnections: [{ id: 'main', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-ready', model: 'current-model',
        status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' }] }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'openai', models: [{ id: 'current-model', reasoning: true }, { id: 'ready-model', reasoning: true }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const target = { connectionId: 'main', provider: 'openai' as const, model: 'current-model', thinkingEffort: 'high' as const };
    modelState.writeSessionModel(session.id, { ...target, roles: { advisor: target, summary: target } }, modelState.readSessionModelEdit(session.id));
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const before = JSON.stringify(modelState.readSessionModelEdit(session.id)), accepted = context.configuration.current;
    const config = fs.readFileSync(getUserRuntimeConfigPath()), dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
      if (event.eventName === 'PreModelSwitch') {
        if (ending === 'close') host.overlay.close();
        else if (ending === 'reopen') await held;
        else host.overlay.open({ title: 'Replacement panel', empty: 'Replacement remains current', load: async () => [], apply: async () => undefined });
      }
      return undefined;
    });
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input(`/${entry}\r`); await vi.waitFor(() => expect(frame()).toContain(entry === 'model' ? 'All models' : 'Settings'));
      host.view.editor.setText('held ready model draft\nkept through cancellation');
      if (entry === 'settings') {
        terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
        terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      }
      terminal.input('ready-model'); await vi.waitFor(() => expect(frame()).toContain('▸ ready-model'));
      terminal.input('\r'); await vi.waitFor(() => expect(hook).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'PreModelSwitch' })));
      if (ending === 'reopen') {
        host.view.editor.setText('/settings'); terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
        release();
      }
      await vi.waitFor(() => expect(host.view.transcript.all().map(block => block.text).join('\n')).toMatch(/Model switch blocked:|Model switched to ready-model/));
      expect(JSON.stringify(modelState.readSessionModelEdit(session.id))).toBe(before);
      expect(context.configuration.current).toBe(accepted); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(config);
      expect(host.overlay.active).toBe(ending !== 'close'); if (ending === 'replace') expect(frame()).toContain('Replacement remains current');
      if (ending === 'reopen') expect(frame()).toContain('Settings');
      expect(host.view.editor.getText()).toBe(ending === 'reopen' ? '' : 'held ready model draft\nkept through cancellation');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally { release(); mode.stop(); hook.mockRestore(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true }); }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  ([{ entry: 'model', ending: 'refusal' }, { entry: 'settings', ending: 'refusal' },
    { entry: 'settings', ending: 'close' }, { entry: 'settings', ending: 'replace' },
    { entry: 'model', ending: 'post-workspace' }, { entry: 'settings', ending: 'post-workspace' },
    { entry: 'model', ending: 'post-ready' }, { entry: 'settings', ending: 'post-ready' }] as const).map(path => ({ kind, ...path }))))(
  'retains effort recovery navigation after $ending in the $kind $entry host', async ({ kind, entry, ending }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/model-effort-refusal-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, activeProviderConnectionId: 'main',
      providerConnections: ['main', 'relay'].map(id => ({ id, provider: 'openai' as const, authType: 'api-key' as const,
        apiKey: `synthetic-${id}`, model: id === 'main' ? 'default-model' : 'blocked-model', status: 'connected' as const,
        ...(id === 'relay' ? { baseUrl: 'https://relay.invalid/v1' } : {}), createdAt: '2026-01-01', updatedAt: '2026-01-01' })) },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'openai', models: [{ id: 'default-model', reasoning: true }] },
      { id: 'relay', runtime: 'openai', baseUrl: 'https://relay.invalid/v1', models: [{ id: 'blocked-model', reasoning: true,
        thinkingLevelMap: { high: null } }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const target = { connectionScope: 'session' as const, connectionId: 'main', provider: 'openai' as const, model: 'default-model', thinkingEffort: 'high' as const,
      roles: { advisor: { connectionId: 'main', provider: 'openai' as const, model: 'default-model', thinkingEffort: 'low' as const } } };
    modelState.writeSessionModel(session.id, target, modelState.readSessionModelEdit(session.id));
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; busy: boolean; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const selection = modelState.readSessionModelEdit(session.id), accepted = context.configuration.current, before = fs.readFileSync(getUserRuntimeConfigPath());
    let switchHook: { mockRestore(): void } | undefined;
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input(`/${entry}\r`); await vi.waitFor(() => expect(frame()).toContain(entry === 'settings' ? 'Settings' : 'All models'));
      host.view.editor.setText('held effort recovery draft\nkept through refusal');
      if (entry === 'settings') {
        terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
        terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      }
      terminal.input('blocked-model'); await vi.waitFor(() => expect(frame()).toContain('▸ blocked-model'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('▸ high'));
      if (ending === 'post-workspace' || ending === 'post-ready') {
        const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
          if (event.eventName === 'PostModelSwitch' && ending === 'post-workspace') context.workspaceIssue = 'Workspace is unavailable.';
          return undefined;
        });
        switchHook = hook; terminal.input('\x1b[A\r');
        await vi.waitFor(() => expect(hook).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'PostModelSwitch' })));
        await vi.waitFor(() => expect(host.view.transcript.all().map(block => block.text).join('\n')).toContain('Model switched to blocked-model.'));
        if (ending === 'post-workspace') expect(host.overlay.active).toBe(false);
        else await vi.waitFor(() => expect(frame()).toContain(entry === 'settings' ? '▸ Models and roles' : '▸ blocked-model'));
        expect(readSessionModel(session.id)).toEqual({ ...target, connectionId: 'relay', model: 'blocked-model', thinkingEffort: 'medium' });
        expect(resolveProviderCredential({ runtimeConfig: context.runtimeConfig })).toMatchObject({
          model: 'blocked-model', thinkingEffort: 'medium', credential: { connectionId: 'relay' } });
        expect(context.runtimeConfig.topP).toBe(0.7);
        expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
        expect(host.view.editor.getText()).toBe('held effort recovery draft\nkept through refusal');
        expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
        return;
      }
      if (ending !== 'refusal') {
        const hook = vi.spyOn(defaultHookDispatcher, 'dispatch').mockImplementation(async event => {
          if (event.eventName === 'PreModelSwitch') {
            if (ending === 'close') host.overlay.close();
            else host.overlay.open({ title: 'Replacement panel', form: 'panel', empty: 'Replacement remains current',
              load: async () => [], apply: async () => undefined });
          }
          return undefined;
        });
        switchHook = hook; terminal.input('\x1b[A\r');
        await vi.waitFor(() => expect(hook).toHaveBeenCalledWith(expect.objectContaining({ eventName: 'PreModelSwitch' })));
        await vi.waitFor(() => expect(host.busy).toBe(false));
        expect(JSON.stringify(modelState.readSessionModelEdit(session.id))).toBe(JSON.stringify(selection));
        expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
        expect(context.configuration.current).toBe(accepted); expect(host.overlay.active).toBe(ending === 'replace');
        if (ending === 'replace') expect(frame()).toContain('Replacement remains current');
        expect(host.view.editor.getText()).toBe('held effort recovery draft\nkept through refusal');
        expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
        return;
      }
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath()); writeUserRuntimeConfigFile({ ...edit.value, topP: 0.8 }, edit);
      const changed = fs.readFileSync(getUserRuntimeConfigPath());
      terminal.input('\x1b[A\r');
      await vi.waitFor(() => expect(frame()).toContain('▸ blocked-model')); expect(frame()).toContain('Model selection expired');
      expect(modelState.readSessionModelEdit(session.id)).toEqual(selection); expect(context.configuration.current).toBe(accepted);
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed); expect(context.runtimeConfig.topP).toBe(0.7);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('▸ high'));
      terminal.input('\x1b[A\r'); await vi.waitFor(() => expect(frame()).toContain('Model switched to blocked-model'));
      expect(readSessionModel(session.id)).toEqual({ ...target, connectionId: 'relay', model: 'blocked-model', thinkingEffort: 'medium' });
      if (entry === 'settings') expect(frame()).toContain('▸ Models and roles');
      else expect(frame()).toContain('▸ blocked-model');
      expect(host.view.editor.getText()).toBe('held effort recovery draft\nkept through refusal');
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed); expect(context.runtimeConfig.topP).toBe(0.8);
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      switchHook?.mockRestore(); mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['model', 'settings'] as const).map(entry => ({ kind, entry }))))(
  'retains model navigation after accepted detail refusal in the $kind $entry host', async ({ kind, entry }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/model-detail-refusal-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, providerConnections: [] },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://fixture.invalid/v1', models: [{ id: 'review-me' }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; busy: boolean; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const selection = modelState.readSessionModelEdit(session.id), accepted = context.configuration.current;
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input(`/${entry}\r`); await vi.waitFor(() => expect(frame()).toContain(entry === 'settings' ? 'Settings' : 'All models'));
      host.view.editor.setText('held refusal draft\nkept through revalidation');
      if (entry === 'settings') {
        terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
        terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      }
      terminal.input('review-me'); await vi.waitFor(() => expect(frame()).toContain('▸ review-me'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      const edit = readRuntimeConfigEditAt(getUserRuntimeConfigPath());
      writeUserRuntimeConfigFile({ ...edit.value, topP: 0.8 }, edit);
      const changed = fs.readFileSync(getUserRuntimeConfigPath());
      terminal.input('\x1b[B\r');
      await vi.waitFor(() => expect(frame()).toContain('Model selection expired'));
      await vi.waitFor(() => expect(frame()).toContain('▸ review-me')); expect(host.busy).toBe(false);
      expect(context.configuration.current).toBe(accepted); expect(context.runtimeConfig.topP).toBe(0.7);
      expect(frame()).not.toContain('API key');
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('API key'));
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ review-me'));
      terminal.input('\x1b');
      if (entry === 'settings') await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(changed); expect(modelState.readSessionModelEdit(session.id)).toEqual(selection);
      expect(context.configuration.current).toBe(accepted); expect(host.view.editor.getText()).toBe('held refusal draft\nkept through revalidation');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['refresh', 'admission'] as const).map(failure => ({ kind, failure }))))(
  'does not reopen models after a detail $failure failure invalidates its browser in the $kind settings host', async ({ kind, failure }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/model-return-owner-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, providerConnections: [] },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://fixture.invalid/v1', models: [{ id: 'verify-me' }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const before = fs.readFileSync(getUserRuntimeConfigPath()), selection = modelState.readSessionModelEdit(session.id), accepted = context.configuration.current;
    const construct = modelDetails.catalogueDetailSource;
    let armed = false;
    const fail = () => { armed = false; context.workspaceIssue = 'Workspace is unavailable.'; throw new Error('private return diagnostic'); };
    const source = vi.spyOn(modelDetails, 'catalogueDetailSource').mockImplementation(options => {
      const original = construct(options);
      return { ...original,
        async refresh() { if (armed && failure === 'refresh') fail(); return original.refresh(); },
        admit(view) { if (armed && failure === 'admission') fail(); return original.admit(view); },
      };
    });
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held browser owner draft\nkept through failure');
      terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('verify-me'); await vi.waitFor(() => expect(frame()).toContain('▸ verify-me'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      armed = true; terminal.input('\x1b[B\r');
      await vi.waitFor(() => expect(frame()).toContain(failure === 'refresh' ? 'Model catalogue could not be refreshed' : 'Model details could not be verified'));
      expect(host.overlay.active).toBe(false); expect(frame()).not.toContain('private return diagnostic');
      expect(context.configuration.current).toBe(accepted); expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before);
      expect(modelState.readSessionModelEdit(session.id)).toEqual(selection);
      expect(host.view.editor.getText()).toBe('held browser owner draft\nkept through failure');
      context.workspaceIssue = undefined;
      host.view.editor.setText('/settings'); terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('verify-me'); await vi.waitFor(() => expect(frame()).toContain('▸ verify-me'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('API key'));
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ verify-me'));
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(modelState.readSessionModelEdit(session.id)).toEqual(selection);
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      source.mockRestore(); mode.stop(); dispatch.mockRestore(); network.mockRestore();
      vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['model', 'settings'] as const).map(entry => ({ kind, entry }))))(
  'retains model navigation after accepted detail admission failure in the $kind $entry host', async ({ kind, entry }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/model-detail-admission-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, providerConnections: [] },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://fixture.invalid/v1', models: [{ id: 'verify-me' }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; busy: boolean; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const before = fs.readFileSync(getUserRuntimeConfigPath()), selection = modelState.readSessionModelEdit(session.id), accepted = context.configuration.current;
    const read = vi.spyOn(context.configuration, 'current', 'get'), construct = modelDetails.modelDetailsPicker;
    let fault = true;
    const detail = vi.spyOn(modelDetails, 'modelDetailsPicker').mockImplementation(source => construct({ ...source,
      admit(view) {
        if (fault) { fault = false; read.mockImplementationOnce(() => { throw new Error('private admission diagnostic'); }); }
        return source.admit(view);
      } }));
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input(`/${entry}\r`); await vi.waitFor(() => expect(frame()).toContain(entry === 'settings' ? 'Settings' : 'All models'));
      host.view.editor.setText('held admission draft\nkept through read failure');
      if (entry === 'settings') {
        terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
        terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      }
      terminal.input('verify-me'); await vi.waitFor(() => expect(frame()).toContain('▸ verify-me'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B\r');
      await vi.waitFor(() => expect(frame()).toContain('Model details could not be verified'));
      await vi.waitFor(() => expect(frame()).toContain('▸ verify-me')); expect(host.busy).toBe(false);
      expect(frame()).not.toContain('private admission diagnostic'); expect(context.configuration.current).toBe(accepted);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('API key'));
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ verify-me'));
      terminal.input('\x1b');
      if (entry === 'settings') await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(modelState.readSessionModelEdit(session.id)).toEqual(selection);
      expect(host.view.editor.getText()).toBe('held admission draft\nkept through read failure');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      detail.mockRestore(); read.mockRestore(); mode.stop(); dispatch.mockRestore(); network.mockRestore();
      vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['model', 'settings'] as const).map(entry => ({ kind, entry }))))(
  'retains model navigation after accepted detail refresh failure in the $kind $entry host', async ({ kind, entry }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/model-detail-failure-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, providerConnections: [] },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'relay', runtime: 'openai', baseUrl: 'https://fixture.invalid/v1', models: [{ id: 'inspect-me' }] }]);
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build({ tuiMode: kind });
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    const host = mode as unknown as { view: InteractiveView; busy: boolean; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const before = fs.readFileSync(getUserRuntimeConfigPath()), selection = modelState.readSessionModelEdit(session.id), accepted = context.configuration.current;
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    const read = vi.spyOn(context.configuration, 'current', 'get');
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input(`/${entry}\r`); await vi.waitFor(() => expect(frame()).toContain(entry === 'settings' ? 'Settings' : 'All models'));
      host.view.editor.setText('held model inspection draft\nkept through refresh failure');
      if (entry === 'settings') {
        terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
        terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      }
      terminal.input('inspect-me'); await vi.waitFor(() => expect(frame()).toContain('▸ inspect-me'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B'); await vi.waitFor(() => expect(frame()).toContain('▸ Configure connection'));
      read.mockImplementationOnce(() => { throw new Error('private refresh diagnostic'); });
      terminal.input('\r');
      await vi.waitFor(() => expect(frame()).toContain('All models'));
      await vi.waitFor(() => expect(host.busy).toBe(false));
      expect(frame()).toContain('Model catalogue could not be refreshed'); expect(frame()).toContain('▸ inspect-me');
      expect(frame()).not.toContain('private refresh diagnostic'); expect(context.configuration.current).toBe(accepted);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Back to models'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('API key'));
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain('▸ inspect-me'));
      terminal.input('\x1b');
      if (entry === 'settings') await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(before); expect(modelState.readSessionModelEdit(session.id)).toEqual(selection);
      expect(host.view.editor.getText()).toBe('held model inspection draft\nkept through refresh failure');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      read.mockRestore(); mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
  (['user', 'project'] as const).flatMap(scope =>
    ['"read"', 'read\nwrite'].map(item => ({ kind, scope, item })))))(
  'preserves a literal list through untouched Enter and Apply in the $kind $scope host ($item)', async ({ kind, scope, item }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/settings-list-host-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, topP: 0.7, ...(scope === 'user' ? { allowedTools: [item] } : {}) },
      readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    const project = getProjectConfigPath(root); fs.mkdirSync(path.dirname(project), { recursive: true });
    fs.writeFileSync(project, `// project list\n${JSON.stringify({ schemaVersion: 1, topP: 0.6, ...(scope === 'project' ? { allowedTools: [item] } : {}) })}`);
    const target = scope === 'user' ? getUserRuntimeConfigPath() : project, other = scope === 'user' ? project : getUserRuntimeConfigPath();
    const bytes = fs.readFileSync(target), otherBytes = fs.readFileSync(other), before = readRuntimeConfigEditAt(target).values;
    const manager = new SessionManager(), session = manager.createNew(root), { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; busy: boolean; options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(root) });
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const tools = ['read', 'write'], visible = filterVisibleToolNames(tools, context.runtimeConfig);
    expect(visible).toEqual([]);
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      host.view.editor.setText('held list draft\nkept during settings');
      terminal.input('allowedTools'); await vi.waitFor(() => expect(frame()).toContain(`▸ ${scope === 'user' ? '● ' : ''}Allowed tools`));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Edit value'));
      if (scope === 'project') {
        terminal.input('\x1b[B\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('Choose save scope'));
        terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('save to project'));
      }
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Edit Allowed tools'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Apply'));
      expect(fs.readFileSync(target)).toEqual(bytes); expect(filterVisibleToolNames(tools, context.runtimeConfig)).toEqual(visible);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain(`Settings — ${scope} configuration`));
      await vi.waitFor(() => expect(host.busy).toBe(false));
      expect(frame()).toContain('▸ ● Allowed tools'); expect(frame()).toContain(`Saved to your ${scope} configuration`);
      expect(readRuntimeConfigEditAt(target).values).toEqual(before); expect(fs.readFileSync(other)).toEqual(otherBytes);
      expect(context.runtimeConfig.allowedTools).toEqual([item]);
      expect(filterVisibleToolNames(tools, context.runtimeConfig)).toEqual(visible);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Edit value'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Edit Allowed tools'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('▸ Apply'));
      terminal.input('\x1b'); await vi.waitFor(() => expect(frame()).toContain(`Settings — ${scope} configuration`));
      expect(readRuntimeConfigEditAt(target).values).toEqual(before);
      expect(host.view.editor.getText()).toBe('held list draft\nkept during settings');
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

it('withdraws the prompt estimate when context selection changes', async () => {
  vi.useFakeTimers();
  const preview = {
    estimate: { tokens: 100, source: 'estimated' as const, identity: { provider: 'openai', model: 'fixture' }, method: 'characters/3.5' as const },
    verify: vi.fn(),
  };
  const load = vi.spyOn(contextPreview, 'previewContext').mockResolvedValue(preview);
  const { mode } = build();
  const host = mode as unknown as {
    promptContext: { start(): void; update(): void; read(): { tokens?: number; source: string }; stop(): void };
    options: { runtimeContext: ShellRuntimeContext };
  };
  try {
    const first = { id: 'first', role: 'tool' as const, content: 'x'.repeat(4096) };
    host.options.runtimeContext.session = { ...host.options.runtimeContext.session, turns: [first] };
    host.promptContext.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(host.promptContext.read()).toEqual({ tokens: 100, source: 'estimated' });
    host.options.runtimeContext.session = { ...host.options.runtimeContext.session,
      contextSelection: { version: 1, revision: 1, entries: [] } };
    host.promptContext.update();
    expect(host.promptContext.read()).toEqual({ tokens: 100, source: 'estimated' });
    host.options.runtimeContext.session = { ...host.options.runtimeContext.session,
      contextSelection: { version: 1, revision: 2, entries: [{ id: first.id, hash: contextMessageHash(first), modes: ['elide'] }] } };
    host.promptContext.update();
    expect(host.promptContext.read()).toEqual({ source: 'stale' });
  } finally {
    host.promptContext.stop();
    mode.stop();
    load.mockRestore();
    vi.useRealTimers();
  }
});

it.each(['regular', 'fullscreen'] as const)(
  'keeps the completed request measurement visible after the %s draft preview expires',
  async tuiMode => {
    vi.useFakeTimers();
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/status-measured-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const sessionId = `status-measured-${tuiMode}`;
    resetSessionUsage(sessionId);
    const preview = {
      estimate: { tokens: 700, source: 'estimated' as const, identity: { provider: 'openai', model: 'fixture' },
        method: 'characters/3.5' as const },
      verify: vi.fn(), verifyContent: vi.fn(async () => {}),
      suspend: vi.fn(), resume: vi.fn(), invalidate: vi.fn(), dispose: vi.fn(),
    };
    const load = vi.spyOn(contextPreview, 'previewContext').mockResolvedValue(preview);
    const { mode, terminal } = build({ tuiMode });
    const host = mode as unknown as {
      busy: boolean;
      promptContext: { read(): { tokens?: number; source: string } };
      view: InteractiveView & { context: { facts(): { contextUsed?: number; contextSource?: string } } };
      options: { runtimeContext: ShellRuntimeContext };
    };
    const context = withConfiguration({
      cwd: root,
      projectRoot: root,
      session: { id: sessionId, turns: [] },
      gitContext: { branch: 'main' },
      runtimeConfig: { provider: 'openai', providerCredentials: { openai: { model: 'fixture' } },
        contextWindow: 64_000, configDiagnostics: [], tuiMode, tui: { statusItems: ['context'] } },
    } as unknown as ShellRuntimeContext);
    host.options.runtimeContext = context;
    const identity = { provider: 'openai', model: 'fixture', endpoint: 'openai-compatible',
      schemaDigest: 'a'.repeat(64), systemDigest: 'b'.repeat(64), historyDigest: 'c'.repeat(64) };
    const route = vi.spyOn(commandRouter, 'routeInteractiveCommand').mockImplementation(async () => {
      context.promptIdentity = { schemaDigest: identity.schemaDigest, systemDigest: identity.systemDigest,
        historyDigest: identity.historyDigest };
      recordSessionUsage(sessionId, { promptTokens: 568, promptMessageCount: 1, promptIdentity: identity,
        attribution: captureUsageAttribution({ provider: 'openai', model: 'fixture', baseUrl: 'https://api.openai.com/v1' }) });
      return { turnNumber: 1 };
    });
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      terminal.input('measure\r');
      await vi.waitFor(() => expect(route).toHaveBeenCalledTimes(1));
      await vi.waitFor(() => expect(host.busy).toBe(false));
      await vi.advanceTimersByTimeAsync(500);
      expect(load).toHaveBeenCalled();
      expect(host.promptContext.read()).toEqual({ tokens: 700, source: 'estimated' });
      expect(frame()).toContain('~700/');

      vi.setSystemTime(Date.now() + 20_001);
      expect(host.promptContext.read()).toEqual({ source: 'stale' });
      expect(host.view.context.facts()).toMatchObject({ contextUsed: 568, contextSource: 'measured' });
      expect(frame()).toContain('568/');
      expect(frame()).not.toContain('? stale');
    } finally {
      mode.stop(); route.mockRestore(); load.mockRestore(); resetSessionUsage(sessionId);
      vi.useRealTimers(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  },
);

it('keeps a published preview reservation while a user submission is busy', async () => {
  vi.useFakeTimers();
  const invalidate = vi.fn();
  const preview = {
    estimate: { tokens: 100, source: 'estimated' as const, identity: { provider: 'openai', model: 'fixture' }, method: 'characters/3.5' as const },
    verify: vi.fn(), invalidate,
  };
  const load = vi.spyOn(contextPreview, 'previewContext').mockResolvedValue(preview);
  let finish!: () => void;
  const route = vi.spyOn(commandRouter, 'routeInteractiveCommand').mockImplementation(() => new Promise(resolve => {
    finish = () => resolve({ turnNumber: 0 });
  }));
  const { mode } = build();
  const host = mode as unknown as {
    busy: boolean;
    promptContext: { start(): void; update(): void; suspend(): void; resume(): void; read(): { tokens?: number }; stop(): void };
    options: { runtimeContext: ShellRuntimeContext };
    run(text: string): Promise<void>;
  };
  try {
    host.options.runtimeContext.session = { ...host.options.runtimeContext.session, turns: [] };
    host.promptContext.start();
    await vi.advanceTimersByTimeAsync(150);
    expect(load).toHaveBeenCalledTimes(1);
    expect(host.promptContext.read().tokens).toBe(100);
    const running = host.run('/review');
    expect(route).toHaveBeenCalledTimes(1);
    expect(host.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(500);
    expect(invalidate).not.toHaveBeenCalled();
    finish();
    await running;
    expect(invalidate).not.toHaveBeenCalled();
  } finally {
    host.promptContext.stop(); mode.stop(); route.mockRestore(); load.mockRestore(); vi.useRealTimers();
  }
});

it('delivers all composed instructions and images through the real interactive route once', async () => {
  fs.mkdirSync('/tmp/cheers-test', { recursive: true }); const root = fs.mkdtempSync('/tmp/cheers-test/interactive-methods-');
  const skillPaths = ['a', 'b'].map(name => {
    const file = path.join(root, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file));
    fs.writeFileSync(file, `---\nname: ${name}\ndescription: method\n---\nBODY ${name}`); return file;
  });
  const { mode } = build(); const host = mode as unknown as { run(text: string, attachments?: unknown): Promise<void>;
    lastPrompt?: string; lastAttachments?: unknown;
    options: { runtimeContext: ShellRuntimeContext } };
  const context = host.options.runtimeContext;
  Object.assign(context, { cwd: root, projectRoot: root, skillOptions: { skillPaths, noSkills: true } });
  const binding = configurationBinding(context); context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
  const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
  const attachments = { images: [{ type: 'image' as const, data: 'AA==', mimeType: 'image/png' }] };
  const source = '/skill:a\n/skill:b  正文  ';
  try {
    await host.run(source, attachments);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch.mock.calls[0]?.[0]).toMatchObject({ effectivePrompt: expect.stringContaining('BODY a'), attachments,
      promptMetadata: { originalInput: source, skills: [{ name: 'a' }, { name: 'b' }] } });
    expect(dispatch.mock.calls[0]?.[0].effectivePrompt).toContain('BODY b');
    expect(host.lastPrompt).toBe(source); expect(host.lastAttachments).toEqual(attachments);
    await host.run('local failure /skill:missing', attachments);
    expect(dispatch).toHaveBeenCalledTimes(1); expect(host.lastPrompt).toBe(source);
  } finally { dispatch.mockRestore(); mode.stop(); fs.rmSync(root, { recursive: true, force: true }); }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind => (['add ', ''] as const).flatMap(prefix =>
  (['dispatch', 'missing', 'oversize', 'interrupt'] as const).flatMap(ending =>
    (ending === 'interrupt' ? [false] : [false, true]).map(reroute => ({ kind, prefix, ending, reroute }))))))(
  'keeps queue $prefix images and composed source through $ending with reroute=$reroute in the $kind Enter host', async ({ kind, prefix, ending, reroute }) => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true }); const root = fs.mkdtempSync('/tmp/cheers-test/queued-method-images-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const skillPaths = ['a', 'b'].map(name => {
      const file = path.join(root, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(file, `---\nname: ${name}\ndescription: method\n---\nBODY ${name}`); return file;
    });
    const second = fs.readFileSync(skillPaths[1]!), manager = new SessionManager(), session = manager.createNew(root);
    const { mode, terminal } = build({ tuiMode: kind });
    const host = mode as unknown as { run(text: string): Promise<void>; busy: boolean; interrupt(): Promise<void>;
      queue: SubmissionQueue; view: InteractiveView; lastPrompt?: string; lastAttachments?: unknown;
      state: { pastes: { holdImage(image: unknown): string; expand(text: string): string; imagesIn(text: string): readonly unknown[] } };
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager; sessionRuntime: ShellSessionRuntime } };
    const context = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root, targetPathBase: root,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session,
      runtimeConfig: { ...getRuntimeConfig(root), tuiMode: kind } });
    context.skillOptions = { skillPaths, noSkills: true };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    let release!: () => void; const held = new Promise<void>(resolve => { release = resolve; });
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockImplementation(async input => {
      if (input.effectivePrompt === 'FOREGROUND') await held;
    });
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const images = [{ type: 'image' as const, data: 'AA==', mimeType: 'image/png' },
      { type: 'image' as const, data: 'AQ==', mimeType: 'image/png' }];
    const markers = images.map(image => host.state.pastes.holdImage(image)).join(' ');
    const draft = `/queue ${prefix}${reroute ? '/queue add ' : ''}比较 ${markers} /skill:a\n/skill:b  `;
    const source = '比较   /skill:a\n/skill:b  ';
    const running = vi.spyOn(host, 'run');
    const settle = async () => {
      // A settled turn may start its queued successor before returning.
      for (let index = 0; index < running.mock.results.length; index++) await running.mock.results[index]!.value;
    };
    let foreground: Promise<void> | undefined;
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      foreground = host.run('FOREGROUND'); await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
      expect(host.busy).toBe(true); host.view.editor.setText(draft); terminal.input('\r');
      await vi.waitFor(() => expect(host.view.transcript.all().some(block => block.text?.includes('Queued '))).toBe(true));
      expect(host.queue.control.entries()).toEqual([{ id: expect.any(String), lane: 'pending', text: `${reroute ? '/queue add ' : ''}${source}` }]);
      expect(host.view.transcript.all().filter(block => block.kind === 'user').at(-1)).toMatchObject({ images });
      expect(host.view.editor.getText()).toBe(''); expect(dispatch).toHaveBeenCalledOnce();
      if (ending === 'missing') fs.unlinkSync(skillPaths[1]!);
      if (ending === 'oversize') fs.appendFileSync(skillPaths[1]!, 'x'.repeat(65536));
      if (ending === 'interrupt') {
        host.options.sessionRuntime.cancelAndWait = vi.fn(async () => { release(); });
        await host.interrupt();
      } else release();
      await foreground; await settle(); expect(host.busy).toBe(false);
      let submitted = source;
      if (ending !== 'dispatch') {
        expect(dispatch).toHaveBeenCalledOnce();
        const restored = host.view.editor.getText(); expect(restored.startsWith(source)).toBe(true);
        expect(host.state.pastes.imagesIn(restored)).toEqual(images);
        if (ending === 'missing' || ending === 'oversize') {
          expect(host.view.transcript.all().some(block => block.text?.includes(ending === 'missing' ? 'Unknown skill: b' : 'input budget'))).toBe(true);
          fs.writeFileSync(skillPaths[1]!, second);
        }
        submitted = host.state.pastes.expand(restored); terminal.input('\r');
        await settle(); expect(host.busy).toBe(false);
      }
      expect(dispatch).toHaveBeenCalledTimes(2); const sent = dispatch.mock.calls[1]![0];
      expect(sent).toMatchObject({ attachments: { images }, promptMetadata: {
        originalInput: submitted, skills: [{ name: 'a' }, { name: 'b' }],
      } });
      expect(sent.effectivePrompt.match(/BODY a/g)).toHaveLength(1); expect(sent.effectivePrompt.match(/BODY b/g)).toHaveLength(1);
      expect(host.lastPrompt).toBe(submitted); expect(host.lastAttachments).toEqual({ images });
      expect(host.queue.length).toBe(0); expect(host.queue.takeAttachments()).toBeUndefined(); expect(network).not.toHaveBeenCalled();
    } finally {
      release(); mode.stop();
      try { await foreground; await settle(); }
      finally {
        running.mockRestore(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  });

it.each((['regular', 'fullscreen'] as const).flatMap(kind => [true, false].map(valid => ({ kind, valid }))))(
  'submits quoted research options through actual $kind Enter with valid=$valid', async ({ kind, valid }) => {
    const setup = researchHarness();
    const skillPaths = ['a', 'b'].map(name => {
      const file = path.join(setup.root, name, 'SKILL.md'); fs.mkdirSync(path.dirname(file));
      fs.writeFileSync(file, `---\nname: ${name}\ndescription: method\n---\nBODY ${name}`); return file;
    });
    const { mode, terminal, renderer } = build({ tuiMode: kind });
    const host = mode as unknown as { view: InteractiveView; busy: boolean; run(text: string): Promise<void>;
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager; sessionRuntime: ShellSessionRuntime } };
    const context = createShellRuntimeContext({ cwd: setup.root, originalCwd: setup.root, projectRoot: setup.root,
      targetPathBase: setup.root, rootMode: 'direct', gitRoot: null,
      gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session: setup.session,
      runtimeConfig: { ...getRuntimeConfig(setup.root), tuiMode: kind } });
    context.skillOptions = { skillPaths, noSkills: true };
    host.options.runtimeContext = context; host.options.sessionManager = setup.manager;
    const provider = vi.fn();
    host.options.sessionRuntime = new ShellSessionRuntime({ sessionManager: setup.manager, renderer, runPrompt: provider });
    const runtime = researchFor(context, setup.manager, renderer);
    const create = vi.spyOn(runtime, 'create'), arm = vi.spyOn(runtime, 'arm'), run = vi.spyOn(runtime, 'run');
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const input = `比较论文 /deep-research --mode="${valid ? 'paper' : 'unknown'}" --depth='deep' --brief="brief /review.md" /skill:a /skill:b `;
    const before = fs.readFileSync(readResearch(setup.manager, setup.session).bound.layout.statePath);
    const submitted = vi.spyOn(host, 'run');
    mode.start();
    try {
      expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
      terminal.input(`\x1b[200~${input}\x1b[201~`);
      expect(host.view.editor.getText()).toBe(input);
      terminal.input('\r');
      expect(submitted).toHaveBeenCalledOnce(); await submitted.mock.results[0]!.value;
      if (valid) {
        expect(dispatch, host.view.transcript.all().map(block => block.text).join('\n')).toHaveBeenCalledOnce();
        const admitted = currentResearch(readResearch(setup.manager, setup.session))!;
        expect(admitted.request).toMatchObject({ mode: 'paper', depth: 'deep', briefPath: 'brief /review.md',
          methods: { originalInput: input, skills: [{ name: 'a' }, { name: 'b' }] } });
        expect(admitted.request.question.trim()).toBe('比较论文');
        const sent = dispatch.mock.calls[0]![0];
        expect(sent.promptMetadata).toMatchObject({ researchRunId: admitted.id, originalInput: input });
        expect(sent.effectivePrompt).toContain('BODY a'); expect(sent.effectivePrompt).toContain('BODY b');
        expect(create).toHaveBeenCalledOnce(); expect(arm).toHaveBeenCalledOnce();
      } else {
        expect(host.view.transcript.all().map(block => block.text).join('\n')).toContain('Invalid research composition');
        expect(host.view.editor.getText()).toBe(input); expect(dispatch).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled(); expect(arm).not.toHaveBeenCalled();
        expect(fs.readFileSync(readResearch(setup.manager, setup.session).bound.layout.statePath)).toEqual(before);
      }
      expect(host.busy).toBe(false);
      expect(run).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled(); expect(provider).not.toHaveBeenCalled();
    } finally {
      mode.stop();
      try { await submitted.mock.results[0]?.value; } finally { cleanupResearch(); }
    }
  });

it('restores queued composed images and text when the active turn is interrupted', async () => {
  const { mode } = build(); const host = mode as unknown as { busy: boolean; interrupt(): Promise<void>;
    queue: SubmissionQueue; view: InteractiveView; state: { pastes: { holdImage(image: unknown): string } };
    options: { sessionRuntime: ShellSessionRuntime } };
  host.busy = true; host.options.sessionRuntime.cancelAndWait = vi.fn(async () => {});
  const image = { type: 'image' as const, data: 'AA==', mimeType: 'image/png' };
  const hold = vi.spyOn(host.state.pastes, 'holdImage').mockReturnValue('[image:fixture]');
  try {
    host.queue.push('  正文 /skill:a\n/skill:b  ', { images: [image] }); host.view.editor.setText('new draft');
    await host.interrupt();
    expect(hold).toHaveBeenCalledWith(image);
    expect(host.view.editor.getText()).toBe('  正文 /skill:a\n/skill:b  \n\n[image:fixture]\n\nnew draft');
    expect(host.queue.length).toBe(0);
  } finally { hold.mockRestore(); mode.stop(); }
});

it.each(['regular', 'fullscreen'])('adopts the same startup editor and terminal engine in %s mode', async kind => {
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
  const start = vi.spyOn(terminal, 'start'); const startup = new StartupSurface(terminal, scheduler, vi.fn());
  terminal.input('retained\rinput');
  const { mode } = build({ startup, scheduler });
  const host = mode as unknown as { state: unknown; tui: unknown; view: InteractiveView; options: { runtimeContext: ShellRuntimeContext }; alternateScreen: boolean };
  host.alternateScreen = kind === 'fullscreen';
  try {
    mode.start(); scheduler.flush();
    expect(host.state).toBe(startup.state); expect(host.tui).toBe(startup.tui);
    await vi.waitFor(() => expect(host.view.editor.getText()).toBe('retained\ninput'));
    expect(start).toHaveBeenCalledTimes(1);
    terminal.input('!'); scheduler.flush(); await vi.waitFor(() => expect(host.view.editor.getText()).toBe('retained\ninput!'));
  } finally { mode.stop(); startup.dispose(); }
  expect(terminal.stopped).toBe(true);
});

it('preserves a bracketed paste split across startup adoption', () => {
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
  const startup = new StartupSurface(terminal, scheduler, vi.fn()); terminal.input('\x1b[200~first');
  const { mode } = build({ startup, scheduler }); const host = mode as unknown as { view: InteractiveView };
  try {
    mode.start(); terminal.input(' second\x1b[201~'); scheduler.flush();
    expect(host.view.editor.getText()).toBe('first second');
  } finally { mode.stop(); startup.dispose(); }
});

it.each(['regular', 'fullscreen'] as const)(
  'expands the held block under the caret on a later paste in %s mode', kind => {
    // The gesture is the caret, not a time window: the second paste arrives long
    // after the first in wall-clock terms and carries unrelated text, and the
    // block still opens because the caret was moved onto it.
    const { mode, terminal } = build({ tuiMode: kind });
    const host = mode as unknown as { view: InteractiveView; state: { pastes: import('../../presentation/tui/pastes.js').PasteStore } };
    const long = Array.from({ length: 8 }, (_, index) => `line ${index} ${'text '.repeat(8)}`).join('\n');
    try {
      mode.start();
      terminal.input(`\x1b[200~${long}\x1b[201~`);
      const placeholder = host.view.editor.getText();
      expect(placeholder).toMatch(/^\[#1 pasted /);
      expect(host.state.pastes.expand(placeholder)).toBe(long);

      // Move back onto the token, then paste something unrelated: the block
      // opens in place and the clipboard text is deliberately not inserted.
      terminal.input('\x1b[D\x1b[D');
      terminal.input('\x1b[200~unrelated clipboard\x1b[201~');
      expect(host.view.editor.getText()).toBe(long);
    } finally { mode.stop(); }
  });

it.each(['regular', 'fullscreen'] as const)('stashes the draft and takes it back on the same key in %s mode', kind => {
  // One key, two directions: with text in the prompt it stashes, with an empty
  // prompt it restores. The caret comes back where it was, so a draft set aside
  // mid-sentence resumes mid-sentence.
  const { mode, terminal } = build({ tuiMode: kind });
  const host = mode as unknown as { view: InteractiveView };
  try {
    mode.start();
    terminal.input('half a question');
    terminal.input('\x13');                       // ctrl+s
    expect(host.view.editor.getText()).toBe('');

    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('half a question');
  } finally { mode.stop(); }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind => ['remapped', 'conflicted'].map(binding => ({ kind, binding }))))(
  'advertises the effective draft shortcut after $binding stash bindings in $kind', ({ kind, binding }) => {
    const { mode, terminal } = build({ tuiMode: kind });
    const host = mode as unknown as { view: InteractiveView; toast?: string; preferences: { keybindings: Keybindings } };
    mode.start();
    try {
      host.preferences.keybindings.setUserConfig(binding === 'remapped' ? { 'tui.input.stash': ['alt+k'] }
        : { 'tui.input.stash': ['alt+j', 'alt+k'], 'app.retry': ['alt+j'] });
      terminal.input('retained original'); terminal.input('\x1bk');
      expect(host.view.editor.getText()).toBe('');
      expect(host.toast).toBe('Draft stashed · alt+k takes it back');
      terminal.input('\x1bk'); expect(host.view.editor.getText()).toBe('retained original');
    } finally { mode.stop(); }
  });

it('stashes on the alternate chord too, for a terminal that eats the primary one', () => {
  // ctrl+s is XOFF. A terminal with flow control still on, or a multiplexer
  // that forwards it, never delivers the key; the fallback has to work on its
  // own rather than only being advertised.
  const { mode, terminal } = build();
  const host = mode as unknown as { view: InteractiveView };
  try {
    mode.start();
    terminal.input('kept');
    terminal.input('\x1bs');                     // alt+s
    expect(host.view.editor.getText()).toBe('');
    terminal.input('\x1bs');
    expect(host.view.editor.getText()).toBe('kept');
  } finally { mode.stop(); }
});

it('does not consume the stash slot for an empty prompt', () => {
  const { mode, terminal } = build();
  const host = mode as unknown as { view: InteractiveView };
  try {
    mode.start();
    terminal.input('\x13');                       // nothing to stash, nothing held
    expect(host.view.editor.getText()).toBe('');
    terminal.input('kept');
    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('');
    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('kept');
  } finally { mode.stop(); }
});

it('leaves an expired block alone when the caret sits just past it', () => {
  const { mode, terminal } = build();
  const host = mode as unknown as { view: InteractiveView };
  const long = Array.from({ length: 8 }, (_, index) => `line ${index} ${'text '.repeat(8)}`).join('\n');
  const clock = vi.spyOn(Date, 'now').mockReturnValue(10000);
  try {
    mode.start();
    terminal.input(`\x1b[200~${long}\x1b[201~`);
    clock.mockReturnValue(11201);
    terminal.input('\x1b[200~more text\x1b[201~');
    expect(host.view.editor.getText()).toMatch(/^\[#1 pasted .*\]more text$/);
  } finally { mode.stop(); clock.mockRestore(); }
});

it.each(['regular', 'fullscreen'] as const)('expands an immediate repeat paste as one undoable edit in %s mode', kind => {
  const { mode, terminal } = build({ tuiMode: kind });
  const host = mode as unknown as { view: InteractiveView };
  const long = 'long text\n'.repeat(8);
  try {
    mode.start();
    terminal.input(`\x1b[200~${long}\x1b[201~`);
    const placeholder = host.view.editor.getText();
    terminal.input('\x1b[200~different clipboard\x1b[201~');
    expect(host.view.editor.snapshot()).toMatchObject({ text: long, cursor: long.length });
    terminal.input('\x1a');
    expect(host.view.editor.getText()).toBe(placeholder);
    terminal.input('\x1b[200~next\x1b[201~');
    expect(host.view.editor.getText()).toBe(placeholder + 'next');
  } finally { mode.stop(); }
});

it.each(['regular', 'fullscreen'] as const)('rejects edited and undone fresh paste gestures in %s mode', async kind => {
  const { mode, terminal } = build({ tuiMode: kind });
  const host = mode as unknown as { view: InteractiveView };
  try {
    mode.start(); terminal.input(`\x1b[200~${'long text\n'.repeat(8)}\x1b[201~`);
    const placeholder = host.view.editor.getText();
    terminal.input('!'); await vi.waitFor(() => expect(host.view.editor.getText()).toBe(placeholder + '!'));
    terminal.input('\x1a'); expect(host.view.editor.getText()).toBe(placeholder);
    terminal.input('\x1b[200~next\x1b[201~');
    expect(host.view.editor.getText()).toBe(placeholder + 'next');
  } finally { mode.stop(); }
});

it.each(['regular', 'fullscreen'] as const)('routes a composer caret click through actual SGR input in %s mode', kind => {
  const { mode, terminal } = build({ tuiMode: kind });
  const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost; pager: Pager; syncSuggestions(force: boolean): void };
  try {
    mode.start(); host.view.editor.setDraftText('a中😀e\u0301z');
    host.view.renderFrame({ columns: 80, rows: 24 });
    const geometry = host.view.composerGeometry()!, row = geometry.layout.rows.find(row => row.kind === 'content')!;
    if (row.kind !== 'content') throw Error('content');
    const resync = vi.spyOn(host, 'syncSuggestions');
    const click = () => {
      const position = `${row.contentColumn + 3};${geometry.top + row.screenRow + 1}`;
      terminal.input(`\x1b[<0;${position}M\x1b[<0;${position}m`);
    };
    click();
    expect(host.view.editor.snapshot().cursor).toBe(kind === 'fullscreen' ? 1 : 7);
    expect(host.view.editor.getText()).toBe('a中😀e\u0301z');
    expect(resync).toHaveBeenCalledTimes(kind === 'fullscreen' ? 1 : 0);
    // A full-screen picker or reader owns the same coordinates.
    host.view.editor.setCursorOffset(7);
    host.overlay.open({ title: 'Covered', fullScreen: true, empty: '', load: async () => [], apply: async () => undefined });
    click(); expect(host.view.editor.snapshot().cursor).toBe(7);
    host.overlay.close();
    host.pager.open('Reader', 'line\n'.repeat(100));
    host.view.renderFrame({ columns: 80, rows: 24 });
    click(); expect(host.view.editor.snapshot().cursor).toBe(7);
  } finally { mode.stop(); }
});

it.each([
  ['regular', false], ['regular', true], ['fullscreen', false], ['fullscreen', true],
] as const)('estimates and submits the adopted draft in %s mode (split paste: %s)', async (kind, split) => {
  vi.useFakeTimers();
  fs.mkdirSync('/tmp/cheers-test', { recursive: true });
  const root = fs.mkdtempSync('/tmp/cheers-test/startup-context-');
  vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('USERPROFILE', root);
  const preview = (tokens: number) => ({
    estimate: { tokens, source: 'estimated' as const, identity: { provider: 'openai', model: 'fixture' }, method: 'characters/3.5' as const },
    verify: vi.fn(), verifyContent: vi.fn(async () => {}), suspend: vi.fn(), resume: vi.fn(), invalidate: vi.fn(), dispose: vi.fn(),
  });
  const old = preview(111), current = preview(222);
  let finish!: (value: typeof old) => void;
  const load = vi.spyOn(contextPreview, 'previewContext').mockResolvedValue(current)
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const route = vi.spyOn(commandRouter, 'routeInteractiveCommand').mockResolvedValue({ turnNumber: 1 });
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
  const start = vi.spyOn(terminal, 'start');
  const startup = new StartupSurface(terminal, scheduler, vi.fn());
  const pasted = Array.from({ length: 8 }, (_, index) => `line ${index} 中文 😀 ${'text '.repeat(8)}`).join('\n');
  const prefix = 'retained\ninput ';
  terminal.input('retained\rinput ');
  terminal.input(`\x1b[200~${split ? pasted.slice(0, 30) : pasted + '\x1b[201~'}`);
  const { mode } = build({ startup, scheduler });
  const host = mode as unknown as { alternateScreen: boolean; busy: boolean; state: typeof startup.state;
    view: InteractiveView; promptContext: ReturnType<typeof import('./context/controller.js').createContextController>;
    options: { runtimeContext: ShellRuntimeContext } };
  host.alternateScreen = kind === 'fullscreen';
  const context = host.options.runtimeContext;
  const frame = () => stripAnsi(host.view.renderFrame({ columns: terminal.columns, rows: terminal.rows }).rows.join('\n'));
  try {
    Object.assign(context, { cwd: root, projectRoot: root, session: { ...context.session, turns: [] } });
    const binding = configurationBinding(context);
    const config = context.configuration.current.config;
    context.configuration.publish(context.configuration.begin(binding), { ...config,
      tui: { ...config.tui, statusItems: ['context'] } }, binding);
    expect(load).not.toHaveBeenCalled(); expect(route).not.toHaveBeenCalled();
    mode.start(); scheduler.flush();
    expect(host.state).toBe(startup.state); expect(start).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(150);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load.mock.calls[0]?.slice(3, 7)).toEqual([prefix + (split ? '' : pasted), undefined, 'build', 'ask']);
    expect(host.promptContext.read()).toEqual({ source: 'unknown' });
    expect(frame()).toContain('?/');

    if (split) terminal.input(`${pasted.slice(30)}\x1b[201~`);
    // A lone text cluster waits briefly for a combining continuation.
    terminal.input('!'); await vi.advanceTimersByTimeAsync(10);
    const submitted = prefix + pasted + '!';
    expect(host.state.pastes.expand(host.view.editor.getText())).toBe(submitted);
    expect(host.view.editor.getText().includes('[#1 pasted')).toBe(split);
    expect(load.mock.calls[0]?.[7].aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(1); expect(route).not.toHaveBeenCalled();
    finish(old); await vi.advanceTimersByTimeAsync(0);
    expect(old.invalidate).toHaveBeenCalledOnce(); expect(old.verify).not.toHaveBeenCalled();
    expect(host.promptContext.read()).toEqual({ source: 'unknown' });
    expect(frame()).toContain('?/'); expect(frame()).not.toContain('~111/');
    await vi.advanceTimersByTimeAsync(650);
    expect(load).toHaveBeenCalledTimes(2);
    expect(load.mock.calls[1]?.slice(3, 7)).toEqual([submitted, undefined, 'build', 'ask']);
    expect(host.promptContext.read()).toEqual({ tokens: 222, source: 'estimated' });
    expect(frame()).toContain('~222/');
    terminal.input('\x1b[D'); terminal.columns = 80; terminal.rows = 16; terminal.resize(); scheduler.flush();
    terminal.input('\x1b[C'); await vi.advanceTimersByTimeAsync(100);
    expect(host.promptContext.read()).toEqual({ tokens: 222, source: 'estimated' });
    expect(frame()).toContain('~222/'); expect(load).toHaveBeenCalledTimes(2);
    expect(route).not.toHaveBeenCalled();

    terminal.input('\r'); await vi.advanceTimersByTimeAsync(0); scheduler.flush();
    expect(route).toHaveBeenCalledOnce(); expect(route.mock.calls[0]?.[0].prompt).toBe(submitted);
    expect(host.view.editor.getText()).toBe(''); expect(host.busy).toBe(false);
    mode.stop(); await vi.advanceTimersByTimeAsync(1000);
    expect(load).toHaveBeenCalledTimes(2); expect(route).toHaveBeenCalledOnce();
    expect(current.invalidate).toHaveBeenCalledOnce(); expect(terminal.stopped).toBe(true);
  } finally {
    mode.stop(); startup.dispose(); load.mockRestore(); route.mockRestore();
    vi.unstubAllEnvs(); vi.useRealTimers(); fs.rmSync(root, { recursive: true, force: true });
  }
});

it.each([true, false])('records runtime adoption separately from its completed write (prepaint %s)', async prepaint => {
  const timing = vi.spyOn(startupTiming, 'time').mockImplementation(() => {});
  const terminal = new RecordingTerminal(), scheduler = new ManualScheduler();
  const writes: Array<() => void> = [];
  vi.spyOn(terminal, 'write').mockImplementation((data, callback) => { terminal.writes.push(data); if (callback) writes.push(callback); });
  const startup = prepaint ? new StartupSurface(terminal, scheduler, vi.fn()) : undefined;
  if (startup) { writes[0]?.(); await startup.firstPaint; writes.length = 0; }
  const callback = vi.fn();
  const { mode, terminal: ordinary } = build({ startup, scheduler, onFirstFrame: callback });
  if (!startup) {
    const start = ordinary.start.bind(ordinary);
    vi.spyOn(ordinary, 'start').mockImplementation((input, resize, disconnect, options) => {
      start(input, resize, disconnect, options); options?.onInputReady?.();
    });
    vi.spyOn(ordinary, 'write').mockImplementation((data, written) => { ordinary.writes.push(data); if (written) writes.push(written); });
  }
  try {
    mode.start(); scheduler.flush();
    expect(timing.mock.calls.filter(([label]) => label === 'runtime input adopted')).toHaveLength(1);
    expect(timing.mock.calls.filter(([label]) => label === 'runtime frame write completed')).toHaveLength(0);
    expect(callback).not.toHaveBeenCalled();
    expect(writes.length).toBeGreaterThan(0);
    writes[0]();
    expect(timing.mock.calls.filter(([label]) => label === 'runtime frame write completed')).toHaveLength(1);
    expect(callback).toHaveBeenCalledOnce();
    mode.stop(); writes[0]();
    expect(timing.mock.calls.filter(([label]) => label === 'runtime frame write completed')).toHaveLength(1);
  } finally { mode.stop(); startup?.dispose(); timing.mockRestore(); }
});

describe("session wiring", () => {
  it.each([
    ['regular', true, 'plain'], ['fullscreen', true, 'plain'], ['regular', false, 'plain'], ['fullscreen', false, 'plain'],
    ['regular', true, 'key'], ['fullscreen', true, 'key'], ['regular', true, 'model'], ['fullscreen', true, 'model'],
    ['regular', true, 'label'], ['fullscreen', true, 'label'],
    ['regular', true, 'known-option'], ['fullscreen', true, 'known-option'],
  ] as const)('configures a model from settings and activates it only on the next explicit selection in %s mode (existing: %s, value: %s)', async (kind, existing, variant) => {
    const apiKey = variant === 'key' ? '--synthetic-private-key=value' : variant === 'known-option' ? '--account' : 'synthetic-new-key';
    const model = variant === 'model' ? '--relay-model=opaque' : 'key-model';
    const focused = `▸ ${model.slice(0, 10)}`;
    const providerId = variant === 'label' ? '--account=label' : 'candidate';
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const directory = fs.mkdtempSync('/tmp/cheers-test/model-configure-select-');
    const home = path.join(directory, 'home'), project = path.join(directory, 'project');
    fs.mkdirSync(home); fs.mkdirSync(project);
    vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', tuiMode: kind, ...(existing ? { activeProviderConnectionId: 'existing',
      providerCredentials: { openai: { apiKey: 'synthetic-existing', baseUrl: 'https://existing.invalid/v1', model: 'retained' } },
      providerConnections: [{ id: 'existing', provider: 'openai', authType: 'api-key', apiKey: 'synthetic-existing',
        baseUrl: 'https://existing.invalid/v1', model: 'retained', status: 'connected', createdAt: '2026-01-01', updatedAt: '2026-01-01' }],
      } : {}),
    }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([
      { id: 'existing', label: 'Existing', runtime: 'openai', baseUrl: 'https://existing.invalid/v1', models: [{ id: 'retained', reasoning: true }] },
      { id: providerId, label: 'Candidate', runtime: 'openai', baseUrl: 'https://candidate.invalid/v1', models: [{ id: model, reasoning: true }] },
    ]);
    const manager = new SessionManager(), session = manager.createNew(project);
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; busy: boolean; options: { runtimeContext: ShellRuntimeContext;
      sessionManager: SessionManager } };
    const context = createShellRuntimeContext({ cwd: project, originalCwd: project, projectRoot: project, targetPathBase: project,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session, runtimeConfig: getRuntimeConfig(project) });
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const before = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    const target = () => resolveProviderCredential({ runtimeConfig: context.runtimeConfig, env: {} });
    const originalTarget = target();
    const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    mode.start();
    try {
      terminal.input('/settings\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      terminal.input('Models and roles'); await vi.waitFor(() => expect(frame()).toContain('▸ Models and roles'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input(model); await vi.waitFor(() => expect(frame()).toContain(focused));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Configure connection'));
      terminal.input('\x1b[B\r'); await vi.waitFor(() => expect(frame()).toContain('API key'));
      terminal.input(apiKey); await vi.waitFor(() => expect(frame()).toContain('••••'));
      expect(frame()).not.toContain(apiKey);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain(focused));
      await vi.waitFor(() => expect(host.busy).toBe(false));
      const saved = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
      const added = saved.providerConnections!.find(connection => connection.id !== 'existing')!;
      expect(added).toMatchObject({ model, apiKey, label: providerId, baseUrl: 'https://candidate.invalid/v1', status: 'connected', autoSelect: false });
      expect(saved.activeProviderConnectionId).toBe(before.activeProviderConnectionId); expect(saved.provider).toBe(before.provider);
      expect(saved.providerCredentials).toEqual(before.providerCredentials);
      expect(saved.providerConnections!.filter(connection => connection.id !== added.id)).toEqual(before.providerConnections ?? []);
      expect(target()).toEqual(originalTarget);
      expect(readSessionModel(session.id)).toBeUndefined();
      const configured = fs.readFileSync(getUserRuntimeConfigPath());

      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Settings'));
      await vi.waitFor(() => expect(host.busy).toBe(false));
      expect(frame()).toContain('▸ Models and roles'); expect(frame()).toContain('Model switched');
      expect(readSessionModel(session.id)).toMatchObject({ connectionId: added.id, provider: 'openai', model });
      expect(target()).toMatchObject({ model, baseUrl: 'https://candidate.invalid/v1', credential: { connectionId: added.id } });
      expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(configured);
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain(focused));
      expect(frame()).toContain('active');
      expect(JSON.stringify(host.view.transcript.all())).not.toContain(apiKey);
      expect(host.view.editor.getHistory()).not.toContain(apiKey);
      expect(manager.getSession(session.id)?.turns).toHaveLength(0);
      expect(dispatch).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs();
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it.each(['save', 'escape', 'failure'] as const)('handles a model API key through masked host input without prompt history (%s)', async outcome => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true }); const directory = fs.mkdtempSync('/tmp/cheers-test/model-key-host-');
    const home = path.join(directory, 'home'), project = path.join(directory, 'project');
    fs.mkdirSync(home); fs.mkdirSync(project); vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', providerConnections: [], providerCredentials: {} }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'openai', models: [{ id: 'key-model', reasoning: true }] }]);
    const manager = new SessionManager(), session = manager.createNew(project);
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; busy: boolean; options: { runtimeContext: ShellRuntimeContext;
      sessionManager: SessionManager; sessionRuntime: ShellSessionRuntime } };
    const context = createShellRuntimeContext({ cwd: project, originalCwd: project, projectRoot: project, targetPathBase: project,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null }, session, runtimeConfig: getRuntimeConfig(project) });
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const run = outcome === 'failure' ? vi.spyOn(host.options.sessionRuntime.commands, 'run')
      .mockRejectedValue(new ConfigWriteError('conflict', 'unchanged')) : undefined;
    const original = fs.readFileSync(getUserRuntimeConfigPath());
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      terminal.input('/model\r'); await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('key-model'); await vi.waitFor(() => expect(frame()).toContain('▸ key-model'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Configure connection'));
      terminal.input('\x1b[B'); terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('API key'));
      terminal.input('synthetic-host-key'); await vi.waitFor(() => expect(frame()).toContain('••••'));
      expect(frame()).not.toContain('synthetic-host-key');
      terminal.input(outcome === 'escape' ? '\x1b' : '\r');
      await vi.waitFor(() => expect(frame()).toContain('▸ key-model')); await vi.waitFor(() => expect(host.busy).toBe(false));
      const config = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
      if (outcome === 'save') {
        expect(config.providerConnections![0]).toMatchObject({ model: 'key-model', apiKey: 'synthetic-host-key', status: 'connected' });
        expect(context.runtimeConfig.providerConnections[0]!.model).toBe('key-model');
      } else expect(fs.readFileSync(getUserRuntimeConfigPath())).toEqual(original);
      if (outcome === 'failure') expect(frame()).toContain('this attempt did not write');
      const transcript = JSON.stringify(host.view.transcript.all()); expect(transcript).not.toContain('synthetic-host-key');
      expect(transcript).not.toContain('Saved key:'); expect(transcript).not.toContain('--api-key');
      expect(host.view.editor.getHistory()).not.toContain('synthetic-host-key');
      const history = path.join(project, '.ts-shell', 'prompt-history.txt');
      expect(fs.existsSync(history) ? fs.readFileSync(history, 'utf8') : '').not.toContain('synthetic-host-key');
      expect(manager.getSession(session.id)?.turns).toHaveLength(0);
      expect(host.view.editor.getText()).toBe('');
    } finally { run?.mockRestore(); mode.stop(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each([false, true])('reports a thrown model sign-in without exposing underlying errors (config write: %s)', async configWrite => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true }); const directory = fs.mkdtempSync('/tmp/cheers-test/model-auth-error-');
    const home = path.join(directory, 'home'), project = path.join(directory, 'project');
    fs.mkdirSync(home); fs.mkdirSync(project); vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home);
    const manager = new SessionManager(); const session = manager.createNew(project);
    const { mode } = build();
    const host = mode as unknown as { pickerHost(): PickerHost; options: { runtimeContext: ShellRuntimeContext; sessionRuntime: ShellSessionRuntime } };
    host.options.runtimeContext = createShellRuntimeContext({ cwd: project, originalCwd: project, projectRoot: project, targetPathBase: project,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(project) });
    const failure = configWrite ? new ConfigWriteError('verification-failed', 'unknown') : new Error('synthetic-sensitive-native-exception');
    const run = vi.spyOn(host.options.sessionRuntime.commands, 'run').mockRejectedValue(failure);
    mode.start();
    try {
      const result = await host.pickerHost().modelSignIn!('openai');
      expect(run).toHaveBeenCalledTimes(1);
      expect(result.note).toBe(configWrite ? failure.message
        : 'Account sign-in outcome is unverified. Inspect the saved connections before retrying.');
      expect(result.note).not.toContain('synthetic-sensitive-native-exception');
      expect(result.context.sessionId).toBe(session.id);
    } finally { run.mockRestore(); mode.stop(); vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it.each(['success', 'failure', 'cancel'] as const)('retains a native model sign-in %s through the real host without leaking its request-free draft', async outcome => {
    fs.mkdirSync('/tmp/cheers-test', { recursive: true }); const directory = fs.mkdtempSync('/tmp/cheers-test/model-auth-host-');
    const home = path.join(directory, 'home'), project = path.join(directory, 'project');
    fs.mkdirSync(home); fs.mkdirSync(project); vi.stubEnv('HOME', home); vi.stubEnv('USERPROFILE', home); vi.stubEnv('OPENAI_API_KEY', '');
    writeUserRuntimeConfigFile({ provider: 'openai', providerConnections: [], providerCredentials: {} }, readRuntimeConfigEditAt(getUserRuntimeConfigPath()));
    writeCatalogCache([{ id: 'openai', models: [{ id: 'gpt-5.4', reasoning: true }, { id: 'gpt-5.4-mini', reasoning: true }] }]);
    const manager = new SessionManager(); const session = manager.createNew(project);
    const context = createShellRuntimeContext({ cwd: project, originalCwd: project, projectRoot: project, targetPathBase: project,
      rootMode: 'direct', gitRoot: null, gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session, runtimeConfig: getRuntimeConfig(project) });
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; busy: boolean;
      options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager; sessionRuntime: ShellSessionRuntime } };
    host.options.runtimeContext = context; host.options.sessionManager = manager;
    const commands = new ShellCommandRuntime();
    Object.assign(host.options.sessionRuntime, { commands, cancelAndWait: async () => {
      const current = commands.current; current?.controller.abort(new DOMException('Sign-in cancelled', 'AbortError'));
      await current?.settled.catch(() => {});
    } });
    let signal: AbortSignal | undefined;
    __setOpenAIProviderAuthLoginForTest(async options => {
      signal = options?.signal;
      options?.onProgress?.({ authorizeUrl: 'https://auth.openai.com/authorize' });
      if (outcome === 'cancel') await new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
      if (outcome === 'failure') throw new Error('synthetic-sensitive-auth-error');
      return { accessToken: 'synthetic-model-host-account', refreshToken: 'synthetic-model-host-refresh', expiresAt: Date.now() + 3600000,
        authorizeUrl: 'https://auth.openai.com/authorize', callbackUrl: 'http://localhost:1455/auth/callback', accountId: 'fixture' };
    });
    const frame = () => stripAnsi(host.view.renderFrame({ columns: 120, rows: 40 }).rows.join('\n'));
    mode.start();
    try {
      terminal.input('/model\r');
      await vi.waitFor(() => expect(frame()).toContain('All models'));
      terminal.input('gpt-5.4-mini'); await vi.waitFor(() => expect(frame()).toContain('▸ gpt-5.4-mini'));
      terminal.input('\r'); await vi.waitFor(() => expect(frame()).toContain('Account sign-in'));
      terminal.input('\x1b[B'); terminal.input('\r');
      await vi.waitFor(() => expect(frame()).toContain('Confirm account sign-in'));
      terminal.input('\x1b[B'); terminal.input('\r');
      await vi.waitFor(() => expect(signal).toBeDefined());
      if (outcome === 'cancel') {
        expect(host.busy).toBe(true); host.view.editor.setText('retained draft');
        terminal.input('\x03'); await vi.waitFor(() => expect(signal!.aborted).toBe(true));
      }
      await vi.waitFor(() => expect(commands.current).toBeUndefined());
      await vi.waitFor(() => expect(host.busy).toBe(false));
      if (outcome === 'cancel') {
        expect(host.overlay.active).toBe(false);
        expect(frame()).not.toContain('▸ gpt-5.4-mini');
      } else {
        await vi.waitFor(() => expect(frame()).toContain('▸ gpt-5.4-mini'));
        expect(frame()).toContain(outcome === 'success' ? 'account-auth connected' : 'account-auth login failed');
      }
      expect(host.view.transcript.all().some(block => 'text' in block && block.text.includes(
        outcome === 'success' ? 'pending -> connected' : 'pending -> error'))).toBe(true);
      const config = readRuntimeConfigEditAt(getUserRuntimeConfigPath()).values;
      expect(config.providerConnections?.[0]?.status).toBe(outcome === 'success' ? 'connected' : 'error');
      expect(context.runtimeConfig.providerConnections[0]?.status).toBe(config.providerConnections?.[0]?.status);
      expect(frame()).not.toMatch(/synthetic-model-host-account|synthetic-model-host-refresh|synthetic-sensitive-auth-error/);
      expect(manager.getSession(session.id)?.turns).toHaveLength(0);
      if (outcome === 'cancel') expect(host.view.editor.getText()).toBe('retained draft');
    } finally { commands.current?.controller.abort(); mode.stop(); __setOpenAIProviderAuthLoginForTest(undefined);
      vi.unstubAllEnvs(); fs.rmSync(directory, { recursive: true, force: true }); }
  });

  it('keeps the draft held when a pending picker has no interruptible command owner', async () => {
    const { mode, terminal } = build(); let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; pickerInputPending: Map<number, number> };
    mode.start();
    try {
      host.view.editor.setText('keep this draft');
      host.overlay.open({ title: 'Read', holdInput: true, load: async () => [{ id: 'read', label: 'Read' }],
        apply: async () => { await gate; return undefined; } });
      await vi.waitFor(() => expect(host.overlay.render(100, 24).join('\n')).toContain('Read'));
      terminal.input('\r');
      await vi.waitFor(() => expect(host.pickerInputPending.size).toBe(1));
      terminal.input('\x03'); expect(host.view.editor.getText()).toBe('keep this draft');
      release(); await vi.waitFor(() => expect(host.pickerInputPending.size).toBe(0));
    } finally { release(); mode.stop(); }
  });

  it.each([
    { command: 'tools', key: '\x03', gesture: 'Ctrl+C' },
    { command: 'tools', key: '\x1b', gesture: 'Escape' },
    { command: 'debug', key: '\x03', gesture: 'Ctrl+C' },
  ])('cancels accepted $command inspection through real terminal $gesture', async ({ command, key }) => {
    const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
    const root = fs.mkdtempSync(path.join(scratch, 'accepted-tools-'));
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const { mode, renderer, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; pickerInputPending: Map<number, number>;
      onSubmit(text: string): void; options: { runtimeContext: ShellRuntimeContext; sessionRuntime: ShellSessionRuntime;
        sessionManager: SessionManager; initialMcpGateway: CliMcpGateway } };
    const context = host.options.runtimeContext;
    Object.assign(context, { cwd: root, projectRoot: root, skillOptions: { noSkills: true },
      runtimeConfig: { ...context.configuration.current.config, enableMcpTools: true, allowedTools: ['mcp__fixture__Read'] } });
    const binding = configurationBinding(context);
    context.configuration.publish(context.configuration.begin(binding), context.runtimeConfig, binding);
    const provider = vi.fn(() => { throw new Error('Unexpected provider call'); });
    const runtime = new ShellSessionRuntime({ sessionManager: host.options.sessionManager, renderer, runPrompt: provider });
    host.options.sessionRuntime = runtime;
    let signal: AbortSignal | undefined, release!: () => void, entered = false, finished = false, calls = 0;
    const gate = new Promise<void>(resolve => { release = resolve; });
    Object.assign(host.options.initialMcpGateway, { snapshot: async (_admission: unknown, current?: AbortSignal) => {
      if (++calls === (command === 'tools' ? 2 : 1)) {
        signal = current; entered = true;
        try { await gate; signal?.throwIfAborted(); } finally { finished = true; }
      }
      return { clients: [], tools: [{ serverName: 'fixture', toolName: 'Read', qualifiedName: 'mcp__fixture__Read',
        description: 'Read fixture metadata' }] };
    } });
    mode.start();
    try {
      host.onSubmit('/' + command);
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n')))
        .toContain(command === 'tools' ? 'mcp__fixture__Read' : 'summary'));
      (host.overlay as unknown as { model: { focus(id: string): void } }).model.focus(command === 'tools' ? 'mcp__fixture__Read' : 'tools');
      host.view.editor.setText('original draft'); terminal.input('\r');
      await vi.waitFor(() => expect(entered).toBe(true));
      expect(host.overlay.active).toBe(false); expect(runtime.commands.current).toBeDefined();
      expect(signal?.aborted).toBe(false); const before = [...host.view.transcript.all()];
      if (command === 'tools') {
        terminal.input('x\x1b[200~ignored paste\x1b[201~'); expect(host.view.editor.getText()).toBe('original draft');
      }
      terminal.input(key);
      await vi.waitFor(() => expect(signal?.aborted).toBe(true));
      expect(runtime.commands.current).toBeDefined(); expect(finished).toBe(false);
      release(); await vi.waitFor(() => expect(runtime.commands.current).toBeUndefined());
      await vi.waitFor(() => expect(host.pickerInputPending.size).toBe(0));
      expect(finished).toBe(true); expect(host.view.transcript.all()).toEqual(before);
      expect(host.view.editor.getText()).toBe('original draft'); expect(provider).not.toHaveBeenCalled();
    } finally {
      runtime.commands.current?.controller.abort(); release(); await runtime.commands.current?.settled.catch(() => {});
      mode.stop(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['cancel', 'complete'])('keeps an accepted skill manifest owned until %s settles', async outcome => {
    const scratch = path.join(os.tmpdir(), 'cheers-test'); fs.mkdirSync(scratch, { recursive: true });
    const root = fs.mkdtempSync(path.join(scratch, 'accepted-skill-'));
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const file = path.join(root, 'SKILL.md');
    const body = 'x'.repeat(outcome === 'cancel' ? 128 * 1024 : 32);
    fs.writeFileSync(file, '---\nname: fixture\ndescription: Fixture instructions\n---\n' + body);
    const beforeSource = fs.readFileSync(file), { mode, renderer, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; pickerInputPending: Map<number, number>;
      onSubmit(text: string): void; options: { runtimeContext: ShellRuntimeContext; sessionRuntime: ShellSessionRuntime; sessionManager: SessionManager } };
    const context = host.options.runtimeContext;
    Object.assign(context, { cwd: root, projectRoot: root, skillOptions: { noSkills: true, skillPaths: [file] } });
    const binding = configurationBinding(context);
    context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
    const provider = vi.fn(() => { throw new Error('Unexpected provider call'); });
    const runtime = new ShellSessionRuntime({ sessionManager: host.options.sessionManager, renderer, runPrompt: provider });
    host.options.sessionRuntime = runtime;
    let opened = 0, closed = 0, acceptedBytes = 0, release!: () => void, entered = false;
    const gate = new Promise<void>(resolve => { release = resolve; }), open = fs.promises.open.bind(fs.promises);
    const observed = vi.spyOn(fs.promises, 'open').mockImplementation(async (...args) => {
      const handle = await open(...args); if (String(args[0]) !== file) return handle;
      const accepted = ++opened === 2, read = handle.read.bind(handle), close = handle.close.bind(handle);
      handle.read = (async (buffer: Buffer, offset: number, length: number, position: number) => {
        const result = await read(buffer, offset, length, position);
        if (accepted) { acceptedBytes += result.bytesRead; entered = true; await gate; }
        return result;
      }) as typeof handle.read;
      handle.close = async () => { await close(); closed++; }; return handle;
    });
    mode.start();
    try {
      host.onSubmit('/skill');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('fixture'));
      host.view.editor.setText('original draft'); terminal.input('\r');
      await vi.waitFor(() => expect(entered).toBe(true));
      expect(runtime.commands.current).toBeDefined(); expect(acceptedBytes).toBe(Math.min(64 * 1024, beforeSource.length)); expect(closed).toBe(1);
      const before = [...host.view.transcript.all()];
      terminal.input('x\x1b[200~ignored paste\x1b[201~');
      expect(host.view.editor.getText()).toBe('original draft');
      if (outcome === 'cancel') {
        terminal.input('\x03');
        await vi.waitFor(() => expect(runtime.commands.current?.controller.signal.aborted).toBe(true));
      }
      expect(closed).toBe(1); release();
      await vi.waitFor(() => expect(runtime.commands.current).toBeUndefined());
      await vi.waitFor(() => expect(host.pickerInputPending.size).toBe(0));
      expect(opened).toBe(2); expect(closed).toBe(2);
      if (outcome === 'cancel') {
        expect(acceptedBytes).toBe(64 * 1024);
        expect(host.view.transcript.all()).toEqual(before); expect(host.view.editor.getText()).toBe('original draft');
      } else {
        expect(acceptedBytes).toBe(beforeSource.length);
        expect(host.view.transcript.last()?.text).toContain(body);
        expect(host.view.editor.getText()).toBe('/skill fixture ');
      }
      expect(fs.readFileSync(file)).toEqual(beforeSource); expect(provider).not.toHaveBeenCalled();
    } finally {
      runtime.commands.current?.controller.abort(); release(); await runtime.commands.current?.settled.catch(() => {});
      mode.stop(); observed.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("drops a status preview when an external configuration publication advances", () => {
    const { mode } = build();
    const host = mode as unknown as {
      pickerHost(): PickerHost;
      options: { runtimeContext: ShellRuntimeContext };
      view: { context: { statusItems(): readonly string[] } };
    };
    Object.defineProperty(host.options.runtimeContext, 'runtimeConfig', {
      configurable: true,
      get: () => host.options.runtimeContext.configuration.current.config,
    });
    host.pickerHost().previewStatusItems(["cost"]);
    expect(host.view.context.statusItems()).toEqual(["cost"]);
    host.options.runtimeContext.configuration.recordDisplay({ tui: { statusItems: ["model"] } });
    expect(host.view.context.statusItems()).toEqual(["model"]);
    expect(host.pickerHost().statusItems).toEqual(["model"]);
  });
  it('binds the usage picker to an interactive command context for local reset inspection', async () => {
    const { mode } = build();
    const host = mode as unknown as { pickerHost(): PickerHost; options: { runtimeContext: ShellRuntimeContext } };
    const runtime = host.options.runtimeContext;
    const resolution: ProviderCredentialResolution = {
      provider: 'openai',
      model: 'fixture-model',
      baseUrl: 'https://chatgpt.com/backend-api',
      expectedEnvVarName: 'OPENAI_API_KEY',
      credential: {
        provider: 'openai',
        source: 'config',
        authMode: 'account-auth',
        envVarName: 'OPENAI_API_KEY',
        baseUrl: 'https://chatgpt.com/backend-api',
        accountAuth: {
          type: 'openai-chatgpt-account',
          accessToken: 'synthetic-access',
          refreshToken: 'synthetic-refresh',
          accountId: 'synthetic-account',
          expiresAt: Date.now() + 3_600_000,
        },
      },
    };
    Object.assign(runtime, { resolveConfigTarget: () => resolution });
    installUsageRuntime(runtime, () => ({
      workspaceRoot: runtime.projectRoot,
      sessionId: runtime.session.id,
      agentMode: 'build',
      permissionScope: 'allow-all',
      hooks: new HookDispatcher(),
      denyRules: [],
      emit: () => {},
    }));
    const port = host.pickerHost();
    expect(port.commandContext.interactive).toBe(true);
    const picker = pickerFor('/usage', { ...port, commandContext: { ...port.commandContext, admission: () => undefined } })!;
    await picker.load();
    const result = await picker.apply(['reset-status']);
    expect(result?.note).toBeDefined();
    expect(result?.note).not.toContain('requires the current bound interactive session');
  });

  it('cancels an accepted exact MCP refresh through the actual terminal command lifecycle', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { pickerHost(): PickerHost; overlay: OverlayHost; busy: boolean;
      options: { sessionRuntime: ShellSessionRuntime; initialMcpGateway: CliMcpGateway; runtimeContext: ShellRuntimeContext } };
    host.options.runtimeContext.runtimeConfig.enableMcpTools = true;
    const commands = new ShellCommandRuntime();
    Object.assign(host.options.sessionRuntime, { commands, cancelAndWait: async () => {
      const active = commands.current; active?.controller.abort(new Error('MCP refresh cancelled'));
      await active?.settled.catch(() => {});
    } });
    const config = { scope: 'user' as const, transport: 'stdio' as const, command: 'fixture' };
    const snapshot = { clients: [{ name: 'all', config, type: 'connected' as const }], tools: [] };
    let signal: AbortSignal | undefined;
    const refresh = vi.fn(async (_name, options) => {
      signal = options.signal;
      await new Promise((_resolve, reject) => signal!.addEventListener('abort', () => reject(signal!.reason), { once: true }));
      return snapshot;
    });
    Object.assign(host.options.initialMcpGateway, { snapshot: async () => snapshot, refresh });
    mode.start();
    try {
      const port = host.pickerHost();
      const picker = pickerFor('/mcp', { ...port, commandContext: { ...port.commandContext, admission: () => undefined } })!;
      host.overlay.open(picker);
      await vi.waitFor(() => expect(host.overlay.render(100, 20).join('\n')).toContain('all'));
      terminal.input('\r');
      await vi.waitFor(() => expect(refresh).toHaveBeenCalledOnce());
      expect(host.busy).toBe(true);
      expect(refresh).toHaveBeenCalledWith('all', expect.objectContaining({ exactTarget: true, expectedConfig: config,
        signal: expect.any(AbortSignal), admission: expect.any(Function) }));
      terminal.input('\x03');
      await vi.waitFor(() => expect(signal?.aborted).toBe(true));
      await vi.waitFor(() => expect(commands.current).toBeUndefined());
      await vi.waitFor(() => expect(host.busy).toBe(false));
    } finally { commands.current?.controller.abort(); mode.stop(); }
  });
  it('suppresses an accepted help draft when the original binding expires before host publication', async () => {
    const { mode } = build();
    const host = mode as unknown as { pickerHost(): PickerHost; overlay: OverlayHost; view: InteractiveView;
      applyPicker(picker: Picker, ids: readonly string[]): void; pickerInputPending: Map<number, number>; sink: { begin(): void } };
    const begin = vi.spyOn(host.sink, 'begin'); let current = true;
    const original = host.pickerHost();
    const picker = pickerFor('/help', { ...original, commandContext: { ...original.commandContext,
      admission: () => current ? undefined : 'original binding changed' } })!;
    const guarded = { ...picker, apply: async (ids: readonly string[]) => {
      const outcome = await picker.apply(ids); current = false; return outcome;
    } };
    host.overlay.open(guarded); const before = [...host.view.transcript.all()];
    host.applyPicker(guarded, ['/model']);
    await vi.waitFor(() => expect(host.pickerInputPending.size).toBe(0));
    expect(host.view.editor.getText()).toBe(''); expect(host.view.transcript.all()).toEqual(before);
    expect(begin).not.toHaveBeenCalled(); host.overlay.close();
  });
  it('binds typed MCP definitions to the original runtime owner without a file staging adapter', async () => {
    const { mode } = build();
    const host = mode as unknown as { pickerHost(): PickerHost; options: { runtimeContext: ShellRuntimeContext } };
    const add = vi.fn(async () => 'ordinary writer result');
    const port = vi.spyOn(mcpRuntime, 'mcpDefinitionFor').mockReturnValue(add);
    try {
      const pickerHost = host.pickerHost();
      expect(port).toHaveBeenCalledWith(host.options.runtimeContext);
      expect(pickerHost.addMcpServer).toBe(add);
      expect(await pickerHost.addMcpServer!('project', 'local', { command: 'server', args: ['two words'] })).toBe('ordinary writer result');
      expect(add).toHaveBeenCalledWith('project', 'local', { command: 'server', args: ['two words'] });
    } finally { port.mockRestore(); }
  });

  it('does not open or connect the MCP picker when the accepted runtime config disables it', async () => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; options: { runtimeContext: ShellRuntimeContext;
      initialMcpGateway: CliMcpGateway }; onSubmit(text: string): void };
    host.options.runtimeContext.runtimeConfig.enableMcpTools = false;
    const snapshot = vi.fn(async () => ({ clients: [], tools: [] }));
    Object.assign(host.options.initialMcpGateway, { snapshot });
    const open = vi.spyOn(host.overlay, 'open');
    mode.start();
    try {
      host.onSubmit('/mcp');
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(open).not.toHaveBeenCalled();
      expect(snapshot).not.toHaveBeenCalled();
    } finally { mode.stop(); }
  });
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
    const root = process.cwd();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original,
      commandContext: { ...original.commandContext, cwd: root, projectRoot: root, admission: () => undefined },
      sessionContext: () => ({ sessionId: 'sess_1', projectRoot: root, busy: false }), security: {
      read: () => ({ state: 'ready', snapshot: { identity: { sessionId: 'sess_1', workspaceRoot: root }, version: 'v1', items: [] } }),
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

  it('shows a copy source revision refusal in its current host instead of closing silently', async () => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; applyPicker(picker: Picker, ids: readonly string[]): void;
      view: InteractiveView };
    const transcript = host.view.transcript;
    const block = transcript.append(textBlock('assistant', 'original source'));
    const picker = copyPicker(transcript, { cwd: '/workspace', admission: () => undefined });
    await picker.load();
    transcript.setText(block, 'changed source');
    host.applyPicker(picker, ['0']);
    await vi.waitFor(() => expect(transcript.all().at(-1)?.text).toContain('Transcript changed'));
    expect(transcript.all().at(-1)?.kind).toBe('command');
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
      openPicker(command: string): void; options: { runtimeContext: ShellRuntimeContext } };
    // This UI fixture mocks persistence; explicitly supply its matching workspace owner.
    vi.spyOn(undoService, 'undoScope').mockReturnValue({ sessionId: 'sess_1', workspace: { path: '/workspace', identity: '1:2:3' } });
    const context = host.options.runtimeContext;
    const binding = configurationBinding(context);
    context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
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

  it('binds the undo registry to the original selection surface before acquiring receipts', async () => {
    const { mode } = build();
    const host = mode as unknown as { closing: boolean; pickerHost(): PickerHost; options: { runtimeContext: ShellRuntimeContext } };
    vi.spyOn(undoService, 'undoScope').mockReturnValue({ sessionId: 'sess_1', workspace: { path: '/workspace', identity: '1:2:3' } });
    const context = host.options.runtimeContext;
    const binding = configurationBinding(context);
    context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
    const prepare = vi.spyOn(undoService, 'prepareUndo').mockResolvedValue({ note: 'No operation.' });
    try {
      const picker = pickerFor('/undo', host.pickerHost())!;
      host.closing = true;
      await expect(picker.load()).rejects.toThrow('unavailable');
      expect(prepare).not.toHaveBeenCalled();
      expect(await picker.apply(['history'])).toBeUndefined();
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
      expect(dispatch).not.toHaveBeenCalledWith('/help', undefined); expect(host.queue.control.entries().map(entry => entry.text)).toEqual(['/help']);
      terminal.input('\x1b');
      await vi.waitFor(() => expect(dispatch).toHaveBeenCalledWith('/help', undefined));
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
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void>; pickerHost(): PickerHost };
    const original = host.pickerHost();
    const root = process.cwd();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original,
      commandContext: { ...original.commandContext, cwd: root, projectRoot: root, admission: () => undefined },
      sessionContext: () => ({ sessionId: 'sess_1', projectRoot: root, busy: false }),
    });
    const navigation = vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockResolvedValue({
      version: 'saved-v1', session: { id: 'sess_1', projectRoot: root },
      points: [
        { entryId: 'older', label: 'Older question', depth: 0, current: false, prompt: 'older' },
        { entryId: 'current', label: 'Current question', depth: 1, current: true, prompt: 'current' },
      ],
    } as Awaited<ReturnType<typeof sessionNavigation.readSessionNavigationAsync>>);
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
    vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockRejectedValue(new Error('PRIVATE_STORAGE_BODY'));
    mode.start();
    try {
      await host.run('/history');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('Session history unavailable. Reopen /history to retry.'));
      const frame = stripAnsi(host.overlay.render(100, 24).join('\n'));
      expect(frame).not.toContain('PRIVATE_STORAGE_BODY');
      expect(frame).not.toContain('No saved session history');
    } finally { mode.stop(); }
  });

  it('publishes an exact history draft through actual acceptance after browser signal release', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void>;
      pickerHost(): PickerHost; view: InteractiveView };
    const original = host.pickerHost(), root = process.cwd(), rewind = vi.fn();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original, rewind,
      commandContext: { ...original.commandContext, cwd: root, projectRoot: root, admission: () => undefined },
      sessionContext: () => ({ sessionId: 'sess_1', projectRoot: root, busy: false }),
    });
    const navigation = vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockResolvedValue({ version: 'saved-v1', session: { id: 'sess_1', projectRoot: root },
      points: [{ entryId: 'entry with space', label: 'Exact saved question', depth: 0, current: true, prompt: 'question' }],
    } as Awaited<ReturnType<typeof sessionNavigation.readSessionNavigationAsync>>);
    mode.start();
    try {
      await host.run('/history');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('Exact saved question'));
      terminal.input('\r');
      await vi.waitFor(() => expect(host.view.editor.getText()).toBe('/tree -- "entry with space"'));
      expect(navigation).toHaveBeenCalledTimes(2); expect(rewind).not.toHaveBeenCalled();
      expect(host.overlay.active).toBe(false);
    } finally { mode.stop(); navigation.mockRestore(); }
  });

  it('reports queued back source failures without claiming there are no questions', async () => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void>;
      options: { sessionManager: SessionManager }; pickerHost(): PickerHost };
    host.options.sessionManager.getSession = () => undefined;
    const original = host.pickerHost();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original, commandContext: { ...original.commandContext, admission: () => undefined } });
    vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockRejectedValue(new Error('PRIVATE_STORAGE_BODY'));
    mode.start();
    try {
      await host.run('/back');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('Questions are unavailable'));
      const frame = stripAnsi(host.overlay.render(100, 24).join('\n'));
      expect(frame).not.toContain('PRIVATE_STORAGE_BODY');
      expect(frame).not.toContain('Nothing to go back to yet');
    } finally { mode.stop(); }
  });

  it('keeps a saved back version through the real host and refuses later changed content without navigation', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void>;
      view: InteractiveView; options: { sessionManager: SessionManager; sessionRuntime: ShellSessionRuntime; runtimeContext: ShellRuntimeContext }; pickerHost(): PickerHost };
    const revert = vi.fn(); host.options.sessionManager.revertTo = revert;
    host.options.sessionManager.getSession = () => ({ id: 'sess_1', turns: [{ id: 'question', role: 'user', content: 'original question' }] } as never);
    host.options.sessionRuntime.getState = () => 'idle';
    const context = host.options.runtimeContext;
    const binding = configurationBinding(context);
    const ticket = context.configuration.begin(binding);
    context.configuration.publish(ticket, context.configuration.current.config, binding);
    const original = host.pickerHost();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original, commandContext: { ...original.commandContext, admission: () => undefined } });
    let version = 'saved-v1';
    vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockImplementation(async () => ({ version,
      session: { id: 'sess_1', projectRoot: '/workspace', turns: [{ id: 'question', role: 'user', content: 'original question' }] },
      points: [{ entryId: 'question', depth: 0, label: 'Original question', current: true, prompt: 'original question' }],
      thread: { entries: [{ id: 'question', kind: 'turn-message', role: 'user', order: 0, timestamp: 'now' }], activeLeafId: 'question' },
    } as Awaited<ReturnType<typeof sessionNavigation.readSessionNavigationAsync>>));
    mode.start();
    try {
      await host.run('/back');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain('original question'));
      version = 'saved-v2'; terminal.input('\r');
      await vi.waitFor(() => expect(host.view.transcript.all().at(-1)?.text).toContain('saved conversation changed'));
      expect(revert).not.toHaveBeenCalled();
      expect(host.view.editor.getText()).toBe('');
    } finally { mode.stop(); }
  });

  it.each([true, false])('distinguishes queued history no-match from an empty tree (saved=%s)', async saved => {
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; run(command: string): Promise<void>; pickerHost(): PickerHost };
    const original = host.pickerHost();
    const root = process.cwd();
    vi.spyOn(host, 'pickerHost').mockReturnValue({ ...original,
      commandContext: { ...original.commandContext, cwd: root, projectRoot: root, admission: () => undefined },
      sessionContext: () => ({ sessionId: 'sess_1', projectRoot: root, busy: false }),
    });
    vi.spyOn(sessionNavigation, 'readSessionNavigationAsync').mockResolvedValue({ version: 'saved-v1', session: { id: 'sess_1', projectRoot: root }, points: saved
      ? [{ entryId: 'saved', depth: 0, label: 'Saved question', current: true }]
      : [] } as Awaited<ReturnType<typeof sessionNavigation.readSessionNavigationAsync>>);
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

  it('binds accepted tool inspection to the real host lifecycle', async () => {
    const tool = { name: 'lifecycle_tool', description: 'Lifecycle metadata.', argsSchema: { type: 'object' }, execute: vi.fn() };
    const signals: AbortSignal[] = [];
    const catalog = vi.spyOn(toolCatalog, 'loadToolCatalog').mockImplementation(async input => {
      if (input.signal) signals.push(input.signal);
      if (signals.length === 2) {
        await new Promise((_resolve, reject) => input.signal!.addEventListener('abort', () => reject(input.signal!.reason), { once: true }));
      }
      return { skills: new Map(), tools: new Map([[tool.name, tool]]) };
    });
    const { mode } = build();
    const host = mode as unknown as { overlay: OverlayHost; options: { runtimeContext: ShellRuntimeContext };
      onSubmit(text: string): void };
    const context = host.options.runtimeContext, binding = configurationBinding(context);
    context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
    mode.start();
    try {
      host.onSubmit('/tools');
      await vi.waitFor(() => expect(stripAnsi(host.overlay.render(100, 24).join('\n'))).toContain(tool.name));
      const picker = (host.overlay as unknown as { picker?: Picker }).picker!;
      const accepted = picker.apply([tool.name]);
      await vi.waitFor(() => expect(signals).toHaveLength(2));
      expect(signals[1]).toBeDefined();
      expect(signals[1]!.aborted).toBe(false);
      mode.stop();
      await expect(accepted).resolves.toBeUndefined();
      expect(signals[1]!.aborted).toBe(true);
    } finally { mode.stop(); catalog.mockRestore(); }
  });

  it('transfers the picker lifecycle to a continuation page', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; onSubmit(text: string): void;
      options: { runtimeContext: ShellRuntimeContext } };
    const context = host.options.runtimeContext, binding = configurationBinding(context);
    context.configuration.publish(context.configuration.begin(binding), context.configuration.current.config, binding);
    mode.start();
    try {
      for (let index = 0; index < 105; index++) {
        host.view.transcript.append(textBlock('assistant', `copy block ${index}`));
      }
      host.onSubmit('/copy');
      await vi.waitFor(() => expect(host.overlay.active).toBe(true));
      await vi.waitFor(() => {
        const model = (host.overlay as unknown as { model: { visible: readonly { id: string }[] } }).model;
        expect(model.visible.some(option => option.id === '__more__')).toBe(true);
      });
      (host.overlay as unknown as { model: { focus(id: string): void } }).model.focus('__more__');
      terminal.input('\r');
      await vi.waitFor(() => {
        const picker = (host.overlay as unknown as { picker?: Picker }).picker;
        expect(picker?.isCurrent?.()).toBe(true);
      });
      const picker = (host.overlay as unknown as { picker?: Picker }).picker!;
      expect(await picker.load()).not.toHaveLength(0);
    } finally { mode.stop(); }
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

  it('opens a retained report without appending or persisting a duplicate', async () => {
    const { mode } = build();
    const host = mode as unknown as { view: InteractiveView; pager: Pager; applyPicker(picker: Picker, ids: readonly string[]): void };
    const report = createReport({ title: 'Side question', facts: { question: 'Why?' },
      lines: Array.from({ length: 80 }, (_, index) => ({ kind: 'text' as const, spans: [span(`line ${index}`, 'text')] })) });
    host.view.transcript.append({ ...textBlock('command', 'retained report', 'Side question'), report });
    mode.start();
    try {
      host.applyPicker({ title: 'Side questions', form: 'panel', empty: '', load: async () => [],
        apply: async () => ({ report, reportRetained: true }) }, ['retained']);
      await vi.waitFor(() => expect(host.pager.active).toBe(true));
      expect(host.view.transcript.all().filter(block => block.report === report)).toHaveLength(1);
    } finally {
      mode.stop();
    }
  });

  it('holds composer typing and paste until a delayed restore preview draft settles', async () => {
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; applyPicker(picker: Picker, ids: readonly string[]): void };
    let resolve!: (value: PickerOutcome) => void;
    const pending = new Promise<PickerOutcome>(done => { resolve = done; });
    mode.start();
    try {
      host.view.editor.setText('original draft');
      host.applyPicker({ ...restorePicker(process.cwd()), apply: () => pending }, ['edit-a:record-a']);
      terminal.input('typed\x1b[200~ pasted\x1b[201~');
      expect(host.view.editor.getText()).toBe('original draft');
      resolve({ draft: '/restore preview --authority-id=edit-a --record=record-a' });
      await new Promise(done => setTimeout(done, 0));
      expect(host.view.editor.getText()).toContain('/restore preview');
      terminal.input('!');
      await vi.waitFor(() => expect(host.view.editor.getText()).toContain('--record=record-a!'));
    } finally { mode.stop(); }
  });

  it.each([false, true])('reports a restore refusal only while its opening owner remains current: changed=%s', async changed => {
    const { mode } = build();
    const host = mode as unknown as { view: InteractiveView; applyPicker(picker: Picker, ids: readonly string[]): void };
    const owner = { sessionId: 'restore-owner', projectRoot: process.cwd(), busy: false };
    let blocked = false;
    let resolve!: (value: PickerOutcome) => void;
    const pending = new Promise<PickerOutcome>(done => { resolve = done; });
    const picker = restorePicker(process.cwd(), undefined, { context: () => owner,
      admission: () => blocked ? 'Changed admission' : undefined });
    mode.start();
    try {
      host.view.editor.setText('original draft');
      host.applyPicker({ ...picker, apply: () => pending }, ['edit-a:record-a']);
      blocked = true;
      if (changed) owner.sessionId = 'new-owner';
      resolve({ note: 'Restore opening refused', ...(changed ? { draft: '/restore preview stale' } : {}) });
      await new Promise(done => setTimeout(done, 0));
      expect(host.view.transcript.all().some(block => block.text.includes('Restore opening refused'))).toBe(!changed);
      expect(host.view.editor.getText()).toBe('original draft');
    } finally { mode.stop(); }
  });

  it('resets Vim mode when a picker replaces the draft', async () => {
    const scheduler = new ManualScheduler();
    const { mode, terminal } = build({ scheduler });
    const host = mode as unknown as { view: InteractiveView; overlay: OverlayHost;
      options: { runtimeContext: ShellRuntimeContext };
      applyPicker(picker: Picker, ids: readonly string[]): void };
    host.options.runtimeContext.runtimeConfig.vimMode = true;
    mode.start();
    try {
      host.view.editor.setText('old');
      terminal.input('\x1b');
      scheduler.flush();
      const picker = { title: 'Draft', form: 'panel' as const, empty: '', load: async () => [],
        apply: async () => ({ draft: 'new' }) };
      host.overlay.open(picker);
      host.applyPicker(picker, ['draft']);
      await vi.waitFor(() => expect(host.view.editor.getText()).toBe('new'));
      host.overlay.close();
      terminal.input('x');
      scheduler.flush();
      expect(host.view.editor.getText()).toBe('newx');
    } finally { mode.stop(); }
  });

  it.each([['/models', '/model ', undefined, '/model '], ['/recall', '/recall ', '<query>', '/recall '], ['/exit', '/exit ', undefined, '/exit ']])(
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

  it('keeps selected help usage safe in the actual host without executing the draft', async () => {
    const argumentHint = 'password=synthetic-sensitive-hint file:///workspace/meter';
    const remove = registerSlashCommand({ name: 'guide-usage', group: 'workflow', summary: 'Guide', argumentHint });
    const { mode, terminal } = build();
    const host = mode as unknown as { overlay: OverlayHost; view: InteractiveView; onSubmit(text: string): void };
    const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
    mode.start();
    try {
      host.overlay.open(helpPicker({ root: '/workspace', sessionId: 'sess_1' }));
      await new Promise(resolve => setTimeout(resolve, 0));
      terminal.input('/guide-usage'); terminal.input('\r');
      await vi.waitFor(() => expect(host.view.editor.getText()).toBe('/guide-usage '));
      const frame = stripAnsi(host.view.renderFrame({ columns: 140, rows: 24 }).rows.join('\n'));
      expect(frame).toContain('Usage: /guide-usage password=[redacted] [project]/meter');
      expect(frame).not.toContain('synthetic-sensitive'); expect(frame).not.toContain('file:///workspace');
      expect(host.overlay.active).toBe(false); expect(submit).not.toHaveBeenCalled();
    } finally { mode.stop(); remove(); }
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
      expect(frame).toContain('Slash commands'); expect(frame).toContain('more'); expect(frame).toContain('Esc: back');
      expect(frame).toContain('A session notice remains visible');
      terminal.input('\x1b');
      expect(host.overlay.active).toBe(true); expect(host.view.editor.getText()).toBe(draft);
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

  it.each((['regular', 'fullscreen'] as const).flatMap(kind => [
    { prefix: '', gesture: 'path-tab' }, { prefix: 'Inspect ', gesture: 'path-tab' },
    { prefix: '', gesture: 'command-tab' }, { prefix: 'Inspect ', gesture: 'command-tab' },
    { prefix: '', gesture: 'exact-enter' },
  ].map(scenario => ({ kind, ...scenario }))))(
    'keeps template and directory intent through actual $kind $gesture after "$prefix"', async ({ kind, prefix, gesture }) => {
      fs.mkdirSync('/tmp/cheers-test', { recursive: true }); const root = fs.mkdtempSync('/tmp/cheers-test/template-path-host-');
      vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root); vi.stubEnv('OPENAI_API_KEY', '');
      const prompts = path.join(root, '.agents', 'prompts'); fs.mkdirSync(prompts, { recursive: true });
      fs.writeFileSync(path.join(prompts, 'tmp.md'), '---\ncomposable: true\n---\nTEMPLATE INTENT: $@');
      const scheduler = new ManualScheduler(), manager = new SessionManager(), session = manager.createNew(root);
      const { mode, terminal } = build({ tuiMode: kind, scheduler });
      const host = mode as unknown as { view: InteractiveView; lastPrompt?: string;
        options: { runtimeContext: ShellRuntimeContext; sessionManager: SessionManager } };
      host.options.runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
        targetPathBase: root, rootMode: 'direct', gitRoot: null,
        gitContext: { insideGit: false, root: null, branch: null, isClean: null },
        session, runtimeConfig: { ...getRuntimeConfig(root), tuiMode: kind } });
      host.options.runtimeContext.skillOptions = { noSkills: true }; host.options.sessionManager = manager;
      const config = JSON.stringify(host.options.runtimeContext.configuration.current);
      const selection = JSON.stringify(modelState.readSessionModelEdit(session.id));
      const dispatch = vi.spyOn(promptRunner, 'runInteractivePromptExecution').mockResolvedValue();
      const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
      mode.start();
      try {
        expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
        terminal.input(prefix + '/tmp'); scheduler.flush();
        await vi.waitFor(() => expect(host.view.suggestions.length).toBeGreaterThanOrEqual(2));
        const selected = gesture === 'command-tab' ? 'command' : 'path';
        const value = selected === 'path' ? '/tmp/' : '/tmp';
        for (let moves = 0; moves < host.view.suggestions.length; moves++) {
          const current = host.view.suggestions.current();
          if (current?.kind === selected && current.value === value) break;
          terminal.input('\x1b[B');
        }
        expect(host.view.suggestions.current()).toMatchObject({ kind: selected, value });
        let source = prefix + '/tmp';
        if (gesture !== 'exact-enter') {
          terminal.input('\t'); scheduler.flush();
          expect(host.view.editor.getText()).toBe(prefix + (selected === 'path' ? '/tmp/' : '/tmp '));
          expect(dispatch).not.toHaveBeenCalled();
          terminal.input(' chosen'); scheduler.flush(); source = host.view.editor.getText();
        }
        terminal.input('\r'); await vi.waitFor(() => expect(dispatch).toHaveBeenCalledOnce());
        const sent = dispatch.mock.calls[0]![0];
        if (gesture === 'path-tab') expect(sent.effectivePrompt).toBe(source);
        else expect(sent.effectivePrompt).toContain('TEMPLATE INTENT:');
        expect(host.lastPrompt).toBe(source);
        expect(JSON.stringify(host.options.runtimeContext.configuration.current)).toBe(config);
        expect(JSON.stringify(modelState.readSessionModelEdit(session.id))).toBe(selection); expect(network).not.toHaveBeenCalled();
      } finally {
        mode.stop(); dispatch.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
      }
    });

  it.each((['regular', 'fullscreen'] as const).flatMap(kind => [
    { marked: "Let's inspect @src/mo|stale  后文 /skill:follow unchanged", file: 'src/model.ts' },
    { marked: "read @src/O|Brien's.ts  后文 /skill:follow unchanged", file: "src/O'Brien.ts" },
  ].map(scenario => ({ kind, ...scenario }))))(
    'preserves prose and filename apostrophes through actual $kind reference Tab: $marked', async ({ kind, marked, file }) => {
      fs.mkdirSync('/tmp/cheers-test', { recursive: true });
      const root = fs.mkdtempSync('/tmp/cheers-test/reference-apostrophe-');
      vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
      fs.mkdirSync(path.join(root, 'src')); fs.writeFileSync(path.join(root, file), 'fixture');
      const scheduler = new ManualScheduler();
      const { mode, terminal } = build({ tuiMode: kind, scheduler }); terminal.columns = 120; terminal.rows = 24;
      const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void;
        options: { runtimeContext: ShellRuntimeContext } };
      host.options.runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
        targetPathBase: root, rootMode: 'direct', gitRoot: null,
        gitContext: { insideGit: false, root: null, branch: null, isClean: null },
        session: host.options.runtimeContext.session, runtimeConfig: { ...getRuntimeConfig(root), tuiMode: kind } });
      host.options.runtimeContext.skillOptions = { noSkills: true };
      const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
      const walk = vi.spyOn(fileWalk, 'listWorkspaceFiles');
      const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
      const cursor = marked.indexOf('|'), text = marked.replace('|', ''), from = text.indexOf('@');
      const suffix = '  后文 /skill:follow unchanged';
      mode.start();
      try {
        expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
        terminal.input(`\x1b[200~${text}\x1b[201~`);
        terminal.input('\x1b[D'.repeat(text.length - cursor)); scheduler.flush();
        expect(host.view.editor.snapshot().cursor).toBe(cursor);
        await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe('@' + file));
        terminal.input('\t'); scheduler.flush();
        const next = host.view.editor.getText();
        expect(next.slice(0, from)).toBe(text.slice(0, from)); expect(next.endsWith(suffix)).toBe(true);
        expect(scanCommandArgs(next.slice(from, -suffix.length)).map(token => token.value)).toEqual(['@' + file]);
        expect(stripAnsi(terminal.drain())).toContain('后文 /skill:follow unchanged');
        expect(promptTokens(next).find(token => token.raw === '/skill:follow')?.literal).toBeUndefined();
        expect(walk).toHaveBeenCalledTimes(1);
        expect(walk).toHaveBeenCalledWith(root, expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
        expect(submit).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
      } finally {
        mode.stop(); submit.mockRestore(); walk.mockRestore(); network.mockRestore(); vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

  it.each([
    ['regular', 'inline'], ['regular', 'fence'], ['fullscreen', 'inline'], ['fullscreen', 'fence'],
  ] as const)('keeps code references inert and resumes file completion in %s %s', async (kind, syntax) => {
    vi.useFakeTimers();
    fs.mkdirSync('/tmp/cheers-test', { recursive: true });
    const root = fs.mkdtempSync('/tmp/cheers-test/reference-code-');
    vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
    const walk = vi.spyOn(fileWalk, 'listWorkspaceFiles').mockResolvedValue(['my @file.ts']);
    const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
    const { mode, terminal } = build();
    const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void;
      options: { runtimeContext: ShellRuntimeContext } };
    host.options.runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
      targetPathBase: root, rootMode: 'direct', gitRoot: null,
      gitContext: { insideGit: false, root: null, branch: null, isClean: null },
      session: host.options.runtimeContext.session, runtimeConfig: { ...getRuntimeConfig(root), tuiMode: kind } });
    const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
    const initial = syntax === 'inline' ? 'example `literal @my' : '```text\n@my';
    const close = syntax === 'inline' ? '` ' : '\n```\n';
    mode.start();
    try {
      terminal.input(`\x1b[200~${initial}\x1b[201~`);
      await vi.advanceTimersByTimeAsync(100);
      expect(host.view.editor.getText()).toBe(initial);
      expect(walk).not.toHaveBeenCalled(); expect(host.view.suggestionsOpen).toBe(false);
      terminal.input(`\x1b[200~${close}@my\x1b[201~`);
      await vi.advanceTimersByTimeAsync(100);
      expect(host.view.suggestions.current()?.value).toBe('@my @file.ts');
      expect(walk).toHaveBeenCalledTimes(1);
      expect(walk).toHaveBeenCalledWith(root, expect.objectContaining({ abortSignal: expect.any(AbortSignal) }));
      terminal.input('\t');
      expect(host.view.editor.getText()).toBe(`${initial}${close}@"my @file.ts" `);
      expect(submit).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
    } finally {
      mode.stop(); submit.mockRestore(); walk.mockRestore(); network.mockRestore();
      vi.useRealTimers(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
    ['absolute', 'home'].map(form => ({ kind, form }))))(
    'completes raw apostrophe paths through actual $kind Tab in $form form', async ({ kind, form }) => {
      fs.mkdirSync('/tmp/cheers-test', { recursive: true });
      const root = fs.mkdtempSync('/tmp/cheers-test/apostrophe-path-host-');
      vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
      const child = path.join(root, "O'Brien", 'child space');
      fs.mkdirSync(child, { recursive: true }); fs.writeFileSync(path.join(child, "report's.md"), 'fixture');
      const base = form === 'absolute' ? root + '/' : '~/';
      const scheduler = new ManualScheduler();
      const { mode, terminal } = build({ tuiMode: kind, scheduler }); terminal.columns = 120; terminal.rows = 24;
      const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void;
        options: { runtimeContext: ShellRuntimeContext } };
      host.options.runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
        targetPathBase: root, rootMode: 'direct', gitRoot: null,
        gitContext: { insideGit: false, root: null, branch: null, isClean: null },
        session: host.options.runtimeContext.session, runtimeConfig: { ...getRuntimeConfig(root), tuiMode: kind } });
      host.options.runtimeContext.skillOptions = { noSkills: true };
      const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
      const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
      const suffix = '\n后文 /skill:follow unchanged';
      const text = `读取 ${base}O'Brstale${suffix}`, cursor = text.indexOf('stale');
      mode.start();
      try {
        expect(terminal.writes.join('').includes('\x1b[?1049h')).toBe(kind === 'fullscreen');
        terminal.input(`\x1b[200~${text}\x1b[201~`);
        terminal.input('\x1b[D'.repeat(text.length - cursor)); scheduler.flush();
        expect(host.view.editor.snapshot().cursor).toBe(cursor);
        for (const target of [base + "O'Brien/", base + "O'Brien/child space/", base + "O'Brien/child space/report's.md"]) {
          await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe(target));
          terminal.input('\t'); scheduler.flush();
          const snapshot = host.view.editor.snapshot();
          expect(snapshot.text.startsWith('读取 ')).toBe(true); expect(snapshot.text.endsWith(suffix)).toBe(true);
          expect(scanCommandArgs(snapshot.text.slice(3, -suffix.length)).map(token => token.value)).toEqual([target]);
          expect(promptTokens(snapshot.text).find(token => token.raw === '/skill:follow')?.literal).toBeUndefined();
          expect(promptTokens(snapshot.text).some(token => token.raw === '/skill:follow')).toBe(true);
          if (target.endsWith('/')) expect(snapshot.text[snapshot.cursor]).toBe('"');
        }
        expect(stripAnsi(terminal.drain())).toContain('后文 /skill:follow unchanged');
        expect(submit).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
      } finally {
        mode.stop(); submit.mockRestore(); network.mockRestore(); vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
      }
    });

  it.each(['regular', 'fullscreen'] as const)(
    'continues a manually opened single-quoted path through actual %s Tab acceptance', async kind => {
      fs.mkdirSync('/tmp/cheers-test', { recursive: true });
      const root = fs.mkdtempSync('/tmp/cheers-test/single-quote-path-host-');
      vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
      const directory = path.join(root, 'work space'), child = path.join(directory, 'child'), file = path.join(child, "report's.md");
      fs.mkdirSync(child, { recursive: true }); fs.writeFileSync(file, 'fixture');
      const { mode, terminal } = build();
      const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void;
        options: { runtimeContext: ShellRuntimeContext } };
      host.options.runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
        targetPathBase: root, rootMode: 'direct', gitRoot: null,
        gitContext: { insideGit: false, root: null, branch: null, isClean: null },
        session: host.options.runtimeContext.session, runtimeConfig: { ...getRuntimeConfig(root), tuiMode: kind } });
      const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
      const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
      mode.start();
      try {
        terminal.input(`\x1b[200~读取 '${root}/work sp\x1b[201~`);
        for (const target of [directory + '/', child + '/', file]) {
          await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe(target));
          terminal.input('\t');
          const snapshot = host.view.editor.snapshot();
          expect(snapshot.text.startsWith('读取 ')).toBe(true);
          expect(scanCommandArgs(snapshot.text.slice(3)).map(token => token.value)).toEqual([target]);
          if (target !== file) expect(snapshot.text[snapshot.cursor]).toBe("'");
          else expect(snapshot.text.endsWith(' ')).toBe(true);
        }
        terminal.input('\x1b[200~/skill:follow\x1b[201~');
        const source = host.view.editor.getText();
        expect(promptTokens(source).find(token => token.raw === '/skill:follow')).toMatchObject({ from: source.indexOf('/skill:follow') });
        expect(promptTokens(source).find(token => token.raw === '/skill:follow')?.literal).toBeUndefined();
        expect(submit).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
      } finally {
        mode.stop(); submit.mockRestore(); network.mockRestore(); vi.unstubAllEnvs(); fs.rmSync(root, { recursive: true, force: true });
      }
    });

  it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
    ['pick-quote"dir', 'pick-tick`dir'].map(name => ({ kind, name }))))(
    'continues escaped path Tab acceptance in $kind for $name', async ({ kind, name }) => {
      fs.mkdirSync('/tmp/cheers-test', { recursive: true });
      const root = fs.mkdtempSync('/tmp/cheers-test/path-tab-');
      vi.stubEnv('HOME', root); vi.stubEnv('USERPROFILE', root); vi.stubEnv('CHEERS_TEST_ROOT', root);
      const directory = path.join(root, name), child = path.join(directory, 'child');
      const file = path.join(child, 'report.txt');
      fs.mkdirSync(child, { recursive: true }); fs.writeFileSync(file, 'fixture');
      const { mode, terminal } = build();
      const host = mode as unknown as { view: InteractiveView; onSubmit(text: string): void;
        options: { runtimeContext: ShellRuntimeContext } };
      host.options.runtimeContext = createShellRuntimeContext({ cwd: root, originalCwd: root, projectRoot: root,
        targetPathBase: root, rootMode: 'direct', gitRoot: null,
        gitContext: { insideGit: false, root: null, branch: null, isClean: null },
        session: host.options.runtimeContext.session, runtimeConfig: { ...getRuntimeConfig(root), tuiMode: kind } });
      const submit = vi.spyOn(host, 'onSubmit').mockImplementation(() => {});
      const network = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('unexpected network'));
      const suffix = '\n后文 /skill:follow';
      mode.start();
      try {
        terminal.input(`\x1b[200~阅读 ${root}/pickold${suffix}\x1b[201~`);
        terminal.input('\x1b[D'.repeat(('old' + suffix).length));
        for (const target of [directory + '/', child + '/', file]) {
          await vi.waitFor(() => expect(host.view.suggestions.current()?.value).toBe(target));
          terminal.input('\t');
          const snapshot = host.view.editor.snapshot();
          expect(snapshot.text.startsWith('阅读 ')).toBe(true);
          expect(snapshot.text.endsWith(suffix)).toBe(true);
          expect(scanCommandArgs(snapshot.text.slice(3, -suffix.length)).map(token => token.value)).toEqual([target]);
          expect(promptTokens(snapshot.text).find(token => token.raw === '/skill:follow')?.literal).toBeUndefined();
          expect(promptTokens(snapshot.text).some(token => token.raw === '/skill:follow')).toBe(true);
          if (target !== file) expect(snapshot.text[snapshot.cursor]).toBe('"');
          expect(stripAnsi(host.view.renderFrame({ columns: 100, rows: 24 }).rows.join('\n'))).toContain('后文 /skill:follow');
        }
        expect(submit).not.toHaveBeenCalled(); expect(network).not.toHaveBeenCalled();
      } finally {
        mode.stop(); submit.mockRestore(); network.mockRestore(); vi.unstubAllEnvs();
        fs.rmSync(root, { recursive: true, force: true });
      }
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
      expect(dispatched).not.toHaveBeenCalledWith("/help", undefined);
      if (action === "confirm") {
        await vi.waitFor(() => expect(Reflect.get(host.overlay, 'model').current()?.id).toBe('first'));
        terminal.input("\r");
        await vi.waitFor(() => expect(rewind).toHaveBeenCalledWith(expect.objectContaining({ entryId: "first" })));
        expect(dispatched).not.toHaveBeenCalledWith("/help", undefined);
        finishNext();
      } else {
        terminal.input("\x1b");
        expect(rewind).not.toHaveBeenCalled();
      }
      await vi.waitFor(() => expect(dispatched).toHaveBeenCalledWith("/help", undefined));
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

  it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
    ['/exit', '/quit', '/q'].map(command => ({ kind, command }))
  ))('executes $command immediately while the $kind host is busy with a question', async ({ kind, command }) => {
    const exit = vi.fn();
    const { mode, terminal, readline } = build({ exit, tuiMode: kind });
    const host = mode as unknown as { busy: boolean; view: InteractiveView; queue: SubmissionQueue };
    const answer = vi.fn();
    mode.start();
    try {
      host.busy = true;
      (readline.current as { question(query: string, callback: (answer: string) => void): void }).question('Continue?', answer);
      host.view.editor.setText(command);
      terminal.input('\r');
      await vi.waitFor(() => expect(exit.mock.calls).toEqual([[0]]));
      expect(terminal.stopped).toBe(true);
      expect(host.queue.control.entries()).toEqual([]);
      expect(answer.mock.calls).toEqual([['n']]);
    } finally { mode.stop(); }
  });

  it.each(['exit', ' /exit', '/exit later', '/quit later', '/q/file'])('keeps %s outside the explicit immediate-exit lane', source => {
    const exit = vi.fn(); const { mode } = build({ exit });
    const host = mode as unknown as { busy: boolean; onSubmit(text: string): void; queue: SubmissionQueue };
    host.busy = true;
    try {
      host.onSubmit(source);
      expect(host.queue.shift()).toBe(source);
      expect(exit).not.toHaveBeenCalled();
    } finally { mode.stop(); }
  });

  it.each(['regular', 'fullscreen'] as const)('does not dispatch queued work after a late turn settles in the exiting %s host', async kind => {
    const exit = vi.fn(); const { mode, terminal } = build({ exit, tuiMode: kind });
    const host = mode as unknown as { run(text: string): Promise<void>; view: InteractiveView; queue: SubmissionQueue };
    let release!: () => void;
    const route = vi.spyOn(commandRouter, 'routeInteractiveCommand').mockImplementation(() => new Promise(resolve => {
      release = () => resolve({ turnNumber: 1 });
    }));
    mode.start();
    let active: Promise<void> | undefined;
    try {
      active = host.run('pending turn');
      host.queue.push('/help');
      host.view.editor.setText('/exit'); terminal.input('\r');
      await vi.waitFor(() => expect(exit.mock.calls).toEqual([[0]]));
      release(); await active;
      expect(route).toHaveBeenCalledOnce();
      expect(terminal.stopped).toBe(true);
    } finally { release?.(); await active; route.mockRestore(); mode.stop(); }
  });

  it.each(['regular', 'fullscreen'] as const)('reports failed session persistence after restoring the %s terminal and still exits', async kind => {
    const exit = vi.fn(); const { mode, terminal, renderer } = build({ exit, tuiMode: kind });
    const host = mode as unknown as { view: InteractiveView; options: { sessionRuntime: ShellSessionRuntime } };
    const rendered: { line: string; stopped: boolean }[] = [];
    const render = vi.spyOn(renderer, 'renderLine').mockImplementation(line => { rendered.push({ line, stopped: terminal.stopped }); });
    host.options.sessionRuntime.terminate = () => { throw new Error('private fixture persistence detail'); };
    mode.start();
    try {
      host.view.editor.setText('/exit'); terminal.input('\r');
      await vi.waitFor(() => expect(exit.mock.calls).toEqual([[1]]));
      expect(rendered).toEqual([{ line: 'Session state could not be saved; session close was not verified.', stopped: true }]);
    } finally { render.mockRestore(); mode.stop(); }
  });

  it.each((['regular', 'fullscreen'] as const).flatMap(kind =>
    (['subscription', 'transcript', 'terminal-write', 'terminal-stop', 'error-report', 'stdin'] as const).map(fault => ({ kind, fault }))
  ))('continues failed $fault cleanup and exits the actual $kind host', async ({ kind, fault }) => {
    const exit = vi.fn();
    let armed = false;
    const released = vi.fn(() => { if (armed && (fault === 'subscription' || fault === 'error-report')) throw new Error('PRIVATE_CLEANUP_DETAIL'); });
    const { mode, terminal, renderer } = build({ exit, tuiMode: kind, observeEvents: () => released });
    const host = mode as unknown as { shutdown(): Promise<void>; view: InteractiveView;
      options: { sessionRuntime: ShellSessionRuntime }; clipboard: Clipboard; stdin: { dispose(): void }; pointer: { handle(report: unknown): void } };
    const terminate = vi.spyOn(host.options.sessionRuntime, 'terminate');
    const clipboard = vi.spyOn(host.clipboard, 'release');
    const notices: string[] = [];
    const renderLine = vi.spyOn(renderer, 'renderLine').mockImplementation(line => {
      notices.push(line); if (fault === 'error-report') throw new Error('PRIVATE_REPORT_DETAIL');
    });
    mode.start();
    const render = vi.spyOn(host.view.transcript, 'render');
    const write = vi.spyOn(terminal, 'write');
    const dispose = vi.spyOn(host.stdin, 'dispose');
    if (fault === 'stdin') dispose.mockImplementation(() => { throw new Error('PRIVATE_CLEANUP_DETAIL'); });
    if (fault === 'transcript') render.mockImplementationOnce(() => { throw new Error('PRIVATE_CLEANUP_DETAIL'); });
    if (fault === 'terminal-write') write.mockImplementationOnce(() => { throw new Error('PRIVATE_CLEANUP_DETAIL'); });
    const pending: Promise<void>[] = [];
    const original = host.shutdown.bind(mode);
    const shutdown = vi.spyOn(host, 'shutdown').mockImplementation(() => {
      const operation = original(); pending.push(operation); void operation.catch(() => {}); return operation;
    });
    const stop = vi.spyOn(terminal, 'stop');
    if (fault === 'terminal-stop') stop.mockImplementationOnce(() => { throw new Error('PRIVATE_CLEANUP_DETAIL'); });
    armed = true;
    const submit = vi.spyOn(host as unknown as { onSubmit(text: string): void }, 'onSubmit');
    const pointer = vi.spyOn(host.pointer, 'handle');
    try {
      terminal.input('\x04should-not-submit\r\x1b[200~retired paste\x1b[201~\x1b[<0;1;1M\x1b[<0;1;1m');
      await expect(pending[0]).resolves.toBeUndefined();
      expect(stop).toHaveBeenCalledOnce();
      expect(terminal.stopped).toBe(fault !== 'terminal-stop');
      expect(clipboard).toHaveBeenCalledOnce();
      expect(terminate).toHaveBeenCalledOnce();
      expect(submit).not.toHaveBeenCalled();
      expect(host.view.editor.getText()).toBe('');
      expect(pointer).not.toHaveBeenCalled();
      expect(exit.mock.calls).toEqual([[1]]);
      expect(notices.some(line => line.includes('Interactive cleanup failed'))).toBe(true);
      expect(notices.join('')).not.toContain('PRIVATE_CLEANUP_DETAIL');
      terminal.input('\x04');
      expect(exit).toHaveBeenCalledOnce();
    } finally {
      armed = false; render.mockRestore(); write.mockRestore(); stop.mockRestore(); shutdown.mockRestore(); dispose.mockRestore(); submit.mockRestore(); pointer.mockRestore();
      terminal.stop(); mode.stop(); clipboard.mockRestore(); terminate.mockRestore(); renderLine.mockRestore();
    }
  });

  it.each(['regular', 'fullscreen'] as const)('retains embedded cleanup failure after closing the actual %s host', async kind => {
    const { mode, terminal } = build({ tuiMode: kind });
    const host = mode as unknown as { shutdown(): Promise<void>; options: { sessionRuntime: ShellSessionRuntime } };
    const terminate = vi.spyOn(host.options.sessionRuntime, 'terminate');
    mode.start();
    const failure = new Error('private terminal cleanup fixture');
    const stop = vi.spyOn(terminal, 'stop').mockImplementationOnce(() => { throw failure; });
    try {
      await expect(host.shutdown()).rejects.toBe(failure);
      expect(terminate).toHaveBeenCalledOnce();
      expect(stop).toHaveBeenCalledOnce();
    } finally { stop.mockRestore(); terminal.stop(); mode.stop(); terminate.mockRestore(); }
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

it('clears a pending Vim operator when a bracketed paste enters the draft', async () => {
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView; options: { runtimeContext: ShellRuntimeContext } };
  host.options.runtimeContext.runtimeConfig.vimMode = true;
  mode.start();
  try {
    terminal.input("\x1b");
    scheduler.flush();
    terminal.input("d");
    terminal.input("\x1b[200~one two\x1b[201~");
    terminal.input("w");
    scheduler.flush();
    expect(host.view.editor.getText()).toBe("one twow");
  } finally { mode.stop(); }
});

it('copies the exact Visual grapheme through the real clipboard owner without clearing the draft', () => {
  const scheduler = new ManualScheduler();
  const copy = vi.spyOn(Clipboard.prototype, 'copy').mockImplementation(() => {});
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView; options: { runtimeContext: ShellRuntimeContext } };
  host.options.runtimeContext.runtimeConfig.vimMode = true;
  mode.start();
  try {
    host.view.editor.setText('👩‍💻b');
    host.view.editor.move('doc-start');
    terminal.input('\x1b');
    scheduler.flush();
    terminal.input('v');
    scheduler.flush();
    terminal.input('\x03');
    scheduler.flush();
    expect(copy).toHaveBeenCalledWith('👩‍💻');
    expect(host.view.editor.getText()).toBe('👩‍💻b');
  } finally { mode.stop(); }
});

it('resets pending Vim state when the real external-editor round trip adopts a draft', () => {
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView; preferences: { openExternalEditor(text: string): void };
    options: { runtimeContext: ShellRuntimeContext } };
  host.options.runtimeContext.runtimeConfig.vimMode = true;
  vi.spyOn(externalEditor, 'editExternally').mockReturnValue({ text: 'fresh draft' });
  mode.start();
  try {
    terminal.input('\x1b');
    scheduler.flush();
    terminal.input('d');
    scheduler.flush();
    host.preferences.openExternalEditor(host.view.editor.getText());
    terminal.input('x');
    scheduler.flush();
    expect(host.view.editor.getText()).toBe('fresh draftx');
  } finally { mode.stop(); }
});

it.each((['regular', 'fullscreen'] as const).flatMap(kind => [
  'remapped stash', 'unbound stash', 'conflicted stash', 'remapped undo', 'unbound undo', 'conflicted undo',
].map(binding => ({ kind, binding }))))('uses the effective draft shortcut for external rewrites with $binding in $kind', ({ kind, binding }) => {
  const scheduler = new ManualScheduler(), { mode, terminal } = build({ tuiMode: kind, scheduler });
  const host = mode as unknown as { view: InteractiveView; toast?: string;
    preferences: { keybindings: Keybindings; openExternalEditor(text: string): void } };
  const occupied = binding.endsWith('undo'), unbound = binding.startsWith('unbound') || binding === 'conflicted stash';
  const action = occupied ? 'tui.editor.undo' : 'tui.input.stash', key = occupied ? 'alt+z' : 'alt+k';
  const keys = unbound ? binding.startsWith('conflicted') ? ['alt+j'] : [] : binding.startsWith('conflicted') ? ['alt+j', key] : [key];
  vi.spyOn(externalEditor, 'editExternally').mockReturnValue({ text: 'rewritten draft' });
  mode.start();
  try {
    host.preferences.keybindings.setUserConfig({ [action]: keys, ...(binding.startsWith('conflicted') ? { 'app.retry': ['alt+j'] } : {}) });
    if (occupied) { terminal.input('older stashed draft'); terminal.input('\x13'); scheduler.flush(); }
    terminal.input('original draft'); scheduler.flush(); host.preferences.openExternalEditor(host.view.editor.getText()); scheduler.flush();
    expect(host.view.editor.getText()).toBe('rewritten draft');
    expect(host.toast).toBe(occupied
      ? unbound ? 'Draft rewritten · the slot already held a draft; undo shortcut is unbound'
        : `Draft rewritten · the slot already held a draft, so this original is only reachable with ${key}`
      : unbound ? 'Draft rewritten · original stashed (shortcut unbound)' : `Draft rewritten · ${key} brings the original back`);
    if (unbound) host.preferences.keybindings.setUserConfig({ [action]: [key] });
    terminal.input(occupied ? '\x1bz' : '\x1bk'); scheduler.flush(); expect(host.view.editor.getText()).toBe('original draft');
    if (occupied) { terminal.input('\x13'); expect(host.view.editor.getText()).toBe('older stashed draft'); }
  } finally { mode.stop(); }
});

it('keeps the pre-rewrite draft one key away after an external edit', () => {
  // The editor is where a person goes to have the draft rewritten. What it
  // replaces is not reachable by undo — that edit never happened in this
  // terminal — so the original goes into the stash slot instead.
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView; preferences: { openExternalEditor(text: string): void } };
  vi.spyOn(externalEditor, 'editExternally').mockReturnValue({ text: 'polished version' });
  mode.start();
  try {
    terminal.input('original thought');
    scheduler.flush();
    host.preferences.openExternalEditor(host.view.editor.getText());
    scheduler.flush();
    expect(host.view.editor.getText()).toBe('polished version');

    terminal.input('\x13');                       // ctrl+s: take the original back
    expect(host.view.editor.getText()).toBe('original thought');
  } finally { mode.stop(); }
});

it('swaps the prompt and the stash instead of refusing the second draft', () => {
  // Two drafts, one key: the prompt's text and the stashed text trade places,
  // so the key is reversible without remembering which one it will produce.
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView };
  mode.start();
  try {
    terminal.input('first');
    scheduler.flush();
    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('');

    terminal.input('second');
    scheduler.flush();
    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('first');
    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('second');
  } finally { mode.stop(); }
});

it('says when a rewrite cannot be kept because the slot is full', () => {
  // The slot holds one draft. When a rewrite replaces a second one, the
  // original is only in the undo stack — and saying so is the difference
  // between "your original is one key away" and "your original is gone".
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView; toast?: string;
    preferences: { openExternalEditor(text: string): void } };
  vi.spyOn(externalEditor, 'editExternally').mockReturnValue({ text: 'rewritten' });
  mode.start();
  try {
    terminal.input('stashed draft');
    scheduler.flush();
    terminal.input('\x13');                       // stash it
    expect(host.view.editor.getText()).toBe('');

    terminal.input('second draft');
    scheduler.flush();
    host.preferences.openExternalEditor(host.view.editor.getText());
    scheduler.flush();

    expect(host.view.editor.getText()).toBe('rewritten');
    expect(host.toast).toContain('only reachable with ctrl+z');
  } finally { mode.stop(); }
});

it('leaves the stash empty when the editor changed nothing', () => {
  // No rewrite means nothing was replaced, so there is no original to keep.
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView; preferences: { openExternalEditor(text: string): void } };
  vi.spyOn(externalEditor, 'editExternally').mockReturnValue({ message: 'No changes.' });
  mode.start();
  try {
    terminal.input('kept as written');
    scheduler.flush();
    host.preferences.openExternalEditor(host.view.editor.getText());
    scheduler.flush();

    // The first press stashes; the second brings it back unchanged.
    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('');
    terminal.input('\x13');
    expect(host.view.editor.getText()).toBe('kept as written');
  } finally { mode.stop(); }
});

it('answers runtime questions through the text channel while Vim is in Normal mode', async () => {
  const scheduler = new ManualScheduler();
  const { mode, terminal, readline } = build({ scheduler });
  const host = mode as unknown as { options: { runtimeContext: ShellRuntimeContext } };
  host.options.runtimeContext.runtimeConfig.vimMode = true;
  mode.start();
  try {
    terminal.input("\x1b");
    scheduler.flush();
    let answer: string | undefined;
    (readline.current as { question(query: string, callback: (value: string) => void): void })
      .question("Need an answer", value => { answer = value; });
    terminal.input("y");
    scheduler.flush();
    terminal.input("\r");
    scheduler.flush();
    await vi.waitFor(() => expect(answer).toBe("y"));
  } finally { mode.stop(); }
});

it('starts Vim in Insert mode after it is disabled and enabled again', async () => {
  const scheduler = new ManualScheduler();
  const { mode, terminal } = build({ scheduler });
  const host = mode as unknown as { view: InteractiveView; options: { runtimeContext: ShellRuntimeContext } };
  host.options.runtimeContext.runtimeConfig.vimMode = true;
  mode.start();
  try {
    terminal.input("\x1b");
    scheduler.flush();
    host.options.runtimeContext.runtimeConfig.vimMode = false;
    terminal.input("x");
    scheduler.flush();
    host.options.runtimeContext.runtimeConfig.vimMode = true;
    terminal.input("i");
    scheduler.flush();
    expect(host.view.editor.getText()).toBe("xi");
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

it('publishes an accepted cleanse draft through the original interactive consumer and rejects a changed live owner', async () => {
  const { mode } = build();
  const host = mode as unknown as { applyPicker(picker: Picker, ids: readonly string[]): void; replaceExternalDraft(draft: string): void };
  const root = process.cwd(); let sessionId = 'sess_1';
  const inspector = { read: () => ({ state: 'ready' as const, snapshot: { identity: { sessionId: 'sess_1', workspaceRoot: root }, version: 'v1',
    items: [{ identity: 'scan-row', kind: 'scan' as const, id: 'scan-a', targetId: 'scan-a', status: 'unknown', durability: 'unknown' as const,
      owner: 'none' as const, summary: 'retained', detail: ['retained finding'] }] } }), subscribe: () => () => undefined };
  const choose = () => cleansePicker(inspector, { cwd: root, sessionId: 'sess_1' }, () => ({ sessionId, projectRoot: root, busy: false }));
  const replace = vi.spyOn(host, 'replaceExternalDraft'); const first = choose(), row = (await first.load())[0]!;
  host.applyPicker(first, [row.id]); await vi.waitFor(() => expect(replace).toHaveBeenCalledWith('/cleanse diagnose "scan-a"'));
  replace.mockClear(); const second = choose(); await second.load(); host.applyPicker(second, [row.id]); sessionId = 'sess_2';
  await new Promise(resolve => setTimeout(resolve, 0)); expect(replace).not.toHaveBeenCalled();
});
